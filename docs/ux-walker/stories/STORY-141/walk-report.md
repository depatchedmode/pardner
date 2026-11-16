# STORY-141: Exporting retained work after revocation

Setup: this continues STORY-140. Kevin Brandt's replica of "Atlas Mobile" was revoked by the hub. I kept the project ID from the earlier setup receipt, as the persona does. All steps are CLI against Kevin's real client directory (`--data …/kevin`). Each command's output was rendered to a screenshot for the evidence (`screenshots/<step>.png`), and the full transcript is in `cli-transcript.json`. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-141/`.

## Steps
1. **`client list`.** `screenshots/step-1-list.png`: `projects: []`, so Atlas Mobile is gone. Matches.
   - Browser after a client restart: `screenshots/step-1b-browser-after-restart.png` shows "Welcome, Kevin Brandt" with Start a project / Join a project. There is no trace of Atlas Mobile and no revoked notice. Geometry clean.
2. **Docs.** `docs/PARDNER-CLIENT-RECOVERY.md` line 21 says: "Keep the project ID from a prior receipt when a revoked project disappears from `list`." Matches.
3. **Find the ID.** Nothing in the CLI or the browser shows it any more. The project directory on disk is named with a different UUID (`projects/76cc6aa2-…`), not the project ID, so browsing the data directory does not help either (F-141-01). I used the ID kept from setup.
4. **Export without `--output-file`.** `screenshots/step-4-export-no-output.png`: `INVALID_ARGUMENT: Supply --output-file for the private content export`, exit 1. Matches.
5. **Export with `--output-file`.** `screenshots/step-5-export.png`: `{success, projectId, format:"pardner-workspace-view-v1", savedLocally:true, exportFile}`. `screenshots/step-5-file.png`: the file has mode 600 and the keys `format, workspaceId, exportedAt, savedLocally, doc, restoreRequires`, with `restoreRequires: "Complete cold client backup; this readable content view is not a replica or credential backup"`. The content is all present: four tasks, including Tomás's P0 change and the new task made during the hub outage, and one comment. Matches. The "readable" view is a 26 KB raw document dump with Actor hashes and the operations log, not something a person can read as notes (F-141-03).
   - Exporting again to the same path silently overwrites the earlier file (`screenshots/step-5b-export-again-same-file.png`) (F-141-04).

### Variations and edge cases
- **Live, non-revoked project** (Tomás's replica): `screenshots/var-live-project.png` succeeds the same way. Matches.
- **Wrong ID:** `screenshots/var-wrong-id.png` gives `NOT_FOUND: Project not found`. It does not suggest how to find revoked IDs.
- **Client not running** (`client stop`, then export): `screenshots/edge-not-running.png` gives **`INTERNAL_ERROR: fetch failed`**, not the documented `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve" (F-141-02). The client was restarted afterwards.
- `STORAGE_FAILED`: not produced; there was no storage fault to inject.
- Mobile check: `screenshots/mobile-check.png` (the Welcome screen at 390x844) is clean. There is no board for this story.

## Flagged claim verdicts
- **#31 (after revocation the project disappears from `client list`, and nothing lists revoked project IDs needed for `client export`):** CONFIRMED. `list` returns `[]`, the browser shows Welcome, and the on-disk folder name is not the project ID.
- **#25 (stale connection file gives a raw `INTERNAL_ERROR: fetch failed` rather than `CLIENT_NOT_RUNNING`):** CONFIRMED for `client export` as well.

## Flow Log
- Ideal 2 (find the ID, export). Actual: `list` (empty), read the recovery doc, recover the ID from an old log, export (fails without `--output-file`), export again = 5. The first export failure is a required-flag miss that could default to a safe path. Re-entry: the project ID must be pasted from an external record.
- Dead end: without the earlier receipt there is no route to the data except a cold backup.

Status: pass
