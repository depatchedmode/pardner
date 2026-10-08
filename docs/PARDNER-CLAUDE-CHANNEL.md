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

The user signs in with `claude auth login` if needed. After approving persistent
project MCP configuration, run this in the mapped worktree, using actual absolute
paths and the registered Actor/configuration:

```sh
claude mcp add --transport stdio --scope project pardner -- \
  /absolute/node-v24.11.1/bin/node /absolute/pardner/scripts/claude-channel.js CONFIG_PATH ACTOR_ID
claude --resume NATIVE_CLAUDE_SESSION_ID --dangerously-load-development-channels server:pardner
```

The resume ID is the selected native Claude session, separate from the channel
binding. Authorized native qualification may instead use an isolated fixture
session; session creation within that test scope needs no additional approval.
Sign-in, persistent MCP/security configuration and local consent remain user
actions. Accept the interactive development warning and project MCP consent,
confirm channel registration with `/mcp`, and leave any tool approvals local.
If organization policy blocks channels, its Owner must enable `channelsEnabled`;
the development flag bypasses only the preview allowlist.

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
An operator can now explicitly abandon an outstanding delivery after stopping
the bridge, channel server, native Claude client and any possible effects. This
means closing that delivery with an **unverified execution outcome**. It is not
proof of non-acceptance, successful execution or task completion. The command
does not retry the delivery or change the Pardner task's status. Existing user
jobs require their own authorization; fixture tests do not authorize operating
someone else's uncertain delivery.

```sh
pardner bridge disposition --config CONFIG_PATH --actor ACTOR_ID --delivery DELIVERY_ID
pardner bridge dispose --config CONFIG_PATH --actor ACTOR_ID --delivery DELIVERY_ID \
  --decision abandon --expected-revision INSPECTED_REVISION \
  --operation-id STABLE_DISPOSITION_ID --evidence 'Observed client/effect shutdown and operator decision' \
  --confirm-client-stopped
```

Both commands require exclusive ownership of the existing inbox and channel
storage. They never connect to or launch Claude. `--confirm-client-stopped` is
an explicit operator attestation; the provider cannot independently verify the
native client or external effects. Inspect returns a revision over both full
delivery records and their bindings, a prompt digest and any genuinely observed
cooperative receipt. A later receipt, inbox change or retargeted mapping makes
the original decision stale and is rejected before the first mutation.

Abandonment retains the full prior prompt, state, genuine receipt, original
revision, operation ID and operator evidence in durable journals. It leaves a
terminal tombstone in both stores. Submission and late acceptance/completion
callbacks for that ID are rejected; core retry cannot revive it. A new authorized
delivery has a separate ID and must independently deduplicate any possible
effects of the abandoned work.

The channel journal is committed first and keeps an unfinished-decision barrier
until the matching inbox decision commits and is finalized. A process crash or
lost command reply can be recovered by repeating the **identical command** with
its original operation ID, revision and evidence. Offline inspection reports
an unfinished decision's original request. Changed payloads or prior evidence
remain blocked; never overwrite or delete the journals to force recovery. After
finalization the original notification is never resent and later deliveries may
proceed. This provides explicit operator recovery, not automatic unattended
recovery or permission handling.

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
The subsequent foundation follow-up diagnosed the old Codex CLI/runtime model
incompatibility and verified one real automatic Codex wake/reply on exact #71.
That result does not qualify native Claude execution or this branch's Codex
runtime. No merge or deployment is implied by these tests.

## Prior published-head verification

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

## Explicit recovery verification

The abandonment implementation passed independent source review and 43 focused
tests, including 11 new disposition tests. Review fixed recovery of a previously
requeued prompt, required both recorded store snapshots to remain unchanged
through an interrupted decision, and checked cross-Actor operation-ID reuse
before any ledger mutation. Tests cover lost cooperative acknowledgements,
stale state/receipt/binding evidence, live storage ownership, failures between
both database commits and finalization, same-operation recovery, preserved audit
records, rejected late MCP callbacks and one distinct notification after restart.

On Node 24.11.1, `npm run verify -- --local-ack-ms 10000` passed the production
build, all **323** default parallel tests and complete seed-1 acceptance on frozen
source fingerprint
`d305f1979f269ea3f7874e93e9f19a919827282a2b82e752fa360d428f1b317d`
(119 source/build files). The report is retained at
`output/acceptance/2026-10-07T08-59-40.776Z`.
All 719 acknowledged operations were independently checked on each of three
replicas with matching final snapshot hashes. Maximum local acknowledgment was
753 ms against the explicitly declared 10,000 ms budget; other acceptance bounds
and the strict default are unchanged. These fixtures do not establish native
Claude execution or automatic unattended recovery.

The source-level permanently blocking row now has a tested explicit operator
disposition path. Native model wake/reply, client approval interaction and mixed
three-provider execution remain unqualified. Read-only authentication status
still reports Claude signed out. No actual user's uncertain delivery, sign-in,
MCP/security setup, native permission, retained worktree or session was operated
on by this implementation/verification.

## October 8 interrupted-disposition repair

Follow-up review reproduced a channel commit followed by an inbox commit failure,
then bridge restart changing the original inbox evidence. The unchanged operation
failed with `STALE_DISPOSITION`; changing the revision reused the operation ID,
and subsequent work remained busy. This occurred for both queued and dispatching
rows. A durable inbox intent now precedes channel mutation. Recovery, reconciliation
and dispatch preserve its original snapshot and block later Actor work until the
identical operation finishes both stores and releases both barriers.

Independent review found that existing channel-only journals also needed this
protection. They are now imported before generic inbox recovery, including
historical routes after mappings are removed, disabled or switched. Import retains
the recorded request, original evidence and timestamp. Changed evidence remains
guarded and an explicit retry still fails stale; import never restores an older
snapshot over intervening changes. Fully finalized legacy audits do not acquire an
unnecessary barrier. Startup shutdown waits for recovery to settle, and clean
cleanup preserves a rejected recovery's original error code.

The final focused bridge/Claude run passed **103/103** tests. Independent source
review and adversarial checks passed **63/63**, including **ten actual process
exits** at the five durable-write boundaries for both queued and dispatching rows,
SQL insertion faults, legacy migration, unchanged audit evidence, tamper guards,
historical mappings, startup/shutdown ownership and a distinct later delivery.
The legacy and error-reporting findings were repaired and independently rechecked;
no findings remained.

Node **24.11.1**, source at `54b3589d` and fingerprint
`559d2576e6c99f51e720b5a480b25b4270ba85d2937539ee2884abf5022673b9`
passed `npm run verify -- --local-ack-ms 10000`: production build, **345/345**
default parallel tests with no skips/cancellations, and complete seed-1 acceptance.
All **719** acknowledged operations were checked on each of three replicas with
matching snapshot hashes. Maximum acknowledgment was **356 ms** against the
declared 10,000 ms budget. Independent evidence review reconstructed the operation
manifest, reverified the saved snapshot and confirmed the recorded source/build
fingerprint. The 2,000 ms default and other acceptance bounds are unchanged;
repeatable default-budget performance remains unqualified.

Shared deadline and shutdown fixes are included through #70/#71 stack merges.
The [browser environment recovery](PARDNER-66-QUALIFICATION.md#october-8-deadline-repair)
also applies to this run; actual Chromium and WebKit tests passed. No native Claude
or mixed-provider qualification ran on this repaired head. These fixtures do not
qualify automatic native execution, interactive approval or arbitrary effects.
The original published commits and draft branch are retained. No actual user's
uncertain delivery, native sign-in, persistent access configuration, merge into
main or deployment was operated on. Runtime histories and configuration remain
private.
