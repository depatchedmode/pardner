# Provider boundary qualification

This foundation is stacked above PR #70 at
`4e55ecc8325a9e207267745069732c77b695b645`. It registers only the existing
Codex App Server implementation. Provider-specific validation, connection
identity, construction, and inspection are selected through `BridgeProviders`.
Existing Codex configuration normalization and persisted mappings keep their
shape. The Codex adapter's protocol/session/recovery methods are unchanged.

Validation used Node 24.11.1. The canonical
`npm run verify -- --local-ack-ms 10000` passed the production build, all 304
default parallel tests, and complete seed-1 acceptance on source fingerprint
`fe453d066537b22011b2807a1b6417c77b70fc1fbd493ff48bdbce66a2a45392`.
The strict 2,000 ms default is unchanged. Only this invocation selected the
previously authorized 10,000 ms acknowledgment bound. All other gates retain
their original bounds. The first full attempt failed an existing 25 ms ticket
test and an injected fixture missing its provider ID; the latter was corrected
without weakening assertions. The ticket test was unchanged and passed on
retry before the complete canonical pass. The initial failure remains recorded.

Independent implementation review found no blocking findings. It checked all
nine implementation/documentation/test files before this evidence document,
verified unchanged Codex methods and legacy route comparisons, and independently
passed 24 provider/core bridge tests. The affected bridge suite passed 59 tests;
the subsequent ticket/review regression suite passed 26 tests.

## Native qualification remains partial

One dedicated Codex probe session was reused across the attempts. Actual native
configuration/CLI inspection and acceptance were observed. Run
`91b4cbc3-390f-4b79-8b2f-727a8ed936bc` verified a deliberately lost acceptance
reply followed by reopening the durable inbox and recovering the same receipt
from exact native prompt history, without another submission for that delivery.

An actual attributed Pardner reply was not observed. The separate healthy
attempt `85f7e035-5f10-4f0a-a3f9-6c2fc4048be8` timed out at its declared bound.
Native histories recorded user-message-only turns without assistant output or
the required reply; the healthy final native status was `systemError` and queued
work was unavailable. Receipt or
native completion metadata is not evidence that the model performed the task.
The current host/provider cause remains undiagnosed; this is a qualification
blocker, not a claimed successful native round trip. The former #70 qualification
is historical evidence on its original source, not a substitute for this gate.

No permissions were answered, sign-ins or credentials changed, existing chats
archived, or worktrees moved/deleted. The probe's processes were stopped while
the session and private evidence were retained. Human approval UI, three-agent
execution on this foundation, other providers, and separate-machine behavior
remain unqualified. Raw histories, inboxes and runtime configuration are private.

## October 8 shutdown repair

Follow-up review found that provider inspection and `AgentBridge.stop()` discarded
an asynchronous adapter `close()` result. The shared callers now wait for process
ownership to end before returning. Shutdown starts every close, waits for all
owners and pending work even if one close fails, and shares one completion
promise across repeated stops. Failed startup also completes bridge cleanup
before releasing the inbox lease.

The repair propagates the deadline changes from #70 through the existing stack
using merges, preserving the original published commits. The root focused bridge
run passed **26/26** tests. Independent review passed **29/29** focused checks and
verified pending-job shutdown, close failures, repeat stops, and failed-startup
lease retention. Real Cursor fixture probes on the dependent branch confirmed
ownership through an 800 ms delayed exit and the one-second forced-stop fallback;
replacement could begin only after the old process exited. No findings remained.

Node **24.11.1**, source at `fdc5282d` and fingerprint
`59d310fc706946024ce570cd2df46c220958e417d0c4a957e561434648663227`
passed `npm run verify -- --local-ack-ms 10000`: production build, **308/308**
default parallel tests with no skips/cancellations, and complete seed-1 acceptance.
All **719** acknowledged operations were independently checked on each of three
replicas with matching snapshot hashes. Maximum acknowledgment was **329 ms**
against the declared 10,000 ms budget. Independent acceptance-component checks
also passed **5/5**, preserving the distinct 2,000 ms default and explicit override.
Repeatable performance at the default remains unqualified.

The [deadline repair addendum](PARDNER-66-QUALIFICATION.md#october-8-deadline-repair)
records the local browser dependency recovery used for this run. No browser
assertion was skipped or weakened. The prior #71 one-session native wake/reply
follow-up is historical evidence; no native or mixed-provider run qualifies this
updated head. This work performs no sign-in, persistent access change, merge into
main, or deployment. Existing drafts remain drafts.
