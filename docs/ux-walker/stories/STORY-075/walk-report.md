# STORY-075: Newer save on a field Maya did not touch

Walked 2026-11-09 in Chromium 1440×900 on Maya Okafor's client. Juniper (agent, enrolled on Theo's computer with `client agent-grant`) ran `pardner update <task> --priority p0 --revisions … --token-file juniper.json`, and the change synced through the hub. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-075/` (video in `videos/`).

## Steps
1. **Maya edits the Title** (`screenshots/step-1-title-draft.png`): she changes the title to "…on slow networks" and the draft is kept. Geometry: only the known `button.task-card` wrap false positive.
2. **Juniper's update lands** (`screenshots/step-2-3-notice.png`): within about a second a notice appears above the form: "Juniper · agent saved a newer priority since you started editing. Your draft is unchanged." Below it, in small text: "If you also changed that field, saving is refused until you choose. Basing your draft on the latest version makes your save an explicit replacement." and the button **Base my draft on the latest version**. Geometry: card false positive only. Matches word for word.
3. **Form vs reality** (same screenshot): the card and the summary line show **P0**, while the form's Priority still shows **P2**. The screen contradicts itself, and nothing says whether saving will put P2 back. Matches the predicted hesitation.
4–5. **Save changes** (`screenshots/step-4-5-saved.png`): "Saved locally · synced". The server holds the title "…on slow networks" with priority **p0**, so only the title was sent. Matches.
6. **History** (`screenshots/step-6-history.png`): "Maya Okafor renamed this task — Was “Checkout button double-submits on slow 3G”" above "Juniper changed the priority of this task to P0". Matches.

Variations:
- **Two newer fields from two Actors, then rebase** (`screenshots/var-two-fields-notice.png`, `var-after-rebase.png`): Maya began a description edit. Juniper then moved the status to In progress (CLI) and Theo changed the tags (his client). The notice read **"Theo Lindqvist · human saved a newer status, tags since you started editing."** That credits Theo with Juniper's status change, because it names only the last author. The field names are raw keys ("status, tags"), not the form labels. Before the rebase the form showed Status "Up next" and empty Tags. After **Base my draft on the latest version**, Status read In progress, Tags read "checkout, mobile", the description draft was kept, the notice went away and focus moved to Title. Saving kept in-progress and both tags. Matches the catalog's rebase behaviour; the misattribution is new.

Mobile check (`screenshots/mobile-check.png`, 390×844): the notice and button fit the width, and the title input scrolls horizontally inside the field. For a moment the panel status read "Saved locally · waiting for hub" in amber while Juniper's change synced. Geometry: card false positives only.

Console/page errors: none.

## Flagged claim verdicts
No flagged claim names STORY-075.

## Flow Log
- Ideal 2 (read the notice, Save changes); actual 2. The hesitation the catalog predicted was real: the form showed P2 while the summary showed P0.
- No re-entry. Rebasing is one optional extra click that makes the form honest.
- Duplicated information: priority appears in the card, the summary line, the form (stale) and History, with different values on one screen until the rebase.

Status: pass
