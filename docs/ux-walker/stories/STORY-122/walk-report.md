# STORY-122 walk report: An agent credential tries to use Control

Walked 2026-11-09 against the walker's CLI-started client. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-122/` (no screenshots: this story has no browser surface).

**Setup.** The agent credential came from `pardner client agent-grant --project <id> --output-file builder.json --harness openai-codex` (the "Setup agent" Actor, used as Builder). Its token is not recorded here. All requests used `fetch` with the agent's bearer token against the client's loopback URL. The variations used the local operator bearer, which acts as the signed-in person.

## Steps
1. **Agent `GET …/projects/{id}/api/pardner/control`**: 403 `FORBIDDEN` "Control is available only to a person using Pardner on this computer". Confirmed. The refusal is immediate and explains why.
2. **Agent project details** (`GET /pardner/client/v1/projects/{id}`): `controlAvailable: false` for the agent and `true` for the operator. Confirmed, so the **Control** button would not be offered to an agent session. A browser session for the agent cannot be created: `POST /open` with the agent token gives 403 `FORBIDDEN` "Local operator authority required".
3. **Agent `POST …/control/poll`, `/projects`, `/executions`**: all 403 with the same message. Confirmed.
- **Variation: the person posts `/executions` with `fromActorId` = Builder**: 403 `ACTOR_MISMATCH` "Actor must match authenticated participant". Confirmed.
- **Variation: unknown routes**: `/sessions/delete` gives 403 `FORBIDDEN` "Unsupported control endpoint" (confirmed). `/executions?actor=x` gives 403 `ACTOR_MISMATCH` "Actor must match authenticated participant", **not** "Unsupported query parameter" as the story expects. The actor check runs first, so a person who adds a stray query parameter gets a misleading "Actor must match" message.
- **Edge: `pardner client operation` with a control type** (`{"type":"control.poll"}` with `--harness openai-codex`): `FORBIDDEN` "This operation is not available to board credentials". Confirmed.
- **Observation**: with the agent token, `GET /pardner/client/v1/session` returns the person's identity (name, email) and device. That is outside this story's scope and is noted only for context.
- Mobile check: not applicable (no browser surface).

## Flagged claim verdicts
None of the flagged claims touch STORY-122.

## Flow Log
- Ideal path: 1 (an immediate refusal with a reason). Actual: 1. Every control route refuses the agent at once with a clear, consistent message. The only legitimate path is for the person to queue the follow-up, which matches the design.

Status: pass
