# Operate the pinned control runtime

Use the private controller for development coordination. Give candidate code its
own storage and ports. GitHub remains authoritative for issues and milestones;
Pardner is a secondary working view. The [repair report](PARDNER-CONTROL-RUNTIME-EVIDENCE.md)
records the exact app pin and verification. This installation preserves schema 2;
it does not gain the current checkout's schema-4 features or bridge adapters.

## Locate the installation

`--home` selects an installation explicitly. Otherwise the controller uses
`PARDNER_CONTROL_HOME`, then the directory containing the installed controller.
The normal installation is `$HOME/Library/Application Support/Pardner/control-runtime`.
Keep it private (0700), outside every disposable checkout. It contains:

- `control`: an installed copy of [control-runtime.py](../scripts/control-runtime.py).
- `config.json`: absolute release/data/Node paths, exact SHA, role, fixed ports,
  existing workspace/replica IDs, and existing Actor IDs. It contains no token.
- `deployment.json`: hashes of the built UI, source dependency locks and installed
  dependency lock identities, recorded while this installation is stopped.
- `running.json`: the assigned launchd PID and its configuration, deployment and
  controller identities. This is launch metadata, not proof of liveness.
- `service.plist`: the manually loaded `app.pardner.control` launchd job.
- `releases/SHA/`: an independent Git clone, runtime dependencies and built UI.
- `data/`: **the sole authoritative service replica**, including `repo/`,
  `workspace.json`, SQLite files and protected `connection.json` credentials.
- `backups/`: cold data, original installations and wrappers, historical execution
  artifacts, and pinned-release/source-history Git bundles.
- `evidence/`: private inventories, timestamped reads, comparisons and logs.
  Recovery probe directories here are offline copies, never another live authority.

Retain backup metadata and credentials unchanged. Do not serve backup/probe copies
alongside the authoritative replica. A browser depends on the host service and
owns no separate Automerge database.

The private config has this shape. Substitute inspected paths and existing IDs:

```json
{
  "sha": "eb66151ad57af45baf686909b1ab19ece58c7bad",
  "release": "ABSOLUTE_CONTROL_HOME/releases/eb66151ad57af45baf686909b1ab19ece58c7bad",
  "data": "ABSOLUTE_CONTROL_HOME/data",
  "node": "ABSOLUTE_NODE_24_11_1_BINARY",
  "role": "hub",
  "httpPort": 8004,
  "wsPort": 8005,
  "workspaceId": "EXISTING_WORKSPACE_ID",
  "replicaId": "EXISTING_REPLICA_ID",
  "actors": ["HUMAN_ACTOR_ID", "AGENT_ACTOR_ID"]
}
```

Data must resolve to this installation's `data/`; the release must be under its
`releases/`. Use a full independent clone, not a candidate worktree or Git
alternates. The Node binary may live outside the installation. Entry point Actor
IDs must be filename-safe; other existing IDs can use `control cli --actor ID`.

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
4. Record deployment artifacts and generate Actor entrypoints:

   ```sh
   export PARDNER_CONTROL_HOME="ABSOLUTE_CONTROL_HOME"
   "$PARDNER_CONTROL_HOME/control" seal
   "$PARDNER_CONTROL_HOME/control" entrypoints
   ```

`seal` refuses an active installation. It checks the exact Git SHA, tracked source
and untracked additions, Node version, storage identity and role, then records UI
and dependency-lock hashes. Start, run and Actor CLI calls verify that record.
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
checks, errors and live API state. It checks PID ownership of both listeners and
reads **the configured loopback HTTP port**, ignoring the connection file's saved
URL and all proxies. An HTTP 401 means responding but unauthenticated. Missing or
invalid launch metadata, release drift and locally unsaved state remain separate
failures. `apiChecked: false` means ownership/listener checks prevented a probe;
it does not assert that every process on that port is stopped.

Exit 0 means the selected job, launch configuration, deployment, authenticated
workspace identity and locally saved state all match. Exit 1 requires investigation.
A connection file, saved task list or loaded job alone does not establish liveness.
Inspect `evidence/service.stderr.log` locally; publish only sanitized observations.

Open `http://127.0.0.1:8004/pardner/`, read the token locally from the protected
`data/connection.json`, and select your Actor. The service binds loopback and
preserves shared-secret admission. This repair changes no synchronization,
transport, enrollment or credential semantics.

## Use the guarded Actor CLI

```sh
"$PARDNER_CONTROL_HOME/pardner-YOUR_ACTOR_ID" tasks --json
"$PARDNER_CONTROL_HOME/pardner-YOUR_ACTOR_ID" show TASK_ID
"$PARDNER_CONTROL_HOME/control" cli --actor YOUR_ACTOR_ID -- mentions pending
"$PARDNER_CONTROL_HOME/control" cli -- activity --limit 1000
```

`entrypoints` generates wrappers from `config.actors`. Each wrapper locates the
controller beside itself and passes that home explicitly, so copying it to a
restored installation does not retain old release/data paths. Actor defaults stay
explicit; select another wrapper to change Actor. `--json` is forwarded once.
The final example intentionally omits an Actor to read unfiltered activity.

The canonical CLI checks the selected managed service, forces its configured URL
and data path, and uses an allowlisted environment. Caller proxy, Node and Git
injection settings cannot redirect the connection or revision checks. It rejects
`serve`, `bridge` and connection overrides. Coordination failures retain one JSON
error envelope on stdout, with diagnostics on stderr. Agent Actor selection does not launch
an agent or authorize work. Harness ownership and approvals remain separate.
Historical checkout aliases are conveniences; update them to the selected home
after recovery. An alias targeting an old home must fail the job-ownership check.

## Back up and recover

1. Stop the **original** controller before changing the selected home. Confirm its
   PID exited. Preserve its config, controller, plist, deployment record, Actor
   mapping and exact app revision. Copy the entire cold `data/`, including SQLite
   WAL/journal files, workspace metadata, credentials and Automerge storage.
   Hash and verify the copy. Retain previous backups, historical inboxes, ledgers,
   attachments, Git bundles and private evidence.
2. Restore to a new private home while leaving the original intact and stopped.
   Recover the pinned source into its own `releases/SHA/`, for example:

   ```sh
   git clone "$BACKUP_HOME/control-release.bundle" "$RESTORED_CONTROL_HOME/releases/$PINNED_SHA"
   git -C "$RESTORED_CONTROL_HOME/releases/$PINNED_SHA" checkout --detach "$PINNED_SHA"
   ```

3. Install Node 24.11.1 and prepare this inactive release as above. Copy the cold
   data to the new home's `data/`. Keep its workspace/replica IDs and credentials.
   Update only the config's installation paths and intended fixed ports; copy the
   installed controller and create the plist with the new absolute locations.
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
   authenticated Chromium and WebKit reads against this restored process. Record
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
