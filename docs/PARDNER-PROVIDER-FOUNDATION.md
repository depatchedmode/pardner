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
