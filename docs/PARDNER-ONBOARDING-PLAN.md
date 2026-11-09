# Plan: project onboarding, identity, invitations and presence

Status: proposed implementation plan. Product requirements below come from the
onboarding discussion; technical choices marked as proposals need validation
during implementation. This document does not claim those capabilities exist.

## Outcome

An existing agent sets up Pardner and opens a connected local board for its human.
The human can create or join projects, invite collaborators, see where humans and
agents are working, and edit together without finding credentials in files or
choosing an arbitrary Actor to impersonate. The experience should be legible in a
screen share or screenshot, with secrets hidden from the normal interface.

Pardner is the shared coordination surface. Agents run in their existing apps or
harnesses. This onboarding flow does not start models, dispatch provider work, or
require an agent bridge.

## Personas and walkthrough

Human examples use Alice, Bob and Carol. Agent examples use Greek names; names
are display labels, not identity keys or a mandatory production naming scheme.

| Actor | Kind | Human relationship | Harness | Devices |
| --- | --- | --- | --- | --- |
| Alice | Human | Self | Browser | Laptop and desktop |
| Alpha | Agent | Alice's agent | Claude Code | Alice's laptop and desktop |
| Beta | Agent | Alice's agent | Codex | Alice's laptop |
| Bob | Human | Self | Browser | Bob's laptop |
| Gamma | Agent | Bob's agent | Claude Code | Bob's laptop |
| Carol | Human | Self | Browser | Carol's laptop |
| Delta | Agent | Carol's agent | Codex | Carol's laptop |

1. Alice asks Alpha to start a project. Alpha sets up the local client, initializes
   Alice's identity from her Git configuration, creates the project, registers
   itself, and opens the board with Alice authenticated. Both Actors exist before
   the first task is created. Alpha's presence reflects its actual session state.
2. Alice selects **Invite → Human** and copies a short invitation for Bob to give
   Gamma. Bob can scan the prompt before using it. It identifies the project and
   explains that Gamma will create a local board connected to it.
3. Gamma initializes Bob's own identity and persisted replica, joins the project,
   registers itself, and opens Bob's local board. Alice does not create Bob's
   identity for him. Alice and Bob see each other's presence.
4. Alice and Bob move cards and edit tasks. Saved changes appear on both boards.
   They can inspect Alpha's and Gamma's profiles and current task focus without
   leaving the board. A mention is shared state, not proof that an agent woke up.
5. Alice selects **Invite → Agent** and gives the generated prompt to Beta in its
   existing harness. Beta joins as another Actor. Pardner does not invoke Beta.
6. Alice selects **Invite → My device** to connect her desktop. This links the
   existing Alice identity. Alpha sessions on both devices remain one Actor; its
   avatar appears on each task those sessions are focused on.
7. Carol joins with Delta through the same human invitation flow. Alice switches
   to a second project and back in the same client, retaining project-specific
   drafts, filters and connection state without mixing their contents.

## Agreed product requirements

- The agent performs installation/setup and opens the local board. The human does
  not retrieve an API key or enrollment JSON to get into their own board.
- The client is the local application; a project is a shared board, its records
  and its participants. One client can create, join and switch between projects.
- Each human has one identity across projects, initially populated from local Git
  name and email. Git metadata is a profile source, not authentication proof.
- Authentication determines the Actor authoring an operation. Filtering by other
  Actors is separate from identity; the board has no arbitrary author selector.
- Invitations distinguish another human, another agent, and another device the
  human owns. The human invitation is a short prompt for an existing agent.
- A setup agent becomes an Actor immediately. Agents have the same board-editing
  permissions as humans. Neither needs provider execution inside Pardner.
- An agent Actor is grouped by **human identity + harness identity**, across
  machines and sessions. Machine and model changes do not create a new Actor.
- The avatar shows only picture/initials, human/bot kind, and presence. Placement
  on a task shows focus. One Actor can appear on several tasks simultaneously.
- The Actor profile exposes Git identity, human relationship, machine
  relationships, app/harness, and each agent session's active model.
- Presence has three states: **active** means connected and doing something;
  **idle** means connected but not doing something; **offline** means disconnected.
- Realtime collaboration means propagation of saved edits. Keystroke-level
  co-editing and live cursors are not required for this scope.

## Baseline and gaps

Inspected checkout: `4a7ae50e4a1a114c242c1f34936ee3979a7c4f40` on
`t3/review-open-prs-issues`. The locally available sync branch
`cursor/native-automerge-ws-sync-cda6` points to
`13d3eb98215ccc0ca8c4cd9b88dd31caf60c4e89`, which is an ancestor of this checkout.
There are no commits on that local reference missing from this baseline. This is
a local-ref comparison, not a claim of a fresh remote fetch.

| Area | Current implementation | Work required |
| --- | --- | --- |
| Client | One service configuration and workspace per browser address | Local project registry, lifecycle management, project-aware routing and switcher |
| Startup | Service generates connection credentials; browser enters token or pairing code | Authenticated automatic local opening and resumable setup |
| Identity | Actor record has ID, handle, kind and display name; caller supplies author | Persistent human identity, harness grouping, session-bound author authority |
| Enrollment | Shared workspace API secret plus separately provisioned native replica credential | Purpose-specific, resumable invitations and device linking |
| Presence | Saved document/status subscriptions; no live Actor presence model | Session registration, activity/focus reporting and expiration |
| Collaboration | Revision-aware operations, persisted replicas, explicit conflict resolution | Preserve semantics while adding project routing and visible presence |

Relevant implementation: [local service](../lib/local-service.js),
[client connection](../ui-prototype/src/connection.js),
[board](../ui-prototype/src/Pardner.jsx),
[Actor schema](../lib/workspace-schema.js),
[operations](../lib/workspace-commands.js),
[runtime](../lib/workspace-runtime.js), and
[server](../automerge-sync-server.js).

The existing [Control pane](PARDNER-CONTROL-PANE.md) also calls its local
repository/thread mappings “projects.” Those are not separate shared boards.
Give those mappings an explicit relationship to the new project ID; do not reuse
that registry as a board switcher or silently change its meaning. Existing
optional execution integrations remain outside this onboarding work.

## Proposed domain and authority model

### Human, Actor, device and session

- **Human identity:** stable generated ID plus editable Git name/email and avatar.
  Persist identity locally before project creation. Resolve Git configuration in
  the requested project directory on first setup; if required values are absent,
  ask for a name/email once in setup. Never modify Git configuration implicitly.
  Later repository-specific Git overrides do not silently replace the identity.
- **Actor:** stable human Actor or agent Actor. Agent grouping uses a canonical
  `(humanIdentityId, harnessId)` key. Names such as Alpha are editable labels;
  changing them preserves authorship, mentions and history. Repeated registration
  resolves the existing identity instead of generating duplicate Actors.
- **Harness:** a stable registered app/harness ID, not a process ID, model name or
  user-agent string. Proposed rule for nested apps: the integrating outer harness
  supplies the grouping ID; child runtimes are profile metadata. Document the
  canonical names so sessions do not accidentally split or merge Actors.
- **Device:** a registered installation linked to a human identity, with its own
  credentials. Each project has a separate persisted replica on that device.
  Linking another device proves possession through the existing identity's
  enrollment flow; matching Git email alone never links identities.
- **Session:** a live connection for an Actor, with device ID, app/harness details,
  optional active model, activity state and project/task focus. Models can change
  during a session. Missing model information is shown as “Not reported.”
- **Project membership:** a project's admitted human and agent Actors. Reusing a
  global identity does not grant automatic access to every project. Project views
  expose only memberships and sessions authorized for that project.

The human profile is reusable locally; each project contains its public Actor
projection and admitted relationships. Private credentials never enter shared
Automerge documents. Two humans with identical Git names/emails stay distinct.
Two devices registering the same human/harness concurrently must converge on one
agent Actor, using a versioned canonical identity key and deterministic retry
semantics, while retaining any conflicting profile edits for resolution.

### Authenticated participation

Bind browser and agent credentials to a principal, device, Actor and permitted
project. Derive the author from that authenticated context and reject conflicting
caller-supplied Actor IDs. Enforce this for HTTP writes, CLI writes, presence,
read receipts, delivery claims and subscriptions, not only the avatar picker.
Human browser sessions and agent sessions receive separate credentials.

Initial local setup may provision the human and setup agent through narrowly
scoped bootstrap authority. Afterwards, the agent authors as itself. Local
opening consumes a one-time browser bootstrap grant and establishes a remembered
local session; it does not disable authentication merely because a request comes
from loopback. Bind grants to the intended origin, identity and project, consume
them atomically, clear transient launch material, and exclude it from logs.

Preserve shared-secret admission and separate native-replica credentials. Add
Actor-bound authorization on top of admission; possession of the workspace secret
alone must no longer permit choosing any author through ordinary APIs in the new
flow. Audit legacy API, pairing and WebSocket paths for bypasses.

The current native replication boundary remains material: enrolled replicas are
trusted full document writers and bypass operation validation. This plan provides
authenticated authorship through supported services under that trust model; it
does not claim tamper-proof authorship against a malicious replica administrator
or isolation from another process controlling the same OS account. Document that
limit alongside authentication. A stronger hostile-replica guarantee would need
a separate design for verified authored operations, including the native path.

Equal board-editing permissions do not implicitly grant credential administration.
Proposed initial policy: admitted humans can invite humans, connect their own
agents and link their own devices; agents receive only explicit setup/enrollment
authority when needed. A human can revoke their own devices and agents; the
project creator can revoke project membership. Preserve authored history on
revocation. Validate this policy before finalizing the enrollment API.

### Local client and project storage

Introduce one local client supervisor with a private project/identity registry
and a stable browser entry point. It owns per-project runtime lifecycles and
routes authenticated requests by immutable project/workspace ID. Keep each
project's replica storage, service lock, credentials, sync status and delivery
state separate. Decide process layout in the first implementation milestone;
prefer preserving the existing runtime boundary over merging project documents.

The service remains the persistence owner. The browser does not gain an Automerge
database. Keep project-specific drafts and uncertain requests keyed by project
and Actor. Switching projects cannot submit a draft or retry to the new project.
A failure in one runtime must leave other projects usable. Do not stop accepted
agent work or sync simply because its board is not the currently visible one.

## Setup and invitation behavior

### Create, join and reopen

Proposed CLI capabilities are `project create`, `project join`, `project list`,
`open`, `invite`, and session registration/activity commands. Final command spelling
should follow [existing CLI conventions](PARDNER-CLI.md). Agents get structured,
non-secret results and actionable failure codes; humans get an opened board.

Create and join are resumable operations with stable operation IDs. Persist the
identity, project entry, credentials, enrollment receipt and bootstrap registrations
at defined boundaries. A lost response must resume the same attempt rather than
create a second project, consume another invitation or register duplicate Actors.
Only report ready when the local workspace identity matches the intended project,
required registrations are persisted, and the browser can authenticate locally.
Report local save and hub acknowledgement separately.

Restart and open discover the existing client and data. They never reset a
workspace, rotate credentials or allocate another replica as an implicit repair.
An unavailable browser launcher leaves a credential-free local URL and a
recoverable opening action. Connection errors explain whether the client, project
runtime, enrollment authority or remote route is unavailable.

### Invite entry points

- **Human:** join the selected project with the recipient's own identity and local
  persisted replica; register their setup agent under that human/harness.
- **Agent:** connect an agent already running in a harness under the inviting
  human. Reuse its Actor if that human/harness already exists; add a session.
- **My device:** link the existing human identity and explicitly selected project
  memberships on another machine. Reuse agent identities for matching harnesses.
  Pairing a companion browser remains a separate option and must not be described
  as creating a persisted replica. *Implemented:* **Pair a phone** on the board pairs
  a phone companion of the local client ([guide](PARDNER-LAN.md)); it is a
  companion, not a replica.

The prompt should fit in a few sentences, with all routine setup in a supported,
versioned entry point rather than a pasted shell script. Example copy:

> Join Alice's project “Shared board” in Pardner using the attached invitation.
> Set up or reuse my local client and identity, register yourself as my agent,
> and open my local board. Keep credentials private and report when connected.

That is illustrative copy, not an executable invitation. The generated artifact
must include the supported setup reference and private enrollment material needed
to work on a fresh machine. Package/version discovery must not depend on already
having Pardner installed. The broader unfamiliar-code trust experience remains
outside this plan; prompt clarity and accurate disclosure of setup are in scope.

Invitation grants are purpose- and project-bound, short-lived and revocable. A
new human's setup needs an enrollment transaction covering its human, initial
agent and device, not an unrestricted workspace credential dump. Persist the
grant's redemption outcome before acknowledging; uncertain retries authenticate
the same recipient and recover the same outcome. Never allow another recipient
to retrieve credentials by replaying a used grant.

The default invitation screen shows its purpose and project, with **Copy invite**
and expiration/revoke controls. Credential-bearing content stays hidden unless
explicitly revealed. A copied invite is private even if its credential is opaque.
No long-lived credentials in ordinary URLs, screenshots, logs or status output.

## Presence and saved collaboration

Keep presence ephemeral and separate from durable task/history mutations. An
authenticated session reports connection liveness, activity and focus through a
versioned interface. The local service relays authorized presence to project
subscribers and other replicas through the existing supported network route.
Heartbeats must not generate Automerge history or disk writes for every tick.

Proposed aggregation within the visible project:

1. Active if any live session for that Actor reports ongoing activity.
2. Otherwise idle if at least one session remains connected.
3. Otherwise offline. Expired sessions lose their focus markers; the Actor remains
   in participants and authored history.

Deduplicate the same Actor on a task, but show it on every task with a live focus.
The profile lists the contributing sessions, machines and reported active models
so one avatar does not imply a single execution context. Presence is scoped to
this project; work in another project must not reveal its tasks here.

Browser activity comes from actual interaction, with a documented idle threshold.
Agent activity/focus/model comes from cooperative harness or CLI reporting. A
connected service, running PID, assigned task, or mention is insufficient evidence
that a model is working. Offer a small reporting contract usable by existing
harnesses without a provider bridge or an agent polling conversation. Registration
alone cannot leave an agent permanently active. Specify heartbeat, idle and
expiry intervals before implementation; test with an injected clock.

Offline means no live connection observed from this view. During a partition the
remote Actor may still be working locally. Show the project's disconnected state
so the avatar is not presented as evidence of a crashed process. Reconnection
requires fresh session observations; stale active markers cannot resurrect.

Saved task edits continue through the existing revision-aware API and disk barrier.
Do not replace a user's unsaved editor text when another participant saves. Show
that a newer revision exists and preserve the draft and its observed revisions.
Different-field edits merge; authored same-field alternatives remain explicit.
Preserve existing comment edit/delete behavior and history, including concurrent
edit/delete cases. Task/vein/goal deletion is not added by this plan; do not infer
delete semantics from presence disappearance or member removal. Duplicate retries
reuse the unchanged request identity/payload. Interrupted sync cannot silently
discard an acknowledged local edit.

## Connectivity, outage and recovery

Keep the current hub/WebSocket protocol. This plan does not require a new peer
protocol, browser-only replica, centralized account provider or permanent cloud
service. Enrollment and new delivery leases still require the project's hub.

- **Same LAN or an existing private network:** offer a reachable hub address when
  explicitly configured and verified; avoid an unnecessary public relay. This is
  a direct route to the hub, not arbitrary peer mesh replication. Discovery must
  use an explicit address initially; do not silently change bind interfaces.
- **Unrelated networks:** use an explicitly configured authenticated reachable hub
  or relay. Current code does not establish automatic discovery, public inbound
  reachability, NAT traversal or background mobile peer hosting. Therefore
  automatic direct peer mesh is excluded from this iteration. Keep invite failures
  diagnostic and do not silently publish the service to make an invite work.
- **Relay or hub loss:** already enrolled local replicas reopen, edit and save
  offline. Remote presence expires and remote sync is pending. New enrollment and
  delivery leases pause; already accepted work can continue and save locally.
- **Local service loss:** its browser cannot read/write its replica until the local
  service resumes. A companion browser likewise depends on its host. Cached UI
  assets must not turn a service-dependent browser into a claimed offline replica.
  *Implemented:* the client phone companion has no offline copy and stops working
  when the computer's client service or its network is unavailable.
- **Revocation:** reject future admission and close known live sessions. Offline
  peers retain data already received; revocation cannot erase their disks. Define
  treatment of offline authored operations against the known revocation state
  before shipping; never silently erase rejected changes. Show recoverable local
  work and the loss of project access distinctly.

Provide export and restore for project content/history/Actor mappings plus a
separate protected identity/device recovery bundle. Inventory any local attachment
assets and credential material needed; references alone do not back up external
files. Public content exports contain no private keys. A fresh device restore
must explain whether it can reopen only locally or can also reconnect; missing
admission credentials require re-enrollment, never guessed identity from Git email.

Document hub replacement as a deliberate restore of project state, admission and
delivery metadata, followed by updating enrolled devices' endpoint configuration.
Do not automatically promote a replica into a competing hub. Preserve pending
operation identities through recovery. Sync propagates deletion/corruption and is
not a substitute for a separate backup. Process-crash evidence does not establish
power-loss durability.

## Implementation sequence

Use these milestone IDs as the implementation work list. Keep the plan stable
while implementation progress is tracked separately. Each milestone needs its
own observable behavior and evidence; interface polish alone does not complete
the onboarding outcome.

### M1 — Freeze identity and project contracts

- Specify IDs, public/private records, canonical harness names, session aggregation,
  invitation transaction states and recovery behavior; resolve the explicitly
  proposed policy choices above.
- Choose supervisor/runtime process layout and versioned storage boundaries.
  Preserve one writer per replica and safe concurrent client startup.
- Define API author binding under the trusted-replica model and enumerate every
  admission route. Review bootstrap, project membership and offline revocation.
- Define schema/version rejection. Incompatible installations stay intact; fresh
  versioned storage is acceptable. Do not migrate or delete existing user data.
- **Done:** reviewed contracts and negative scenarios make identity, access and
  restart behavior unambiguous before UI work depends on them.

### M2 — Local identity, client and multiple projects

- Implement the private identity/device/project registry and supervisor, building
  on [local-service.js](../lib/local-service.js), [cli.js](../lib/cli.js) and existing
  atomic persistence conventions. New focused modules should own these concerns.
- Add idempotent create/list/open flows, project-scoped discovery, lifecycle and
  request routing, and the switcher in the browser client.
- **Done:** Alice creates two projects, switches between them, restarts offline,
  and sees the correct saved data, identity and independent sync status in each.
  Concurrent launches do not create duplicate identities, writers or projects.

### M3 — Bind authenticated sessions to Actors

- Extend Actor schema and operations with human/harness relationships and stable
  cross-device registration. Introduce browser/agent grants and automatic local
  bootstrap opening. Update CLI and WebSocket authorization consistently.
- Remove arbitrary author selection from the normal UI; retain a separate Actor
  filter. Preserve explicit history authorship and read-receipt isolation.
- **Done:** Alice opens as Alice, Alpha writes as Alpha, and a changed request
  Actor cannot impersonate Bob. Model/name/device changes preserve Actor identity.
  Setup failures do not strand an apparently ready but unauthenticated board.

### M4 — Invite humans, agents and owned devices

- Implement persistent purpose-bound grants, redemption/retry/revocation, separate
  replica admission and the short versioned setup entry point.
- Build the three Invite flows and connect their setup receipts to the client
  registry. Reuse rather than replace existing installations.
- **Done:** Bob and Gamma join from a fresh machine; Alice links a second device;
  Alpha remains one Actor. Expired, replayed, interrupted and concurrently
  redeemed invites have documented outcomes without leaking credentials.

### M5 — Report session presence, models and focus

- Add authenticated ephemeral session transport and the minimal agent reporting
  interface. Define activity transitions and heartbeat expiry for humans/agents.
- Add compact accessible avatars, per-task focus markers and detailed profiles.
  Presence needs non-color labels; kind and presence must remain distinguishable.
- **Done:** Alpha can be active on two tasks from two machines with one Actor
  identity. Its sessions show their actual reported models. Idle, disconnect,
  crash, reconnect and project switching produce no stale or cross-project focus.

### M6 — Complete shared editing and the screen-share flow

- Exercise saved changes across real local replicas, including concurrent edits,
  open drafts, conflict resolution and retries. Repair any uncovered gaps.
- Make the opened project, current human identity, participants, Invite and save/
  sync state obvious without exposing setup internals. Keep the board readable
  at normal screen-share sizes and place detailed profile data behind the avatar.
- **Done:** Alice and Bob can follow the walkthrough without a credential file,
  arbitrary Actor picker, large pasted script or provider configuration.

### M7 — Recovery, regression and qualification

- Finish device loss/revocation, export/fresh-install restore and hub replacement
  procedures, with behavior-level checks against the acceptance scenarios below.
- Update [README](../README.md), [CLI](PARDNER-CLI.md), [LAN](PARDNER-LAN.md),
  rehearsal instructions and feature-map coverage to distinguish shipped behavior
  from future guarantees. Keep screenshots and evidence free of credentials.
- Run the required routine checks and deliberately requested milestone
  qualification on the final candidate. Record remaining manual evidence gaps.
- **Done:** the entire onboarding path works and the existing persistence, sync
  and delivery acceptance guarantees still hold; no partial milestone is labeled
  complete because its own UI is working.

## Acceptance scenarios

| Scenario | Expected observable result |
| --- | --- |
| Fresh Alice setup through Alpha | Local board opens as Alice; Alpha registered; no manual token lookup; no fabricated active state |
| Missing Git config or changed Git email | One explicit profile setup when needed; later changes never silently fork or link identity |
| Alice creates and switches projects | Separate data/membership/credentials; correct drafts and pending requests after switching and restart |
| Bob joins through Gamma | Bob chooses/initializes his own identity; both Actors visible; Bob owns a local persisted replica |
| Carol joins with the same Git email as Bob | Distinct identities until an authorized device/identity linking flow proves otherwise |
| Another Alpha session or device | Existing Alpha reused; per-session model/device details; same avatar can appear on two tasks |
| Beta joins Alice's project | Different harness yields a distinct Actor without invoking a provider |
| Human/agent author spoof attempt | Supported APIs reject Actor/principal mismatch, including presence, receipts, claims and WebSocket access |
| Invite response lost or setup killed | Same attempt resumes; one enrollment, intended Actors and replica; unchanged credential material recovered only by its recipient |
| Expired/revoked invite or device | Clear refusal and recovery path; no partial access; old history remains attributed |
| Activity, idle, crash and reconnect | Three presence states follow actual observations; stale focus expires; renewed observations restore presence |
| Alice and Bob save different fields | Both edits preserved and propagated after persistence; no keystroke co-editing implied |
| Same-field saves or comment edit/delete | Authored alternatives/history preserved according to existing semantics; explicit resolution; drafts retained |
| Lost save response and retry | Same operation identity/payload yields one effect; never sent to the newly selected project |
| Relay/hub outage and local restart | Enrolled data reopens; acknowledged changes remain; pending sync shown; new enrollment/leases unavailable |
| Runtime or disk failure in one project | No false save/ready indication; other projects stay usable; acknowledged data survives covered restart cases |
| Screen-share walkthrough | Invite secrets hidden by default; avatars legible; current identity/project obvious; no secrets in artifacts |
| Fresh-install restoration | Documented content, identity and credential inputs reproduce the promised local/reconnect behavior |

## Verification and completion evidence

This is guidance-only work. For this plan, check local links, paths, persona
consistency and the diff; do not start services or run regression suites.

For future implementation, use the [verification skill](../.agents/skills/verify/SKILL.md)
and update its feature coverage for the scenarios above. Select Node **24.11.1**
for every command. Prepare matching dependencies, the UI build and pinned
Chromium/WebKit as required by the [acceptance contract](PARDNER-ACCEPTANCE.md)
and [LAN guide](PARDNER-LAN.md).

- Run affected `npm run test:runtime`, `npm run test:qualification`,
  `npm run test:cli` and `npm run test:ui`, then `npm run verify`.
  `test:qualification` is a focused routine regression suite, not the deliberate
  20-seed milestone gate.
- If server/runtime/persistence files change, use the
  [lifecycle model skill](../.agents/skills/verify-lifecycle-model/SKILL.md), review
  the implementation mapping and run `npm run verify:model`. Record model bounds.
- Enrollment, admission, storage and recovery changes create a milestone
  qualification obligation: deliberately schedule
  `npm run test:acceptance -- --repeat 20 --seed 1` against the final candidate.
  Do not recommend milestone completion/merge until that obligation is satisfied.
- Preserve existing measured acceptance limits and retry/idempotency assertions.
  Do not weaken them to accommodate the new supervisor or setup path.
- Inspect desktop and companion browser layouts with pinned Chromium and WebKit.
  Record actual LAN reachability and skips; loopback success is insufficient.
  (The companion is now the client's opt-in phone listener; see the
  [phone companion guide](PARDNER-LAN.md) for its checks.)
- Rehearse Alice/Alpha and Bob/Gamma on separate machines, then Carol/Delta, using
  actual existing agent harnesses. Record the real interactions separately from
  deterministic workers; automation does not prove a real-agent rehearsal ran.
- Record screenshot readability, setup failures and successful recovery. Do not
  claim startup timing or success rates without measured evidence.

No implementation, service restart, new replica, benchmark, provider setup,
external message or publication is part of preparing this plan. Existing running
workspaces and private invitations remain untouched.
