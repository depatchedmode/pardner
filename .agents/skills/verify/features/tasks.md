# Tasks, comments, and safe retry

## Sub-features

Create and edit attributed tasks; read full context/comments; preserve stale
drafts; retry uncertain operations without duplicate tasks, comments, or history.
Reopen locally saved state after a service restart.

## How to get to it (user POV)

Open `/pardner/`, enter the local service token, choose an **Actor**, then use
**New task** or open a task. The CLI exposes `task create`, `show`, `update`, and
`comment`; mutations need `--actor`, and retries reuse `--operation-id` and payload.

## Driving it with CLI and Playwright

`npm run verify:smoke` launches a disposable real service, checks readiness with
`status`, registers Alice, creates a task, repeats its operation, reads the task
list, restarts the same data directory, and checks the recovered task and history.
Expected: `savedLocally: true`, `replayed: true` for the retry, one task, one
creation history event attributed to Alice, and unchanged workspace identity.
The printed `output/verification/smoke-*/report.json` records commands, receipts,
candidate, and cleanup results and remains after scratch deletion.

Run `node --test test/pardner-cli-workflow.test.js` for the fuller CLI workflow.
Run `node --test test/pardner-ui.test.js` after building UI for browser operations.
The browser uses `getByLabel('Actor', { exact: true })`, **New task**, **Title**,
**Create task**, **Comment**, **Add comment**, and **Retry saved request**. Its
lost-response case checks identical operation attempts and exactly one comment
through CLI readback. Its stale-write case checks a preserved draft and an
unchanged newer task value. Inspect the resulting UI for presentation changes.

## Gotchas

Fixtures must explicitly register Actors. `test:cli` does not include the separate
vein workflow. A locally saved result does not establish remote hub persistence.
The smoke covers graceful restart of one local hub; use the offline/conflict map
for partition and process-kill guarantees. It does not prove power-loss durability.
