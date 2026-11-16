# STORY-103 walk report: Adding tasks to a vein and watching the counts change

Walked 2026-11-09. Ada is Dev's client agent with a `client agent-grant` token file; the UI names her "Setup agent". Maya watched **Goals** on the hub client in Chromium at 1440×900. First Ada created the vein "Batch Stripe webhooks" under "Cut checkout latency" with `vein create … --goal goal-<id>`.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-103/`. Video: `videos/`.

## Steps
0. `screenshots/step-0.png`: on Goals, "Batch Stripe webhooks" shows Open and "0 tasks". Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
1. `vein add vein-<id> task-<Coalesce>` returns `{taskId, veinId}`. `screenshots/step-1.png`: the row updates live to "1 task".
2. `vein add` for "Add webhook dedupe table": `screenshots/step-2.png` shows "2 tasks".
3. `task create --title "Retry 429s with jitter" --vein vein-<id>` returns `{taskId, veinIds}`.
4. `screenshots/step-4.png`: the count reaches "3 tasks" live. The human never reloaded; each count changed within the 1.5 s wait.
5. `vein remove` without `--revisions` gives `INVALID_ARGUMENT` "Supply --revisions" (F-103-02). The link revision was read from `vein show` → `tasks[].linkRevisions`, then `vein remove … --revisions '["op-…"]'` succeeded. `screenshots/step-5.png` shows "2 tasks".
- **Activity.** `screenshots/step-activity.png`:
  - "Setup agent added Coalesce invoice.paid events to vein Batch Stripe webhooks".
  - "Setup agent created Retry 429s with jitter", with detail "Backlog · P2 · Unassigned · Vein: Batch Stripe webhooks".
  - "Setup agent removed Add webhook dedupe table from vein Batch Stripe webhooks".
  - Task and vein subjects are links. Geometry: clean.
  - The "Dev Raman marked vein Right-size staging DB Dead end/Open" rows come from a focus probe in STORY-098.
- **Board.** `screenshots/board-vein-labels.png`: the Coalesce and Retry cards carry a green "Batch Stripe webhooks" label. Geometry flags three wrapped task-card buttons; these are multi-line task titles inside cards, which is intended.
- **Mobile.** `screenshots/mobile-check.png`: clean.

### Variations and edge cases
- Removing a task that is not linked gives `NOT_FOUND` "This task is not part of that vein", as documented.
- An unknown vein ID gives `NOT_FOUND` "Vein not found: vein-000…", as documented.
- `tasks --vein` lists only the two linked tasks. `veins --goal goal-<id> --status open` lists only "Batch Stripe webhooks", because the other veins in that goal are Proven.
- **Re-adding an already linked task** succeeds and writes a second "added Coalesce invoice.paid events to vein Batch Stripe webhooks" row, the top row in `screenshots/step-activity.png` (F-103-01).

## Flagged claim verdicts
No flagged claim touches this story.

## Flow Log
- The ideal path is 3 commands; the actual path was 3, plus 2 for removal (`vein show` to find `linkRevisions`, then `remove`).
- `vein add` needs no revision but `vein remove` does. The error does not say where to get one.
- Live updates on Goals worked every time. There is no UI route to attach tasks (by design), so the human can only watch.
- Console and page errors: none.

Status: pass
