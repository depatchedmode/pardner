# STORY-014: No Git config, so the person types their identity

Walked 2026-11-09 in Chromium 1440×900. Fresh client `--device-name Tomas-Mac-mini`, started from a non-Git directory with global and system Git config disabled. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-014/`.

## Steps

1. **Empty identity step.** Name and Email are blank. The helper reads "Git didn't provide a name and email here, so enter them once…", and the button reads **Continue as this person**. `screenshots/step-1-empty.png` — the same clean single-column layout as STORY-013. Geometry: clean.
2. **Type the name.** After "Tomás Rivera" the button reads **Continue as Tomás Rivera** (`screenshots/step-2-name.png`). Geometry: clean.
3. **Typo email "tomas@fernhill".** Chromium's `type=email` validity message is empty (accepted), the server accepted it too, and the identity was saved as `{name:"Tomás Rivera", email:"tomas@fernhill"}`.
4. **Welcome.** `screenshots/step-4-welcome.png` — **Welcome, Tomás Rivera**, with no edit control. I also created a project and opened **You: Tomás Rivera**: the profile shows "Git email tomas@fernhill", and its only button is **Close**, with no edit (`screenshots/step-4b-profile-no-edit.png`). The profile labels the typed values as "Git name" / "Git email" although they did not come from Git.
5. **CLI fix attempt.** `pardner client identity --name "Tomás Rivera" --email tomas@fernhill.studio --operation-id fix-email` → `{"success":false,"error":{"code":"IDENTITY_EXISTS","message":"Identity already initialized; linking requires My device"}}`. Matches the story.

Variations:
- Spaces-only name: the browser `required` check passes, and the server's "Supply a name" shows in the red inline box (`screenshots/var-spaces-name.png`). Geometry: clean. Two 400 responses were logged to the console (expected for server-side validation).
- "tomas @fernhill.studio": blocked natively ("A part followed by '@' should not contain the symbol ' '.") (`screenshots/var-email-space.png`).
- Name longer than 200 characters (201 × "T"): the server says "Supply a name", which does not mention a length limit. The page also blows out horizontally: the button label "Continue as TTTT…" does not wrap or truncate, and the form spills 1048 px past the viewport (`pageOverflowX: 1048`, spills on `#root`, `main.client-entry` and `form`) (`screenshots/edge-long-name.png`). Confirmed by eye: the inputs, error box and button run off the right edge.

Mobile 390×844 (`mobile-check.png`, Welcome): clean.

Console: two "400 Bad Request" resource errors from the deliberate invalid submissions; no page errors.

## Flagged claim verdicts

- **#19 An identity typo cannot be fixed; `IDENTITY_EXISTS` "linking requires My device" is misleading; the email regex accepts addresses with no dot — CONFIRMED.** "tomas@fernhill" was saved. No UI edit path exists (the profile has only Close), and the CLI correction returns `IDENTITY_EXISTS` "Identity already initialized; linking requires My device", which says nothing about editing.

## Flow Log

- Ideal 3 (name, email, continue); actual 3 for the happy path.
- Recovery from the typo: there is no path. Fixing it needs a new `--data` directory, which strands any projects already made. That is effectively a dead end.
- Hesitation: the error for an over-long name ("Supply a name") contradicts what the person sees (a name *was* supplied).

Status: fail
