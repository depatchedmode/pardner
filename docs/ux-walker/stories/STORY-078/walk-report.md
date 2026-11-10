# STORY-078: Resolve an assignee or tags conflict where the values are raw data

Walked 2026-11-09 in Chromium 1440×900 on Theo Lindqvist's client. Setup (`outage.mjs`, hub stopped):
- Maya's replica set "Localize receipt emails (de, fr)" to Assignee = Maya, Tags = `["i18n","receipts"]`.
- Juniper on Theo's computer ran `pardner update --assignee <Juniper> --tags '["i18n","email"]'`.

After the hub restarted, both fields were conflicted. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-078/` (video in `videos/`).

## Steps
1. **Open the task** (`screenshots/step-1-2-resolve-assignee.png`): the summary reads "Juniper · agent · P2". The quick Status select is present, because status is not conflicted. Two amber sections follow: **Resolve assignee** and **Resolve tags**. The card shows "Juniper · agent / Conflicting edits". Geometry: only the known `button.task-card` wrap false positive. Matches.
2. **Read Resolve assignee** (same screenshot): the author lines read "Juniper · agent" and "Maya Okafor · human". The *values* are the raw 70-character Actor IDs (`actor-6b8ee6b3…40c8`, `actor-6809f49e…8f31`), broken after "actor-" onto a second line. Here each author assigned themselves, so a reader can guess. Where an author assigned someone else, the value would be unreadable. Matches the catalog.
3. **Keep this assignee under Maya** (`screenshots/step-3-assignee-kept.png`): "Saved locally · synced". The section disappears and focus goes to the panel heading. History reads "Theo Lindqvist resolved conflicting assignee on this task — Kept Maya Okafor". Matches. History resolves the name, so the formatter exists but is not used in the Resolve box.
4. **Resolve tags** (`screenshots/step-4a-resolve-tags.png`, `step-4b-history.png`): the values render as JSON (`["i18n","email"]`, `["i18n","receipts"]`) and the buttons read **"Keep this tags"**. Keeping Juniper's gives "… resolved conflicting tags on this task — Kept i18n, email". The tags conflict cleared and the card label went away. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844, a second assignee conflict on "Localize refund emails (es)" created during STORY-084's outage): the Actor ID wraps over three lines mid-token ("actor-6809f49ec39edcb00fdf55ecb236ef9439a / 5f5b8e95e1add5ce43119c7418f31"). Geometry: card false positives only. The script does not flag text wrap in a `<p>`; I confirmed it by eye.

Console/page errors: none.

## Flagged claim verdicts
- **#40** (conflict values render as raw slugs, Actor IDs and JSON, with labels like "Keep this tags"): **CONFIRMED** (`step-1-2-resolve-assignee.png`, `step-4a-resolve-tags.png`, `mobile-check.png`).

## Flow Log
- Ideal 3 (open, Keep this assignee, Keep this tags); actual 3 clicks. The person has to decode the Actor IDs by matching them against the author line, or go to History.
- Duplicated information: each alternative's author and value say the same thing twice, once readable and once raw.

Status: fail
