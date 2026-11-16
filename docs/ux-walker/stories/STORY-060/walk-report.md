# STORY-060: Submit a title that is empty or only spaces

Walked 2026-11-09 in Chromium 1440×900. Project "Fjord CMS" (empty) on Maya Okafor's client (she stands in for Tomás). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-060/`.

## Steps
1. **Empty Title, Enter** — `screenshots/step-1.png`: the form is unchanged. Title's `validationMessage` is "Please fill out this field." and no operation request was sent (0 requests to `/operations`). Headless screenshots do not capture the native bubble itself, so it is confirmed through the constraint API, not visually. Geometry: clean.
2. **Three spaces, Enter** — `screenshots/step-2.png`: "Enter a title that is not only spaces." appears in red below Title (`role=alert`); Title has `aria-invalid=true` and focus. Still 0 requests. **Discard draft** is hidden (spaces do not make the draft dirty). Geometry: clean. Matches. While focused, the invalid field keeps the mint focus ring, so only the small text line signals the error.
3. **First keystroke** — `screenshots/step-3.png`: the alert clears at once. Matches.
4. **Enter** — `screenshots/step-4.png`: "Hero image crop on article page" is created and its detail opens. Matches.

## Variation
- With Priority P1 (dirty) and a spaces-only Title: the error shows (`screenshots/var-discard-1.png`). **Discard draft** clears the error, resets Priority to P2 and refocuses Title (`screenshots/var-discard-2.png`). Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844, error state): the error line fits under Title. Geometry: clean.

Console/page errors: none.

## Edge cases
- Two different messages for nearly the same mistake ("Please fill out this field." vs "Enter a title that is not only spaces."): confirmed. The first is browser-styled and localized; the second is Pardner's own red inline text.

## Flagged claim verdicts
No numbered flagged claim names STORY-060 (the two-validation inconsistency is listed under "Inconsistencies" and is confirmed above).

## Flow Log
- Ideal 2; actual 2 after each mistake. No re-entry.

Status: pass
