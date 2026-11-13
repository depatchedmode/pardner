# STORY-001 walk report: First-ever launch on a Mac with a bare `pardner`

Walked 2026-11-09 on branch `client-only-entry`. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-001/`.

**Setup.** `HOME` was set to a fresh temp dir so the default `~/.pardner/client` resolved inside the walker's scratch area (the real `~/.pardner` was not touched). A fake `open` launcher on `PATH` recorded the URL instead of launching the real Safari; the recorded URL was then loaded in Playwright WebKit (Safari engine). The grant is redacted below as `#grant=…`.

## Steps
1. **Bare `node bin/pardner.js`.** Created `~/.pardner/client` as `drwx------` with `client.log` `-rw-------`, spawned a detached service. Every CLI invocation first prints Node's `ExperimentalWarning: SQLite is an experimental feature…` on stderr (F-001-01).
2. **Wait.** The command returned in ~0.7 s.
3–4. **Launch.** Output `{"success":true,"localUrl":"http://127.0.0.1:52178/pardner/","launchIssued":true}`; no grant in stdout. The launcher received `http://127.0.0.1:52178/pardner/#grant=…`.
5. **Static shell** (`screenshots/step-5-startup-shell.png`, JS delayed 1.5 s to observe it): "Pardner / Opening your workspace… / If this page does not open, check that Pardner is running on your computer (start it with `pardner open`)." plus **Reload Pardner**. Clean, readable; geometry not run (static shell).
6. **Grant strip.** After mount the address was `http://127.0.0.1:52178/pardner/` with no hash. Confirmed.
7. **"Opening your local client…"** passed too fast to capture; the next frame was already the identity step (`screenshots/step-7-opening-client.png`). Geometry clean.
8–9. **Identity step** (`screenshots/step-9-identity-step.png`): "Welcome to Pardner", Name/Email empty, helper "Git didn't provide a name and email here, so enter them once…", **Continue as this person**, "This device: filament.local", "Link this device instead". Geometry clean. The Git-prefill text did not appear because the temp `HOME` hides the global Git config; this is an artefact of the isolation, not a defect (prefill is covered by STORY-013).
- **Mobile 390×844** (`screenshots/mobile-check.png`): form reflows to one column, no overflow; geometry clean.

Edge cases: Ctrl-C after return is moot (the CLI exits on its own in under a second; service kept running, PID 85196). Missing `ui-prototype/dist`: NOT TESTED (would require modifying the checkout). Non-Git cwd: effectively observed via the temp HOME (the "Git didn't provide…" copy).

Console/page errors: none.

## Flagged claim verdicts
None of the flagged claims touch STORY-001.

## Flow Log
- Ideal path 1 command; actual 1 command plus waiting. Matches the ideal.
- No hesitation points beyond the story's own "do I need `open`?" (the bare command works; `--help` lists `pardner [open]`).
- No data re-entry. The only noise is the SQLite ExperimentalWarning on stderr.

Status: pass
