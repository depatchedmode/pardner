#!/usr/bin/env python3
"""Two real Lima guests. Keep test services alive for the subsequent agent handoff."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import select
import shlex
import subprocess
import tarfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
VMS = ['pardner-remote-a', 'pardner-remote-b']
NODE = str(Path.home() / '.nvm/versions/node/v24.11.1/bin/node')


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout


def ssh(vm):
    return ['ssh', '-F', str(Path.home() / '.lima' / vm / 'ssh.config'),
            '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'BatchMode=yes',
            f'lima-{vm}']


def guest(vm, command, **kwargs):
    return run([*ssh(vm), command], **kwargs)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


class Rehearsal:
    def __init__(self):
        self.id = uuid.uuid4().hex[:12]
        self.output = ROOT / '.pardner/labs/remote' / self.id
        self.output.mkdir(parents=True)
        self.home = guest(VMS[0], 'printf %s "$HOME"').strip()
        self.remote = f'{self.home}/pardner-runs/{self.id}'
        self.replica_credentials = {vm: secrets.token_hex(32) for vm in VMS}
        self.hub = None
        self.tunnels = {}
        self.services = {}
        self.logs = []
        self.measurements = []
        self.evidence = {'runId': self.id, 'infrastructure': 'running', 'realAgents': 'pending'}

    def log(self, message):
        print(message, flush=True)

    def background(self, args, name):
        output = open(self.output / f'{name}.log', 'a')
        self.logs.append(output)
        return subprocess.Popen(args, stdout=output, stderr=output, start_new_session=True)

    def prepare(self):
        archive = self.output / 'candidate.tar'
        names = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).split('\0')
        with tarfile.open(archive, 'w') as tar:
            for name in sorted(set(names)):
                path = ROOT / name
                if name and path.is_file() and not name.endswith(('.DS_Store', '.pyc')):
                    tar.add(path, arcname=name, recursive=False)
            tar.add(ROOT / 'ui-prototype/dist', arcname='ui-prototype/dist')
        self.evidence['archiveSha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        identities = []
        for vm in VMS:
            self.log(f'Preparing {vm}')
            home = guest(vm, 'printf %s "$HOME"').strip()
            assert home == self.home, f'Guest homes differ: {home} vs {self.home}'
            guest(vm, f'mkdir -p {self.remote}/repo')
            with archive.open('rb') as source:
                subprocess.run([*ssh(vm), f'tar -xf - -C {self.remote}/repo'], stdin=source, check=True)
            guest(vm, f'cd {self.remote}/repo && PATH="$HOME/.local/node/bin:$PATH" npm ci --no-audit --no-fund', timeout=180)
            machine = guest(vm, 'cat /etc/machine-id').strip()
            mounts = guest(vm, 'findmnt -rn -o FSTYPE,TARGET')
            assert not any(kind in mounts for kind in ['virtiofs', '9p', 'fuse.sshfs'])
            assert guest(vm, f'test ! -e {shlex.quote(str(ROOT))} && echo isolated').strip() == 'isolated'
            identities.append({'vm': vm, 'machineId': machine, 'mounts': mounts,
                               'kernel': guest(vm, 'uname -a').strip()})
        assert identities[0]['machineId'] != identities[1]['machineId']
        self.evidence['machines'] = identities
        fingerprint_code = "import {candidateFingerprint} from './support/acceptance/candidate.js'; console.log(JSON.stringify(await candidateFingerprint()));"
        expected = json.loads(run([NODE, '--input-type=module', '-e', fingerprint_code], cwd=ROOT))
        for vm in VMS:
            actual = json.loads(guest(vm, f'cd {self.remote}/repo && ' + shlex.join([self.home + '/.local/node/bin/node', '--input-type=module', '-e', fingerprint_code])))
            assert actual['sha256'] == expected['sha256'], 'Candidate mismatch'
        self.evidence['candidateSha256'] = expected['sha256']

    def start_hub(self):
        error = open(self.output / 'hub.log', 'a')
        self.logs.append(error)
        env = {k: v for k, v in os.environ.items() if not k.startswith('PARDNER_')}
        env['PARDNER_REPLICA_CREDENTIALS'] = json.dumps(self.replica_credentials)
        self.hub = subprocess.Popen([NODE, str(ROOT / 'bin/pardner.js'), 'serve', '--role', 'hub',
            '--data', str(self.output / 'hub'), '--http-port', '0', '--ws-port', '0'],
            stdout=subprocess.PIPE, stderr=error, text=True, env=env)
        assert select.select([self.hub.stdout], [], [], 15)[0], 'Hub startup timed out'
        ready = json.loads(self.hub.stdout.readline())
        assert ready['success'], ready
        self.connection = json.loads((self.output / 'hub/connection.json').read_text())

    def connect(self, vm):
        config = self.connection
        args = ssh(vm)
        args[1:1] = ['-N', '-o', 'ExitOnForwardFailure=yes',
                     '-R', f"18004:127.0.0.1:{config['httpPort']}",
                     '-R', f"18005:127.0.0.1:{config['wsPort']}"]
        self.tunnels[vm] = self.background(args, f'{vm}-tunnel')
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.tunnels[vm].poll() is not None:
                raise RuntimeError(f'{vm} tunnel exited')
            try:
                guest(vm, 'bash -c "echo > /dev/tcp/127.0.0.1/18004"', timeout=2)
                return
            except subprocess.SubprocessError:
                time.sleep(.1)
        raise RuntimeError('Tunnel startup timed out')

    def disconnect(self, vm):
        child = self.tunnels.pop(vm)
        child.terminate()
        child.wait(timeout=5)

    def start_replica(self, vm):
        # Token travels through encrypted stdin into a private guest file, not argv or logs.
        guest(vm, f'umask 077; cat > {self.remote}/hub-token', input=self.connection['token'])
        guest(vm, f'umask 077; cat > {self.remote}/replica-token', input=self.replica_credentials[vm])
        command = (f'cd {self.remote}/repo; echo $$ > {self.remote}/service.pid; '
                   f'export PARDNER_HUB_TOKEN="$(cat {self.remote}/hub-token)"; '
                   f'export PARDNER_REPLICA_ID={shlex.quote(vm)}; '
                   f'export PARDNER_REPLICA_TOKEN="$(cat {self.remote}/replica-token)"; '
                   f'exec "$HOME/.local/node/bin/node" bin/pardner.js serve --role replica '
                   f'--data {self.remote}/data --hub http://127.0.0.1:18004 '
                   '--hub-ws ws://127.0.0.1:18005/automerge --http-port 8004 --ws-port 8005')
        self.services[vm] = self.background([*ssh(vm), command], f'{vm}-service')
        started = time.monotonic()
        self.wait(lambda: self.cli(vm, 'status')['savedLocally'], 5)
        self.measurements.append({'check': 'replicaStart', 'vm': vm, 'ms': round((time.monotonic()-started)*1000)})

    def stop_replica(self, vm):
        guest(vm, f'kill -TERM "$(cat {self.remote}/service.pid)"')
        self.services.pop(vm).wait(timeout=8)

    def cli(self, vm, *args, actor='test-a', op=None):
        command = [NODE, str(ROOT / 'bin/pardner.js'), '--data', str(self.output / 'hub'), '--json', '--actor', actor]
        if vm:
            command = [f'{self.home}/.local/node/bin/node', f'{self.remote}/repo/bin/pardner.js',
                       '--data', f'{self.remote}/data', '--json', '--actor', actor]
        command.extend(args)
        if op:
            command.extend(['--operation-id', op])
        started = time.monotonic()
        raw = guest(vm, shlex.join(command), timeout=12) if vm else run(command, timeout=12)
        result = json.loads(raw)
        assert result['success'], result
        elapsed = round((time.monotonic()-started)*1000)
        self.measurements.append({'check': args[0], 'vm': vm or 'hub', 'ms': elapsed})
        assert elapsed <= 2000, f'CLI exceeded 2 seconds: {elapsed} ms'
        if op:
            assert result['savedLocally'], result
        return result

    def wait(self, predicate, seconds=10):
        deadline = time.monotonic() + seconds
        last = None
        while time.monotonic() < deadline:
            try:
                if predicate():
                    return
            except (subprocess.SubprocessError, KeyError) as error:
                last = error
            time.sleep(.1)
        raise AssertionError(f'Condition not reached in {seconds}s: {last}')

    def converge(self):
        started = time.monotonic()
        def matches():
            states = [self.cli(vm, 'status') for vm in [None, *VMS]]
            return all(s['heads'] == states[0]['heads'] and not s['syncPending'] for s in states)
        self.wait(matches)
        elapsed = round((time.monotonic()-started)*1000)
        assert elapsed <= 10000, f'Convergence exceeded 10 seconds: {elapsed}'
        self.measurements.append({'check': 'convergence', 'ms': elapsed})

    def exercise(self):
        a, b = VMS
        for actor, kind in [('test-a', 'agent'), ('test-b', 'agent'), ('codex', 'agent'), ('claude', 'agent'), ('ryan', 'human')]:
            self.cli(None, 'actors', 'register', actor, '--handle', actor, '--kind', kind, op=f'register-{actor}')
        for vm in VMS:
            self.connect(vm)
            self.start_replica(vm)
        self.converge()
        states = [self.cli(vm, 'status') for vm in VMS]
        assert states[0]['workspaceId'] == states[1]['workspaceId']
        assert states[0]['replicaId'] != states[1]['replicaId']
        self.evidence['replicas'] = [{k: s[k] for k in ['workspaceId', 'replicaId']} for s in states]
        task = self.cli(a, 'task', 'create', '--title', 'Remote infrastructure rehearsal', op='infra-create')['result']['taskId']
        self.converge()
        observed = [self.cli(vm, 'show', task) for vm in VMS]
        self.log('Partitioning both replica connections')
        for vm in VMS:
            self.disconnect(vm)
        self.wait(lambda: all(not self.cli(vm, 'status')['hubConnected'] for vm in VMS))
        for vm, actor, value, context in zip(VMS, ['test-a','test-b'], ['Offline A','Offline B'], observed):
            result = self.cli(vm, 'update', task, '--title', value,
                '--revisions', json.dumps({'title': context['revisions']['title']}), actor=actor, op=f'edit-{actor}')
            assert result['syncPending']
            self.cli(vm, 'comment', task, value, actor=actor, op=f'comment-{actor}')
        self.stop_replica(a)
        self.start_replica(a)
        recovered = self.cli(a, 'show', task)
        assert recovered['task']['title'] == 'Offline A'
        assert any(c['content']=='Offline A' for c in recovered['comments'])
        self.cli(a, 'comment', task, 'After offline restart', op='after-restart')
        self.log('Restoring connections and checking conflict preservation')
        for vm in VMS:
            self.connect(vm)
        self.converge()
        context = self.cli(a, 'show', task)
        write_json(self.output / 'conflict.json', context)
        assert 'title' in context['conflicts'] and len(context['revisions']['title']) == 2
        assert {(c['value'], c['actorId']) for c in context['conflicts']['title']} == {('Offline A', 'test-a'), ('Offline B', 'test-b')}
        assert len(context['comments']) == 3
        self.cli(a, 'resolve', task, '--field', 'title', '--value', 'Resolved remotely',
                 '--revisions', json.dumps(context['revisions']['title']), op='resolve')
        replay = self.cli(a, 'comment', task, 'After offline restart', op='after-restart')
        assert replay['replayed']
        self.converge()
        for vm in VMS:
            self.stop_replica(vm)
        for vm in VMS:
            self.disconnect(vm)
        self.hub.terminate()
        self.hub.wait(timeout=8)
        self.start_hub()
        for vm in VMS:
            self.connect(vm)
            self.start_replica(vm)
        self.converge()
        for vm in VMS:
            final = self.cli(vm, 'show', task)
            assert final['task']['title'] == 'Resolved remotely' and not final['conflicts']
            assert len(final['comments']) == 3
            assert len([e for e in final['history'] if e['operationId']=='after-restart']) == 1
            write_json(self.output / f'{vm}-final.json', final)
        self.evidence['infrastructure'] = 'pass'
        self.evidence['taskId'] = task

    def prepare_agents(self):
        a, b = VMS
        challenge = {'runId': self.id, 'nonce': uuid.uuid4().hex, 'author': 'codex'}
        payload = json.dumps(challenge, indent=2) + '\n'
        guest(a, f'cat > {self.remote}/challenge.json', input=payload)
        # Explicit network transfer A -> SSH -> controller -> SSH -> B, no shared volume.
        transferred = guest(a, f'cat {self.remote}/challenge.json')
        guest(b, f'cat > {self.remote}/challenge.json', input=transferred)
        digest = hashlib.sha256(payload.encode()).hexdigest()
        assert guest(b, f'sha256sum {self.remote}/challenge.json').split()[0] == digest
        description = (f'Remote real-agent rehearsal authorized by Ryan. Execute all task work in Lima VM {b} '
            f'using limactl shell --workdir={self.remote}/repo {b}. Read {self.remote}/challenge.json there. '
            f'Only create {self.remote}/claude-response.json, containing runId, nonce, actor=claude, cwd from pwd -P, '
            'machineId from /etc/machine-id, and workspaceId/replicaId from local Pardner status. '
            f'Use {self.home}/.local/node/bin/node {self.remote}/repo/bin/pardner.js '
            f'--data {self.remote}/data --actor claude --json for all task reads/writes. '
            'Comment with scope before writing, then hand back to codex in review with observed status/assignee revisions. '
            'Do not use the Mac board wrapper for this task, edit application code, or commit. '
            'Codex will explicitly transfer your response over SSH to VM A and verify the checksum. '
            'Report model/harness version if available; do not claim durable delivery without an inbox.')
        task = self.cli(a, 'task', 'create', '--title', 'Remote VM collaboration rehearsal', '--description', description,
                        '--assignee', 'claude', actor='codex', op='real-agent-create')['result']['taskId']
        self.converge()
        self.evidence['agentTaskId'] = task
        self.evidence['challengeSha256'] = digest
        self.evidence['remoteDirectory'] = self.remote
        instructions = f'Check task {task} on your VM-local Pardner replica:\n\n' + shlex.join([
            'limactl', 'shell', f'--workdir={self.remote}/repo', b,
            f'{self.home}/.local/node/bin/node', f'{self.remote}/repo/bin/pardner.js',
            '--data', f'{self.remote}/data', '--actor', 'claude', '--json', 'show', task]) + '\n'
        (self.output / 'CLAUDE.md').write_text(instructions)

    def close(self):
        for vm in list(self.services):
            try:
                self.stop_replica(vm)
            except Exception as error:
                self.log(f'Could not stop test service {vm}: {error}')
        for vm in list(self.tunnels):
            self.disconnect(vm)
        if self.hub and self.hub.poll() is None:
            self.hub.terminate()
            self.hub.wait(timeout=8)
        for log in self.logs:
            log.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hold', action='store_true', help='Keep services alive for real agents after infrastructure checks')
    parser.add_argument('--infrastructure-only', action='store_true', help='Run replica qualification without creating a manual Claude task')
    args = parser.parse_args()
    rehearsal = Rehearsal()
    rehearsal.log(f'Run directory: {rehearsal.output}')
    (rehearsal.output / 'runner.pid').write_text(str(os.getpid()) + '\n')
    try:
        rehearsal.prepare()
        rehearsal.start_hub()
        rehearsal.exercise()
        if args.infrastructure_only:
            rehearsal.evidence['realAgents'] = 'not-run'
        else:
            rehearsal.prepare_agents()
        write_json(rehearsal.output / 'result.json', rehearsal.evidence)
        write_json(rehearsal.output / 'timings.json', rehearsal.measurements)
        rehearsal.log('Infrastructure PASS. Real agents not run.' if args.infrastructure_only
                      else 'Infrastructure PASS. Real-agent task ready; see CLAUDE.md.')
        if args.hold:
            rehearsal.log('Keeping test services alive. Ctrl-C stops services, preserving VM disks and evidence.')
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    except Exception as error:
        rehearsal.evidence['infrastructure'] = 'fail'
        rehearsal.evidence['error'] = str(error)
        write_json(rehearsal.output / 'result.json', rehearsal.evidence)
        write_json(rehearsal.output / 'timings.json', rehearsal.measurements)
        raise
    finally:
        rehearsal.close()


if __name__ == '__main__':
    main()
