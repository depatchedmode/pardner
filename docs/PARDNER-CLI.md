# Pardner local service and CLI

The default service and executable now use the version 3 workspace. Human and
agent Actors author through the same local HTTP operations. The UI integration and
full acceptance milestone are still in progress; see [implementation evidence](PARDNER-EVIDENCE.md).

## Open the local UI

Build the browser client with `npm ci --prefix ui-prototype` and `npm run ui:build`.
Start the local service, then open its HTTP address at `/pardner/` (normally
`http://127.0.0.1:8004/pardner/`). Enter the token from the local connection file
and select the human or agent Actor making changes. The token is remembered in
browser local storage without application expiry; no token is compiled into the
application. Actor selection and filters are remembered by workspace.

For a companion device on the same trusted network, use **Pair another device**
on the desktop. Enable LAN access, restart with the same data directory, then scan the displayed
QR code to pair automatically, or use the address and code to connect manually.
See [companion device and LAN access](PARDNER-LAN.md)
for HTTP transport limitations, secret rotation, disabling access, and recovery.

The board, task editor, handoff form, comments, conflict alternatives, explicit
read receipts, history, and commit evidence use the same operation API as the CLI.
The browser owns no Automerge database; the local service persists and synchronizes
its workspace. Keep that service running for local authoring.

`npm run test:ui` builds the UI and tests independent Chromium contexts, mobile
Chromium/WebKit over LAN HTTP, connection failures, and a local WebSocket proxy.
Install pinned engines with `npx playwright install chromium webkit` after
installing root dependencies. LAN cases explicitly skip when no suitable IPv4
interface exists. Physical phones and the full multi-replica gate are separate
qualification steps.

## Start a workspace

Use Node 24.11.1 and `npm ci`. Run `node bin/pardner.js` from this checkout, or
install the package to put `pardner` on PATH. The examples below use `pardner`.

```sh
pardner serve --data .pardner
```

This starts the hub on loopback ports 8004/8005. It generates a local API token and
writes `.pardner/connection.json` with mode 0600. CLI commands discover that file;
`--data`, `--server`, and `--token` override connection settings. The equivalent
environment variables are `PARDNER_DATA_DIR`, `PARDNER_LOCAL_URL`, and
`PARDNER_API_TOKEN`. `npm run sync` also starts this runtime.

Register the first Actor explicitly, then register the other humans and agents:

```sh
pardner actors register alice --handle alice --kind human --actor alice
pardner actors register builder --handle builder --kind agent --actor alice
pardner actors register reviewer --handle reviewer --kind agent --actor alice
pardner task create --title 'Ship Pardner' --assignee builder --actor alice --operation-id create-001 --json
pardner tasks --assignee builder --json
```

Actor IDs remain stable across replicas. Handles are accepted where an Actor is
selected. Mutations require `--actor` or `PARDNER_ACTOR`; there is no implicit
human or agent identity. `--agent` is an Actor-selection alias.

## Enroll another machine

Each machine runs one service owning its own directory. Configure a reachable hub
HTTP and native WebSocket address plus its token at initial enrollment:

```sh
pardner serve --data .pardner --role replica \
  --hub http://hub-host:8004 --hub-ws ws://hub-host:8005/automerge \
  --hub-token "$PARDNER_HUB_TOKEN"
```

The default binding is loopback. A hub accepting other machines must explicitly
set `PARDNER_BIND_HOST` to the intended interface and expose its HTTP/WebSocket
ports. Enrollment requires the hub; reopening an enrolled directory does not.
`pardner serve --data .pardner` remembers the role, addresses, ports, and local
credentials. CLI and UI should connect to the local service on each machine.

Existing incompatible storage is rejected and left intact. Choose a fresh
directory; there is no automatic migration. A second process cannot own the same
directory, and process death releases its OS-backed lock.

Version 3 stores mutable task fields and comment bodies in shared register maps.
Retried creation requests on disconnected replicas therefore share each field's
merge location. A shared map records superseded field revisions, so a late
retry cannot resurrect an initial value after an edit or explicit resolution.
Version 2 directories must be preserved and replaced with a fresh workspace; all
services participating in a workspace must use the same schema version.

## Read, edit, and hand off

`pardner show <task> --actor builder --json` returns the full description,
comments, revisions, conflicts, history, commit evidence, and sync status. It does
not mark comments read. Comment `revisionIds` includes every concurrent revision;
submit only revisions actually observed using `pardner read --receipts`.

An edit supplies the revisions observed in `show` for the affected fields:

```sh
pardner update TASK --actor builder --status in-progress \
  --revisions '{"status":["OBSERVED_OPERATION_ID"]}' --operation-id update-001
pardner handoff TASK --actor builder --to reviewer --status review \
  --message 'Implementation is ready; please review the evidence.' \
  --revisions '{"assignee":["ASSIGNMENT_REVISION"],"status":["STATUS_REVISION"]}' \
  --operation-id handoff-001
```

Handoff atomically changes assignment/status, adds the explanation, and mentions
the recipient. Different-field edits merge. Concurrent same-field alternatives
remain attributed; `pardner resolve` requires the full observed revision set.
`STALE_UPDATE` means refresh context and decide again. Never silently retry a
stale edit using freshly fetched revisions.

For transport failures, retry the **same payload with the same operation ID**.
An existing matching operation is replayed; reuse for a different payload returns
`OPERATION_ID_REUSED`. `pardner operation --request JSON` exposes the complete
shared-operation envelope for deterministic agent clients.

## Agent delivery

```sh
pardner mentions pending --actor builder
pardner mentions claim-next --actor builder --request-id inbox-poll-001
pardner mentions ack MENTION --actor builder --claim-token TOKEN
pardner mentions release MENTION --actor builder --claim-token TOKEN
```

The local service forwards delivery requests to the hub's transactional SQLite
ledger. A harness must durably store the claimed message in its own inbox before
acknowledging it. Claims are delivery leases, not task execution locks. Reuse a
claim request ID only to retry that request; subsequent polls need new IDs. An
empty claim response is also replayable. Expired, released, or superseded tokens
cannot acknowledge work.

New dispatch requires the hub. `HUB_UNAVAILABLE` does not prevent an agent from
continuing accepted work and saving comments or task operations locally. External
side effects still need harness-level idempotency; a delivery acknowledgement is
not an exactly-once execution guarantee.

## Results and verification

Coordination commands emit exactly one JSON value on stdout, including failures.
Diagnostics and Git output go to stderr. Successful commands exit 0; errors exit
1 and expose `error.code`, `error.message`, and `error.details`. A Git commit whose
task link fails returns the existing commit hash and recovery instructions; use
`link-commit` to finish the link without making another Git commit.

`savedLocally` confirms the acknowledged operation crossed the local disk barrier.
`syncPending` clears only after an explicit hub persistence acknowledgement covers
the current heads. An open socket alone is insufficient.

```sh
npm run test:qualification
npm run test:runtime
npm run test:cli
```

These focused suites exit naturally. The legacy regression command still uses
forced exit and is not lifecycle evidence. The final `verify` command and 20-seed
two-browser/two-agent acceptance gate remain to be implemented.

## Native transport diagnostics

`npm run stress:native-peer -- all --runs 2` starts a temporary production hub and exercises one Actor across replicas, two Actors across replicas, and offline recovery. `--hub-restart` gives each run a fresh temporary hub. To target an existing hub, set `PARDNER_SYNC_SERVER`, `PARDNER_API_TOKEN`, `PARDNER_WS_BASE`, `PARDNER_ACTOR`, and `PARDNER_SECOND_ACTOR`; both Actors must already be registered. Remote runs create diagnostic tasks in that workspace.

`npm run smoke:native-peer -- show-task <taskId>` returns complete task context. Set `PARDNER_PEER_STORAGE_PATH` to use a persisted replica, including cached offline reads. With `PARDNER_ACTOR`, `create-task [title]` and `set-task <taskId> <field> <value>` submit attributed operations. `PARDNER_OPERATION_ID` supplies a stable ID for retries. A successful write means saved locally; synchronization is reported separately in its receipt. `watch` streams snapshots until SIGINT/SIGTERM and closes its storage cleanly.

Native diagnostic storage must be a separate directory from any running local service. These tools use the same runtime, disk barrier, directory ownership, schema checks, and fresh-ticket reconnect path as Pardner. They do not replace the full acceptance suite.
