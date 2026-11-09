# STORY-100 walk report: Resolving a disputed vein status with the Keep buttons

Walked 2026-11-09 as Tomás Ferreira on his replica client (Chromium 1440×900).

Setup was a real offline conflict:
1. Maya's hub was stopped with `client stop`.
2. Tomás's replica set "Batch Stripe webhooks" to Dead end.
3. Ada (Dev's client agent, shown as "Setup agent") set it to Proven with `vein update --token-file`. Both writes reported `savedLocally:true, syncPending:true`.
4. The hub was restarted, and all three replicas converged on `conflicts.status` with two alternatives.

The same outage also produced the goal-status, goal-title, description and vein-goal conflicts used in STORY-101/102.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-100/`. Video: `videos/`.

## Steps
0. `screenshots/pre-offline.png`: Tomás's Goals view while the hub was down. His Dead end was saved locally.
1. **Goals.** `screenshots/step-1.png`: the Batch row shows an amber-outlined pill "Dead end or Proven" (`data-status="disputed"`) in place of the select. Below it is a closed disclosure "▸ Conflicting edits: status". Every other conflict on the page shows the same amber summary. Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
2. **Click the pill.** It is a `span`, so nothing happens and focus falls to the surrounding goal `article` (`screenshots/step-2.png`) (F-100-03).
3. **Expand.** `screenshots/step-3.png` / `step-4.png`: the disclosure shows "Status: both edits are kept until you choose one." and then two choices: "**Tomás Ferreira · human** Dead end [Keep Dead end]" and "**Setup agent · agent** Proven [Keep Proven]".
   - The buttons sit at the far right edge (x≈1022–1142), about 550 px from the values they keep, and have different widths (F-100-02).
4. **Accessible names** are "Keep Dead end for vein Batch Stripe webhooks" and "Keep Proven for vein Batch Stripe webhooks", as documented.
5. **Keep Dead end.** `screenshots/step-5.png`: the disclosure disappears. The pill is replaced by the **Status of vein Batch Stripe webhooks** select showing Dead end, with focus on it (focus ring visible).
6. **Activity.** `screenshots/step-6.png`: the top row reads "Tomás Ferreira resolved conflicting status on vein Batch Stripe webhooks", with the detail "Kept Dead end".
   - It is **not** in **Status changes and handoffs** (`screenshots/step-6b.png`: 23 rows, no resolve row). A probe of every Show option found the resolve row only in **Goals and veins**.
   - The two verdicts that caused the conflict ("marked vein … Dead end" and "… Proven") *are* in Status changes (F-100-01).

### Variations and edge cases
- **Goal status dispute.** `screenshots/var-goal-dispute.png`: goal-2adcfd shows the pill "Achieved or Abandoned" and the choices "Dev Raman · human Achieved [Keep Achieved]" and "Tomás Ferreira · human Abandoned [Keep Abandoned]". The aria labels read "Keep Achieved for goal goal-2adcfd". Matches the catalog.
- `vein update --status proven` while disputed returns `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly", with both revisions in details. Matches.
- `vein resolve --field colour` returns "Choose a valid vein field to resolve". Matches.
- **Mobile.** `screenshots/mobile-check.png` / `mobile-summary-ctx.png`: the Keep buttons stack under each author, which is good. However, the `summary` is `display:flex` at this width, so the ▸ disclosure marker disappears. "Conflicting edits: title" reads as plain amber text with no sign it expands (F-100-04). Geometry reported the 44 px-tall summaries as "wrapped controls"; that is a false positive (one line of text in a 44 px touch target).

## Flagged claim verdicts
No flagged claim names STORY-100. The related catalog statement "the resolve row is grouped under Status changes and handoffs" was **refuted** by observation: it is under Goals and veins (see F-100-01 and STORY-105).

## Flow Log
- The ideal path is 3 steps (see dispute, open disclosure, Keep one); the actual path was 3, plus one wasted click on the pill.
- Each author is shown once, with a value next to it. No re-entry.
- Six conflict disclosures on one page all use the same amber summary, so it is hard to tell which needs attention first.
- Console and page errors: none.

Status: pass
