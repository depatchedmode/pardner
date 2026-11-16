# STORY-144: Control runtime start, status, open and stop

Setup: a temporary control home (`$R/control-home`) holding a syntactically valid `config.json`: a placeholder 40-hex `sha`, `release` under `releases/`, `data` = `home/data`, absolute `node`, `httpPort` 7499, `agents:["openai-codex"]`, plus `projectName` and `identity`. There is no release clone, no sealed deployment, and no launchd job. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-144/` (CLI outputs rendered as screenshots; transcript in `cli-transcript.txt`).

**Why most steps are BLOCKED:** `start`, `stop`, `restart` and `run` bootstrap, boot out or require a launchd job. `status`, and therefore `open` and `cli` (which verify the service through `status` first), query launchd for one fixed job label. On this machine that label belongs to the user's real control runtime. The brief forbids touching launchd and `~/PardnerControl`, so I ran only the paths that fail before any launchd call. No managed service was started.

## Steps
1. **`start`** (launchd bootstrap and first-run provisioning). BLOCKED (launchd).
2. **`start` again** ("A control job is already loaded…"). BLOCKED (launchd).
3. **`status`** (health checks JSON). BLOCKED. It would read the user's real launchd job.
4. **`open`** (it runs `client open` after the health check). BLOCKED for the same reason.
5. **`cli -- tasks --json` without `--agent`.** `screenshots/var-cli-without-agent.png`: stderr `Control runtime: Name an agent harness from config.agents; people use control open`, and stdout `{"success":false,"error":{"code":"CONTROL_RUNTIME_UNAVAILABLE",…}}`, exit 1. Matches. The code `CONTROL_RUNTIME_UNAVAILABLE` is misleading for a usage error, since the runtime may be perfectly available (F-144-01).
6. **`stop`.** BLOCKED (launchd).
7. **`status` after stop.** BLOCKED.

### Variations and edge cases walked
- **`open -- --bogus`:** `Control runtime: open accepts only --output-file FILE`, exit 1 (`screenshots/var-open-bad-args.png`). Matches.
- **`open --output-file x` without `--`:** the catalog expected "Only cli and open accept arguments after --". The actual result is the raw argparse `error: unrecognized arguments: --output-file /tmp/x`, exit 2, with no hint that the `--` separator is needed (`screenshots/var-open-without-separator.png`, F-144-02).
- **`cli --agent openai-codex -- open`:** `Supply a coordination command; lifecycle, client and bridge commands are not Actor entrypoints` (`screenshots/edge-cli-lifecycle-command.png`). Matches.
- **`cli --agent openai-codex -- tasks --data /x`:** `The control installation selects connection settings and the entrypoint Actor` (`screenshots/edge-cli-protected-flag.png`). Clear.
- **`status --agent …`:** argparse `Only cli accepts --agent`, exit 2 (`screenshots/edge-agent-on-status.png`). Clear.
- First start with no `config.identity`, `open` while unhealthy, and "belongs to another installation": BLOCKED, because each is reached only through `start` or `status` (launchd).
- Reaching Control after `control open` (merged): BLOCKED. The Control tab itself is covered by STORY-110.
- Mobile check: not applicable (no board was opened).

## Flagged claim verdicts
- **#6 (control-runtime recovery after an agent is revoked):** BLOCKED. It needs a running managed service.
- No other flagged claim names this story.

## Flow Log
- Ideal 4 (start, status, open, stop). It could not be walked end to end without launchd. In the error paths I could exercise, the copy is mostly specific and actionable. The friction is the `--` separator (needed for `open --output-file`) and an error code that blames availability for usage mistakes.

Status: blocked
