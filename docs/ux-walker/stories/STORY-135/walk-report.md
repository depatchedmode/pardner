# STORY-135 walk report: Run a standalone `pardner serve` for an integration

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-135/` (redacted CLI transcript `cli.log`). Setup: an empty scratch directory standing in for `/srv/pardner-ci`. Ports 8004/8005 were free beforehand.

## Steps
1. **`pardner serve --data …/standalone`** (background) → stderr startup lines (emoji banner: "Backend AutomergeStore initialized", "HTTP API listening on 127.0.0.1:8004", "Auth mode: token required"…) and stdout `{success:true, serving:true, role:"hub", workspaceId:"9d2e…", httpUrl:"http://127.0.0.1:8004", wsUrl:"ws://127.0.0.1:8005"}`. `connection.json` is written with the token. Matches.
2. **Browser at `http://127.0.0.1:8004/pardner/`** (`screenshots/step-2-standalone-page.png`) → "Pardner" / "This is an agent and integration service. Open Pardner with `pardner open`." No board. Geometry clean. The inline code renders noticeably smaller than the sentence around it, with the full stop inside the code style (F-135-03).
3. **`--data … task create --title "Flaky: …"`** → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`. Matches.
4. **`actors register ci-bot --handle ci-bot --kind agent --actor ci-bot`** on the empty workspace → **success**. The first Actor can register itself. The story predicted an `Unknown Actor` failure here, so this step is smoother than expected.
5. A second self-registration (`actors register tomas … --actor tomas`) → `UNKNOWN_ACTOR: Unknown Actor: tomas`. The rule "the author must already exist, except for the very first Actor" is not stated anywhere in the error or help (F-135-01). With `--actor ci-bot` → success.
6. **`PARDNER_ACTOR=ci-bot … task create --title … --description "3/50 runs on ci-mini-02"`** → success, `actorId:"ci-bot"`. Matches.
7. **`tasks --json`** → the task, `created_by:"ci-bot"`, plus `status`. Matches.
8. **Raw `POST {httpUrl}/api/automerge/doc`** with the bearer token → HTTP 409 `{"code":"OPERATION_REQUIRED","error":"Use attributed Pardner operations for workspace changes"}`. Matches.

### Variations and edge cases
- **Port 8004 taken** (second `pardner serve --data …/standalone2`) → exit 1, `EADDRINUSE: listen EADDRINUSE: address already in use 127.0.0.1:8004`. This raw Node error does not mention `--http-port`/`PARDNER_HTTP_PORT`, and the startup banner had already printed "initialized" lines before the failure (F-135-02).
- A client credential pointed at this service (bare token, `--data` of the standalone) → `AUTH_REQUIRED: Unauthorized` (see STORY-127).
- Not walked: `--role replica`, and the no-`--data` default to `./.pardner` (I did not want to create a `.pardner/` inside the product repo).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the single message reflows. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#30 Standalone `actors register` has no guidance for bootstrapping the first Actor — REFUTED for the first Actor, CONFIRMED for later ones.** Self-registration of the first Actor on an empty workspace just works. After that, self-registration fails with a bare `UNKNOWN_ACTOR: Unknown Actor: tomas` and nothing explains that an existing Actor must be the author.

## Flow Log
- Ideal 3 (serve, register, create). Actual 4: one `ACTOR_REQUIRED` refusal before registering, which is the documented teaching moment.
- Hesitation: the stdout JSON is mixed with an emoji startup banner on stderr. A CI job that captures both streams gets non-JSON noise.
- Re-entry: `--actor` or `PARDNER_ACTOR` on every write.

Status: pass
