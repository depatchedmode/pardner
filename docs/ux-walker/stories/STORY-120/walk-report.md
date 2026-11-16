# STORY-120 walk report: Stale reads and an unreachable service

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-120/`.

**Setup.** A follow-up ("Long-running: regenerate all invoice fixtures.") was left Running as T3 run 11 in the fake T3. Then:
- "T3 stops answering": the fake T3's listener on port 47390 was closed.
- "Pardner service unreachable": the walker's own client service was stopped with `client stop`.
- "Service back": the client was restarted on the same port and T3 listened again.

The default CLI client uses `pollMs` 2000 and `staleAfterMs` 6000.

## Steps
0. **Fresh** (`screenshots/step-0-fresh.png`): the session and the running card both show "Read 0s ago" in green. Geometry: clean.
1. **T3 stops answering** (`screenshots/step-1-t3-stale.png`, `screenshots/step-1-t3-stale-card.png`): after about 9 s, both labels read "Stale: last read 10s ago (12:02:11 PM)" in amber, and a red box reads "Last T3 pass failed: No conclusive T3 reply to tools/call". Confirmed. The card's state stays "Running" in green next to the stale label, and the failure text is protocol jargon ("tools/call"). Geometry: clean.
2. **Service unreachable** (`screenshots/step-2-service-down-top.png`, `screenshots/step-2-service-down-session.png`): the labels read "Stale: the service is unreachable; last known read 12:02:11 PM" and the last view is kept. Confirmed. The pane shows the raw browser error **"Failed to fetch"** in a red box. Meanwhile the app-level banner says "The local Pardner client did not respond. Check that it is still running, then retry." with **Retry connection**, and the header reads "Local service disconnected". That is three statements of one fact, two buttons that can retry (Retry connection, Read T3 now) and one raw error string. Clicking **Read T3 now** while the service is down changes nothing visible (`screenshots/step-2-readnow-while-down.png`).
3. **Service back, Read T3 now** (`screenshots/step-3-back-top.png`, `screenshots/step-3-back.png`): the labels return to "Read 1s ago", and the banner and "Failed to fetch" clear. Confirmed. One "410 (Gone)" resource error appeared in the console right after the service restarted, with no visible effect.
- **Edge: ended runs show no freshness label** (`screenshots/edge-ended-no-freshness.png`): after the run completed, its line is "Maya Okafor → Setup agent · run …:11" with no freshness. Confirmed.
- **Edge: Cloud freshness vocabulary**: not observable here because no Cloud context existed yet. See STORY-121.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console: ERR_CONNECTION_REFUSED ×12 while the service was down (expected) and one 410 after the restart. There are no page errors.

## Flagged claim verdicts
None of the flagged claims touch STORY-120.

## Flow Log
- Ideal path: 1 (read the label, or click Read T3 now). Actual: 1. The stale label is clear and well placed.
- Hesitation: while the service is down there are two retry affordances (app banner **Retry connection** and **Read T3 now**) and a raw "Failed to fetch". It is unclear which one to use.
- Duplicated information: "service unreachable" is stated in the header, the app banner, the pane error and each freshness label.

Status: pass
