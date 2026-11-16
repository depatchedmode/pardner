# STORY-028: Hub offline during join, then resuming after reload

Setup: hub "Lena Fischer" (`--http-port 52102 --public-url http://127.0.0.1:52102`), project "Data pipeline audit" with one task; Human invitation issued, then the hub stopped with `client stop`. Sam Whitaker's client already had "Sam notes". Chromium 1440x900; invitation text masked in screenshots. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-028/`.

## Steps
1. **Paste and Join while the hub is down** (via switcher → Start or join a project… → Join a project). `screenshots/step-1-hub-down.png`: "Project authority unavailable; retry this attempt" / "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." The refusal came in ~0.5 s (connection refused, not a 15 s timeout). pending-join kept; textarea still holds the text. Geometry clean. Matches; heading jargon F-028-02.
2. **Retry while still down.** `screenshots/step-2-retry-still-down.png`: same failure; pending-join operation ID unchanged. Geometry clean. Matches.
3. **Reload.** `screenshots/step-3-after-reload.png`: lands on "Sam notes" board. Geometry clean. Back on Join a project: `screenshots/step-3-join-empty.png`: textarea empty, no resume notice (F-028-01). Geometry clean. Matches the catalog's description of the gap.
4. **Hub restarted; re-paste (with an extra trailing newline) and Join.** pending-join operation ID before submit was the original one, so the attempt resumed.
5. **Success.** `screenshots/step-5-joined.png`: board "Data pipeline audit", task "Profile nightly ETL", header "Saved locally · synced". Geometry: one wrappedControls hit on the task card (multi-line card by design, not a defect). Switcher `screenshots/step-5-switcher.png`: "Data pipeline audit — Saved locally · waiting for hub" while the header says synced (F-028-03). The geometry spill on `.menu-anchor` is the open dropdown overlaying the page, intentional.
- Mobile (Join form at 390x844): `screenshots/mobile-check.png`, geometry clean, no wrap.
- Console: two 503s from the deliberate hub-down attempts. Video: `videos/hub-offline-join.webm`.

## Flagged claim verdicts
- **#34 (joins have no resume notice and the textarea is empty after reload):** CONFIRMED (`screenshots/step-3-join-empty.png`). Resume does work if the same text is re-pasted (trailing newline tolerated).
- **#9 (HUB_UNAVAILABLE for a loopback-endpoint invitation can never succeed):** BLOCKED. Only one computer is available; a loopback endpoint is reachable from the same machine, so the other-computer failure cannot be reproduced honestly.
- **#32 (switcher labels stale):** CONFIRMED here too (`screenshots/step-5-switcher.png`).

## Flow Log
- Ideal path 3 (paste, submit, retry when back). Actual: paste, submit, submit, reload, open switcher, Start or join, Join tab, find message again and re-paste, submit = 9 actions. The reload forced 4 extra steps and re-entry of known data (the invitation).
- Hesitation: after reload nothing indicates a join is pending.

Status: pass
