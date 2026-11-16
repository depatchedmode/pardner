# STORY-111 walk report: Pair T3, mistyping the code first

Walked 2026-11-09, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-111/`.

**Setup.** Real T3 is not available. The repo's `support/fake-t3-server.js` (`FakeT3`, which reports T3 0.1.6) ran as a persistent process on loopback port 47390, and pairing codes were issued from it. The Control tab's **T3 address** field was pointed at `http://127.0.0.1:47390`. The pairing codes are fake-T3 values and are not recorded here.

## Steps
1. **Read the T3 credential form** (`screenshots/step-1-form.png`): the intro text and the prefilled `http://127.0.0.1:3773` match the story. Geometry: clean (nav widths only).
- **Edge: empty code**: clicking **Pair T3** shows the native "Please fill out this field." bubble (`screenshots/edge-empty-code.png`). Confirmed.
- **Variation: wrong address** `http://127.0.0.1:3780` (nothing listening): the server returns HTTP 500 `INTERNAL_ERROR` "fetch failed", not the 503/504 `T3_BUSY`/`T3_UNKNOWN` the story expects. The page shows a red banner "fetch failed" under the status line (`screenshots/var-wrong-address-flash.png`), and the banner is **gone within 1 s**. A screenshot taken 4 s later (`screenshots/var-wrong-address.png`) shows no error at all.
2. **Transposed code** (`screenshots/step-2-error-flash.png`): HTTP 502 `T3_REJECTED`. The banner reads "T3 sign-in failed with HTTP 400" (not "T3 did not approve the pairing code"). It sits above **Control settings**, about 300 px from the field at fault, and **disappears after about 1–2.5 s** when the next 2 s poll succeeds. A screenshot taken 3 s after the click (`screenshots/step-2-wrong-code.png`) shows the form exactly as before, with the code still typed in and no message. Someone who looks away for two seconds sees nothing. Whether the button disables during the request was not observable, because the request finished in under 150 ms.
3. **Correct code** (`screenshots/step-3-paired.png`): the pairing-code field clears. The status line reads "T3 credential: valid · expires 12/9/2026 · T3 0.1.6 · qualified 0.1.5, 0.1.6. These records stay…". Confirmed (the fake issues 30-day credentials). There is no other success cue. Geometry: clean.
4. **Button label** (`screenshots/step-4-pair-again.png`): it now reads **Pair again**. Confirmed. The T3 address keeps the paired address across a reload (`screenshots/step-5-reload.png`).
- **Mobile 390×844** (`screenshots/mobile-check.png`): it stacks cleanly and the status wraps to five lines. Geometry: clean.
- Console: two "Failed to load resource" entries (500 and 502) for the deliberately failed pairings, as expected for the failure paths. There are no page errors.
- Video: `videos/` (the probe run shows the error flash and the auto-clear).

## Flagged claim verdicts
None of the flagged claims touch STORY-111 directly.

## Flow Log
- Ideal path: 2 (paste the code, click Pair). Actual: 2 on the happy path. The mistyped path needed 4 actions, and only if Maya catches the short-lived error.
- Hesitation: after the failed attempt there is no lasting sign of failure, so Maya cannot tell whether pairing worked until she reads the "missing/valid" word in the small status line.
- Re-entry: none. The typed code is kept after a failure, which is good.

Status: fail
