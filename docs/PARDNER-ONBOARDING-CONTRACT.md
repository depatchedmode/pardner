# Onboarding implementation contract

This records coordinator decisions for implementing issue #109 after the three
explorations. It supplements the plan without editing it. Decisions are within
the user's instruction to continue through working screenshots; human acceptance
of completed features remains separate.

## Decisions

- One generated human identity, with Git name/email as profile defaults. Never
  deduplicate or authenticate by email. Agent identity is human + execution
  harness family (`openai-codex`, `anthropic-claude-code`, `cursor`). T3 is management
  metadata. Multiple sessions and devices share the corresponding Actor.
- Project ID equals workspace ID. One local client owns a private registry and
  isolated per-project runtime/storage. Existing standalone service mode remains
  available as an agent and integration service, and existing installations are
  preserved. People open the board only through the local client.
- New client sessions are Actor-bound. The supervisor derives authors before
  forwarding operations; ordinary API grants never allow impersonation. Keep
  replica admission separate and disclose the existing trusted full-document
  writer boundary. Do not expose privileged child service tokens through pairing
  or an unrestricted remote proxy.
- Existing project members can see Git profile names/emails and device labels in
  profiles, as requested. Avatars show only initials/image, kind and presence.
- Admission follows the [trust design](PARDNER-TRUST-DESIGN.md) (sections 2, 4
  and 5), which supersedes the original rule here. The owner and admins invite
  people, and only the owner offers the admin role. Every member pairs their own
  devices and agents; the owner or an admin pairs a device for a person who lost
  every one. Each new machine waits for an approval its approver's machine signs
  after a confirmation code matches. The owner removes anyone but the owner, an
  admin removes members, and a person's other machine removes one of their
  machines; only the owner changes roles. Agent grants allow board editing and
  session reporting, never implicit human/admin powers, and are revoked locally on
  the machine that runs the agent. Disconnected replicas keep last-known authority
  and exportable work; no global retroactive revocation or hostile-replica
  authorship claim.
- Presence is ephemeral and derived from explicit reports. Use session TTL 45 s,
  normal heartbeat 15 s, browser idle after 120 s, agent activity lease 90 s with
  a 300 s maximum. Registration starts idle. Unknown models remain unreported.
  One Actor appears at every currently focused task. No task assignment implies
  execution. A dedicated authenticated presence API is acceptable; do not use
  unchecked native ephemeral forwarding.
- Saved edits, not typing, synchronize. Drafts and retry identity stay bound to
  their original project/Actor. Preserve existing revisions/conflict behavior.

## Ownership for the first integrated implementation

- Beta: backend client registry, identity/authorization, project runtime
  supervision, create/join/invites, CLI, and focused backend tests. Own new
  `lib/client-*.js` except `lib/client-presence.js`, `bin/pardner.js`, `lib/cli.js`,
  and `test/client-*.test.js` except `test/client-presence.test.js`. Necessary
  existing service changes must be announced to the coordinator.
- Gamma: browser flow and components, browser connection helper, CSS, UI
  integration tests, accessibility. Own `ui-prototype/src/` and new
  `test/client-onboarding-ui.test.js`. Preserve existing standalone UI behavior.
- Coordinator: `lib/client-presence.js`, its tests, integration/qualification,
  documentation and screenshots. Coordinate any backend edits after Beta's handoff.
- Alpha's enrollment report is the accepted input for the grant lifecycle. The
  cloud session is human-managed; no automatic wakeup is assumed.

Each worker commits its owned changes locally and posts real progress in Pardner.
No worker may reset the coordination host, demo, remote exe.dev data or another
worker's checkout. Report source changes and limits, not invented evidence.

## Browser/server contract

New local client mode serves the same UI at `/pardner/`. Its public
`GET /pardner/config` returns `{ mode: "client", clientApiBase: "/pardner/client/v1" }`.
Standalone services keep their existing config contract, but their `/pardner/`
page serves no board and points people to `pardner open`.

Browser calls use a remembered HttpOnly SameSite session cookie. An agent-led
`client open` creates a short-lived single-use browser grant, opens the URL with
that grant in the fragment, and writes only credential-free status to stdout.
The UI clears the fragment immediately and exchanges it through `POST /bootstrap`
with `{ grant }`. Bootstrap is local, origin-bound and replay-safe; loopback alone
does not authenticate. Normal UI never requests an API key. Local CLI control
authority is private, distinct from agent board credentials.

All routes below are relative to `/pardner/client/v1`, except bootstrap and config
as described. Errors are HTTP errors with `{ code, error }`. Service-side
conditions (`HUB_UNAVAILABLE`, `LOCAL_SERVICE_UNAVAILABLE`, `SERVICE_STOPPING`,
`REGISTRATION_PENDING`, `RUNTIME_TIMEOUT`, `RUNTIME_FAILED`, `INTERNAL_ERROR`,
storage failures) are 5xx and retryable with the same `operationId`; 4xx codes
are decisions the client must not retry unchanged. Enrollment validates agent
and device metadata once at the boundary (text fields with length limits, device
reduced to `{id,name}`) before any member can see it. Successful responses
use the shapes below. Mutating setup operations accept a stable `operationId`;
same ID plus different input must fail. Secrets never appear in list/profile
responses or normal status output.

| Route | Request / response |
| --- | --- |
| `GET /session` | `{ identity: null or {id,name,email}, device: {id,name}, suggestedIdentity: {name,email}, setupAgent: {harnessId,name,model,managedBy}, projects: Project[], removedProjects: RemovedProject[] }` |
| `POST /identity` | `{name,email,operationId}` → session shape; initialize once, preserve stable identity |
| `POST /projects` | `{name,operationId}` → `{project: Project}`; register human and configured setup agent before ready |
| `GET /projects/:id` | `{project: Project, actors: Actor[], presence: PresenceSnapshot, membership}`; `membership` is computed from this client's record store, read-only |
| `GET /projects/:id/invites` | `?limit=1..50&offset=N` → `{invites: InviteSummary[], total, offset, nextOffset}` newest first (10 by default), without credential text |
| `POST /projects/:id/invites` | `{purpose: "human"|"agent"|"device", operationId, role?: "admin"|"member", personId?}` → `{invite: InviteSummary, invitation: string, setupPrompt}`; the offer is signed by this machine; invitation is private opaque setup data for explicit Copy/Reveal |
| `POST /projects/:id/invites/:inviteId/revoke` | revokes the invitation and rejects its waiting requests; refused once an approval is being recorded; returns updated summary |
| `POST /join` | `{invitation: string, operationId, agent?:{harnessId,name,model,managedBy}}` → `{join: JoinState}` while the request waits for approval, then `{project: Project}`. A retry with the same operation ID resumes the same request and never takes another place on the invitation. An Agent invitation on a machine already in the project returns `{project}` at once |
| `GET /projects/:id/join-requests` | `{requests: JoinRequest[]}` that this machine may approve |
| `POST /projects/:id/join-requests/:requestId/code` | adds this approver's nonce if none is fixed; `{request: JoinRequest}` with its `code` |
| `POST /projects/:id/join-requests/:requestId/approve` | `{code}`; refused with `CODE_MISMATCH` unless it matches; this machine signs the admission and the hub records it → `{request: {id, state, recordId}}` |
| `POST /projects/:id/join-requests/:requestId/reject` | rejects a waiting request |
| `POST /projects/:id/revoke` | `{kind: "member"|"machine"|"agent", id, operationId}`; signs `member.remove` or `machine.remove`, or revokes a local agent |
| `POST /projects/:id/role` | `{personId, role: "admin"|"member", operationId}`; owner only; signs `member.role` |
| `GET /projects/:id/people` | `PeopleView`, from this client's record store with live presence and, from the hub, last seen |
| `POST /projects/:id/leave` | `{operationId}`; signs `member.remove` for this machine's own person; refused for the owner → `{removed, left: true, id, recordId}` |
| `POST /projects/:id/profile` | `{name, email, operationId}`; signs a `profile` record and keeps the details as this client's identity → `{personId, name, email, recordId}` |
| `GET /projects/:id/presence` | PresenceSnapshot |
| `POST /projects/:id/sessions` | `{kind:"browser"|"agent", model?, managedBy?}` → `{sessionId, ttlMs}`; server supplies project/Actor/device binding |
| `POST /projects/:id/sessions/:sessionId/report` | `{seq, active:boolean, focusTaskIds:string[], model?}` → session receipt |
| `POST /projects/:id/sessions/:sessionId/end` | end only a session owned by this principal |

`Project` contains `id`, `name`, `role`, `actorId` (the authenticated participant),
`memberRole` (`owner`, `admin`, `member`, or null until this machine's own
admission record has synced), `apiBase`, `wsPath`, and current save/sync
`status`. It contains no service token.

`JoinState` contains `state` (`waiting` until the approver opens the request,
then `confirm`), `requestId`, `projectId`, `projectName`, `purpose`, `role`,
`expiresAt`, `machineId`, `code` (null while waiting) and, for a machine
invitation, `linkingAs: {name, email}`. A rejected or expired request is an error
(`JOIN_REJECTED`, `REQUEST_EXPIRED`). `JoinRequest` contains `id`, `offerId`,
`purpose`, `role`, `createdAt`, `expiresAt`, `machineId`, `device`, `agent`,
`person: {id, name, email}` (whose identity a machine joins), `code` and
`possibleDuplicates` when a new person's name or email matches a member.
Its `apiBase` is `/pardner/client/v1/projects/:id/api`. The board can reuse its
existing operations against that prefix; project-specific config has
`authentication: "session"`, `workspaceId: id`, and `actorId`. The UI must never
render a free author selector in this mode. Assignment/filter controls remain.

The API proxy only exposes supported workspace operations/context/status, not
child control, pairing, secret administration or arbitrary endpoints. Derive and
verify author/observer/claim identities throughout. Its WebSocket route requires
an authenticated project session and correctly scoped short-lived ticket. Keep
native replica traffic on a distinct admission path with separate credentials.

`Actor` retains existing id/handle/kind/displayName and may include public
`humanId`, `harnessId`, `gitIdentity:{name,email}` and `devices` metadata. Profiles
must use actual records/reports; missing metadata is not guessed.

`InviteSummary` contains `id`, `purpose`, `projectId`, `projectName`, `expiresAt`,
`createdAt`, `role` or `personId` with `for: {personId, name}`, `pending` (requests
waiting), `state` (`issued`, `redeemed`, `revoked`, `expired`), `issuedBy`, and
`usedBy` with `usedAt` once used or `revokedBy` with `revokedAt` once revoked. Each
person reference is `{personId, name, removed?}`.

`PeopleView` contains `projectId`, `projectName`, `observedAt`, `you: {personId,
machineId, role, agentsOnly}` (null with `syncing: true` until this machine holds
its own admission record), `hubReachable`, `suggestPairing` (the owner has one
machine), `counts: {people, machines, agents, removed}`, `actions: {invite: {allowed,
reason, roles}, leave: {allowed, reason}}`, `people[]` and `removed: {people[],
machines[]}`. Each person has `id`, `actorId`, `name`, `email`, `role`, `roleLabel`,
`you`, `admittedBy` (null for the owner, who started the project), `machines[]`
(`id`, `shortId`, `name`, `thisMachine`, `hostsProject`, `agentsOnly`, `paired`,
`status`: `this`, `online`, `offline` or `unreachable`, `lastSeenAt`, `admittedBy`,
`actions`), `agents[]` (`id`, `name`, `harness`, `machines[]`) and `actions`. An action
is `{allowed, reason}`, present only where the viewer could take it; on the owner's
entry a non-owner gets `{note}` instead. Removed people carry `left`, `removedBy[]`
and their former `machines[]`; removed machines of current people carry
`personName` and `removedBy[]`.

`RemovedProject` is `{id, name, role, removal, message}`, where `removal` is
`{kind: "person"|"machine", left, by: {personId, name}}` or null when unknown. A
removed machine's requests to that project fail with `REVOKED` and `details:
{removal}`. The browser shows the project as removed, never as signed out, and
keeps it in the project switcher. The default UI presents
purpose/project/expiry and Copy invite; credentials are absent from the DOM until
explicit Reveal. Join can accept the copied private payload; short agent-facing
prompt text points to a supported, versioned setup entry point. Never invent a
published npm package version.

## Presence module interface

The coordinator supplies `ClientPresence` in `lib/client-presence.js` with an
injectable monotonic `now` function. Methods:

```js
new ClientPresence({ now, ttlMs: 45000, activityMs: 90000 })
start(binding, input)             // {sessionId, ttlMs}; initially idle
report(binding, sessionId, input) // seq monotonic; expiry is not resurrection
end(binding, sessionId)
snapshot(projectId)              // {actors:[{actorId,state,focusTaskIds,sessions}], observedAt}
```

`binding` is server-derived `{projectId,actorId,deviceId,deviceName?,principalId}`;
the caller cannot alter it. Session metadata includes kind, harnessId, managedBy,
model and deviceName where known. Server routes validate task membership before
reporting focus. Snapshot filters to the requested project. Expiry clears focus;
profiles keep stable Actor history. Do not persist heartbeat frames as document
operations. Remote presence requires authenticated membership and fresh sessions
after reconnect; a working local-only presence implementation cannot be presented
as cross-replica presence until that route is exercised.

## UI direction and evidence

Extend the existing dark, quiet Pardner tool interface: clear typography, mint
accent, compact controls and strong keyboard focus. No marketing layout or new
visual identity. Welcome shows Start a project / Join a project with Git-derived
identity confirmation when needed. The board header shows project switcher,
current human, participants, People and Invite. Invite has Human / Agent / My device.
People opens the panel for people, machines, agents, join requests, removed entries
and invitation history.
The Actor profile separates identity from session machine/harness/model details.

Screenshots must come from the working implementation using real service APIs
and explicit Alice/Bob/Carol fixture identities, not a static mock or invented
agent activity. Record fixture reporting separately from actual worker evidence.
Capture welcome/create, board/project switching, invitation and profile/focus at
desktop and a narrow viewport. Keep secrets out of every capture.

## Completion boundaries

Run affected regression suites and `npm run verify`, lifecycle checks where
required, and a real create/join/save/reopen/retry walkthrough. Track the separate
20-seed qualification obligation for storage/admission/recovery changes. Screenshots
are a deliverable, not evidence that every M7 qualification has completed. Do not
claim merge readiness or weaken the acceptance contract to get a screenshot.
