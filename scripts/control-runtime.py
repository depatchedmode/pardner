#!/usr/bin/python3 -I
"""Operate an explicitly provisioned, private macOS Pardner control runtime in client mode."""
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
import urllib.parse
import urllib.request

LABEL = 'app.pardner.control'
LAUNCH_KEYS = ['sha', 'release', 'data', 'node', 'httpPort', 'agents']
CLIENT_API = '/pardner/client/v1'
# Stable operation IDs make first-run provisioning a replay, not a duplicate, when it is retried.
IDENTITY_OPERATION = 'control-runtime-identity'
PROJECT_OPERATION = 'control-runtime-project'
LOCKFILES = ['package-lock.json', 'ui-prototype/package-lock.json',
             'node_modules/.package-lock.json', 'ui-prototype/node_modules/.package-lock.json']
LAUNCHCTL = '/bin/launchctl'
LSOF = '/usr/sbin/lsof'


class ControlError(Exception):
    pass


class ControlUsageError(ControlError):
    """A refused command line, as opposed to a service that is stopped or cannot be verified."""


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
        try:
            self.config = json.loads((self.home / 'config.json').read_text())
        except FileNotFoundError:
            raise ControlError(f'{self.home} is not a Pardner control installation (no config.json); '
                               'pass --home or set PARDNER_CONTROL_HOME') from None
        c = self.config
        if not isinstance(c, dict):
            raise ControlError('Config must be a JSON object')
        for key in LAUNCH_KEYS:
            if key not in c:
                raise ControlError(f'Missing config field: {key}')
        for key in ['release', 'data', 'node']:
            if not isinstance(c[key], str) or not Path(c[key]).is_absolute():
                raise ControlError(f'Config {key} must be an absolute path')
        if not isinstance(c['sha'], str) or not re.fullmatch('[0-9a-f]{40}', c['sha']):
            raise ControlError('Config sha must be an exact Git revision')
        if type(c['httpPort']) is not int or not 1 <= c['httpPort'] <= 65535:
            raise ControlError('Config httpPort must be a fixed TCP port')
        agents = c['agents']
        if not isinstance(agents, list) or not agents or len(set(agents)) != len(agents) or \
                any(not isinstance(a, str) or not re.fullmatch('[a-z0-9-]+', a) for a in agents):
            raise ControlError('Config agents must list the harness IDs of this client\'s agent Actors')
        if 'projectId' in c and (not isinstance(c['projectId'], str) or not c['projectId']):
            raise ControlError('Config projectId must name an existing client project')
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
        self.project_file = self.home / 'project.json'
        self.credentials = self.home / 'credentials'

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
        # Read the pinned declaration without importing app code or opening storage.
        source = (self.release / 'lib/workspace-schema.js').read_text()
        versions = re.findall(r'^export const SCHEMA_VERSION = ([1-9][0-9]*)\s*;?$', source, re.MULTILINE)
        if len(versions) != 1:
            raise ControlError('Cannot establish release schema; preserve storage and inspect the pinned source')
        # Each client project keeps its own workspace; a fresh client has none yet.
        for path in sorted((self.data / 'projects').glob('*/workspace.json')):
            manifest = json.loads(path.read_text())
            version = manifest.get('schemaVersion') if isinstance(manifest, dict) else None
            if type(version) is not int or version != int(versions[0]):
                raise ControlError('Storage schema is incompatible with the release; preserve this installation '
                                   'and choose a separate workspace or an explicitly reviewed migration')

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

    def project_id(self):
        """The configured project, or the one this installation created on its first start."""
        if 'projectId' in self.config:
            return self.config['projectId']
        try:
            value = json.loads(self.project_file.read_text()).get('projectId')
        except FileNotFoundError:
            return None
        if not isinstance(value, str) or not value:
            raise ControlError('project.json is invalid; preserve it and inspect the installation')
        return value

    def operator_token(self):
        connection = json.loads((self.data / 'client-connection.json').read_text())
        token = connection['token']
        if not isinstance(token, str) or not token or '\n' in token or '\r' in token:
            raise ValueError()
        return token

    def request(self, path, token, body=None):
        """Calls the client API on the configured loopback port, ignoring the connection file's URL and all proxies."""
        data = None if body is None else json.dumps(body).encode()
        headers = {'Authorization': f'Bearer {token}', **({} if body is None else {'Content-Type': 'application/json'})}
        request = urllib.request.Request(self.url + CLIENT_API + path, data=data, headers=headers, method='GET' if body is None else 'POST')
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=30) as response:
            value = json.load(response)
        if not isinstance(value, dict):
            raise ValueError()
        return value

    def api_status(self):
        try:
            token = self.operator_token()
        except (OSError, ValueError, KeyError, TypeError):
            return False, None, {'code': 'CONNECTION_METADATA_INVALID'}
        try:
            project_id = self.project_id()
        except ControlError:
            return False, None, {'code': 'PROJECT_METADATA_INVALID'}
        try:
            session = self.request('/session', token)
            projects = [p.get('id') for p in session.get('projects', [])]
            live = {'identity': bool(session.get('identity')), 'projectId': project_id, 'projects': projects, 'status': None}
            if project_id in projects:
                live['status'] = self.request(f'/projects/{urllib.parse.quote(project_id, safe="")}/api/automerge/status', token)
            return True, live, None
        except urllib.error.HTTPError as error:
            return True, None, {'code': f'HTTP_{error.code}'}
        except (ValueError, UnicodeError, AttributeError):
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
        ).returncode == 0 for port in [self.config['httpPort']]))
        responding, live, api_error = False, None, None
        if checks['listeners']:
            responding, live, api_error = self.api_status()
        else:
            api_error = {'code': 'MANAGED_LISTENERS_UNAVAILABLE'}
        workspace = (live or {}).get('status') or {}
        checks['authenticated'] = live is not None
        checks['project'] = bool(live and live['projectId'] and workspace.get('workspaceId') == live['projectId'])
        checks['saved'] = checks['project'] and workspace.get('savedLocally') is True and not workspace.get('storageError')
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
            if status['checks']['authenticated'] and not status['live']['projectId']:
                self.provision(status['live'])
                continue
            if time.monotonic() >= deadline:
                raise ControlError('Runtime did not become healthy; inspect status and private service logs')
            time.sleep(0.2)

    def provision(self, live):
        """On the first start, confirms the client identity and creates this installation's project."""
        if live['projects']:
            raise ControlError('This client already has projects; name the one to manage in config.projectId')
        token = self.operator_token()
        if not live['identity']:
            identity = self.config.get('identity')
            if not isinstance(identity, dict) or not all(isinstance(identity.get(key), str) and identity[key] for key in ['name', 'email']):
                raise ControlError('Record the person this client acts for in config.identity (name and email) before the first start')
            self.request('/identity', token, {'name': identity['name'], 'email': identity['email'], 'operationId': IDENTITY_OPERATION})
        name = self.config.get('projectName')
        if not isinstance(name, str) or not name.strip():
            raise ControlError('Record the project to create in config.projectName before the first start')
        project = self.request('/projects', token, {'name': name, 'operationId': PROJECT_OPERATION})['project']
        atomic_json(self.project_file, {'projectId': project['id']})

    def run(self):
        job = self.job()
        if not job['loaded'] or not job['owned'] or job['pid'] != os.getpid():
            raise ControlError('run is reserved for the process assigned by launchd')
        self.verify_release()
        atomic_json(self.home / 'running.json', {'pid': os.getpid(), 'launch': self.launch_identity()})
        os.chdir(self.release)
        # The client binds loopback only. The first agent harness is the client's setup agent when its data is fresh.
        self.exec_node(['client', 'serve', '--data', str(self.data), '--http-port', str(self.config['httpPort']),
                        '--harness', self.config['agents'][0]], environment(self.config['node']))

    def exec_node(self, argv, env):
        os.execve(self.config['node'], [self.config['node'], str(self.release / 'bin/pardner.js'), *argv], env)

    def require_service(self):
        status = self.status()
        if not all(value for key, value in status['checks'].items() if key != 'saved'):
            raise ControlError('The selected managed service cannot be verified; inspect control status')
        return status

    def credential(self, agent):
        """The agent's private client credential (the client agent-grant JSON), granted on first use."""
        project_id = self.project_id()
        path = self.credentials / f'{agent}.json'
        api_base = f'{self.url}{CLIENT_API}/projects/{urllib.parse.quote(project_id, safe="")}/api'
        try:
            saved = json.loads(path.read_text())
            if isinstance(saved, dict) and saved.get('projectId') == project_id and saved.get('apiBase') == api_base:
                return path, api_base
        except FileNotFoundError:
            pass
        grant = self.request(f'/projects/{urllib.parse.quote(project_id, safe="")}/agent-grant', self.operator_token(), {'harnessId': agent})
        self.credentials.mkdir(mode=0o700, exist_ok=True)
        self.credentials.chmod(0o700)
        atomic_json(path, {**grant, 'apiBase': api_base})
        return path, api_base

    def cli(self, argv, agent):
        if not argv or argv[0].startswith('--') or argv[0] in ['serve', 'bridge', 'client', 'open']:
            raise ControlUsageError('Supply a coordination command; lifecycle, client and bridge commands are not Actor entrypoints')
        protected = {'--data', '--server', '--token', '--token-file', '--actor', '--agent', '--role', '--http-port', '--ws-port'}
        if protected.intersection(argv):
            raise ControlUsageError('The control installation selects connection settings and the entrypoint Actor')
        if agent not in self.config['agents']:
            raise ControlUsageError('Name an agent harness from config.agents; people use control open')
        self.require_service()
        try:
            path, api_base = self.credential(agent)
        except urllib.error.HTTPError as error:
            raise ControlError(f'The client refused an agent credential for {agent} (HTTP {error.code}); '
                               'only the client\'s enrolled agent harnesses have one')
        self.exec_node(['--data', str(self.data), '--server', api_base, '--token-file', str(path), *argv],
                       environment(self.config['node']))

    def open(self, argv):
        if argv and (len(argv) != 2 or argv[0] != '--output-file'):
            raise ControlUsageError('open accepts only --output-file FILE')
        self.require_service()
        self.exec_node(['client', 'open', '--data', str(self.data), *argv], environment(self.config['node']))

    def seal(self):
        job = self.job()
        if job['loaded'] and job['owned']:
            raise ControlError('Stop this installation before recording deployment artifacts')
        self.verify_code()
        atomic_json(self.home / 'deployment.json', self.artifacts())

    def entrypoints(self):
        self.verify_release()
        for agent in self.config['agents']:
            path = self.home / f'pardner-{agent}'
            script = '#!/bin/sh\ncontrol_home=$(CDPATH= cd -P "$(/usr/bin/dirname "$0")" && /bin/pwd -P) || exit 1\n'
            script += f'exec /usr/bin/python3 -I "$control_home/control" cli --home "$control_home" --agent {shlex.quote(agent)} -- "$@"\n'
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
    parser.add_argument('action', choices=['start', 'status', 'stop', 'restart', 'run', 'cli', 'open', 'seal', 'entrypoints'])
    parser.add_argument('--home', type=Path)
    parser.add_argument('--agent')
    args, unknown = parser.parse_known_args(argv[:separator])
    if unknown:
        parser.error(f'unrecognized arguments: {" ".join(unknown)}; '
                     'arguments for cli/open go after --, e.g. control open -- --output-file FILE')
    if args.action != 'cli' and args.agent:
        parser.error('Only cli accepts --agent')
    if args.action not in ['cli', 'open'] and forwarded:
        parser.error('Only cli and open accept arguments after --')
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
            control.cli(forwarded, args.agent)
            return 0
        if args.action == 'open':
            control.open(forwarded)
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
            code = 'INVALID_ARGUMENT' if isinstance(error, ControlUsageError) else 'CONTROL_RUNTIME_UNAVAILABLE'
            print(json.dumps({'success': False, 'error': {'code': code,
                                                       'message': str(error), 'details': None}}))
        print(f'Control runtime: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
