# STORY-033: Agent-led setup with `client create` and `client join`

Setup: fresh client served with `--harness openai-codex --name Cobalt`. The "Sensor fleet" invitation came from Lena's hub "Data pipeline audit" (written to a 0600 file). Full CLI transcript (tokens and invitations redacted): `cli-transcript.txt` in the evidence dir `<evidence-archive>/walker-2026-11-09/STORY-033/`.

## Steps
1. `client create --name "Firmware OTA" --operation-id create-ota` before identity → exit 1, `IDENTITY_REQUIRED` "Confirm your identity before creating a project", stderr `IDENTITY_REQUIRED: …`. Matches.
2. `client identity --name "Felix Wagner" --email felix@wagner.dev --operation-id id-felix` → success; the payload still includes `suggestedIdentity` from Git (F-033-01).
3. Re-run create → `{project:{id:844aab4a…, name:"Firmware OTA", role:"hub", …}}`. Matches.
4. Re-run again → same project ID. Idempotent, matches.
5. `client join --invitation-file … --operation-id join-sensor-fleet` → `role:"replica"`, name "Data pipeline audit". Re-run with the same ID → same project. Matches.
6. `client list` → both projects with `status`. Matches.
7. `client open --output-file …` → `{localUrl, launchIssued:true}`; opening the launch URL in Chromium landed on "Firmware OTA" (`projects[0]`) (`screenshots/step-7-browser.png`, geometry clean); switcher lists both, "Saved locally · synced" (`screenshots/step-7-switcher.png`, menu overlay spill only). Matches.
- **Variations/edges:** join without `--invitation-file` → "Supply --invitation-file with private invitation data"; same op ID with "Firmware OTA v2" → `OPERATION_ID_REUSED` "Operation ID belongs to different input"; op ID "has spaces" → "Supply a stable operationId"; `client status` on a data dir with no service → `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve". All match. Missing `--operation-id` creating duplicates: confirmed in STORY-025 (F-025-03).
- Agent-only device and adding a second harness: not walked (time).
- Mobile `screenshots/mobile-check.png`: clean. Console: none. Video: `videos/browser-handoff.webm`.

## Flow Log
- Ideal path 4 (identity, create, join, open). Actual 4 commands after the expected IDENTITY_REQUIRED refusal. Errors are machine-readable and each names the fix.
- Known-data re-entry: none. `--name` ambiguity is the main hesitation point for an agent (F-033-02).

Status: pass
