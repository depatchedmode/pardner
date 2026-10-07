# Cursor ACP mapped sessions

`cursor-acp` implements a local stdio bridge for an existing, exclusively
bridge-owned Cursor CLI ACP session. It does not create sessions per delivery
or attach to arbitrary editor chats. Stop other clients driving the same session.
The CLI must already be authenticated. This adapter never calls `authenticate`,
opens sign-in, supplies credentials, or sets a model.

The protocol sources are [Cursor CLI ACP](https://cursor.com/docs/cli/acp),
[ACP session loading](https://agentclientprotocol.com/protocol/v1/session-setup),
[prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn), and
[mode updates](https://agentclientprotocol.com/protocol/v1/session-modes).

## Configure and inspect

Use Node 24.11.1 and an existing persisted ACP session ID. Inspect that session
without requesting a model turn:

```sh
pardner bridge inspect --adapter cursor-acp \
  --command /Users/you/.local/bin/agent --session EXISTING_SESSION_ID \
  --worktree /absolute/path/to/worktree
```

Inspection spawns the executable with exactly `acp`, initializes protocol v1,
checks advertised `loadSession`, and calls `session/load`. It passes the mapped
absolute directory as `cwd` and an empty `mcpServers` list. It registers no new
MCP servers. Existing Cursor project/user configuration still applies and must
already be reviewed by the user. A mode must be observed in the load response
or a native `current_mode_update`; missing information blocks dispatch. No
mode-setting request is sent.

Review the returned mode and limitations, then create a private configuration:

```json
{
  "workspaceId": "WORKSPACE_ID",
  "replicaId": "LOCAL_REPLICA_ID",
  "dataDirectory": "/absolute/path/to/pardner-data",
  "inboxDirectory": "/absolute/path/to/cursor-bridge-inbox",
  "mappings": [{
    "actorId": "cursor-reviewer",
    "enabled": true,
    "adapter": "cursor-acp",
    "sessionOwner": "bridge",
    "command": "/Users/you/.local/bin/agent",
    "transport": "stdio",
    "threadId": "EXISTING_SESSION_ID",
    "worktree": "/absolute/path/to/worktree",
    "worktreeBinding": "load-cwd",
    "expectedPolicy": { "verification": "mode-only", "modeId": "OBSERVED_MODE_ID" },
    "allowedTaskIds": ["TASK_ID"],
    "allowedFromActorIds": ["human-actor", "builder"]
  }]
}
```

The command must be an absolute executable file named `agent` or `cursor-agent`,
including after resolving symlinks. No configured arguments, shell, environment
overrides, credentials, additional roots, models, or permission overrides are
accepted. The process inherits the host environment and existing Cursor account
configuration; Pardner does not independently attest their permissions.

`worktreeBinding: "load-cwd"` acknowledges that ACP receives the authorized
directory on load. ACP does not independently return the session's original
directory or complete native sandbox policy. `verification: "mode-only"` pins
the observed mode; any observed change blocks further dispatch. This is narrower
than Codex's native sandbox/approval attestation. Extra policy fields are rejected.

```sh
pardner bridge inspect --config /absolute/path/to/bridge.json --actor cursor-reviewer
pardner bridge run --config /absolute/path/to/bridge.json
pardner bridge status --config /absolute/path/to/bridge.json
```

Command, transport, worktree binding, session, directory, and policy are part
of the durable route. Changing them does not redirect saved deliveries. Common
Actor/task/sender authorization, durable-before-ack intake, persisted prompts,
and the uncertain-send barrier remain in effect.

## Receipts and blocked work

ACP returns `session/prompt` at the end of a prompt turn with a `stopReason`.
It provides no native accepted turn ID. While waiting, this ACP client is busy
and the inbox stays `dispatching`. Busy state describes this client's pending
prompt; it does not independently attest activity in other clients. Exclusive
session ownership remains a user declaration.

A `cursor-acp:prompt-response:` receipt encodes the session ID, client request
ID, and actually observed stop reason. It identifies that completion response,
not immediate native acceptance. Refusal, cancellation, or limits can produce
responses; a receipt does not prove task success or an attributed Pardner reply.

Setup/load requests have a ten-second timeout and prompt completion a
three-minute timeout. Frames and replay memory are bounded. Disconnects,
timeouts, invalid responses, or bridge shutdown during a submitted prompt
leave the inbox uncertain. The local process stops; native execution may have
been interrupted. Its successor waits for the previous process to exit.
Process closure is not proof of non-acceptance.

Recovery requires a completed `session/load` response and exactly one full
prompt in replayed user-message text with a supplied, nonempty native
`messageId`. Contiguous text chunks sharing that ID are joined. Missing IDs,
incomplete/truncated history, duplicate matches, reused IDs, or incomplete
replay do not permit an inferred retry. A `cursor-acp:replayed-message:` receipt
identifies the native session/message pair, not successful execution. Other
uncertain work needs explicit operator reconciliation with evidence.

Permission requests, `cursor/ask_question`, `cursor/create_plan`, and unsupported
client requests remain unanswered and block dispatch. Unsubmitted work stays
queued; submitted work may become uncertain on disconnect/timeout. This adapter
supplies no approval UI. Inspect blocked work through an authorized provider
client and avoid blind retries. Session discovery and archive are unimplemented;
configurations combining Cursor with `completionCleanup` are rejected.

## Validation and limits

Process tests use a fake stdio peer and are not real Cursor execution evidence.
They cover unchanged load/prompt parameters, mode pins, busy and unanswered
permission states, durable restart with exact replay IDs, ambiguous/missing
history, mapping retargeting, malformed/closing/oversized protocol, timeouts,
non-overlapping process replacement, registration, and inspection.

```sh
node --test test/cursor-bridge-adapter.test.js test/bridge-providers.test.js test/agent-bridge.test.js
node scripts/bridge-cursor-check.js --command /absolute/path/to/agent --worktree /absolute/path/to/worktree
```

The check script defaults to **initialize only**: no session creation/load,
authentication request, or model turn. With installed CLI
`2026.01.28-fd13201`, this implementation observed protocol v1, `loadSession:
true`, and auth method `cursor_login`. The sandbox attempt disconnected; the
authorized read-only check outside the file sandbox passed. Existing CLI status
reports no sign-in visible to this executor. No sign-in or credentials changed.

After authentication and an existing session are separately authorized, the
explicitly opt-in command below checks a native nonce response and exact replay
receipt. It sends one prompt requesting no tools or edits. It does not exercise
Pardner task/comment delivery or qualify an attributed reply:

```sh
node scripts/bridge-cursor-check.js --run --config /absolute/path/to/bridge.json --actor cursor-reviewer
```

That command has **not been run against Cursor**. Real load/mode compatibility,
assistant output, replay IDs, lost-response recovery, automatic attributed reply,
approval interaction, and mixed three-agent review remain unqualified. The
strict two-second acceptance default is unchanged; full qualification may use
the separately authorized explicit ten-second acknowledgment budget. The
three-minute ACP prompt timeout is a different gate.

## Frozen source verification

On Node 24.11.1, `npm run verify -- --local-ack-ms 10000` passed the production
build, all 338 default parallel tests and complete seed-1 acceptance on source
fingerprint `a475bd6f904ac8f9d3149b31c2372e08600a284278afe7ccaf34db7c9b3ec880`.
All 719 acknowledged operations were independently checked on each of three
replicas. Maximum local acknowledgment was 6,521 ms against the declared
10,000 ms budget; this run does not qualify the two-second performance target.
The strict default and other acceptance bounds are unchanged.
Independent source review identified a process-replacement race; the fix waits
for the previous ACP process to exit before spawning its successor, and a
process test verifies that ordering. The final focused suite passed 58 tests.

The first full attempt timed out the existing offline-partition runtime test
after 30 seconds and its hung worker was stopped. That test file is byte-for-byte
unchanged from the foundation. All six runtime tests passed separately, followed
by the complete canonical pass above without source or deadline changes.
The earlier failure is retained; its cause and repeatability remain unresolved.
Neither fixture verification nor the observed initialize-only handshake qualifies
native session loading, model reply or automatic three-provider execution.
