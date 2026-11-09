# STORY-003 walk report: Headless Linux box with no browser launcher (`--output-file`)

Walked 2026-11-09 on macOS. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-003/`. **Simulation:** Linux/`xdg-open` is not available here, so "no launcher" was simulated by running the CLI with a `PATH` that contains only the Node bin directory (so `open` cannot be spawned). That is the same `spawn` error path. The Windows variation (`launcher === null`) cannot be reproduced on macOS: BLOCKED. The VS Code port forward was simulated with a local TCP proxy. Grants redacted as `#grant=…`.

## Steps
1. **`pardner open --data …` with no launcher** → exit 1, `{"success":false,"error":{"code":"LAUNCH_UNAVAILABLE","message":"Browser launcher unavailable; retry open with --output-file"}}`; stderr `LAUNCH_UNAVAILABLE: Browser launcher unavailable; retry open with --output-file`. The service was started anyway.
2. **`pardner open --output-file <missing>/new/sub/pardner-launch.txt`** → `{"success":true,"localUrl":"http://127.0.0.1:65361/pardner/","launchIssued":true}`. Parent dirs were created; the file is `-rw-------`. The result says `launchIssued:true` although nothing was launched (F-003-02). The file has no trailing newline (`cat` output runs into the shell prompt).
3. **`cat` the file** → `http://127.0.0.1:65361/pardner/#grant=…`, the only place the grant is shown.
4. **Paste within 60 s** → grant stripped, identity step (`screenshots/step-4-identity-after-paste.png`). Geometry clean. (The "Git didn't provide…" copy is an artefact of the stripped PATH, which hides `git`.)
5. Pardner never deletes the launch file. Confirmed: still present until removed manually.
- **Variation: launcher exits non-zero** (fake `open` that exits 1) → `LAUNCH_UNAVAILABLE: Browser launch failed; retry client open`. Retrying cannot help when the launcher is broken, and the advice names `client open`, not the `open` the person typed; it should point to `--output-file` (F-003-01).
- **Variation: forwarded to a different local port** (`screenshots/variation-forwarded-port.png`): raw JSON `{"code":"ORIGIN_REJECTED","error":"Open the configured client address"}`. The unused `#grant=…` stays visible in the address bar because no app code runs to strip it (F-003-03). Same raw-JSON page as STORY-002 F-002-02.
- **Mobile 390×844** (`screenshots/mobile-check.png`): identity step clean.

## Flagged claim verdicts
None of the flagged claims touch STORY-003.

## Flow Log
- Ideal 2 (run with `--output-file`, open the URL). Actual 3 (failed open → re-run with flag → paste). The first error message gives the exact recovery, which is good.
- The 60 s window is not stated anywhere in the output (see STORY-012 F-012-02).

Status: pass
