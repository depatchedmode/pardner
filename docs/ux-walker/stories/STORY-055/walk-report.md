# STORY-055: Full collaborative morning — triage by presence, coordinate via focus

Setup: Harbor Billing hub (Maya), Dev and Priya on their own clients, Juniper (Claude Code) active on "Migrate invoice PDFs to S3", Otter (Codex) idle on "Fix timezone drift in renewal emails", Dev's browser on the same task. 9 Actors in total, so "+4" is present (the story assumed 5 Actors and no +N; Sam and three Setup agents sit behind it). Chromium 1440×900, video in `videos/`. Run in two scripts (`s055.mjs`, `s055b.mjs`) because the first run's assignee step picked the board's "Assigned to" filter by mistake (a test-script error, not an app defect).

## Steps
1. **Board** (`screenshots/step-1.png`): header Dev (active), Juniper (active), Maya (active), Otter (idle, dashed), Priya (offline), "+4". Geometry: only the multi-line task-card false positive.
2. **Otter's profile** (`screenshots/step-2.png`): "Agent · Maya Okafor's agent · Idle", session "Idle · Codex", Model gpt-5-codex, Managed by T3, Focus "Fix timezone drift in renewal emails". Pass.
3. **Escape**: focus returns to Otter's avatar. Pass.
4. Card "Fix timezone drift…" shows Otter (idle) and Dev (active) in "Here now". Collision visible. Pass.
5. **Open the card** (`screenshots/step-5.png`): panel "Here now" lists Otter, Dev and Maya. Pass. Geometry clean (false positive only).
6. **Dev from the panel** (`screenshots/step-6.png`): Focus "Fix timezone drift…", Device dev-mbp. Pass.
7. **@mention Dev and Otter** (`screenshots/step-7-typed.png`, `screenshots/step-7.png`): inline warning "@Dev and @Otter match no Actor and won't notify anyone."; comment posted as plain text (F-055-01). Typing kept Maya active.
8. **Juniper's profile** (`screenshots/step-8.png`): Focus "Migrate invoice PDFs to S3", Model claude-opus-5-5, Managed by T3, "Expires in 32 s". Pass.
9. **Focus link** (`screenshots/step-9.png`): panel switches to "Migrate invoice PDFs to S3". Pass.
10. "Redesign invoice PDF header" has no "Here now". Pass.
11. **Priya opens Pardner** (`screenshots/step-11.png`): within 4 s Priya is active and sorts ahead of Otter. Pass.
12. **Assign to Priya** (`screenshots/step-12-edit.png`, `screenshots/step-12.png`): Edit task → Assignee "Priya Raman · human" → Save changes; card shows "Priya Raman · human". Pass.
13. **Priya opens it** (`screenshots/step-13.png`): within 3 s the card shows "PR" in "Here now". Pass. Geometry clean (false positive only).
14. Lunch/idle and close-lid behaviour: covered by STORY-050 (idle at 126 s) and STORY-051/054 (offline on close, 45 s TTL); not repeated.
- Variation, hub link drops (`screenshots/variation-hub-down-dev-view.png`): stopping the hub made Dev's header show "Remote presence unavailable", but every avatar reads offline and the sync line still says "synced" (F-055-02). Maya's side could not be observed because the hub is her client.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean apart from the false positive.
- Console/page errors: none in the main run; the hub-down run logged one expected 503 resource error.

## Flagged claim verdicts
- #15 (owned by STORY-086/095/096, met here at step 7) — **CONFIRMED**: handles are shown nowhere in the browser and "@Name" gets "match no Actor and won't notify anyone".

## Flow Log
- Ideal 6 — actual 7 to the assignment (header, Otter profile, card, Dev profile, Juniper profile, task, edit+save), plus a failed coordination step: the @mention could not reach anyone, so the overlap message has to go some other way.
- Duplicated information: who is on "Fix timezone drift…" was visible in the card, the panel and two profiles (the story's redundancy candidate holds).

Status: fail
