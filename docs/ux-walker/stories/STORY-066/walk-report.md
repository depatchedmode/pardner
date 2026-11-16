# STORY-066: Create a task before your Actor has synced

Walked 2026-11-09 in Chromium 1440×900 with video. Ruth Adeyemi has her own client and joined "Harbor Mobile" with a human invitation from Daniel's hub.

**Simulation:** a real join registers the Actor too quickly to observe the gap. Without interception, the panel showed "Creating as Ruth Adeyemi · human" straight away (first attempt). So I used Playwright to remove Ruth's own Actor from the first `/automerge/doc` response and to refuse the live-update WebSocket until released. Then I created a task from the hub and let the WebSocket connect. This reproduces "document loaded, Actor not yet in `doc.actors`", but it also produces a WebSocket outage the real case would not have. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-066/` (video in `videos/`).

## Steps
1. **New task** — `screenshots/step-1.png`: the panel reads "Your Actor isn’t on this board yet. Wait for the project to sync; your draft is kept." **Create task** is disabled with `aria-describedby="new-task-actor"`. Geometry: `wrappedControls` hits on task cards only (intentional). Matches.
2. **Type "Collect Q3 budget receipts"** — `screenshots/step-2.png`: typing works, and **Discard draft** appears. Closing and reopening keeps the draft (variation confirmed). `screenshots/step-2b.png`: during the simulated wait, the page shows "Live updates disconnected. Reconnecting automatically." with **Retry connection**, and the header says "Local service disconnected". Both messages come from my WebSocket block.
3. **Live update arrives** — `screenshots/step-3.png`: after the WebSocket was released (the 4th connect attempt), the line changes to "Creating as Ruth Adeyemi · human" and **Create task** enables. Matches.
4. **Create task** — `screenshots/step-4.png`: created; the detail panel "Collect Q3 budget receipts" opens. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844): no overflow.

Console/page errors: none.

## Observations
- While the panel says her Actor is not on the board, the header already shows Ruth's "RA" presence avatar (highlighted, first in the row) and "You: Ruth Adeyemi". The two signals contradict each other.
- During a WebSocket-only outage, the header says "Local service disconnected" while the banner says "Live updates disconnected"; the document had loaded from the local service. Because the outage was simulated, this is logged as low severity.

## Flagged claim verdicts
No flagged claim names STORY-066. Related #46 ("You" is a silent no-op before your Actor syncs) was not tested here.

## Flow Log
- Ideal 2; actual 2. Draft kept across close and reopen. The only progress signal while waiting is the panel line.

Status: pass
