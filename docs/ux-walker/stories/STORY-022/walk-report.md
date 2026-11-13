# STORY-022: CLI-only identity setup by an agent, with validation and operation-ID mistakes

Walked 2026-11-09 through the CLI, with a browser check at the end (Chromium 1440×900). The client was started with `client serve --device-name aisha-ws --harness anthropic-claude-code --name Claude --model claude-opus-5-5` from a scratch repo whose Git config is "Aisha Rahman" / "aisha@quillstack.io". Evidence: `<evidence-archive>/walker-2026-11-09/STORY-022/`.

## Steps

1. **`client status`** → `identity:null`, `device:{name:"aisha-ws"}`, `suggestedIdentity:{name:"Aisha Rahman", email:"aisha@quillstack.io"}`, `setupAgent:{harnessId:"anthropic-claude-code", name:"Claude", model:"claude-opus-5-5"}`. Exit 0.
2. **`client identity --name "Aisha Rahman" --operation-id aisha-identity`** (no email) → `{"success":false,"error":{"code":"INVALID_ARGUMENT","message":"Supply an email"}}`, stderr `INVALID_ARGUMENT: Supply an email`, exit 1. The message says "Supply an email" rather than naming the missing `--email` flag.
3. **Same operation ID, with `--email`** → success, identity set. The failed attempt had not consumed the operation ID.
4. **Verbatim retry** → the identical result (same identity id). Idempotent.
5. **Same operation ID, `--name "Aisha R."`** → `OPERATION_ID_REUSED` "Operation ID belongs to different input", exit 1.
6. **New operation ID, different name** → `IDENTITY_EXISTS` "Identity already initialized; linking requires My device", exit 1.
7. **`client open --output-file …`** → `{"success":true,"localUrl":"…/pardner/","launchIssued":true}`. The launch file is created mode `-rw-------`. Opening its link (grant redacted) → the grant is stripped from the URL, and the browser goes straight to **Welcome, Aisha Rahman**, skipping the identity step. The Start form says "Claude (Claude Code) is registered as your agent." (`screenshots/step-7-welcome.png`). Geometry: clean.

Variations:
- Client not running (unused `--data`) → `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve", exit 1.
- `--operation-id` omitted with identical values → success (a generated ID; harmless for identical values, as predicted).
- Name missing (CLI) → `INVALID_ARGUMENT` "Supply a name" (server-side). The browser blocks the same case with `required` (STORY-013). This confirms the browser/CLI asymmetry, which is reasonable.

Mobile 390×844 (Welcome, `mobile-check.png`): clean.

Console errors: none.

## Flagged claim verdicts

- **#19 (`IDENTITY_EXISTS` "linking requires My device" is misleading) — CONFIRMED** again at step 6: an agent trying to change the name is told about My device linking.

## Flow Log

- Ideal 2 (status, identity); actual 2 on the correct path. Each mistake costs one extra call, and the errors are machine-readable with stable codes and non-zero exits.
- The operation-ID semantics behave exactly as documented: validation failures don't consume the ID, verbatim retries are idempotent, and changed input is rejected.
- Passing `--harness/--name/--model` makes the browser copy accurate ("Claude (Claude Code)"), in contrast to the "Setup agent (Codex)" default seen when they are omitted (STORY-013 F-013-02).

Status: pass
