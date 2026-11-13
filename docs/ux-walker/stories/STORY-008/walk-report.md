# STORY-008 walk report: Slow or failing start — CLIENT_START_TIMEOUT, CLIENT_START_FAILED, STORAGE_IN_USE

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-008/` (CLI-only story; no browser surface, so no screenshots or geometry). All runs used throw-away `--data` directories.

## Steps
1. **CLIENT_START_TIMEOUT (15 s)**: **BLOCKED.** There is no honest way to make storage slow on this machine without modifying code or mounting a slow filesystem.
2–3. Tail `client.log` / re-run after a slow start: BLOCKED (depends on step 1). `client.log` exists, is 0600 and append-only, and collects the child's JSON failure lines (observed below).
4. **STORAGE_IN_USE.** A foreground `client serve` held the directory; with its `client-connection.json` moved aside, `pardner open` → exit 1, `STORAGE_IN_USE: Another Pardner service is using this storage directory` in ~0.3 s. Correct code, but the message names neither the process (PID) nor the fix (`pardner client stop --data …`) nor `client.log` (F-008-02). When the connection file is present, `pardner open` simply reuses the foreground service, which is fine.
5. **CLIENT_START_FAILED (child exits with no JSON line)**: not reproduced. The nearest real case, a corrupt `client.sqlite`, gives `ERR_SQLITE_ERROR: file is not a database`: a raw SQLite code with no mention of `client.log`, of which file is corrupt, or of recovery (F-008-03).
- **Variation: `pardner open` while a stop is in progress** (stop launched in parallel) → `INTERNAL_ERROR: fetch failed` instead of the spawn/STORAGE_IN_USE path the story predicts; the stop then completed (`stopped:true`), and later `client status` also gave `INTERNAL_ERROR: fetch failed` (stale file; see STORY-009 F-009-01) (F-008-04).
- **Variation: `--data` is a non-empty non-client directory** → `INCOMPATIBLE_SCHEMA: Choose a fresh client directory; existing data is preserved`. The user's file was untouched, **but the failed attempt created `client.log` and `runtime-lock.sqlite` inside that directory** (F-008-01).
- **Edge: `--data` is a regular file** → `ENOTDIR: ENOTDIR: not a directory, open '…/client-connection.json'` (raw Node error with a doubled code prefix) (F-008-05).
- **Edge: second spawn during a slow first boot**: BLOCKED (needs step 1).

## Flagged claim verdicts
None of the flagged claims touch STORY-008.

## Flow Log
- Ideal 2 (read an error that names `client.log`, fix, re-run). For STORAGE_IN_USE the error is correct but gives no fix; for corruption and ENOTDIR the errors are raw system codes. Recovery depends on knowing the internals.

CLIENT_START_TIMEOUT and CLIENT_START_FAILED could not be reproduced honestly. The parts that were walked found no high-severity defects.

Status: blocked
