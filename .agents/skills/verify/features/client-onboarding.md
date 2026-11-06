# Client onboarding and presence

The [implementation contract](../../../../docs/PARDNER-ONBOARDING-CONTRACT.md)
records the intended client experience. Read implementation and tests before
claiming an entry point is available; the contract alone is not evidence.

## Ephemeral presence

Run `node --test test/client-presence.test.js` with pinned Node 24.11.1.
The focused suite uses an injected monotonic clock to exercise session
registration as idle, explicit active reports, expiry without resurrection,
bounded activity leases, and identity checks on report/end. Duplicate reports
do not extend a lease. Changed or older replays fail without renewing activity.

Two sessions for one Actor on different devices aggregate into one participant,
with separate reported models and a union of focused task IDs. Snapshots are
project-scoped and omit private principal IDs. An Actor absent from a live
snapshot is offline; the persistent Actor record remains independent.

These assertions establish the module's behavior. They do not establish HTTP
authentication, cross-replica presence, real agent activity, browser focus,
transport reachability, or rendering. Those paths require real client API and
browser exercises. Registration is not evidence that an agent is doing work.

## Integrated flow evidence

The [recovery guide](../../../../docs/PARDNER-CLIENT-RECOVERY.md) is exercised by
`test/client-recovery.test.js`: fresh-directory cold restores preserve identity,
project isolation, retry history, invitations and delivery acknowledgements;
an owned device can revoke another, with retained content export restricted to
the local operator. A readable export is not a replica/credential backup. Keep
the [real-agent rehearsal](../../../../docs/PARDNER-CLIENT-REHEARSAL.md) separate
from these automated fixtures and preserve human signoff as a distinct outcome.

Run `node --test test/client-registry.test.js test/client-onboarding.test.js
test/client-cli.test.js test/client-recovery.test.js test/client-shutdown.test.js
test/onboarding-flow.test.js` for the service/CLI paths.
The real two-client fixtures cover enrollment, private bootstrap, actor binding,
recipient proof, member invitations, device identity, remote presence, revocation
and replay. `onboarding-flow` uses browser cookies across project switching,
authority outage, offline client restart and reconnection; it also redeems the
short setup prompt. The public-gateway assertion checks configuration and Host
rejection, not an actual Internet route. These fixtures do not involve live LLMs.
The shutdown regressions pause a WebSocket upgrade at its upstream ticket, send
a late upgrade on an accepted TCP connection, retain a rejected upgrade, and
finish an admitted HTTP request after shutdown starts. Shutdown must close the
connections, deliver the admitted response and stop the persisted runtime.
Agent-grant checks preserve separate harness reporting
defaults, and agent-only clients reject human browser launch before issuing a link.

`npm run test:ui` includes `test/client-onboarding-ui.test.js`. Its Chromium and
WebKit journeys use two real local client services for private opening, identity,
start/join, hidden invitations, remote saved edits, draft isolation, focus,
reported agent models and project switching. Chromium additionally checks the
clipboard; WebKit exercises explicit reveal and hide without unsupported clipboard
permissions. Both engines must run; a missing backend or browser is a failure.

Use separate disposable client directories for Alice and Bob, plus explicit
Greek-named fixture agents. Preserve existing user installations. The intended
exercise covers private local bootstrap, project creation, human invitation,
recipient identity, local replica setup, save propagation, offline reopen,
project switching and Actor profiles. Record fixture reports separately from
actual worker contributions. Inspect screenshots and state readback together;
screenshots alone establish neither persistence nor remote presence.

Invitations, browser grants, cookies, enrollment credentials and raw browser
traces are private. Capture the default hidden invitation state. Do not copy
private request headers or bootstrap fragments into evidence or screenshots.
Keep [companion browser](companion.md) coverage for standalone mode; a new
client walkthrough does not replace those regression assertions.
