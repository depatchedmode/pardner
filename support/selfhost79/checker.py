"""Independent oracle. Candidate code only supplies function results, never verdicts."""
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import tempfile

TARGET = 'lib/selfhost79-task-summary.mjs'
CLOSED = {'completed', 'dead-end', 'abandoned'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(repo, *args):
    env = {'PATH': os.environ['PATH'], 'LC_ALL': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': os.devnull}
    return subprocess.check_output(['git', '--no-replace-objects', '-C', str(repo), *args],
                                   env=env, stderr=subprocess.PIPE, timeout=15)


def commit(repo, sha):
    require(isinstance(sha, str) and re.fullmatch('[0-9a-f]{40}', sha), 'full immutable SHA required')
    require(git(repo, 'cat-file', '-t', sha).strip() == b'commit', 'SHA must name a commit')


def evaluate(repo, base, sha, phase, node, probe):
    commit(repo, base)
    commit(repo, sha)
    git(repo, 'merge-base', '--is-ancestor', base, sha)
    changed = git(repo, 'diff', '--name-only', '-z', base, sha).split(b'\0')[:-1]
    require(changed == [TARGET.encode()], 'diff must change only the frozen fixture path')
    entry = git(repo, 'ls-tree', sha, '--', TARGET).decode()
    require(entry.startswith('100644 blob '), 'fixture must be a regular nonexecutable blob')
    source = git(repo, 'show', f'{sha}:{TARGET}')
    require(len(source) <= 32768, 'fixture source exceeds 32 KiB')
    diff = git(repo, 'diff', '--no-ext-diff', '--no-textconv', '--binary', base, sha)
    baseline = [[], [{'status': 'completed'}], [{'status': 'dead-end'}, {'status': 'abandoned'}],
                [{'status': s} for s in ['ready', 'in-progress', 'blocked', 'completed', 'new-status']]]
    semantic = [[{'status': 'completed', 'deleted': True}],
                [{'status': 'ready', 'deleted': True}, {'status': 'ready'},
                 {'status': 'abandoned', 'deleted': False}]]
    cases = baseline + (semantic if phase == 'C' else [])
    expected = []
    for tasks in cases:
        visible = [t for t in tasks if phase != 'C' or t.get('deleted') is not True]
        closed = sum(t['status'] in CLOSED for t in visible)
        expected.append({'total': len(visible), 'closed': closed, 'open': len(visible) - closed})
    with tempfile.TemporaryDirectory(prefix='pardner-selfhost79-probe-') as scratch:
        candidate = Path(scratch).resolve() / 'candidate.mjs'
        candidate.write_bytes(source)
        command = [str(node), '--permission', f'--allow-fs-read={candidate}',
                   f'--allow-fs-read={probe}', str(probe), str(candidate)]
        # No credentials or loader hooks; no child/write permission. Network isolation is external.
        try:
            def limit_output():
                resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
            with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
                result = subprocess.run(command, input=json.dumps(cases).encode(), stdout=stdout, stderr=stderr,
                                        timeout=5, env={'PATH': os.environ['PATH'], 'TZ': 'UTC'}, preexec_fn=limit_output)
                stdout.seek(0); stderr.seek(0)
                output, errors = stdout.read(65537), stderr.read(65537)
                require(len(output) < 65536 and len(errors) < 65536, 'probe output exceeds bound')
                require(result.returncode == 0, 'candidate probe failed: ' + errors.decode(errors='replace')[:2000])
            actual = json.loads(output)
            passed = encoded(actual) == encoded(expected)
        except subprocess.TimeoutExpired:
            raise ValueError('candidate probe timed out') from None
    return {'sha': sha, 'base': base, 'phase': phase, 'passed': passed,
            'assertions': len(cases), 'sourceSha256': digest(source), 'diffSha256': digest(diff)}, source, diff
