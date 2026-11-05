#!/usr/bin/env python3
"""Offline #79 package: freeze trusted tools, check exact commits, audit observations.
Never submits provider work or supplies a human verdict.
"""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)

FILES = ['scripts/selfhost79.py', 'scripts/selfhost79-cloud.js', 'support/selfhost79/checker.py', 'support/selfhost79/probe.mjs', 'support/selfhost79/fixture.json']


def outside(path, repo):
    path, repo = Path(path).resolve(), Path(repo).resolve()
    require(path != repo and repo not in path.parents, 'checker/evidence must be outside candidate checkout')


def freeze(destination):
    destination = Path(destination).resolve()
    outside(destination, ROOT)
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    for name in FILES:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / name).read_bytes())
        target.chmod(0o444)
    seal = encoded({'version': 1, 'files': {name: digest((destination / name).read_bytes()) for name in FILES}})
    (destination / 'seal.json').write_bytes(seal)
    (destination / 'seal.json').chmod(0o444)
    return {'bundle': str(destination), 'sealSha256': digest(seal)}


def integrity(bundle, expected):
    bundle = Path(bundle).resolve()
    seal = (bundle / 'seal.json').read_bytes()
    require(digest(seal) == expected, 'seal integrity mismatch')
    files = json.loads(seal)['files']
    require(set(files) == set(FILES), 'unexpected checker package members')
    for name, sha in files.items():
        path = bundle / name
        require(not path.is_symlink() and path.resolve().is_relative_to(bundle), 'checker alias rejected')
        require(digest(path.read_bytes()) == sha, f'checker integrity mismatch: {name}')
    return bundle


def check(args):
    bundle = integrity(args.bundle, args.seal)
    outside(bundle, args.repo)
    outside(args.output, args.repo)
    require(not Path(args.output).exists(), 'evidence destination already exists; never overwrite history')
    require(args.phase != 'C' or (args.previous and args.previous_hash), 'C requires frozen B receipt and external digest')
    # Verify before importing/executing the frozen checker, not by trusting its own verdict.
    import importlib.util
    spec = importlib.util.spec_from_file_location('frozen_checker', bundle / 'support/selfhost79/checker.py')
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    node = Path(args.node).resolve()
    require(subprocess.check_output([str(node), '--version'], timeout=5).strip() == b'v24.11.1', 'Node 24.11.1 required')
    probe = bundle / 'support/selfhost79/probe.mjs'
    previous = None
    if args.phase == 'C':
        previous_bytes = Path(args.previous).read_bytes()
        require(digest(previous_bytes) == args.previous_hash, 'historical B receipt changed')
        previous = json.loads(previous_bytes)
        require(previous['phase'] == 'B' and previous['checkerVerdict'] == 'accepted', 'B must have passed')
        require(previous['sealSha256'] == args.seal and previous['base'] == args.base, 'B checker/base mismatch')
        for name, sha in previous['files'].items():
            require(name in {'candidate.mjs', 'diff.patch', 'checks.json'}, 'unexpected B evidence file')
            require(digest((Path(args.previous).parent / name).read_bytes()) == sha, 'historical B artifact changed')
        checker.git(args.repo, 'merge-base', '--is-ancestor', previous['sha'], args.sha)
    result, source, diff = checker.evaluate(args.repo, args.base, args.sha, args.phase, node, probe)
    results = {'candidate': result}
    if previous:
        b_semantic, _, _ = checker.evaluate(args.repo, args.base, previous['sha'], 'C', node, probe)
        results['B_under_C'] = b_semantic
        require(not b_semantic['passed'], 'C semantic test must demonstrably fail on B')
    verdict = 'accepted' if result['passed'] else 'rejected'
    # Catch changed checker bytes during the probe; filesystem isolation is still a deployment gate.
    integrity(args.bundle, args.seal)
    output = Path(args.output)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    artifacts = {'candidate.mjs': source, 'diff.patch': diff, 'checks.json': encoded(results)}
    for name, data in artifacts.items():
        (output / name).write_bytes(data)
        (output / name).chmod(0o444)
    receipt = {'checkedAt': time.time_ns() // 1000000, 'version': 1, 'phase': args.phase, 'base': args.base, 'sha': args.sha,
               'sealSha256': args.seal, 'nodeSha256': digest(node.read_bytes()), 'checkerVerdict': verdict,
               'executionVerdict': 'not-observed', 'humanVerdict': 'not-recorded',
               'previousReceiptSha256': args.previous_hash,
               'files': {name: digest(data) for name, data in artifacts.items()}}
    data = encoded(receipt)
    (output / 'receipt.json').write_bytes(data)
    (output / 'receipt.json').chmod(0o444)
    return {'receipt': str(output / 'receipt.json'), 'receiptSha256': digest(data), **receipt}


def audit(manifest):
    """Checks completeness/order of operator observations, not their authenticity."""
    require(manifest.get('version') == 1, 'manifest version must be 1')
    attempts = manifest.get('attempts', [])
    require(len(attempts) == 6, 'exactly six planned attempt records required')
    require({a['id'] for a in attempts} == {f'{r}-{p}' for r in ['t3', 'cloud'] for p in 'ABC'}, 'attempt identities differ')
    results = []
    for a in attempts:
        gaps = []
        require(a.get('disposition', 'not-run') in ['observed', 'not-run', 'failed', 'interrupted', 'replaced', 'blocked'], 'invalid disposition')
        if a.get('disposition') != 'observed':
            results.append({'id': a['id'], 'result': a.get('disposition', 'not-run')})
            continue
        route, phase = a['id'].split('-')
        for field in ['contextId', 'runId', 'executionId', 'intentAt', 'acceptedAt', 'terminalAt', 'freshReadAt', 'evidenceSha256']:
            if not a.get(field): gaps.append(field)
        if not re.fullmatch('[0-9a-f]{64}', str(a.get('evidenceSha256', ''))): gaps.append('evidence digest')
        if route == 'cloud' and not a.get('agentId'): gaps.append('agentId')
        if a.get('submissions') != 1: gaps.append('exactly one submission')
        times = [a.get(k) for k in ['intentAt', 'acceptedAt', 'terminalAt', 'freshReadAt']]
        if not all(type(t) is int and t > 0 for t in times) or times != sorted(times): gaps.append('timestamp order')
        if phase == 'A':
            for field in ['controllerRestartAt', 'recoveredAt', 'cancelRequestedAt', 'partialEffectsSha256']:
                if not a.get(field): gaps.append(field)
            if a.get('recoveredRunId') != a.get('runId'): gaps.append('exact run recovery')
            if a.get('queueHeld') is not True or a.get('queuedSubmissions') != 0: gaps.append('held queue')
            if a.get('executionVerdict') not in ['cancelled', 'interrupted']: gaps.append('terminal cancellation')
            sequence = [a.get(k) for k in ['acceptedAt', 'controllerRestartAt', 'recoveredAt', 'cancelRequestedAt', 'terminalAt']]
            if not all(type(t) is int and t > 0 for t in sequence) or sequence != sorted(sequence): gaps.append('restart/recovery/cancel order')
        else:
            if a.get('executionVerdict') != 'completed': gaps.append('execution completion')
            for field in ['checkerReceiptSha256', 'commitSha', 'releasedByHumanAt', 'checkerFrozenAt']:
                if not a.get(field): gaps.append(field)
            if not re.fullmatch('[0-9a-f]{40}', str(a.get('commitSha', ''))): gaps.append('immutable commit SHA')
            if not re.fullmatch('[0-9a-f]{64}', str(a.get('checkerReceiptSha256', ''))): gaps.append('checker receipt digest')
            prior = next(x for x in attempts if x['id'] == f'{route}-' + ('A' if phase == 'B' else 'B'))
            sequence = [prior.get('terminalAt'), a.get('releasedByHumanAt'), a.get('intentAt'), a.get('acceptedAt'), a.get('terminalAt'), a.get('checkerFrozenAt')]
            if not all(type(t) is int and t > 0 for t in sequence) or sequence != sorted(sequence): gaps.append('explicit release/terminal/freeze order')
            if a.get('contextId') != prior.get('contextId') or a.get('runId') == prior.get('runId'): gaps.append('same context/new run')
            if a.get('checkerVerdict') != 'accepted': gaps.append('independent checker')
            if phase == 'B' and route == 't3':
                for field in ['nativeApprovalRequestedAt', 'nativeApprovalDecidedAt', 'nativeApprovalEvidenceSha256']:
                    if not a.get(field): gaps.append(field)
                sequence = [a.get(k) for k in ['acceptedAt', 'nativeApprovalRequestedAt', 'nativeApprovalDecidedAt', 'terminalAt']]
                if not all(type(t) is int and t > 0 for t in sequence) or sequence != sorted(sequence): gaps.append('native approval order')
            if phase == 'C':
                b = next(x for x in attempts if x['id'] == f'{route}-B')
                if a.get('contextId') != b.get('contextId') or a.get('runId') == b.get('runId'): gaps.append('same context/new run')
                if a.get('previousReceiptSha256') != b.get('checkerReceiptSha256'): gaps.append('frozen B link')
                if route == 'cloud' and a.get('agentId') != b.get('agentId'): gaps.append('same Cloud agent')
                if not (type(b.get('checkerFrozenAt')) is int and type(a.get('intentAt')) is int and b['checkerFrozenAt'] < a['intentAt']): gaps.append('B frozen before C')
                if not a.get('terminalRestartEvidenceSha256'): gaps.append('B/C terminal restart evidence')
        results.append({'id': a['id'], 'result': 'incomplete' if gaps else 'record-complete',
                        'gaps': gaps, 'execution': a.get('executionVerdict'),
                        'checker': a.get('checkerVerdict', 'not-run'), 'human': a.get('humanVerdict', 'not-recorded')})
    crashes = manifest.get('t3Crashes', [])
    return {'version': 1, 'attempts': results, 'liveVerdict': 'requires-independent-evidence-and-human-review',
            't3CrashCoverage': {kind: next((x for x in crashes if x.get('kind') == kind), {'disposition': 'not-run'})
                                for kind in ['active', 'approval-blocked']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    f = sub.add_parser('freeze'); f.add_argument('destination')
    c = sub.add_parser('check')
    for key in ['bundle', 'seal', 'repo', 'base', 'sha', 'output', 'node']:
        c.add_argument('--' + key, required=True)
    c.add_argument('--phase', choices=['B', 'C'], required=True)
    c.add_argument('--previous'); c.add_argument('--previous-hash')
    a = sub.add_parser('audit'); a.add_argument('manifest')
    args = parser.parse_args()
    try:
        result = freeze(args.destination) if args.command == 'freeze' else check(args) if args.command == 'check' else audit(json.loads(Path(args.manifest).read_text()))
        print(json.dumps(result, indent=2))
        return 1 if result.get('checkerVerdict') == 'rejected' else 0
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error), 'checkerVerdict': 'not-established'}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
