# Remote VM rehearsal

The test uses two Ubuntu 24.04 ARM64 Lima VMs, each with its own kernel, disk,
checkout, machine ID, and persisted Pardner replica. A dedicated hub runs on the
Mac in a fresh test directory. The normal `.pardner` service is not restarted,
partitioned, or reused. Codex and Claude operate their respective guests through
SSH; model inference is outside the guests.

Lima is configured with Apple's VZ backend and `--plain`. The runner asserts there
are no virtiofs, 9p, or SSHFS mounts, that the Mac checkout path is absent, and that
machine and replica identities differ. Plain mode is documented by
[Lima](https://lima-vm.io/docs/config/plain/). The provisioning command allocates
2 CPUs, 2 GiB RAM, and a 12 GiB sparse disk to each VM. Installed dependencies are
independent, installed using `npm ci`. Node 24.11.1 is downloaded inside each VM
and verified against its published SHA256 checksum.

## Run

Prerequisites: this Mac's current built UI, Node 24.11.1 under the usual nvm home,
Python 3, Git, SSH, and Lima (`brew install lima`). The VM names below are reserved
for this experiment. Provisioning starts existing named guests and never deletes
them. Each rehearsal creates new directories and data; it preserves prior runs.

```sh
sh scripts/remote/provision.sh
python3 scripts/remote/rehearse.py --hold
```

The runner prints its output directory under `.pardner/labs/remote/RUN_ID`.
It copies the current candidate, including uncommitted files and built UI, over
SSH rather than relying on the old Git HEAD. Candidate fingerprints must match
between the Mac and both guests. No host folder is mounted into a guest.

The hub listens on fresh loopback ports. Each guest gets a separate SSH reverse
tunnel exposing the hub on its loopback ports 18004/18005. Its local service uses
8004/8005. Cutting a tunnel drops existing Pardner connections while preserving
the separate management SSH connection. This tests loss of the hub link, not loss
of every guest network interface. No firewall changes or LAN listeners are needed.
Tokens travel through encrypted stdin into private guest files and do not appear
in task instructions or evidence.

## Automated assertions

The infrastructure Actors are explicitly named `test-a` and `test-b`; their
operations are not presented as real Claude participation.

1. Verify separate machines, no shared folders, equal candidate fingerprints,
   one workspace, and distinct persisted replica IDs.
2. Create and synchronize a task using public CLI operations.
3. Cut both hub tunnels and verify the replicas report disconnected. Save comments
   and conflicting title updates, checking local durability and pending sync.
4. Stop and reopen replica A offline, verify its acknowledged title/comment, and
   save another comment while still disconnected.
5. Reconnect both guests and compare their heads with the hub. Assert both title
   values and their separate authors remain present. Explicitly resolve them.
6. Retry the same comment operation ID with the same payload and assert replay,
   one logical comment, and one history entry.
7. Restart both local services and the hub. Reconnect and check final heads,
   resolved title, all comments, and deduplicated history on both replicas.
8. Transfer a Codex challenge from VM A to VM B via SSH and verify its checksum.
   Create a task for the real Claude Actor on VM B's replica.

CLI operation round trips, including SSH overhead, must be ≤2 seconds. Replica
opening must be ≤6 seconds, and measured convergence must be ≤10 seconds. Timings
cover CLI visibility, not browser rendering. Assertions fail the run; a failed run
keeps its evidence. The runner shuts down its test services on error or Ctrl-C.
The current six-second requirement follows the [November 5 owner policy decision](PARDNER-ACCEPTANCE.md#scenario-and-bounds).
This legacy runner retains its separate five-second readiness wait and has not
been requalified here; no remote run is implied by the policy update.

## Real-agent step

With `--hold`, the runner stays alive after the infrastructure checks. The generated
`CLAUDE.md` contains the exact VM-local command to read the task. The task instructs
Claude to declare scope, read the challenge in VM B, write one response file with
its nonce and machine/replica identity, and hand the task to Codex in review using
observed revisions. It prohibits application edits and commits.

A real Claude session must execute this task. The test runner never manufactures
Claude's response or writes as its Actor. The initial automated Claude launch was rejected by automatic approval review
because it could transmit private checkout context to Anthropic. The user then
ran the scoped task in their existing Claude session; its results were verified
independently. Future sessions remain subject to their own permissions.

After Claude completes the handoff, run:

```sh
python3 scripts/remote/verify-agent.py .pardner/labs/remote/RUN_ID
```

The verifier rejects a missing handoff or mismatched proof. It reads task context
through VM A's local CLI, checks Claude attribution and its single handoff/mention,
transfers the response from VM B to VM A over SSH, verifies its SHA256 checksum,
posts Codex's review, and checks the review reaches both replicas. It records
`agent-review.json` and updates `realAgents` only after those checks pass.

The JSON proof and Actor attribution are evidence within these controlled agent
sessions, not cryptographic authentication of which model performed an operation.
Human review remains required. A full service restart after the real-agent step
should also be inspected before final human signoff; the automated restart occurs
before that step.

## Evidence and lifecycle

- `result.json`: pass/fail/pending states, candidate/archive hashes, machine and
  replica identities, and task IDs.
- `timings.json`: measured CLI, startup, and convergence times.
- `conflict.json`: both conflicting values with authors and revisions.
- `pardner-remote-*-final.json`: final infrastructure task context on both guests.
- `CLAUDE.md`: instructions for the specific run's real-agent task.
- `agent-review.json`: verified real-agent result, when completed.
- `runner.pid`: runner process to stop with `kill -INT`; its cleanup stops only
  that run's hub, replica services, and tunnels.

VMs remain running after the runner stops. To stop them without deleting data:

```sh
limactl stop pardner-remote-a
limactl stop pardner-remote-b
```

A new runner invocation creates a new rehearsal, not a resume of an old task. Do
not start another held run while the previous one owns the guest service ports.
Use a fresh Claude task from the current run. No automatic VM deletion is provided.

These VMs share the Mac's hardware and network uplink. Separate physical-host
failure, full guest disconnection, browser rendering, and cloud inference while
offline are outside this rehearsal's claims.

## Latest verified run

Run `39465489003d` passed the automated infrastructure assertions.
Candidate SHA256: `531324cb884e500cefcaf661b1821555661386ec7d8e8c6be71c748469d9bf22`.
Maximum measured CLI round trip: 407 ms; replica opening: 599 ms; convergence: 1115 ms.
The verifier also correctly rejected the pending Claude handoff without recording a pass.
Claude completed the task in the user-controlled session. Codex verified the nonce,
VM B machine/replica identities, attributed handoff, and SSH artifact transfer to
VM A. Both replicas received the review. `agent-review.json` records a pass.
The post-handoff restart also passed: both replica task contexts were unchanged,
Claude’s handoff and Codex’s review persisted, and artifact checksums matched on
both VMs. Replica reopening took at most 852 ms; convergence took 454 ms.
Evidence: `post-agent-restart.json` in the run directory. Test services were stopped
after verification; VM disks and all evidence remain available.
