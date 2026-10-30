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


def ports():
    sockets = [socket.socket(), socket.socket()]
    try:
        for sock in sockets:
            sock.bind(('127.0.0.1', 0))
        return [sock.getsockname()[1] for sock in sockets]
    finally:
        for sock in sockets:
            sock.close()


def configure(home, release, identity, http_port=None, ws_port=None):
    if http_port is None:
        http_port, ws_port = ports()
    config = {'sha': git(release, 'rev-parse', 'HEAD'), 'release': str(release), 'data': str(home / 'data'),
              'node': NODE, 'role': 'hub', 'httpPort': http_port, 'wsPort': ws_port,
              'workspaceId': identity['workspaceId'], 'replicaId': identity['replicaId'], 'actors': ['alice', 'builder']}
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
        self.data.mkdir()
        (self.data / 'workspace.json').write_text(json.dumps({'workspaceId': 'workspace', 'replicaId': 'replica', 'role': 'hub'}))
        shutil.copy2(SOURCE, self.home / 'control')
        (self.home / 'service.plist').write_text('fixture job')
        git(self.release, 'init', '-q')
        (self.release / '.gitignore').write_text('node_modules/\nui-prototype/dist/\nui-prototype/node_modules/\n')
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
        self.control = configure(self.home, self.release, {'workspaceId': 'workspace', 'replicaId': 'replica'})
        with patch.object(self.control, 'job', return_value={'loaded': False, 'owned': False, 'pid': None}):
            self.control.seal()

    def test_environment_home_and_explicit_home_select_the_requested_installation(self):
        env = {**module.environment(), 'HOME': self.scratch.name, 'PARDNER_CONTROL_HOME': str(self.home)}
        result = subprocess.run(['/usr/bin/python3', str(self.home / 'control'), 'entrypoints'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / 'pardner-alice').exists())
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
        for args in [['serve'], ['bridge', 'run'], ['--actor', 'alice', 'serve'], ['tasks', '--server', 'http://elsewhere']]:
            with self.subTest(args=args), patch.object(self.control, 'status') as status:
                with self.assertRaises(module.ControlError):
                    self.control.cli(args, 'alice')
                status.assert_not_called()

    def test_actor_guard_failures_preserve_the_json_error_envelope(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(module, 'Controller', return_value=self.control), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = module.main(['cli', '--home', str(self.home), '--actor', 'alice', '--', 'serve'])
        self.assertEqual(code, 1)
        result = json.loads(stdout.getvalue())
        self.assertFalse(result['success'])
        self.assertEqual(result['error']['code'], 'CONTROL_RUNTIME_UNAVAILABLE')
        self.assertIn('Control runtime:', stderr.getvalue())

    def test_bad_launch_record_and_dirty_release_still_allow_live_diagnostics(self):
        (self.home / 'running.json').write_text('{partial')
        (self.release / 'unexpected').write_text('drift')
        live = {'role': 'hub', 'workspaceId': 'workspace', 'replicaId': 'replica', 'savedLocally': True, 'storageError': None}
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
        (self.data / 'connection.json').write_text(json.dumps({'httpUrl': 'http://127.0.0.1:1', 'token': 'fixture-only'}))
        with patch.dict(os.environ, {'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''}):
            responding, live, error = self.control.api_status()
        self.assertTrue(responding)
        self.assertIsNone(live)
        self.assertEqual(error['code'], 'HTTP_401')
        self.assertEqual(requests, ['/automerge/status'])


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
                    paths = git(ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
                    for name in filter(None, paths):
                        origin, target = ROOT / name, release / name
                        if origin.exists():
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(origin, target)
                        elif target.exists():
                            target.unlink()
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

            def cli(control, args, actor='alice'):
                results = []
                def execute(argv, env):
                    result = subprocess.run([control.config['node'], str(control.release / 'bin/pardner.js'), *argv], env=env, capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    results.append(json.loads(result.stdout))
                with patch.object(control, 'exec_node', side_effect=execute):
                    control.cli(args, actor)
                return results[0]

            def document(control):
                connection = json.loads((control.data / 'connection.json').read_text())
                request = module.urllib.request.Request(control.url + '/automerge/doc', headers={'Authorization': 'Bearer ' + connection['token']})
                with module.urllib.request.build_opener(module.urllib.request.ProxyHandler({})).open(request, timeout=5) as response:
                    return json.load(response)['doc']

            def ledger(path):
                database = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
                try:
                    tables = [row[0] for row in database.execute("select name from sqlite_master where type='table'")]
                    return {table: sorted(map(repr, database.execute(f'SELECT * FROM "{table}"'))) for table in tables}
                finally:
                    database.close()

            try:
                original_home, original_release = prepare('original', ROOT)
                data = original_home / 'data'
                script = "import {pathToFileURL} from 'node:url'; const {WorkspaceRuntime}=await import(pathToFileURL(process.argv[1])); const r=await new WorkspaceRuntime({directory:process.argv[2]}).init(); await r.close()"
                subprocess.run([NODE, '--input-type=module', '-e', script, str(original_release / 'lib/workspace-runtime.js'), str(data)], env=module.environment(NODE), check=True, capture_output=True)
                identity = json.loads((data / 'workspace.json').read_text())
                original = attach(configure(original_home, original_release, identity))
                original.seal(); original.entrypoints()
                self.assertTrue(original.start()['healthy'])
                for actor, kind in [('alice', 'human'), ('builder', 'agent')]:
                    cli(original, ['actors', 'register', actor, '--handle', actor, '--kind', kind])
                task = cli(original, ['task', 'create', '--title', 'Retained recovery task'])['result']['taskId']
                cli(original, ['comment', task, 'Review this @builder'])
                cli(original, ['mentions', 'pending'], actor='builder')
                baseline = document(original)
                activity = cli(original, ['activity', '--limit', '1000'], actor=None)['activity']
                self.assertEqual(len(activity), len(baseline['operations']))
                original.stop()
                backup = root / 'cold-backup'
                shutil.copytree(data, backup)
                expected_ledger = ledger(backup / 'deliveries.sqlite')
                self.assertGreater(len(expected_ledger['deliveries']), 0)
                restored_home, restored_release = prepare('restored installation', original_release)
                shutil.copytree(backup, restored_home / 'data')
                restored = attach(configure(restored_home, restored_release, identity))
                restored.seal(); restored.entrypoints()
                self.assertTrue(restored.start()['healthy'])
                self.assertEqual(document(restored), baseline)
                self.assertEqual(cli(restored, ['activity', '--limit', '1000'], actor=None)['activity'], activity)
                self.assertEqual(ledger(restored.data / 'deliveries.sqlite'), expected_ledger)
                shutil.rmtree(original_home)
                self.assertEqual(document(restored), baseline)
                hostile = root / 'hostile-bin'; hostile.mkdir()
                (root / 'wrong-home').mkdir()
                (hostile / 'dirname').write_text('#!/bin/sh\necho ' + str(root / 'wrong-home') + '\n')
                (hostile / 'dirname').chmod(0o700)
                env = {**module.environment(), 'PATH': str(hostile), 'PARDNER_CONTROL_HOME': str(root / 'wrong-home'),
                       'NODE_USE_ENV_PROXY': '1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': '',
                       'NODE_OPTIONS': '--invalid-node-option', 'GIT_DIR': str(root / 'wrong-git')}
                result = subprocess.run(['/bin/sh', str(restored_home / 'pardner-alice'), 'tasks', '--json'], env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)['tasks'][0]['id'], task)
                result = subprocess.run(['/bin/sh', str(restored_home / 'pardner-alice'), 'serve'], env=env, capture_output=True, text=True, timeout=15)
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
