# STORY-084: A full collaborative day on one task

Walked 2026-11-09 end to end on "Support partial refunds in admin" (Backlog, P2, unassigned), in Chromium 1440×900:
- Maya Okafor in her own client's browser.
- Theo Lindqvist on his client (API write for step 7, browser for step 15).
- Juniper (agent on Theo's computer) through `pardner … --token-file` in a scratch Git repo.
- The hub (Priya's client), stopped and restarted for step 12.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-084/` (videos in `videos/`).

## Steps
1. **Open** (`screenshots/step-01-open.png`): heading focused, summary "Unassigned · P2". Geometry: `button.task-card` wrap false positives only. Matches.
2. **Link acme/lantern-checkout#512** (`screenshots/step-02-linked.png`): the link appears with **Unlink**. Matches.
3–4. **Edit task**: Assignee Juniper · agent, Status Up next, Priority P1, and a three-item checklist in Description (`screenshots/step-04-draft.png`). The quick select disappears. Matches.
5. **Close** (`screenshots/step-05-closed.png`): the panel closes and the draft is kept.
6. **Harbor Docs and back** (`screenshots/step-06-back-with-draft.png`): the panel does **not** reopen on return, because Maya had closed it, so preferences hold no selection. Clicking the card reopened the editor with P1, Up next and the checklist. The draft survived, but the catalog's "The task panel reopens with her draft" holds only if the panel was left open.
7. **Theo sets P0** (`screenshots/step-07-notice.png`): "Theo Lindqvist · human saved a newer priority since you started editing. Your draft is unchanged." Matches.
8. **Save without rebasing** (`screenshots/step-08-stale.png`): "This field changed since it was read; refresh its context / Your draft is preserved…". Matches (409).
9. **Priority back to P2** (`screenshots/step-09-priority-back.png`): the form shows P2 while the card shows P0. Choosing P2 makes the save *keep* P0, which is the opposite of what the control says. The hesitation the catalog predicts is real.
10. **Save changes** (`screenshots/step-10-saved.png`): the server holds Up next, Juniper, the checklist and **P0**. The notice cleared. Matches. The description renders as Markdown checkboxes.
11. **Juniper**: `pardner show` confirmed its assignment (`assignee` = Juniper, `up-next`). Then `pardner commit --task … -- -m "Add partial refund endpoint and admin form"`. Evidence lists `e42f4bab…` with the message (`screenshots/step-11-evidence.png`), and History says "Juniper linked commit e42f4ba to this task — “Add partial refund endpoint and admin form”". Matches.
12. **Hub stopped** (`screenshots/step-12-waiting-for-hub.png`): Maya's quick select → In progress shows "Saved locally · waiting for hub" in the panel and header. Juniper's CLI moved the task to Review on Theo's replica. Matches.
13. **Hub restarted** (`screenshots/step-13-conflict.png`): the card shows "Juniper · agent / Conflicting edits" in In progress. The quick select is gone, and **Resolve status** lists Juniper `review` and Maya `in-progress` as raw slugs. The header now reads **"Remote presence unavailable"** after the hub restart (a `410 (Gone)` on the presence session), and stays that way for the rest of the session. Geometry: one `unevenRows` hit on `div.task-actions` (label-width buttons, not a defect).
14. **Keep this status under Juniper** (`screenshots/step-14-resolved.png`): the server status is `review` and conflicts are empty. History: "Maya Okafor resolved conflicting status on this task — Kept Review". Matches.
15. **Theo reviews and hands off** (`screenshots/step-15a-theo-evidence.png`, `step-15b-handoff-form.png`, `step-15c-handed-off.png`): Evidence shows the commit. In **Hand off work**, Handoff status defaults to Review. The Recipient list includes "Setup agent · agent" three times (F-072-03). The handoff to Juniper with status In progress succeeded: "Handed off to Juniper · agent · In progress.", focus returned to **Hand off work**.
16. **Issue link still present**: `acme/lantern-checkout#512` → `https://github.com/acme/lantern-checkout/issues/512`, `target=_blank`. Matches.
17. **Final History** (`screenshots/step-17-history.png`), newest first:
    - handoff with excerpt
    - "resolved conflicting status — Kept Review"
    - "Juniper moved this task to Review"
    - "Maya Okafor moved this task to In progress"
    - commit
    - "Maya Okafor edited this task — Status: Backlog → Up next · Assignee: Unassigned → Juniper · Description edited"
    - "Theo Lindqvist changed the priority of this task to P0"
    - "Maya Okafor recorded task.link-issue on this task" (raw)
    - created

    Matches the catalog's expected trail.

Mobile check: the long-flow screens are the same panel already checked at 390×844 in STORY-072, 073, 077 and 078 (`../STORY-078/screenshots/mobile-check.png` shows the Resolve box at phone width). No new layout appeared in this flow.

Console/page errors: `409 (Conflict)` (expected, step 8) and `410 (Gone)` (presence session after the hub restart).

## Flagged claim verdicts
- **#39** (STALE_UPDATE "Your draft is preserved" wording): seen here in an editor context, where it is accurate. CONFIRMED for the quick select in STORY-072.
- **#40** (raw conflict values): **CONFIRMED** (`step-13-conflict.png`: `review` / `in-progress`).
- **#41** (issue link History row reads "recorded task.link-issue"): **CONFIRMED** (`step-17-history.png`).

## Flow Log
- Ideal 12; actual about 16 interactions:
  - 1 open, 1 link, 1 edit, 4 field changes, 1 close, 4 switcher clicks, 1 card reopen (the panel did not come back on its own).
  - 1 refused save, 1 dismiss, 1 priority revert, 1 save.
  - 1 resolve, plus Theo's 4 for the handoff.
- Hesitations: step 9, where reverting the priority to P2 is how you keep P0, and step 13, where the values are raw slugs.
- Status was visible in five places during the flow (card column, summary line, quick select or Resolve box, editor, History), and they disagreed during the draft and conflict phases.
- "Remote presence unavailable" after the hub restart is a lasting side effect worth a separate look (presence topic).

Status: pass
