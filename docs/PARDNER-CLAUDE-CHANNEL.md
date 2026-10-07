# Claude Code channel bridge

This draft adds a separate `claude-code-channel` provider above the provider
foundation. It pushes authorized Pardner delivery context into one explicitly
configured, already running Claude Code session through its stdio MCP channel.
It creates no Claude sessions and never signs in or modifies Claude configuration.
Use Node 24.11.1. The MCP SDK is pinned to 1.32.1.

The [official channel contract](https://code.claude.com/docs/en/channels-reference)
requires an interactive opt-in. Custom channels currently require the development
channel flag and local warning/MCP consent; organization policy still applies.
The flag is ignored in noninteractive `-p` and Agent SDK runs. These local opt-ins
and any sign-in require the user's approval before native qualification.

## Explicit local configuration

Use a private bridge configuration with an already registered agent Actor and
explicit task/sender IDs, as in the Codex runbook. Replace its mapping with:

```json
{
  "actorId": "builder",
  "enabled": true,
  "adapter": "claude-code-channel",
  "sessionOwner": "bridge",
  "threadId": "unique-claude-channel-binding",
  "worktree": "/absolute/authorized/worktree",
  "channelDirectory": "/absolute/private/channel-runtime",
  "expectedPolicy": {
    "verification": "unavailable",
    "permissionHandling": "local-only"
  },
  "allowedTaskIds": ["TASK_ID"],
  "allowedFromActorIds": ["alice"],
  "receiptTimeoutMs": 10000
}
```

`threadId` is your unique channel binding, **not a native Claude chat ID**.
The channel verifies its actual process cwd against the mapped worktree. It
cannot attest Claude's native session ID, original session cwd, model, permissions,
busy state or history. The explicit policy object acknowledges that limitation;
configuration cannot claim Codex-equivalent permission verification. No permission
relay capability is declared and no approval/input requests are answered.

Once the user approves local setup, configure a project MCP server named
`pardner` using an absolute pinned Node executable, the absolute path to
`scripts/claude-channel.js`, and arguments `CONFIG_PATH ACTOR_ID`. Launch Claude
interactively in that mapped worktree and opt in to `server:pardner`. This
runbook is an instruction for approved setup; the implementation does not install
that configuration or launch Claude. Claude spawns the MCP subprocess itself.
Do not run a second server for the same mapping. The directory is required to be
owned by the current user with mode 0700; an OS-backed SQLite lease permits only
one server. Its Unix socket and ledger are private local control surfaces. No
network endpoint, shared token or persistent credential is created.

Use `pardner bridge inspect --config PATH --actor ACTOR_ID` to inspect the local
channel binding, reported capabilities and client initialization. Then use the
existing `bridge run` and `bridge status` commands. The configured binding and
channel directory are part of saved routing identity, so pending/uncertain work
cannot be silently redirected. Completion cleanup is rejected for this provider.

## Receipt and uncertain delivery

Claude channels do not acknowledge notification delivery. A successful transport
write, MCP initialization, or local socket response does not prove that Claude
loaded the channel or received the prompt. The channel therefore saves the full
prompt to a FULL-synchronous SQLite ledger before sending exactly one notification
for that delivery ID. A repeated submit with identical content is deduplicated;
changed content under the same ID is rejected.

The instructions tell Claude to call `pardner_accept_delivery` with `delivery_id`
before effects. Only that persisted cooperative receipt is returned to the bridge.
The existing inbox field `turnId` holds `channel-receipt:...` for this provider;
it is **not a native turn ID** and not evidence of task completion. Claude then
uses the public Pardner CLI with the supplied Actor/data directory to read current
context and make attributed, idempotent writes. It calls
`pardner_complete_delivery` after finishing; this cooperative report permits the
next notification and does not update a task's status.

A receipt timeout leaves the core bridge delivery uncertain. Reconciliation
requires exactly one matching full prompt with an accepted durable receipt.
An unacknowledged notification remains uncertain, including after server restart;
it is not blindly resent. The ledger keeps one outstanding delivery as a barrier.
Native permission dialogs or a silently dropped channel event may require local
human attention; neither is automatically detected or approved by this provider.
Core `bridge reconcile --decision accepted` can record separately verified
acceptance evidence. `--decision retry` alone cannot clear an unacknowledged
channel-ledger row: that row still blocks availability and is not re-notified.
This draft has no operator disposition/reset command for such a row. Recovery
requires an actual cooperative receipt/completion from the loaded client or a
separately reviewed operator procedure; deleting the ledger is not proof that
the original event was unaccepted. This is an explicit current limitation.

## Qualification

Protocol tests exercise the real MCP SDK server/client, actual stdio entry point,
private socket, exclusive server ownership, explicit scope/policy validation,
durable receipt recovery, no resend after restart, and production bridge intake
with a fixture's attributed public CLI reply. These are protocol fixtures. They
do not claim that a native Claude model executed work.

Read-only discovery found Claude Code 2.1.283 installed and `auth status --json`
reported `loggedIn: false`. No sign-in, project MCP installation, development
channel opt-in, permissions, credentials or native model turn were attempted.
Native Claude wake/reply, loaded-channel behavior, approval UI, and a mixed
three-provider run remain blocked on approved authentication/interactive setup.
The foundation's separate native Codex no-output/systemError qualification
blocker is unchanged. No merge or deployment is implied by these tests.

## Frozen source verification

On Node 24.11.1, `npm run verify -- --local-ack-ms 10000` passed the production
build, all 312 default parallel tests and complete seed-1 acceptance on source
fingerprint `48c7d1c574c2deed22d08a112a2fb4bcf764b9f12f8f3eb065158108d7012f32`.
All 719 acknowledged operations were independently checked on each of three
replicas. Maximum local acknowledgment was 7,805 ms against the declared
10,000 ms budget; this run does not qualify the two-second performance target.
The strict default and other acceptance bounds are unchanged.
Independent implementation review found no blocking source findings and passed
32 focused Claude/provider/core tests. Review corrected the runbook's recovery
claim to disclose the unacknowledged-ledger retry limitation above.

An earlier build and 311-test run passed, but acceptance was correctly rejected
by the source consistency gate because a lifecycle test was added while it ran.
That run is retained and does not count as fixed-source qualification. The
canonical pass above used the final frozen implementation and eight Claude tests.
No native Claude model turn, sign-in or local channel opt-in occurred.
