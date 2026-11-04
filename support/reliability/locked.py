#!/usr/bin/env python3
"""Nonblocking shared host lease; never remove the stable lock file."""
import fcntl
import os
import subprocess
import sys

with open('/tmp/pardner-selfhost-heavy-tests.lock', 'a') as lease:
    try:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('PENDING: another track holds the heavy-test lock', file=sys.stderr)
        sys.exit(75)
    env = dict(os.environ, PARDNER_HEAVY_LOCK_FD=str(lease.fileno()))
    result = subprocess.run(sys.argv[1:], env=env, pass_fds=(lease.fileno(),), check=False)
    sys.exit(result.returncode)
