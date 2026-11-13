# STORY-038 walk report: Copy is blocked, so copy the text by hand

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-038/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

Clipboard denial was simulated in Chromium by an init script that makes `navigator.clipboard.writeText` reject with `NotAllowedError`. Firefox is not installed for Playwright here. WebKit was also walked natively: there its clipboard write succeeded, so only the manual-copy step was tested in WebKit.

## Steps
1. Invite → **My device** opens "Add one of your devices / For another computer you use. It links your existing identity rather than creating a new person." (`screenshots/step-1-dialog-chromium.png`). The history already lists the two Human invites (F-038-02). Geometry clean.
2. **Create invitation** → "Waiting to be used · Expires in 24 h · …" (`screenshots/step-2-created-chromium.png`). Matches.
3. **Copy invite** (blocked) → "This browser blocked copying. Use Show invite text and copy it manually." (`screenshots/step-3-copy-chromium.png`). Matches. Geometry clean.
4. **Show invite text** → warning plus read-only textarea: rows=5, spellcheck=false, aria-label "Invite text". Matches. The content is about 16 lines (scrollHeight 290 px against clientHeight 95 px), so the `pardner-invite-v1` line is below the fold.
5. Click into the textarea. **Chromium:** selection 0–723 (all), as expected (`screenshots/step-5-selected-masked-chromium.png`; the selection highlight shows the first prose lines, and the envelope line is out of view). **WebKit:** selection 0–0 after the click on two separate attempts, so nothing is selected (`screenshots/step-5-selected-masked-webkit.png`) — F-038-01.
6. **Hide invite text**, then **Close** work (`screenshots/step-6-hidden-chromium.png`). Geometry clean.

**Edge case.** The copied text is the full device setup prompt ("Add this machine to project "Checkout Revamp" under my existing identity…"). Linking with a full prompt works (STORY-047 step 7).

**Mobile:** see STORY-039 `mobile-check.png` for the same dialog at 390 px (clean).

**Console:** no errors. **Videos contain revealed invite text (WebKit runs are unmasked) — do not publish.**

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Ideal 4 (Invite, My device, Create, Copy) vs blocked-path actual 7 (+ Show, click, Cmd+C, Hide). That is expected for the fallback.
- WebKit adds a manual drag-select over a 5-row box whose key line is hidden. The step's expected auto-select broke there.

Status: fail
