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
