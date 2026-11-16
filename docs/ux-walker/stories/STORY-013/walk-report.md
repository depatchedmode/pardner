# STORY-013: First-run confirmation with Git-prefilled identity

Walked 2026-11-09 in Chromium 1440×900 against a fresh client (`--device-name Mayas-MacBook-Pro`), started from a scratch Git repo whose local config is `Maya Okafor` / `maya@lanternworks.io` (global Git config disabled so the prefill is controlled). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-013/`.

## Steps

1. **Grant sign-in.** The one-time `/open` link was loaded. By the first screenshot the `#grant=…` fragment was already stripped (URL `…/pardner/`) and the identity step had rendered; the intermediate "Opening your workspace…" / "Opening your local client…" shells were too brief to capture on loopback. `screenshots/step-1-early.png` — identity step already shown. Geometry: clean.
2. **Identity step.** Heading **Welcome to Pardner**, lead "Confirm how people in your projects will see you.", Name "Maya Okafor", Email "maya@lanternworks.io". `screenshots/step-2-identity.png` — single centred column, one dominant primary button, consistent label/input left edges. Geometry: clean.
3. **Helper text** reads exactly as the story says, then "This device: Mayas-MacBook-Pro" and "Already use Pardner on another computer? Link this device instead". Matches.
4. **Continue.** Clicked **Continue as Maya Okafor**; **Saving…** was observed; `/session` then held `{id, name:"Maya Okafor", email:"maya@lanternworks.io"}`. Took about 50 ms.
5. **Welcome.** `screenshots/step-5-welcome.png` — **Welcome, Maya Okafor**, the project lead text, **Start a project** (selected) / **Join a project**, Project name (focused), "You join as Maya Okafor. Setup agent (Codex) is registered as your agent…", **Start project**. Geometry: clean.

Variations: editing the name to "Maya O." updates the button live (`screenshots/var-edit-name.png`); clearing it gives **Continue as this person**, and submit is blocked by the native "Please fill out this field." (`screenshots/var-empty-name.png`). Pressing Enter in Email submits (verified on a second client).

Edge case, Git name only: a client started from a repo with only `user.name` shows Name "Maya Okafor", an empty Email, and still says "Filled in from your Git configuration." (`screenshots/edge-git-name-only.png`). Geometry: clean.

Mobile 390×844 (`mobile-check.png`): it reflows cleanly; the "Link this device instead" link wraps onto its own line. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts

- **#20 "Filled in from your Git configuration." shows even when Git supplied only a name — CONFIRMED.** With Git `user.name` set and no `user.email`, Email is blank but the helper still claims both were filled from Git (`screenshots/edge-git-name-only.png`).

## Other observations

- The Welcome start form says "Setup agent (Codex) is registered as your agent" when the service was started with no `--harness`. The persona's agent is Claude Code, so the default assumes a harness the person may not use. (Logged as F-013-02.)
- "You join as Maya Okafor" on a *Start* form reads oddly: she is starting the project, not joining it (minor copy).

## Flow Log

- Ideal path 1 click; actual 1 click (Continue). No hesitation needed beyond reading the helper text, which answers "is email a login?" directly.
- No data re-entry. The name repeats on the next screen (heading plus "You join as …"), as the story anticipated; acceptable.
- One way per task: the CLI `client identity` is a deliberate alternative.

Status: pass
