# STORY-069: Use the board on a narrow window and a small laptop

Walked 2026-11-09 in Chromium (height 860) at widths 1300, 1050, 820 and 700, plus 1300×560 and 390×844. Project "Kestrel Events" with 25 tasks with realistic long titles, no filters. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-069/`.

## Steps
1. **1300 px** — `screenshots/step-1.png`: the header is one row (69 px); seven columns of 185 px each, with no sideways scroll needed; column headings are `position: sticky`. Geometry: `wrappedControls` hits on task cards only (intentional multi-line cards). Matches.
2. **1050 px** — `screenshots/step-2.png`: the header wraps to 129 px. SaveStatus sits at the left and **New task** at the right of a second row. Columns are 180 px; the board scrolls sideways (scrollWidth 1266). Matches.
3. **New task at 1050** — `screenshots/step-3.png`: the 680 px panel starts at x = 370, top = 129 (below the header); about 370 px of board stays visible. The panel overlaps the right edge of the **Control** view button. Matches.
4. **820 px** — `screenshots/step-4.png`: the panel is full width (0–820) and still sits below the header (top 129). Matches.
5. **Create "Book caterer tasting for 14 March"** — `screenshots/step-5.png`: the detail panel is full width. After Close (`screenshots/step-5b.png`) the card is in Backlog. Matches.
6. **700 px** — `screenshots/step-6.png` and `screenshots/step-6-full.png`: phone layout. The header stacks (181 px); the nav filters are full-width rows; columns are 230 px (scrollWidth 1616 on 700); the document scrolls (scrollHeight 1211); headings are no longer sticky. Control heights are 44 px except the two header avatar buttons at **32 px**. Matches, apart from the avatar size.
7. **Open a card at 700** — `screenshots/step-7.png`: the panel is fixed at top 0, full width, with `html { overflow: hidden }` applied, so page scroll is locked for the user. Matches.
8. **Status = Review at 700** — `screenshots/step-8.png`: the single column fills 700 px. Matches.

## Variation
- **1300×560** (`screenshots/var-short.png`): the desktop frame is off, so the document scrolls and headings are static. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844): no horizontal page overflow. The board itself scrolls sideways in 230 px columns; header, nav and filters take the first ~545 px (see F-063-01).

Console/page errors: none.

## Edge cases
- Between 761 and 839 px the panel is full width below the header: confirmed at 820.
- No "jump to column" control: at 700 px, reaching Abandoned takes about 1,600 px of sideways scrolling. Confirmed.

## Flagged claim verdicts
No flagged claim names STORY-069.

## Flow Log
- Ideal 4; actual 4 (create once; scan at each width). No layout breaks. The friction is the sideways scroll at ≤760 px and the tall stacked header and filters.

Status: pass
