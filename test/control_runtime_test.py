import http.server
import contextlib
import io
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/control-runtime.py'
spec = importlib.util.spec_from_file_location('control_runtime', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NODE = str(Path(shutil.which('node')).resolve())


def git(directory, *argv):
    return subprocess.check_output(['/usr/bin/git', '-C', str(directory), *argv],
                                   env={**module.environment(), 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}, text=True).strip()


def mirror_working_source(source, release):
    tracked = set(git(source, 'ls-files', '--cached', '-z').split('\0'))
    paths = git(source, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
    for name in filter(None, paths):
        origin, target = source / name, release / name
        if name not in tracked and name in {'node_modules', 'ui-prototype/node_modules'} and origin.is_symlink():
            # Dependencies are prepared separately; these links describe the test environment, not source.
            continue
        if origin.is_symlink():
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.is_symlink() or target.exists():
                target.unlink()
            os.symlink(os.readlink(origin), target)
        elif origin.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origin, target)
        elif target.is_symlink() or target.exists():
            target.unlink()


class FixtureTests(unittest.TestCase):
    def test_working_source_preserves_source_links_and_excludes_dependency_links(self):
        with tempfile.TemporaryDirectory(prefix='pardner-control-fixture-') as scratch:
            root = Path(scratch)
            source, release, install = root / 'source', root / 'release', root / 'install'
            for path in [source, release, install, source / 'ui-prototype', source / '.claude']:
                path.mkdir()
            git(source, 'init', '-q')
            (source / '.gitignore').write_text('node_modules/\nui-prototype/node_modules/\n')
            (source / '.claude/skills').symlink_to('../.agents/skills')
            git(source, 'add', '.gitignore', '.claude/skills')
            (source / 'candidate.txt').write_text('uncommitted source')
            for name in ['node_modules', 'ui-prototype/node_modules']:
                (source / name).symlink_to(install, target_is_directory=True)
            (install / 'dependency.txt').write_text('installed dependency')
            mirror_working_source(source, release)
            self.assertEqual(os.readlink(release / '.claude/skills'), '../.agents/skills')
            self.assertEqual((release / 'candidate.txt').read_text(), 'uncommitted source')
            for name in ['node_modules', 'ui-prototype/node_modules']:
                self.assertFalse((release / name).is_symlink())
                self.assertFalse((release / name).exists())
                shutil.copytree(source / name, release / name, symlinks=False)
                self.assertEqual((release / name / 'dependency.txt').read_text(), 'installed dependency')


AGENT = 'openai-codex'


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def configure(home, release, http_port=None, **extra):
    config = {'sha': git(release, 'rev-parse', 'HEAD'), 'release': str(release), 'data': str(home / 'data'),
              'node': NODE, 'httpPort': http_port or free_port(), 'agents': [AGENT],
              'identity': {'name': 'Fixture Person', 'email': 'person@example.invalid'}, 'projectName': 'Control fixture', **extra}
    module.atomic_json(home / 'config.json', config)
    return module.Controller(home)


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='pardner-control-unit-')
        self.addCleanup(self.scratch.cleanup)
        self.home = Path(self.scratch.name) / 'installation'
        self.release = self.home / 'releases/pinned'
        self.release.mkdir(parents=True)
        self.data = self.home / 'data'
        self.manifest = self.data / 'projects/fixture/workspace.json'
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({'workspaceId': 'workspace', 'replicaId': 'replica', 'role': 'hub', 'schemaVersion': 4}))
        shutil.copy2(SOURCE, self.home / 'control')
        (self.home / 'service.plist').write_text('fixture job')
        git(self.release, 'init', '-q')
        (self.release / '.gitignore').write_text('node_modules/\nui-prototype/dist/\nui-prototype/node_modules/\n')
        (self.release / 'lib').mkdir()
        (self.release / 'lib/workspace-schema.js').write_text('export const SCHEMA_VERSION = 4\n')
        (self.release / 'bin').mkdir()
        (self.release / 'bin/pardner.js').write_text('process.exit(17)\n')
        for name in module.LOCKFILES:
            p = self.release / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('{}')
        dist = self.release / 'ui-prototype/dist'
        dist.mkdir()
        (dist / 'index.html').write_text('<p>fixture</p>')
        git(self.release, 'add', '.')
        git(self.release, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
            '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
        self.control = configure(self.home, self.release)
        with patch.object(self.control, 'job', return_value={'loaded': False, 'owned': False, 'pid': None}):
            self.control.seal()

    def test_environment_home_and_explicit_home_select_the_requested_installation(self):
        env = {**module.environment(), 'HOME': self.scratch.name, 'PARDNER_CONTROL_HOME': str(self.home)}
        result = subprocess.run(['/usr/bin/python3', str(self.home / 'control'), 'entrypoints'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / f'pardner-{AGENT}').exists())
        env['PARDNER_CONTROL_HOME'] = str(self.home / 'nonexistent')
        result = subprocess.run(['/usr/bin/python3', str(self.home / 'control'), 'entrypoints', '--home', str(self.home)], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        env.pop('PARDNER_CONTROL_HOME')
        result = subprocess.run(['/usr/bin/python3', str(self.home / 'control'), 'entrypoints'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_malformed_config_has_a_control_error_without_a_traceback(self):
        (self.home / 'config.json').write_text('{}')
        result = subprocess.run(['/usr/bin/python3', str(SOURCE), 'status', '--home', str(self.home)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Missing config field', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_inherited_git_settings_cannot_certify_another_repository(self):
        alternate = Path(self.scratch.name) / 'alternate'
        subprocess.run(['/usr/bin/git', 'clone', '--quiet', '--no-hardlinks', str(self.release), str(alternate)], check=True)
        (self.release / 'unexpected').write_text('dirty release')
        with patch.dict(os.environ, {'GIT_DIR': str(alternate / '.git'), 'GIT_WORK_TREE': str(alternate), 'GIT_INDEX_FILE': str(alternate / 'index')}):
            with self.assertRaisesRegex(module.ControlError, 'has changes'):
                self.control.verify_release()

    def test_changed_ui_and_installed_dependency_identity_are_rejected(self):
        for name in ['ui-prototype/dist/index.html', 'node_modules/.package-lock.json']:
            path = self.release / name
            original = path.read_bytes()
            try:
                path.write_text('changed artifact')
                with self.assertRaisesRegex(module.ControlError, 'identity changed'):
                    self.control.verify_release()
            finally:
                path.write_bytes(original)

    def test_candidate_symlink_artifacts_are_rejected(self):
        path = self.release / 'ui-prototype/dist/external'
        path.symlink_to(Path(self.scratch.name))
        with self.assertRaisesRegex(module.ControlError, 'symlinks'):
            self.control.verify_release()

    def test_sealing_an_active_installation_is_rejected(self):
        with patch.object(self.control, 'job', return_value={'loaded': True, 'owned': True, 'pid': os.getpid()}):
            with self.assertRaisesRegex(module.ControlError, 'Stop this installation'):
                self.control.seal()

    def test_incompatible_schema_cannot_seal_start_or_stop_for_restart(self):
        manifest = self.manifest
        for version in [2, None, '4', True]:
            with self.subTest(version=version):
                metadata = json.loads(manifest.read_text())
                metadata['schemaVersion'] = version
                manifest.write_text(json.dumps(metadata))
                before = {p: p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
                with patch.object(self.control, 'job', return_value={'loaded': False, 'owned': False, 'pid': None}):
                    for action in [self.control.seal, self.control.start]:
                        with self.assertRaisesRegex(module.ControlError, 'schema is incompatible'):
                            action()
                with patch.object(module, 'Controller', return_value=self.control), patch.object(self.control, 'stop') as stop, patch.object(self.control, 'start') as start, contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(module.main(['restart', '--home', str(self.home)]), 1)
                    stop.assert_not_called()
                    start.assert_not_called()
                for path, content in before.items():
                    self.assertEqual(path.read_bytes(), content, str(path))
                self.assertFalse((self.data / 'runtime-lock.sqlite').exists())

    def test_compatibility_follows_selected_release_including_historical_and_future_schema(self):
        for version in [2, 5]:
            with self.subTest(version=version):
                (self.release / 'lib/workspace-schema.js').write_text(f'export const SCHEMA_VERSION = {version}\n')
                git(self.release, 'add', '.')
                git(self.release, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'selected release')
                self.control.config['sha'] = git(self.release, 'rev-parse', 'HEAD')
                manifest = self.manifest
                metadata = json.loads(manifest.read_text())
                metadata['schemaVersion'] = version
                manifest.write_text(json.dumps(metadata))
                before = manifest.read_bytes()
                self.control.verify_code()
                self.assertEqual(manifest.read_bytes(), before)
                self.assertFalse((self.data / 'runtime-lock.sqlite').exists())

    def test_unrecognized_schema_declaration_fails_closed(self):
        path = self.release / 'lib/workspace-schema.js'
        for declaration in ['', 'export const SCHEMA_VERSION = 4 + 1',
                            'export const SCHEMA_VERSION = 4\nexport const SCHEMA_VERSION = 5']:
            with self.subTest(declaration=declaration):
                path.write_text(declaration)
                git(self.release, 'add', '.')
                git(self.release, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'schema fixture')
                self.control.config['sha'] = git(self.release, 'rev-parse', 'HEAD')
                with self.assertRaisesRegex(module.ControlError, 'Cannot establish release schema'):
                    self.control.verify_code()

    def test_direct_run_cannot_overwrite_launch_metadata(self):
        record = {'pid': 123, 'launch': {'sha': 'earlier'}}
        module.atomic_json(self.home / 'running.json', record)
        with patch.object(self.control, 'job', return_value={'loaded': True, 'owned': True, 'pid': os.getpid() + 1}):
            with self.assertRaisesRegex(module.ControlError, 'reserved'):
                self.control.run()
        self.assertEqual(json.loads((self.home / 'running.json').read_text()), record)

    def test_foreign_installation_is_not_stopped(self):
        with patch.object(self.control, 'job', return_value={'loaded': True, 'owned': False, 'pid': 123}), patch.object(self.control, 'command') as command:
            with self.assertRaisesRegex(module.ControlError, 'another installation'):
                self.control.stop()
            command.assert_not_called()

    def test_actor_entrypoints_reject_lifecycle_and_connection_overrides(self):
        for args, agent in [(['serve'], AGENT), (['bridge', 'run'], AGENT), (['client', 'open'], AGENT), (['open'], AGENT),
                            (['--actor', 'alice', 'serve'], AGENT), (['tasks', '--server', 'http://elsewhere'], AGENT),
                            (['tasks', '--token-file', '/tmp/other'], AGENT), (['comment', 'T', 'x', '--actor', 'someone'], AGENT),
                            (['tasks'], None), (['tasks'], 'unlisted-harness')]:
            with self.subTest(args=args, agent=agent), patch.object(self.control, 'status') as status:
                with self.assertRaises(module.ControlError):
                    self.control.cli(args, agent)
                status.assert_not_called()

    def test_open_accepts_only_an_output_file(self):
        for args in [['--data', '/elsewhere'], ['--output-file'], ['--output-file', 'a', 'b']]:
            with self.subTest(args=args), patch.object(self.control, 'status') as status:
                with self.assertRaises(module.ControlError):
                    self.control.open(args)
                status.assert_not_called()

    def test_first_start_refuses_to_adopt_an_unnamed_existing_project(self):
        with patch.object(self.control, 'request') as request:
            with self.assertRaisesRegex(module.ControlError, 'config.projectId'):
                self.control.provision({'identity': True, 'projectId': None, 'projects': ['someone-elses'], 'status': None})
            request.assert_not_called()
        self.assertFalse(self.control.project_file.exists())

    def test_human_actor_options_are_not_entrypoint_options(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                module.main(['cli', '--home', str(self.home), '--actor', 'alice', '--', 'tasks'])
            with self.assertRaises(SystemExit):
                module.main(['status', '--home', str(self.home), '--agent', AGENT])

    def test_actor_guard_failures_preserve_the_json_error_envelope(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(module, 'Controller', return_value=self.control), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = module.main(['cli', '--home', str(self.home), '--agent', AGENT, '--', 'serve'])
        self.assertEqual(code, 1)
        result = json.loads(stdout.getvalue())
        self.assertFalse(result['success'])
        self.assertEqual(result['error']['code'], 'INVALID_ARGUMENT')
        self.assertIn('Control runtime:', stderr.getvalue())

    def test_usage_refusals_and_unavailable_service_have_distinct_codes(self):
        def run(args):
            stdout = io.StringIO()
            with patch.object(module, 'Controller', return_value=self.control), contextlib.redirect_stdout(stdout), \
                    contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(module.main(args), 1)
            return json.loads(stdout.getvalue())['error']['code']
        for args in [['cli', '--home', str(self.home), '--', 'tasks'],
                     ['cli', '--home', str(self.home), '--agent', AGENT, '--', 'tasks', '--server', 'http://elsewhere']]:
            with self.subTest(args=args):
                self.assertEqual(run(args), 'INVALID_ARGUMENT')
        unavailable = module.ControlError('The selected managed service cannot be verified; inspect control status')
        with patch.object(self.control, 'require_service', side_effect=unavailable):
            self.assertEqual(run(['cli', '--home', str(self.home), '--agent', AGENT, '--', 'tasks']), 'CONTROL_RUNTIME_UNAVAILABLE')

    def test_a_directory_without_config_is_named_as_not_an_installation(self):
        empty = Path(self.scratch.name) / 'not-an-installation'
        empty.mkdir()
        result = subprocess.run(['/usr/bin/python3', str(SOURCE), 'status', '--home', str(empty)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('is not a Pardner control installation (no config.json); pass --home or set PARDNER_CONTROL_HOME', result.stderr)
        self.assertNotIn('Errno', result.stderr)

    def test_open_options_before_the_separator_explain_the_separator(self):
        result = subprocess.run(['/usr/bin/python3', str(SOURCE), 'open', '--home', str(self.home), '--output-file', 'launch.txt'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('arguments for cli/open go after --, e.g. control open -- --output-file FILE', result.stderr)

    def test_bad_launch_record_and_dirty_release_still_allow_live_diagnostics(self):
        (self.home / 'running.json').write_text('{partial')
        (self.release / 'unexpected').write_text('drift')
        live = {'identity': True, 'projectId': 'workspace', 'projects': ['workspace'],
                'status': {'role': 'hub', 'workspaceId': 'workspace', 'savedLocally': True, 'storageError': None}}
        original_command = self.control.command
        def command(argv, **kwargs):
            if argv[0] == module.LSOF:
                return subprocess.CompletedProcess(argv, 0, '', '')
            return original_command(argv, **kwargs)
        with patch.object(self.control, 'job', return_value={'loaded': True, 'owned': True, 'pid': os.getpid()}), patch.object(self.control, 'command', side_effect=command), patch.object(self.control, 'api_status', return_value=(True, live, None)):
            status = self.control.status()
        self.assertTrue(status['responding'])
        self.assertFalse(status['healthy'])
        self.assertFalse(status['checks']['release'])
        self.assertFalse(status['checks']['launch'])
        self.assertIn('release', status['errors'])

    def test_health_ignores_stale_connection_url_and_environment_proxy(self):
        requests = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(handler):
                requests.append(handler.path)
                handler.send_response(401)
                handler.end_headers()
            def log_message(self, *args):
                pass
        server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.control.url = f'http://127.0.0.1:{server.server_port}'
        (self.data / 'client-connection.json').write_text(json.dumps({'url': 'http://127.0.0.1:1', 'token': 'fixture-only'}))
        with patch.dict(os.environ, {'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''}):
            responding, live, error = self.control.api_status()
        self.assertTrue(responding)
        self.assertIsNone(live)
        self.assertEqual(error['code'], 'HTTP_401')
        self.assertEqual(requests, ['/pardner/client/v1/session'])


@unittest.skipUnless(sys.platform == 'darwin', 'macOS controller integration uses macOS PID listener tools')
class RecoveryTests(unittest.TestCase):
    def test_real_service_recovery_entrypoints_and_source_removal(self):
        with tempfile.TemporaryDirectory(prefix='pardner-control-recovery-') as scratch:
            root = Path(scratch)
            job_state = root / 'fixture-launchd.json'
            process = None

            def prepare(name, source):
                home = root / name
                release = home / 'releases/pinned'
                release.parent.mkdir(parents=True)
                subprocess.run(['/usr/bin/git', 'clone', '--quiet', '--no-hardlinks', str(source), str(release)], check=True)
                if source == ROOT:
                    mirror_working_source(ROOT, release)
                    git(release, 'add', '-A')
                    if git(release, 'diff', '--cached', '--name-only'):
                        git(release, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                            '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'working candidate fixture')
                shutil.copytree(ROOT / 'node_modules', release / 'node_modules', symlinks=False)
                (release / 'ui-prototype/node_modules').mkdir(parents=True)
                shutil.copy2(ROOT / 'ui-prototype/node_modules/.package-lock.json', release / 'ui-prototype/node_modules/.package-lock.json')
                shutil.copytree(ROOT / 'ui-prototype/dist', release / 'ui-prototype/dist')
                shutil.copy2(SOURCE, home / 'implementation.py')
                driver = f'''import importlib.util, json, os, sys, time
from pathlib import Path
p=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('controller',p/'implementation.py')
m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
def job(self):
 v=json.loads(Path({str(job_state)!r}).read_text()) if Path({str(job_state)!r}).exists() else {{}}
 return {{'loaded':bool(v),'owned':v.get('home')==str(self.home),'pid':v.get('pid')}}
m.Controller.job=job
if 'run' in sys.argv:
 deadline=time.monotonic()+5
 while not Path({str(job_state)!r}).exists() or json.loads(Path({str(job_state)!r}).read_text()).get('pid')!=os.getpid():
  if time.monotonic()>deadline: raise RuntimeError('Fixture launchd did not assign its child')
  time.sleep(.01)
raise SystemExit(m.main())
'''
                (home / 'control').write_text(driver)
                (home / 'service.plist').write_text('fixture launchd job')
                return home, release

            def lookup(control):
                state = json.loads(job_state.read_text()) if job_state.exists() else {}
                return {'loaded': bool(state), 'owned': state.get('home') == str(control.home), 'pid': state.get('pid')}

            def attach(control):
                original_command = control.command
                def command(argv, **kwargs):
                    nonlocal process
                    if argv[0] != module.LAUNCHCTL:
                        return original_command(argv, **kwargs)
                    if argv[1] == 'bootstrap':
                        stdout = open(control.home / 'service.stdout', 'w')
                        stderr = open(control.home / 'service.stderr', 'w')
                        try:
                            process = subprocess.Popen(['/usr/bin/python3', '-I', str(control.home / 'control'), 'run', '--home', str(control.home)], env=module.environment(), stdout=stdout, stderr=stderr)
                        finally:
                            stdout.close(); stderr.close()
                        module.atomic_json(job_state, {'home': str(control.home), 'pid': process.pid})
                    elif argv[1] == 'bootout':
                        process.terminate(); process.wait(timeout=10); process = None; job_state.unlink()
                    else:
                        raise AssertionError(argv)
                    return subprocess.CompletedProcess(argv, 0, '', '')
                control.command = command
                control.job = lambda: lookup(control)
                return control

            def node(control, run):
                results = []
                def execute(argv, env):
                    result = subprocess.run([control.config['node'], str(control.release / 'bin/pardner.js'), *argv], env=env, capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    results.append(json.loads(result.stdout))
                with patch.object(control, 'exec_node', side_effect=execute):
                    run()
                return results[0]

            def cli(control, args):
                return node(control, lambda: control.cli(args, AGENT))

            def operator(control, path, body=None):
                return control.request(path, control.operator_token(), body)

            def project_api(control, path, body=None):
                return operator(control, f'/projects/{control.project_id()}/api{path}', body)

            def ledger(data):
                [path] = (data / 'projects').glob('*/deliveries.sqlite')
                database = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
                try:
                    tables = [row[0] for row in database.execute("select name from sqlite_master where type='table'")]
                    return {table: sorted(map(repr, database.execute(f'SELECT * FROM "{table}"'))) for table in tables}
                finally:
                    database.close()

            try:
                original_home, original_release = prepare('original', ROOT)
                data = original_home / 'data'
                original = attach(configure(original_home, original_release))
                original.seal(); original.entrypoints()
                self.assertFalse((original_home / 'pardner-alice').exists())
                # The first start creates the client identity and this installation's project.
                self.assertTrue(original.start()['healthy'])
                project_id = original.project_id()
                self.assertEqual(json.loads((original_home / 'project.json').read_text()), {'projectId': project_id})
                created = cli(original, ['task', 'create', '--title', 'Retained recovery task'])
                task = created['result']['taskId']
                credential = json.loads((original_home / f'credentials/{AGENT}.json').read_text())
                self.assertEqual(created['actorId'], credential['actorId'])
                self.assertEqual((original_home / f'credentials/{AGENT}.json').stat().st_mode & 0o777, 0o600)
                self.assertEqual((original_home / 'credentials').stat().st_mode & 0o777, 0o700)
                person = operator(original, f'/projects/{project_id}')
                self.assertNotEqual(person['project']['actorId'], credential['actorId'])
                handle = next(actor['handle'] for actor in person['actors'] if actor['id'] == credential['actorId'])
                project_api(original, '/automerge/operations', {'type': 'comment.add', 'operationId': 'mention',
                                                                'payload': {'taskId': task, 'text': f'Review this @{handle}'}})
                self.assertEqual(len(cli(original, ['mentions', 'pending'])['mentions']), 1)
                launch = root / 'launch.txt'
                self.assertTrue(node(original, lambda: original.open(['--output-file', str(launch)]))['launchIssued'])
                self.assertIn('/pardner/#grant=', launch.read_text())
                baseline = project_api(original, '/automerge/doc')['doc']
                activity = cli(original, ['activity', '--limit', '1000'])['activity']
                self.assertEqual(len(activity), len(baseline['operations']))
                original.stop()
                backup = root / 'cold-backup'
                shutil.copytree(data, backup)
                expected_ledger = ledger(backup)
                self.assertGreater(len(expected_ledger['deliveries']), 0)
                # The restored installation names the recovered project instead of creating one.
                restored_home, restored_release = prepare('restored installation', original_release)
                shutil.copytree(backup, restored_home / 'data')
                restored = attach(configure(restored_home, restored_release, projectId=project_id))
                restored.seal(); restored.entrypoints()
                self.assertTrue(restored.start()['healthy'])
                self.assertFalse((restored_home / 'project.json').exists())
                self.assertEqual(project_api(restored, '/automerge/doc')['doc'], baseline)
                self.assertEqual(cli(restored, ['activity', '--limit', '1000'])['activity'], activity)
                self.assertEqual(ledger(restored.data), expected_ledger)
                shutil.rmtree(original_home)
                self.assertEqual(project_api(restored, '/automerge/doc')['doc'], baseline)
                hostile = root / 'hostile-bin'; hostile.mkdir()
                (root / 'wrong-home').mkdir()
                (hostile / 'dirname').write_text('#!/bin/sh\necho ' + str(root / 'wrong-home') + '\n')
                (hostile / 'dirname').chmod(0o700)
                env = {**module.environment(), 'PATH': str(hostile), 'PARDNER_CONTROL_HOME': str(root / 'wrong-home'),
                       'NODE_USE_ENV_PROXY': '1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': '',
                       'NODE_OPTIONS': '--invalid-node-option', 'GIT_DIR': str(root / 'wrong-git')}
                wrapper = str(restored_home / f'pardner-{AGENT}')
                result = subprocess.run(['/bin/sh', wrapper, 'tasks', '--json'], env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)['tasks'][0]['id'], task)
                restored_credential = (restored_home / f'credentials/{AGENT}.json').read_text()
                self.assertNotIn(json.loads(restored_credential)['token'], result.stdout + result.stderr)
                result = subprocess.run(['/bin/sh', wrapper, 'serve'], env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 1)
                self.assertTrue(restored.status()['healthy'])
                restored.stop()
            finally:
                if process is not None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
