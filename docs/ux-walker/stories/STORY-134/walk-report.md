# STORY-134 walk report: Use the control runtime's guarded agent CLI and wrapper scripts

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-134/` (CLI transcript `cli.log`). **The story needs a sealed control installation started by launchd, so most of it is BLOCKED.** I did not touch the user's launchd jobs or `~/PardnerControl` (which does not exist on this machine). Instead I pointed `PARDNER_CONTROL_HOME` at a scratch directory and ran `python3 scripts/control-runtime.py`, the `control` script, in two states: (a) an empty home, and (b) a home with a correctly shaped `config.json` (`agents:["openai-codex","anthropic-claude-code"]`, `httpPort`, `projectName`, `identity`) but no sealed release clone and no launchd job. I never ran `start`, `stop`, `restart`, `run` or `seal`, or any command that reaches `require_service()` (which queries launchd).

## Steps
1. **`control status`** → healthy JSON: **BLOCKED** (no sealed install or launchd job). With an empty home → exit 1, stderr `Control runtime: [Errno 2] No such file or directory: '…/config.json'`. That is a raw OS error, not "this is not a control installation" (F-134-02).
2. **`control entrypoints`** → with the scratch config, exit 1, `Control runtime: Control release needs an independent Git clone`. Writing the wrappers: **BLOCKED** (it verifies the sealed release first).
3. **`pardner-openai-codex tasks --json`** (first-use grant, then exec) → **BLOCKED** (needs the verified managed service).
4. **`cli --agent openai-codex -- activity --actor actor-9a1e`** → exit 1, stdout `{"success": false, "error": {"code": "CONTROL_RUNTIME_UNAVAILABLE", "message": "The control installation selects connection settings and the entrypoint Actor", …}}`, stderr `Control runtime: …`. Matches the story text. The code `CONTROL_RUNTIME_UNAVAILABLE` is used for a usage refusal, which suggests an outage (F-134-01).
5–6. **`mentions pending`, `comment`** through the wrapper → **BLOCKED**.
7. **`cli --agent cursor -- tasks --json`** → `CONTROL_RUNTIME_UNAVAILABLE: Name an agent harness from config.agents; people use control open`. Matches.
8. **`cli --agent openai-codex -- client list`** → `Supply a coordination command; lifecycle, client and bridge commands are not Actor entrypoints`. The same message comes back for `serve`, `bridge status`, an empty command and a leading `--data x`. Matches.
9. **`cli --agent anthropic-claude-code -- show …`** with an un-enrolled harness → the "HTTP 403" message is **BLOCKED** (it comes after `require_service`).
10. **`control open`** → browser sign-in: **BLOCKED**. `open -- --bogus` → `Control runtime: open accepts only --output-file FILE`. Matches.

### Variations and edge cases
- `status --agent x` → exit 2, argparse usage plus `error: Only cli accepts --agent`. `start -- foo` → `error: Only cli and open accept arguments after --`. Matches.
- Config validation (all stderr, exit 1): `sha:"main"` → `Config sha must be an exact Git revision`; `agents` removed → `Missing config field: agents`; `data` outside the home → `Control data must be this installation's data directory`. Clear.
- Only `cli` prints a JSON envelope; `status`/`open`/`entrypoints` print only "Control runtime: …" on stderr. Confirmed.
- Service down, `start` while loaded, first-start identity/project rules, and the revoked-agent cached-credential loop → **BLOCKED** (all need launchd and a sealed release). The revoked re-grant refusal behind that loop is shown in STORY-130.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the board on the walk client (no control-installed board was available). Geometry clean.

## Flagged claim verdicts
- **#6 (STORY-134 part) The control runtime keeps failing with `AUTH_REQUIRED` on its cached credential, and removing the file leads to an HTTP 403 re-grant — BLOCKED** here (no sealed install). The underlying server behaviour is confirmed in STORY-130: after revocation, `agent-grant` for that harness is refused even after re-joining an Agent invitation. The documented "remove the file to request a fresh grant" can therefore only ever reach the 403 path.

## Flow Log
- Ideal 3. Not measurable. The guard layer, which I could walk, refuses quickly with clear sentences. Every refusal is coded `CONTROL_RUNTIME_UNAVAILABLE`, and the `cli` path prints the message twice (JSON on stdout and text on stderr).
- Duplicated paths: `pardner-<harness>`, `control cli --agent` and raw `pardner --token-file` all reach the same commands.

Status: blocked
