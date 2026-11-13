# STORY-050: Watch your own state go Active → Idle → Active (idle timeout)

Setup: Harbor Billing hub; Maya's Chromium tab (1440×900, video in `videos/`) plus Priya's tab on her own client as the "colleague's screen" observer. One real-time wait of ~2 minutes.

## Steps
1. **Click on the board** (`screenshots/step-1.png`, `screenshots/step-1-you-zoom.png`): before the click the You button read "You: Maya Okafor, human, idle. Open your profile" (fresh load); 5 s after the click "…, active". Geometry clean apart from the multi-line task-card false positive.
2. **Read without clicking**: for the whole wait the script moved the mouse and scrolled with the wheel every 5 s (the story's variation), with no pointerdown/keydown/input.
3. **Wait** (`screenshots/step-3.png`, `screenshots/step-3-you-zoom.png`, `screenshots/step-3-priya-view.png`): at 126 s after the click both Maya's own You button and Priya's view showed "Maya Okafor, human, idle" (dashed). Matches the story (120 s + heartbeat/poll). Mouse movement and wheel scrolling did not keep her active (F-050-01). The profile was not opened at this moment because opening it is itself a click.
4. **Press Tab** (`screenshots/step-4.png`): Active again within 4 s in both views. Pass. Programmatic focus alone (no key) did not change state.
- Mobile check: same header as STORY-048 `mobile-check.png`; not repeated.
- Console/page errors: none in either tab.

## Flagged claim verdicts
None of the flagged claims names STORY-050.

## Flow Log
- Ideal 0 actions / ~3 glances — actual 0 actions; transition timings as documented (126 s to idle, 4 s back to active).
- Hesitation: no explanation of why the ring is dashed (F-050-02).

Status: pass
