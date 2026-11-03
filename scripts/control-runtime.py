#!/usr/bin/python3 -I
"""Operate an explicitly provisioned, private macOS Pardner control runtime."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request

LABEL = 'app.pardner.control'
LAUNCH_KEYS = ['sha', 'release', 'data', 'node', 'role', 'httpPort', 'wsPort']
LOCKFILES = ['package-lock.json', 'ui-prototype/package-lock.json',
             'node_modules/.package-lock.json', 'ui-prototype/node_modules/.package-lock.json']
LAUNCHCTL = '/bin/launchctl'
LSOF = '/usr/sbin/lsof'


class ControlError(Exception):
    pass


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def environment(node=None):
    path = '/usr/bin:/bin:/usr/sbin:/sbin'
    return {'HOME': str(Path.home()), 'PATH': f'{Path(node).parent}:{path}' if node else path}


def atomic_json(path, value):
    temporary = path.with_name(f'.{path.name}-{os.getpid()}')
    try:
        with open(temporary, 'w', opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
            json.dump(value, stream, indent=2)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class Controller:
    def __init__(self, home):
        self.home = Path(home).resolve()
        self.config = json.loads((self.home / 'config.json').read_text())
        c = self.config
        if not isinstance(c, dict):
            raise ControlError('Config must be a JSON object')
        for key in LAUNCH_KEYS + ['workspaceId', 'replicaId']:
            if key not in c:
                raise ControlError(f'Missing config field: {key}')
        for key in ['release', 'data', 'node']:
            if not isinstance(c[key], str) or not Path(c[key]).is_absolute():
                raise ControlError(f'Config {key} must be an absolute path')
        if not isinstance(c['sha'], str) or not re.fullmatch('[0-9a-f]{40}', c['sha']):
            raise ControlError('Config sha must be an exact Git revision')
        if c['role'] not in ['hub', 'replica']:
            raise ControlError('Config role must be hub or replica')
        for key in ['httpPort', 'wsPort']:
            if type(c[key]) is not int or not 1 <= c[key] <= 65535:
                raise ControlError(f'Config {key} must be a fixed TCP port')
        if c['httpPort'] == c['wsPort']:
            raise ControlError('HTTP and WebSocket ports must differ')
        for key in ['workspaceId', 'replicaId']:
            if not isinstance(c[key], str) or not c[key]:
                raise ControlError(f'Config {key} must name the enrolled identity')
        self.release = Path(c['release']).resolve()
        self.data = Path(c['data']).resolve()
        if self.data != self.home / 'data':
            raise ControlError('Control data must be this installation\'s data directory')
        try:
            self.release.relative_to(self.home / 'releases')
        except ValueError:
            raise ControlError('Release must be inside this installation\'s releases directory')
        self.service = f'gui/{os.getuid()}/{LABEL}'
        self.url = f'http://127.0.0.1:{c["httpPort"]}'

    def command(self, argv, **kwargs):
        env = environment()
        if argv[0] == '/usr/bin/git':
            env.update(GIT_OPTIONAL_LOCKS='0', GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1')
        return subprocess.run(argv, env=env, capture_output=True, text=True, timeout=15, **kwargs)

    def verify_code(self):
        git_dir = self.release / '.git'
        if not git_dir.is_dir() or git_dir.is_symlink() or (git_dir / 'objects/info/alternates').exists():
            raise ControlError('Control release needs an independent Git clone')
        git = ['/usr/bin/git', f'--git-dir={git_dir}', f'--work-tree={self.release}']
        if self.command(git + ['rev-parse', 'HEAD'], check=True).stdout.strip() != self.config['sha']:
            raise ControlError('Control revision changed; follow the explicit upgrade procedure')
        if self.command(git + ['status', '--porcelain'], check=True).stdout.strip():
            raise ControlError('Control release has changes; preserve it and investigate')
        if self.command([self.config['node'], '--version'], check=True).stdout.strip() != 'v24.11.1':
            raise ControlError('Control runtime requires Node 24.11.1')
        manifest = json.loads((self.data / 'workspace.json').read_text())
        if not isinstance(manifest, dict) or any(manifest.get(key) != self.config[key] for key in ['workspaceId', 'replicaId', 'role']):
            raise ControlError('Control storage identity or role mismatch')

    def artifacts(self):
        dist = self.release / 'ui-prototype/dist'
        if not (dist / 'index.html').is_file():
            raise ControlError('Build the detached release UI before sealing it')
        files = [self.release / name for name in LOCKFILES]
        for path in dist.rglob('*'):
            if path.is_symlink():
                raise ControlError('Deployed UI must not contain symlinks')
            if path.is_file():
                files.append(path)
        hashes = {}
        for path in sorted(files):
            try:
                path.resolve().relative_to(self.release)
            except ValueError:
                raise ControlError('Deployed artifacts must be independent of candidate directories')
            hashes[str(path.relative_to(self.release))] = digest(path)
        return {'sha': self.config['sha'], 'files': hashes}

    def verify_release(self):
        self.verify_code()
        if json.loads((self.home / 'deployment.json').read_text()) != self.artifacts():
            raise ControlError('Deployed UI or dependency lock identity changed; prepare a new release')

    def job(self):
        result = self.command([LAUNCHCTL, 'print', self.service])
        origin = re.search(r'^\tpath = (.+)$', result.stdout, re.MULTILINE)
        pid = re.search(r'^\tpid = (\d+)$', result.stdout, re.MULTILINE)
        return {'loaded': result.returncode == 0,
                'owned': bool(origin and Path(origin[1]).resolve() == self.home / 'service.plist'),
                'pid': int(pid[1]) if pid else None}

    def launch_identity(self):
        return {**{key: self.config[key] for key in LAUNCH_KEYS},
                'deployment': digest(self.home / 'deployment.json'),
                'controller': digest(self.home / 'control')}

    def api_status(self):
        try:
            connection = json.loads((self.data / 'connection.json').read_text())
            token = connection['token']
            if not isinstance(token, str) or not token or '\n' in token or '\r' in token:
                raise ValueError()
        except (OSError, ValueError, KeyError, TypeError):
            return False, None, {'code': 'CONNECTION_METADATA_INVALID'}
        request = urllib.request.Request(self.url + '/automerge/status', headers={'Authorization': f'Bearer {token}'})
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=5) as response:
                live = json.load(response)
            if not isinstance(live, dict):
                raise ValueError()
            return True, live, None
        except urllib.error.HTTPError as error:
            return True, None, {'code': f'HTTP_{error.code}'}
        except (ValueError, UnicodeError):
            return True, None, {'code': 'INVALID_STATUS_JSON'}
        except (OSError, urllib.error.URLError):
            return False, None, {'code': 'SERVICE_UNREACHABLE'}

    def status(self):
        checks, errors = {}, {}
        try:
            self.verify_release()
            checks['release'] = True
        except (ControlError, OSError, ValueError, subprocess.SubprocessError) as error:
            checks['release'] = False
            errors['release'] = str(error)
        job = self.job()
        checks['owner'] = job['loaded'] and job['owned']
        if not checks['owner']:
            errors['job'] = 'Loaded job belongs to another installation' if job['loaded'] else 'Control job is not loaded'
        running = {}
        try:
            running = json.loads((self.home / 'running.json').read_text())
            if not isinstance(running, dict) or not isinstance(running.get('launch'), dict):
                raise ValueError()
            checks['launch'] = job['pid'] is not None and running.get('pid') == job['pid']
            checks['configuration'] = running.get('launch') == self.launch_identity()
        except (OSError, ValueError):
            checks.update(launch=False, configuration=False)
            errors['launch'] = 'Launch record is missing or invalid'
        checks['listeners'] = bool(checks['owner'] and job['pid'] and all(self.command(
            [LSOF, '-nP', '-a', '-p', str(job['pid']), f'-iTCP:{port}', '-sTCP:LISTEN']
        ).returncode == 0 for port in [self.config['httpPort'], self.config['wsPort']]))
        responding, live, api_error = False, None, None
        if checks['listeners']:
            responding, live, api_error = self.api_status()
        else:
            api_error = {'code': 'MANAGED_LISTENERS_UNAVAILABLE'}
        checks['authenticated'] = live is not None
        checks['identity'] = live is not None and all(live.get(key) == self.config[key] for key in ['workspaceId', 'replicaId', 'role'])
        checks['saved'] = live is not None and live.get('savedLocally') is True and not live.get('storageError')
        if api_error:
            errors['api'] = api_error
        return {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'pinnedSha': self.config['sha'], 'runningSha': running.get('launch', {}).get('sha') if checks['launch'] else None,
                'managedServiceLoaded': job['loaded'], 'pid': job['pid'], 'apiUrl': self.url,
                'apiChecked': checks['listeners'], 'responding': responding, 'ownsListeners': checks['listeners'],
                'healthy': all(checks.values()), 'checks': checks, 'errors': errors, 'live': live}

    def stop(self):
        job = self.job()
        if job['loaded'] and not job['owned']:
            raise ControlError('Loaded control job belongs to another installation; refusing access')
        if job['loaded']:
            self.command([LAUNCHCTL, 'bootout', self.service], check=True)
        deadline = time.monotonic() + 20
        while job['pid']:
            try:
                os.kill(job['pid'], 0)
            except ProcessLookupError:
                return
            if time.monotonic() >= deadline:
                raise ControlError('Stopped job still has a process; inspect it before restarting')
            time.sleep(0.1)

    def start(self):
        self.verify_release()
        if self.job()['loaded']:
            raise ControlError('A control job is already loaded; inspect status or explicitly restart its installation')
        self.command([LAUNCHCTL, 'bootstrap', f'gui/{os.getuid()}', str(self.home / 'service.plist')], check=True)
        deadline = time.monotonic() + 60
        while True:
            status = self.status()
            if status['healthy']:
                return status
            if time.monotonic() >= deadline:
                raise ControlError('Runtime did not become healthy; inspect status and private service logs')
            time.sleep(0.2)

    def run(self):
        job = self.job()
        if not job['loaded'] or not job['owned'] or job['pid'] != os.getpid():
            raise ControlError('run is reserved for the process assigned by launchd')
        self.verify_release()
        atomic_json(self.home / 'running.json', {'pid': os.getpid(), 'launch': self.launch_identity()})
        os.chdir(self.release)
        env = environment(self.config['node'])
        env.update(PARDNER_BIND_HOST='127.0.0.1', PARDNER_ALLOWED_ORIGINS=f'http://localhost:{self.config["httpPort"]},http://127.0.0.1:{self.config["httpPort"]}')
        self.exec_node(['serve', '--data', str(self.data), '--role', self.config['role'],
                        '--http-port', str(self.config['httpPort']), '--ws-port', str(self.config['wsPort'])], env)

    def exec_node(self, argv, env):
        os.execve(self.config['node'], [self.config['node'], str(self.release / 'bin/pardner.js'), *argv], env)

    def cli(self, argv, actor):
        if not argv or argv[0].startswith('--') or argv[0] in ['serve', 'bridge']:
            raise ControlError('Supply a coordination command; lifecycle and bridge commands are not Actor entrypoints')
        protected = {'--data', '--server', '--token', '--role', '--hub', '--hub-ws', '--hub-token', '--http-port', '--ws-port'}
        if protected.intersection(argv) or (actor and '--actor' in argv):
            raise ControlError('The control installation selects connection settings and the entrypoint Actor')
        status = self.status()
        if not all(value for key, value in status['checks'].items() if key != 'saved'):
            raise ControlError('The selected managed service cannot be verified; inspect control status')
        options = ['--data', str(self.data), '--server', self.url]
        if actor:
            options += ['--actor', actor]
        self.exec_node([*options, *argv], environment(self.config['node']))

    def seal(self):
        job = self.job()
        if job['loaded'] and job['owned']:
            raise ControlError('Stop this installation before recording deployment artifacts')
        self.verify_code()
        atomic_json(self.home / 'deployment.json', self.artifacts())

    def entrypoints(self):
        self.verify_release()
        actors = self.config.get('actors')
        if not isinstance(actors, list) or not actors or any(not isinstance(a, str) or not re.fullmatch('[A-Za-z0-9_-]+', a) for a in actors):
            raise ControlError('Record filename-safe existing Actor IDs in config.actors first')
        for actor in actors:
            path = self.home / f'pardner-{actor}'
            script = '#!/bin/sh\ncontrol_home=$(CDPATH= cd -P "$(/usr/bin/dirname "$0")" && /bin/pwd -P) || exit 1\n'
            script += f'exec /usr/bin/python3 -I "$control_home/control" cli --home "$control_home" --actor {shlex.quote(actor)} -- "$@"\n'
            temporary = path.with_name(f'.{path.name}-{os.getpid()}')
            try:
                temporary.write_text(script)
                temporary.chmod(0o700)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    separator = argv.index('--') if '--' in argv else len(argv)
    forwarded = argv[separator + 1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'status', 'stop', 'restart', 'run', 'cli', 'seal', 'entrypoints'])
    parser.add_argument('--home', type=Path)
    parser.add_argument('--actor')
    args = parser.parse_args(argv[:separator])
    if args.action != 'cli' and (forwarded or args.actor):
        parser.error('Only cli accepts --actor and arguments after --')
    home = args.home or os.environ.get('PARDNER_CONTROL_HOME') or Path(__file__).resolve().parent
    try:
        control = Controller(home)
        if args.action == 'status':
            status = control.status()
            print(json.dumps(status, indent=2))
            return 0 if status['healthy'] else 1
        if args.action == 'run':
            control.run()
            return 0
        if args.action == 'cli':
            control.cli(forwarded, args.actor)
            return 0
        with (control.home / 'control.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.action == 'seal':
                control.seal()
            elif args.action == 'entrypoints':
                control.entrypoints()
            else:
                if args.action == 'restart':
                    control.verify_release()
                if args.action in ['stop', 'restart']:
                    control.stop()
                if args.action in ['start', 'restart']:
                    print(json.dumps(control.start(), indent=2))
        return 0
    except (ControlError, OSError, ValueError, subprocess.SubprocessError) as error:
        if args.action == 'cli':
            print(json.dumps({'success': False, 'error': {'code': 'CONTROL_RUNTIME_UNAVAILABLE',
                                                       'message': str(error), 'details': None}}))
        print(f'Control runtime: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
