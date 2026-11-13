# Operate the pinned control runtime

Use the private controller for development coordination. Give candidate code its
own storage and ports. GitHub remains authoritative for issues and milestones;
Pardner is a secondary working view. The [repair report](PARDNER-CONTROL-RUNTIME-EVIDENCE.md)
records the exact app pin and verification. This installation preserves schema 2;
it does not gain the current checkout's schema-4 features or bridge adapters.

For the current pane's exact candidate, #77 disposition and the proposed fresh
workspace cutover, see [runtime readiness](PARDNER-CONTROL-READINESS.md).
That report does not authorize an upgrade of this preserved installation.

The repository controller now runs the service as a Pardner **client**
(`pardner client serve`), not standalone `serve`. A client needs its own fresh
data directory: `client serve` refuses a standalone replica's directory and
preserves it. The installed standalone controller and its data stay as they are;
moving to the client-mode controller is a fresh installation, not a migration.
The [controller verification map](../.agents/skills/verify/features/control-runtime.md)
describes focused regression coverage.

## Locate the installation

`--home` selects an installation explicitly. Otherwise the controller uses
`PARDNER_CONTROL_HOME`, then the directory containing the installed controller.
The normal installation is `$HOME/Library/Application Support/Pardner/control-runtime`.
Keep it private (0700), outside every disposable checkout. It contains:

- `control`: an installed copy of [control-runtime.py](../scripts/control-runtime.py).
- `config.json`: absolute release/data/Node paths, exact SHA, the fixed loopback
  port, the agent harnesses that get wrappers, and the first-start identity and
  project name (or an existing `projectId`). It contains no token.
- `deployment.json`: hashes of the built UI, source dependency locks and installed
  dependency lock identities, recorded while this installation is stopped.
- `running.json`: the assigned launchd PID and its configuration, deployment and
  controller identities. This is launch metadata, not proof of liveness.
- `project.json`: the project this installation created on its first start.
- `credentials/`: private (0700) agent credentials, one 0600 `client agent-grant`
  file per wrapper harness, granted on first use.
- `service.plist`: the manually loaded `app.pardner.control` launchd job.
- `releases/SHA/`: an independent Git clone, runtime dependencies and built UI.
- `data/`: **the sole authoritative client directory**: `client.sqlite` (identity,
  device, projects, sessions), each project's workspace under `projects/`, and the
  protected `client-connection.json` operator credential.
- `backups/`: cold data, original installations and wrappers, historical execution
  artifacts, and pinned-release/source-history Git bundles.
- `evidence/`: private inventories, timestamped reads, comparisons and logs.
  Recovery probe directories here are offline copies, never another live authority.

Retain backup metadata and credentials unchanged. Do not serve backup/probe copies
alongside the authoritative replica. A browser depends on the host service and
owns no separate Automerge database.

The private config has this shape. Substitute inspected paths:

```json
{
  "sha": "FULL_40_CHARACTER_SHA",
  "release": "ABSOLUTE_CONTROL_HOME/releases/FULL_40_CHARACTER_SHA",
  "data": "ABSOLUTE_CONTROL_HOME/data",
  "node": "ABSOLUTE_NODE_24_11_1_BINARY",
  "httpPort": 8004,
  "agents": ["openai-codex"],
  "identity": { "name": "YOUR NAME", "email": "you@example.com" },
  "projectName": "Pardner development"
}
```

Data must resolve to this installation's `data/`; the release must be under its
`releases/`. Use a full independent clone, not a candidate worktree or Git
alternates. The Node binary may live outside the installation.

`agents` lists harness IDs (`openai-codex`, `anthropic-claude-code`, `cursor`).
The first one is the client's setup agent when `data/` is fresh, so the first
start enrolls it. A client has one agent Actor per enrolled harness. Other
listed harnesses are not enrolled automatically; until one is, its wrapper
reports the client's refused agent grant.
`identity` and `projectName` are read only on the first start, which confirms
the client identity and creates the project with stable operation IDs, so a retry
replays instead of duplicating. To manage an existing client project instead,
set `"projectId"`; a client that already has projects but no named one is refused.

## Prepare a stopped installation

1. Inventory the existing revision, processes, paths, storage ownership, identities,
   records and credentials privately. Preserve incompatible installations and
   unrelated work. Prepare a verified cold backup before changing launch paths.
2. Clone the selected SHA independently with `git clone --no-hardlinks`, or clone
   the preserved Git bundle. Check out that exact SHA detached. Select Node
   **24.11.1** and install both lockfiles and build the UI in this **new, inactive**
   release:

   ```sh
   npm ci --ignore-scripts
   npm ci --ignore-scripts --prefix ui-prototype
   npm run ui:build
   ```

3. Install the controller and config in the private home. Create `service.plist`
   with label `app.pardner.control` and program arguments
   `/usr/bin/python3 -I CONTROL_HOME/control run --home CONTROL_HOME`.
   Set `RunAtLoad` to true, `KeepAlive` to false, `Umask` to 63, and stdout/stderr
   to private evidence files. Keep the plist outside `Library/LaunchAgents`;
   this setup does not enable login autostart.
4. Record deployment artifacts and generate agent Actor entrypoints:

   ```sh
   export PARDNER_CONTROL_HOME="ABSOLUTE_CONTROL_HOME"
   "$PARDNER_CONTROL_HOME/control" seal
   "$PARDNER_CONTROL_HOME/control" entrypoints
   ```

`seal` refuses an active installation. It checks the exact Git SHA, tracked source
and untracked additions, Node version, and every client project's workspace
manifest schema against the selected release's `lib/workspace-schema.js`
declaration (a fresh client has none yet), then records UI
and dependency-lock hashes. Start, run and Actor CLI calls verify that record.
The schema preflight described here is in the repository controller; the preserved
installed controller is unchanged until a separately approved tooling deployment.
Schema preflight reads source and metadata without importing app code or acquiring
an app storage lease. Unknown declaration syntax fails closed for operator review.
The app still validates the stored document on open; matching manifest versions
do not establish complete compatibility or integrity.
This detects build/dependency-identity drift; it is not a sandbox or a recursive
tamper monitor for every installed dependency file. Never rebuild, reinstall
packages, pull, or reset the active release in place.

## Launch, inspect, stop and restart

```sh
export PARDNER_CONTROL_HOME="$HOME/Library/Application Support/Pardner/control-runtime"
"$PARDNER_CONTROL_HOME/control" start
"$PARDNER_CONTROL_HOME/control" status
"$PARDNER_CONTROL_HOME/control" restart
"$PARDNER_CONTROL_HOME/control" stop
```

Lifecycle commands use a nonblocking operator lock and check job ownership.
`restart` validates the proposed release before stopping the current job. `stop`
unloads only the selected installation's job and waits for its process to exit;
it never kills a process merely because it owns a port. A failed job remains
loaded for inspection. Use explicit stop/start or restart after fixing its cause.
`run` is reserved for the PID assigned by launchd; a manual invocation cannot
replace launch metadata or start an unmanaged writer.

`status` reports a fresh UTC timestamp, configured/running SHAs, PID, individual
checks, errors and live API state. It checks PID ownership of the client's single
listener and reads **the configured loopback HTTP port**, ignoring the connection
file's saved URL and all proxies. With the operator token from
`data/client-connection.json` it calls `GET /pardner/client/v1/session`, then the
managed project's `GET /pardner/client/v1/projects/ID/api/automerge/status`.
An HTTP 401 means responding but unauthenticated. Missing or invalid launch
metadata, release drift, a missing project and locally unsaved state remain
separate failures. `apiChecked: false` means ownership/listener checks prevented
a probe; it does not assert that every process on that port is stopped.

Exit 0 means the selected job, launch configuration, deployment, authenticated
client session, managed project and locally saved state all match. Exit 1
requires investigation. A connection file, saved task list or loaded job alone
does not establish liveness. Inspect `evidence/service.stderr.log` locally;
publish only sanitized observations.

## Open Pardner

```sh
"$PARDNER_CONTROL_HOME/control" open
```

`open` verifies the managed service, then runs `pardner client open` against this
installation's data. The browser receives a one-time grant and signs in as the
client's person; there is no token to read or Actor to choose. `-- --output-file
FILE` writes the private launch URL to a file instead. `open` never starts a
service itself, so it cannot start an unmanaged writer. The service binds loopback
only; the Control pane and its settings are available on this computer.

## Use the guarded agent Actor CLI

```sh
"$PARDNER_CONTROL_HOME/pardner-openai-codex" tasks --json
"$PARDNER_CONTROL_HOME/pardner-openai-codex" show TASK_ID
"$PARDNER_CONTROL_HOME/control" cli --agent openai-codex -- mentions pending
"$PARDNER_CONTROL_HOME/control" cli --agent openai-codex -- activity --limit 1000
```

`entrypoints` generates one wrapper per harness in `config.agents`. Each wrapper
locates the controller beside itself and passes that home explicitly, so copying
it to a restored installation does not retain old release/data paths. People have
no wrapper; they use `open`.

On first use for a harness, the CLI asks the client for that agent's credential
through the operator-only agent grant (the same flow as `pardner client
agent-grant`) and keeps it 0600 in `credentials/`. Every call then runs
`pardner --server PROJECT_API_BASE --token-file CREDENTIAL`, so the token never
appears in arguments, and the client proxy fixes the Actor to that agent: its
operations, `show`, inbox and claims are its own without `--actor`. `activity`
is unfiltered; the wrapper refuses `--actor`, so filter its JSON by `actorId`.
Registering Actors is not available through a client; agents
join through invitations. A revoked credential keeps failing until you remove its
file to request a fresh grant.

The canonical CLI checks the selected managed service, forces its configured URL
and data path, and uses an allowlisted environment. Caller proxy, Node and Git
injection settings cannot redirect the connection or revision checks. It rejects
`serve`, `bridge`, `client`, `open`, `--actor` and connection overrides. Coordination failures retain one JSON
error envelope on stdout, with diagnostics on stderr. Agent Actor selection does not launch
an agent or authorize work. Harness ownership and approvals remain separate.
Historical checkout aliases are conveniences; update them to the selected home
after recovery. An alias targeting an old home must fail the job-ownership check.

## Back up and recover

1. Stop the **original** controller before changing the selected home. Confirm its
   PID exited. Preserve its config, controller, plist, deployment record,
   `project.json` and exact app revision. Copy the entire cold `data/`, including
   SQLite WAL/journal files, `client.sqlite`, each project's workspace and
   Automerge storage, and `client-connection.json`.
   Hash and verify the copy. Retain previous backups, historical inboxes, ledgers,
   attachments, Git bundles and private evidence.
2. Restore to a new private home while leaving the original intact and stopped.
   Recover the pinned source into its own `releases/SHA/`, for example:

   ```sh
   git clone "$BACKUP_HOME/control-release.bundle" "$RESTORED_CONTROL_HOME/releases/$PINNED_SHA"
   git -C "$RESTORED_CONTROL_HOME/releases/$PINNED_SHA" checkout --detach "$PINNED_SHA"
   ```

3. Install Node 24.11.1 and prepare this inactive release as above. Copy the cold
   data to the new home's `data/`. Keep its client identity, projects and
   credentials. Update only the config's installation paths and intended fixed
   port, and set `projectId` to the recovered project (or copy `project.json`), so
   the first start does not create another project. Copy the installed controller
   and create the plist with the new absolute locations. Agent credentials are
   granted again on first use; the client returns the same agent token.
4. Select the restored home, then seal, regenerate wrappers and start it:

   ```sh
   export PARDNER_CONTROL_HOME="$RESTORED_CONTROL_HOME"
   "$PARDNER_CONTROL_HOME/control" seal
   "$PARDNER_CONTROL_HOME/control" entrypoints
   "$PARDNER_CONTROL_HOME/control" start
   "$PARDNER_CONTROL_HOME/control" status
   ```

5. Compare complete workspace/heads, Actors, task contexts, **unfiltered** history,
   delivery records and retained execution artifacts with the cold backup. Verify
   Chromium and WebKit reads after `control open` against this restored process. Record
   the home/revision privately and fresh sanitized results publicly. Repair any
   historical aliases before using them. Retain originals until recovery passes.

Only one controller job may run per login user. Recovery is a serial cutover,
not another concurrently served copy of the same replica. If restoration fails,
stop it explicitly, preserve any new writes, and inspect before returning to the
original. Never discard accepted writes silently.

Prepared local data reopens without GitHub, npm, a model provider or an external
hub. Rebuilding a fresh installation needs dependency availability. Keep protected
copies on independent storage for machine-loss recovery; a same-Mac copy is not
an off-machine backup, and synchronization is not backup. Historical dependency
symlinks and worktree `.git` pointers may refer to old paths. Reconstruct from the
retained source-history bundle and source/artifact files, then reinstall locked
dependencies rather than editing the preserved originals.

During service loss, dependent browsers/CLI cannot save through the host. Other
enrolled replicas retain their supported local operations, but enrollment and new
delivery leases require the hub. Restore the same hub identity and ledger.
Delivery leases are not execution locks or external-effect idempotency.

## Qualify and upgrade without changing the active release

Prepare another independent clone of the proposed pin with its own dependencies
and UI build. Run app regression/acceptance there with fresh fixture data/ports;
write reports outside the clone. Never run `npm ci`, `ui:build` or `verify` inside
the active release. The implementation checkout separately runs
`npm run test:control-runtime` and `npm run verify`, which includes the controller
suite. Its integration fixture uses the real Git, Node CLI, HTTP, SQLite and PID
listener checks; only the launchd boundary is simulated.

After qualification, stop and cold-back up the controller. Prepare a new inactive
release under its home, explicitly update config, then seal, regenerate entrypoints
and start. Verify preservation and fresh browser/CLI reads before accepting the
upgrade. An incompatible schema must fail closed; preserve that installation and
make any migration a separately scoped decision. Never edit `schemaVersion`,
regenerate identities or delete old data to make a release start.
