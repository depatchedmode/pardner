# STORY-139: Working on a replica while the hub is unreachable

Setup: hub client "Dana Whitfield" (`--http-port 52301 --public-url http://127.0.0.1:52301`) created "Atlas Mobile" with three tasks. "Tomás Herrera" and "Kevin Brandt" each joined from their own client through Human invitations, so both are replicas. The outage was real: `client stop` on Dana's client, then an 11 s wait (past the admission cache) before Tomás opened the board. Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-139/`, video `videos/hub-outage-walk.webm`.

## Steps
1. **Open the board (one-time grant, as `pardner open` does).** `screenshots/step-1-open.png`: Atlas Mobile with three Backlog cards. The header shows "Remote presence unavailable" and all avatars grey, but SaveStatus reads **"Saved locally · synced"** while the hub is down (F-139-01). Geometry: two `wrappedControls` hits, multi-line card titles (by design).
2. **Header.** Every avatar is offline, including Tomás's own **You** button. There are two identical "SA" avatars (each client's Setup agent) that cannot be told apart (F-139-05).
3. **Switcher.** `screenshots/step-3-switcher.png`: "Atlas Mobile — Saved locally · waiting for hub". This contradicts the header's "synced" (F-139-01). The geometry spill is the menu overlay (intended).
4. **Escape.** The menu closes and focus returns to the switcher button. Matches.
5. **Status → In progress.** `screenshots/step-5-saving.png`, `screenshots/step-5-saved.png`: the card moves and the panel and header read "Saved locally · waiting for hub" in amber. Matches.
6. **Edit task → P0 → Save changes.** `screenshots/step-6-saved-p0.png`: saved locally as P0, still "waiting for hub". Matches.
7. **Comment "@dana this blocks the 3.2 release".** `screenshots/step-7-comment.png`: saved locally and shown as Comment 1. "@dana" renders as plain text with no chip and no warning, so the mention resolved to nobody and nothing tells Tomás (F-139-06, see flag #15).
8. **Invite ▾ → Human → Create invitation.** `screenshots/step-8-invite-menu.png`, `screenshots/step-8-dialog.png`, `screenshots/step-8-failed.png`: the error appeared within about 4 s: "Project authority unavailable; retry this attempt" / "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." Matches. The heading is internal jargon (F-139-03). Below it, "Invitations for this project" stays on **"Loading…"** with no failure state (F-139-02).
9. **Close (Escape).** `screenshots/step-9-closed.png`: focus returns to **Invite**. Matches.
10. **Reopen Human.** `screenshots/step-10-dialog-again.png`: the earlier error is still shown, and the list is still "Loading…" after 3 s. The catalog expected the list to show the same failure. It never resolves (F-139-02).
11. **You profile.** `screenshots/step-11-profile.png`: "Tomás Herrera (you) · Human · Offline", Live sessions 0, "No live session reported to this view. Offline means none is connected here, not that work stopped." He is shown Offline while actively editing (F-139-04). Matches the catalog's description of the gap.
12. **New task "Add cache warm-up telemetry".** `screenshots/step-12-new-task.png`: created locally, its panel opens, "Saved locally · waiting for hub". Matches.
13. **`client status --data …`** reports `hubConnected:false, syncPending:true, syncError:"Could not reach sync server: fetch failed"`. `client show` reports `presence:{actors:[], available:false, code:"HUB_UNAVAILABLE"}`. Matches.
14. **Hub restarted.** The header changed to "Saved locally · synced" within about 1 s. `screenshots/step-14-hub-back.png` (6 s later): "Remote presence unavailable" is gone and Kevin's avatar appears, but every avatar, including Tomás's own, is still grey. Geometry clean (card wraps only). On the hub, the doc has the task In progress and P0, the new task and the comment. Nothing was lost.
15. **Switcher again.** `screenshots/step-15-switcher.png`: it still reads **"Saved locally · waiting for hub"** while the header and panel say synced (F-139-01, flag #32).
16. **Retry Create invitation.** `screenshots/step-16-invite-ok.png`: "Waiting to be used · Expires in 24 h". The invitation stays hidden, with Copy invite / Show invite text / Revoke, and the list shows it. Matches. The invitation text was not revealed in the screenshot.
- Mobile (390x844, hub down): `screenshots/mobile-check.png`. The header wraps into five rows (avatars, the presence notice with Invite, the You chip truncated to "You: Tomás Herre…", SaveStatus with New task), so the board starts at about 590px. SaveStatus again says "synced" with the hub down. Geometry clean.
- Re-check of step 1 on a later fresh open with the hub down (`s139m`): `client status` shows `hubConnected:false, syncPending:false`. The header showed "Saved locally · synced" at 1 s, 5 s and 15 s. It was repeatable.
- Console: 11 × 503 from replica-to-hub calls during the outage. No page errors.

## Flagged claim verdicts
- **#32 (switcher labels stale; can disagree with the header):** CONFIRMED. During the outage the header says "synced" and the switcher says "waiting for hub". After recovery the header says "synced" and the switcher still says "waiting for hub".
- **#9 (loopback-endpoint HUB_UNAVAILABLE can never succeed):** not applicable. All clients are on one machine, so the hub's loopback endpoint is reachable and the retry did succeed once the hub was back.

## Flow Log
- Ideal path 6. Actual: open, look at the header, open the switcher, edit status, edit priority, comment, Invite → Human → Create (fails), close, reopen, profile, new task, `client status`, wait, switcher, Create = 15 actions. The extra steps are the story's own exploration of hub-only actions. The local edits needed no extra steps.
- Hesitation: three different sync claims are visible at once (header "synced", switcher "waiting for hub", "Remote presence unavailable"), so he cannot tell whether the hub has his work. Only the CLI JSON gives a straight answer (`hubConnected:false`).
- The failed invitation dialog keeps "Loading…" forever, which looks like it might still succeed.
- No data re-entry. The invite retry is one click after reopening.

Status: pass
