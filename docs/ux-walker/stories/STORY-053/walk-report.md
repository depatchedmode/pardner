# STORY-053: Jump from a profile's Focus link straight into the task

Setup: Harbor Billing hub; Juniper has two live agent sessions (focus "Migrate invoice PDFs to S3" and "Redesign invoice PDF header"). Viewer Maya, Chromium 1440×900. Run in the same script as STORY-052. Note: an earlier scripted click landed on the Control tab, so the main path was walked from the Control view (the story's "another view" variation); a second run from Activity confirmed the same.

## Steps
1. **Juniper's header avatar** (`screenshots/step-1.png`): "Agent · Maya Okafor's agent · Active"; "Live sessions 2", each "Active · Claude Code", Device maya-studio, Model claude-opus-5-5, Managed by T3, Focus link, "Expires in 31 s / 45 s without a report". Matches (two sessions → two links, per the variation). Repeated blocks (F-053-01). Geometry: a nav row of tabs with differing widths (69/69/82/81 px), text-driven, not a defect.
2. **Click Focus "Migrate invoice PDFs to S3"** (`screenshots/step-2.png`): dialog closed, panel opened with its H2 "Migrate invoice PDFs to S3" focused. Pass. Maya joined the panel's "Here now" after the next poll (~5 s). From the Control view the panel clips the Control text behind it (F-053-02).
3. **Close** (`screenshots/step-3.png`): focus moves to **New task**, as the story says. Pass.
- Variation, Activity view (`screenshots/variation-activity.png`): link opens the panel over Activity (h2 "Activity" + "Migrate invoice PDFs to S3"). Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.
- Console/page errors: none.

## Flagged claim verdicts
None of the flagged claims names STORY-053.

## Flow Log
- Ideal 2 (open profile, click link) — actual 2.
- Focus after Close goes to New task rather than back to the avatar, which is acceptable since the dialog is gone.

Status: pass
