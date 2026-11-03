# Issue #75 runtime repair evidence

This report covers [issue #75](https://github.com/depatchedmode/pardner/issues/75).
Use the [operations guide](PARDNER-CONTROL-RUNTIME.md) for lifecycle and recovery.
Full paths, ownership mappings, credentials, task contents, execution records,
command transcripts and screenshots remain private, outside disposable checkouts.

## Revisions and deployment boundary

- App runtime: **`eb66151ad57af45baf686909b1ab19ece58c7bad`**, Node **24.11.1**,
  detached independent clone, locked dependencies and prepared UI.
- Controller SHA-256:
  `656593b9d58064c7a49f05d51cea6b7b452786c6c50b17673d6730c74ea9c552`.
  Installed and repository controller bytes match. This identifies this report's
  evaluated revision; subsequent code changes require renewed evidence.
- Implementation base: `07a71f2b831a938a6f7de6cb9fa91b5c1420c6ce`.
  The accompanying implementation contains the controller, tests and guidance.
- Final implementation fingerprint:
  `e0b6ef187edaa024bd73867ae75bf9d63cdeb5af74ef701c5346693ec2e0cf5b`.
  It matched before and after full repository verification.
- Persisted workspace: schema **2**. Development app source: schema **4**.
  The app pin preserves the enrolled workspace; no schema migration occurred.
- One loopback hub, HTTP 8004 / WebSocket 8005, with dependent CLI and browsers.
  GitHub remains authoritative for the milestone. No login autostart, bridge,
  model agent turn, remote service or new network transport was enabled.

The authoritative service data is in the private installation's `data/`.
Historical installations, cold copies and recovery probes retain their original
identities and credentials as offline evidence/backups. They are not additional
live replicas. Only one controller job runs per login user.

## Inventory and preservation

The inspected launch and Actor wrappers referenced the removed `mission-control`
checkout. The original entrypoint failed before Node launched. No corresponding
Pardner listener or LaunchAgent was found, despite persisted connection metadata.
The previously configured source revision was
`b70ded85c85213dfe245d2503232c5100a246ed0`, with four pre-existing staged files.
Those tracked files were not changed by this repair.

Before repair, a private inventory and cold copies preserved the complete original
`.pardner` tree, legacy `.mission-control` data and document URL, launchers and
configuration. The copied tree matched **2,380 regular-file hashes**, excluding
dependency trees and symlinks. Historical dependency symlinks and Git pointers
were retained as evidence, with reconstruction requirements documented.
Self-contained pinned-release and inspected-source-history bundles were verified.
The latter contains refs captured by the initial independent clone, not later
owner changes.

The original live ledger held **2 deliveries and 0 claims**. The historical
inventory contains **32 SQLite databases: 14 inbox databases and 18 delivery
ledgers** (14 rehearsal service ledgers and 4 lab hub ledgers), in addition to
that live ledger. Original historical bytes remain preserved; no inbox was
resumed, acknowledged or dispatched.

The service-owned copy has **4 tasks, 3 Actors, 13 comments, 8 mentions and
22 attributed operations**. Full-document equality and matching heads establish
preservation across the initial restart and subsequent real recovery. The initial
Actor-wrapper activity probe covered only **8 filtered events**; it was not a
complete-history check. The repaired unfiltered CLI verified all **22** operations.

## Review findings repaired

- Installation selection now follows explicit `--home`, then
  `PARDNER_CONTROL_HOME`, then the installed script directory. Configuration
  errors are handled without relying on module-load side effects.
- Only launchd's assigned PID may execute `run` and write launch metadata.
  Actor entrypoints cannot invoke `serve`, `bridge` or connection overrides.
- Entry points locate their adjacent controller and read one private config;
  they no longer hard-code Node, release or data paths. Actor defaults remain.
  `--json` is forwarded once. Inspected checkout aliases route to this controller.
- Git verification uses an explicit repository/work tree and a clean environment.
  Node requests use an allowlisted environment. Isolated system Python and
  absolute wrapper utilities avoid caller injection during entrypoint resolution.
- Health reads use the configured loopback port, with proxies disabled. Saved
  connection URLs cannot redirect them. Release, ownership, launch record,
  listeners, API authentication, identity and persistence checks are separate.
- The deployment record seals built UI and source/installed dependency-lock
  identities while stopped. It detects relevant deployment drift without claiming
  recursive tamper detection for every dependency file.
- Controller tests now run in `npm run verify`. They use disposable installation
  homes; guard checks no longer edit the active release or production config.
  App qualification runs in another independent prepared clone.

## Fresh real recovery observations

All times below are UTC on **2026-10-30**.

- The original job was stopped and a verified cold data copy was taken before
  replacing tooling. Credentials and workspace/replica identities were retained.
  No backup was copied over potentially newer authoritative data.
- **06:57:07**: a restored installation, with its own release, data directory,
  controller and ports, started through the real launchd boundary and reported
  healthy. Its complete document, credential and delivery rows equaled the cold
  backup. The original installation remained intact and stopped.
- A relocated Actor entrypoint returned the restored tasks even with the global
  home pointed at the original and hostile proxy, Node and Git settings present.
  An unfiltered CLI read returned all 22 operations.
- **06:57:09–06:57:10**: fresh authenticated Chromium **151.0.7922.34** and WebKit
  **26.5** reads opened restored task context with connected/saved state and no
  page errors. The screenshots were inspected. No authored operation was made.
- The restored job was stopped explicitly, then the primary job restarted.
- **06:57:12–06:57:14**: both browser engines again passed against the primary
  process. The final doctor confirmed owned listeners, exact deployment and
  controller identities, authenticated workspace identity and locally saved state.
  Full-document and delivery-row equality still held.
- **07:53:11–07:53:13**: after full verification, the final controller was installed
  and the primary restarted. Its only addition since the recovery rehearsal is
  the standard JSON envelope for rejected Actor CLI calls, covered by a new test.
  The document remained equal across restart; a rejected `serve` call returned
  that envelope. Fresh Chromium and WebKit reads passed again with no page errors.
  The app pin and sealed deployment stayed unchanged.

Real recovery transcripts, cold hashes, before/after documents, unfiltered
activity, status receipts, deployment manifests and browser evidence are retained
under the private `control-repair-2` evidence directory. The offline restored
installation and cold backups are retained under `backups/` and named in the
private authority inventory.

## Verification

From the implementation checkout under Node 24.11.1:

```sh
npm run test:control-runtime
npm run test:cli
npm run verify
```

The focused controller suite passed **13/13** tests. Full verification passed the
same **13 Python tests**, **296/296 Node tests**, the UI build and a complete
acceptance scenario. No tests were skipped on this Mac. The watchdog reported
exit 0 and no surviving owned test processes. The integration fixture uses real
Git, Node CLI, HTTP, SQLite and PID listener checks, with only launchd simulated.
It snapshots the working candidate, including uncommitted source, into its own
Git pin, restores to a path containing spaces, then removes its original source
installation. The separate real launchd rehearsal above closes the OS boundary.

The deployed historical app's earlier focused checks passed runtime **20/20**,
CLI **11/11**, UI **2/2** and full regression **166/166** plus acceptance.
The earlier 20-repeat run passed with stable app fingerprint
`385fd193a12ca43918f17033480c614192ce2cce9aae305739876e067de8a5b1`.
It overlapped controller lifecycle work, and some preparation rebuilt the active
release in place. Its passing assertions remain recorded, but that procedure did
not meet the intended stable-deployment discipline and did not test the new
controller. The review identified those gaps; the repaired procedure uses another
prepared clone and leaves the authoritative job untouched throughout qualification.

The new separate-clone verification passed **166/166** regression tests and one
complete acceptance scenario (**06:59:16–07:01:31**). The following 20-repeat run
passed **20/20** seeds (**07:01:31–07:48:34**), with the authoritative job left
untouched throughout. Its before/after app fingerprint remained
`385fd193a12ca43918f17033480c614192ce2cce9aae305739876e067de8a5b1`.
Its exact commands were:

```sh
# In the separate inactive qualification clone, never the active release:
npm run verify
npm run test:acceptance -- --repeat 20 --seed 1 \
  --output "$PARDNER_CONTROL_HOME/evidence/control-repair-2/acceptance-20"
```

Initial mixed-load qualification attempts failed the local-acknowledgement timing
gate; the implementation checkout also had a LAN-test timeout. Later sequential
runs passed unchanged limits. Those failures and diagnostic runs remain private;
the later passes do not prove their cause. An initial new-suite attempt lacked
sandbox permission to bind fixture listeners; the authorized invocation passed.
A recovery-fixture assertion correctly found an empty ledger until the public
pending-delivery read materialized the intended fixture delivery. That fixture
was repaired rather than weakening the assertion.

## Interventions and limits

The repair copied data to independent private storage and changed inspected
launcher/entrypoint configuration. The original databases and unrelated owner
work remain intact. Review repairs changed controller/config/plist/wrapper
metadata, recorded a deployment manifest and performed a controlled serial
recovery. Tooling backups are retained. There were no schema migrations,
credential rotations, production Actor registrations, authored task mutations,
delivery claims or archive retirements. Qualification fixtures had their own
Actors, tasks, comments and disposable resets/removals.

Historical authored task/evidence text retains its original paths. Use current
entrypoints for new work rather than rewriting that history. Prepared local
reopening is independent of GitHub/npm/model availability; fresh dependency
installation still needs package availability. Same-Mac backups do not provide
machine-loss protection.

This does not qualify a fresh-machine restore, physical companion phone, remote
network, power-loss durability, real-agent rehearsal, schema-4 upgrade, T3 adapter,
routing #58 or review #66. The future project-control-pane plan was not created.
