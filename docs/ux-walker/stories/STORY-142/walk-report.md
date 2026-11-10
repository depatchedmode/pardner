# STORY-142: Cold backup and restore into a fresh installation

Setup: "Lena Sørensen" has her own client (`…/resilience/lena`). She is a replica member of "Harbor Infra" (hub: Dana's client on :52301, three tasks) and the creator (hub) of "Billing Alerts" (three tasks). The "new Mac" is a fresh private directory on the same machine (`…/resilience/restored-client`). Same repo revision and Node 24.11.1. CLI outputs are rendered as screenshots, and the full transcript is in `cli-transcript.json`. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-142/`.

## Steps
1. **`client list` and record.** `screenshots/step-1-list.png`, `screenshots/step-1-record.png`: identity `3080b982-…`, device `b0e13dc7-…`. Harbor Infra is a replica and Billing Alerts a hub, both `savedLocally:true, syncPending:false`. Task counts are 3 and 3. Matches.
2. **Unsaved browser draft.** `screenshots/step-2-unsaved-draft.png`: an Edit task draft on "Rotate TLS certs on edge nodes" with the description "UNSAVED DRAFT: check edge-03 before rotating". Geometry: card wrap only.
3. **`client stop`.** `screenshots/step-3-stop.png`: `{stopped:true, running:false}`. Matches. The open board (`screenshots/step-3-board-after-stop.png`) shows "The local Pardner client did not respond…" with Retry connection, and the draft is still on screen. **New task** stays enabled while the service is gone.
4. **`client stop` again.** `screenshots/step-4-stop-again.png`: `{stopped:false, running:false}`, exit 0. Matches.
5. **`umask 077; test ! -e … && cp -Rp`.** `screenshots/step-5-copy.png`: the copy holds `client-connection.json`, `client.sqlite` (no -wal/-shm sidecars after a clean stop), `runtime-lock.sqlite` and `projects/` with two project folders, all mode 700/600. There is no `repo/` or `deliveries.sqlite` in this install, so the catalog's list is out of date (not a defect). Running the same guarded command again refuses to overwrite (`screenshots/step-5b-copy-again-refused.png`, `exit=1`). Matches.
6. **Transfer into a new private directory.** `screenshots/step-6-transfer.png`: `drwx------` directory and `-rw-------` sqlite. Modes kept. Matches.
7. **`client serve --data restored-client`.** `screenshots/step-7-serve.png`: `{"success":true,"serving":true,"mode":"client","localUrl":"http://127.0.0.1:54113/pardner/"}`. The saved port is reused. Matches.
8. **`client list --data restored-client`.** `screenshots/step-8-list-restored.png`, `screenshots/step-8-compare.png`: same identity, same device, same two project IDs and roles. `hubConnected:true` for both. Matches.
9. **`client open --data restored-client`.** `screenshots/step-9-open-output.png`: `{localUrl, launchIssued:true}`. `screenshots/step-9-restored-board.png`: Harbor Infra opens signed in as Lena, "Saved locally · synced". The hub was reachable, so the transient "waiting for hub" never appeared. `screenshots/step-9-switcher.png`: both projects read "Saved locally · synced". Geometry: card wrap only. The geometry spill is the menu overlay (intended). The unsaved Edit task draft from step 2 is gone. That is expected (sessionStorage), and the docs and catalog say so.
10. **Compare.** `screenshots/step-10-compare-counts.png`: 3/3 before and 3/3 after. A status change made on the restored replica (`screenshots/step-10-write-after-restore.png`) reached the hub (`screenshots/step-10-hub-sees.png`: `in-progress`). Matches. The backup was kept.
- Mobile (390x844, restored board): `screenshots/mobile-check.png`, geometry clean.
- Console on the restored board: no errors.

### Edge cases walked
- **Restored copy already running (`STORAGE_IN_USE`).** A second `client serve --data restored-client` gives `STORAGE_IN_USE: Another Pardner service is using this storage directory` (`screenshots/edge-storage-in-use.png`). Matches.
- **Old machine still running (two copies).** Starting the original directory while the restored copy runs gives `PORT_IN_USE: Port 54113 is in use by another process; choose another --http-port` (`screenshots/edge-two-copies.png`). That is only a port coincidence, and the advice is dangerous. **Following it** (`client serve --data lena --http-port 54199`) succeeds. Two copies of the same identity and device then run at once, both `hubConnected:true` for Harbor Infra, and both serving the Billing Alerts hub (`screenshots/edge-two-copies-with-port.png`). The doc forbids this ("Only one active copy… may run"), and nothing detects it (F-142-01). I stopped the duplicate straight away.
- Not walked: `INCOMPATIBLE_SCHEMA` (no older-format data available) and the stale-hub-backup revocation rollback (it would need a revoke between backup and restore on a hub with members; out of time scope).

## Flagged claim verdicts
- **#23 (`PORT_IN_USE` advises `--http-port`):** related, not the same case. Here the advice is followed and it *works*, which is the problem: it starts a forbidden second active copy.
- No other flagged claim names this story.

## Flow Log
- Ideal 8 (record, stop, copy, transfer, serve, list, open, verify). Actual: the same 8 commands plus one accidental extra `stop`, which is harmless and clearly reported. No data re-entry. No new enrollment was needed. The whole flow is CLI plus documentation. There is no `client backup` or `client restore` command, so the person must hand-type `umask`, `test ! -e` and `cp -Rp` correctly.
- Risk point: nothing stops the old copy from coming back after the migration, and the only guard (the port) tells the person how to bypass it.

Status: fail
