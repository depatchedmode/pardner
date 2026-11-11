# Local client onboarding preview

The client owns your local identity and a separate persisted runtime for each
project. Its browser opens through a private one-time link, so starting a project
does not require finding or pasting an API key. This is the onboarding preview
for [issue #109](https://github.com/depatchedmode/pardner/issues/109), with the
[implementation contract](PARDNER-ONBOARDING-CONTRACT.md) and original
[plan](PARDNER-ONBOARDING-PLAN.md) tracked separately.

## Start and open

Use Node 24.11.1 and a trusted checkout containing the client commands. Prepare
the root and UI dependencies, then build the UI:

```sh
npm ci
npm ci --prefix ui-prototype
npm run ui:build
```

Open Pardner with its setup agent's actual harness and name:

```sh
node bin/pardner.js open --harness openai-codex --name Alpha --managed-by T3
```

`pardner open` (or a bare `pardner`) reuses the client service already running for
its data directory. If none answers, it starts a detached `client serve` with the
same setup flags, waits up to 15 s, and logs to `client.log` (mode 0600) in that
directory. The directory is the per-user `~/.pardner/client` unless you pass
`--data DIR`; every client command accepts the same `--data`. A port that answers
but is not this client reports `PORT_IN_USE`; nothing is stopped. Stop the
service with `pardner client stop`, which uses the operator-only shutdown route on
the loopback surface and waits until the directory is released. An agent or
supervisor can still run the service in the foreground:

```sh
node bin/pardner.js client serve --harness openai-codex --name Alpha --managed-by T3
```

Supported harness IDs are `openai-codex`, `anthropic-claude-code` and `cursor`.
Supply `--model` when the agent knows its active model. T3 is management metadata,
not an execution harness.

`open` launches a short-lived, one-time browser link without printing its
credential. The UI clears the fragment and remembers an HttpOnly session cookie.
If a platform has no supported browser launcher, `--output-file FILE` writes the
private launch URL for the local operator. Normal command output has no grant.
The local client is the only way people open the board; the standalone
`pardner serve` is an agent and integration service and serves no board.

Confirm the profile suggested by the local Git configuration. Git name and email
are profile defaults, not proof of identity; Pardner generates the identity and
does not edit Git settings. Start a project or join one. The setup agent becomes
an Actor with the first project. Registration alone does not show it as active.

One client can switch between projects. Each project retains its own runtime,
storage, participant identity and save/sync status. The browser has no separate
Automerge database and needs its local client service to stay available.

## Machine key and project records

The first `client serve` creates `machine-key.pem` (mode 0600), an Ed25519 key
that makes this directory one machine. `client status` reports its machine ID as
`device.machineId`. The key itself is never shown or given to a browser or agent.
Later starts load the same key. A key that is missing, unreadable, linked,
readable by others, or from another directory stops the client with a clear
error. Pardner never creates a replacement key for an existing directory.

**Start a project.** The client signs a `project.genesis` record that names you
as owner and certifies this machine. The project ID is derived from that record,
so the ID alone verifies it. A retried create reuses the saved genesis and gets
the same ID.

**Records in the project.** The project document holds signed membership records
in a map keyed by record ID. Each project directory also has a grow-only record
store, `records.sqlite`. On load and after every document change, the project
runtime verifies new records and saves the valid ones before using them. It then
writes back any stored record the document lacks, so a deleted record still
counts and returns to other peers. A record is stored if it is this project's
genesis, or if its signature verifies under a machine key that another stored
record certifies. The membership computed from the store then decides what each
record grants, so an unauthorized record is kept but has no effect. A record from
a machine the store already holds as removed is refused (enforced from arrival).
A record that arrives together with that removal, as a whole log does for a
newly joined replica, is still stored, so an admin's earlier admissions stay.

`client show --project ID` includes the membership computed from the store,
read-only: `people`, `machines`, `agentNames`, removals, `storedRecords`, and
`notStored`. `notStored` lists records seen in the document but refused, with
the reason; it lasts until the project runtime restarts. `rejected` lists stored
records that have no effect.

Membership records now decide who is admitted, as described below: each approved
join writes a `member.add` or `machine.add`, each machine names its agents with
`agent.name`, and removals and role changes are records. Every new record enters
through one gate in the hub's project runtime, which applies the arrival rule:
a removed machine, or a signer without the role a record needs, cannot add new
records. History that arrives by sync is harvested without that check, so a new
replica keeps a removed admin's earlier admissions.

Directories made before machine keys are refused, whether a client directory
without `machine-key.pem` or a storage directory with an earlier schema. They are
left byte-for-byte unchanged and are never migrated. Start Pardner with a fresh
`--data` directory.

## Invite and join

The project's hub is the client that created it. It is the enrollment point: it
keeps invitations and join requests in its registry and records every admission.

The board's **Invite** menu offers:

- **Human:** another person joins with their own identity, their local client and
  setup agent. Only the owner or an admin can create one. The owner chooses the
  role (member or admin); an admin offers only the member role.
- **Agent:** another execution harness works for the inviting person.
- **My device:** another of the inviting person's computers links to that
  identity. The owner or an admin can also create one for another person, for
  someone who lost every computer.

An invitation holds an offer signed by the issuing machine (project, offer ID,
purpose, role or person, the hub's enrollment route, expiry) and a one-time
secret. It expires after 24 hours. The default dialog shows purpose, project,
expiry and state. **Copy invite** copies a short setup prompt and the private
invitation. The invitation stays out of the page until deliberately revealed.
The receiving agent uses a trusted onboarding-preview checkout; this flow does
not assume a published npm release. The Join form accepts either the complete
prompt or the raw invitation. Invitations from earlier Pardner versions are
refused with a request for a new one.

### Waiting for approval

A new machine sends a join request to the hub: its new machine key, the person it
joins as, its device name and setup agent, signed by that key and keyed with the
invitation secret. The hub stores the request before anything else happens. At
most 5 requests wait on one invitation, and 20 are kept in any state. A request
expires 30 minutes after the hub stores it, or when its invitation expires,
whichever comes first. A join that cannot succeed, from a removed machine, a
removed person or someone already in the project, is refused before it takes a
place, so the invitation stays usable.

Until it is approved, the joining machine receives nothing from the project. The
browser shows **Waiting for approval**; `client join` reports `{ join: { state,
requestId, code, … } }` and is run again with the same operation ID to continue.

**Confirmation code.** When the approver opens the request, their client adds a
fresh random nonce. Both sides then derive the same eight-digit code from the
offer, the joining machine's public key and that nonce, and each derives it
itself. The approver compares the codes face to face or by voice, ideally not over
the channel the invitation came through, and approves only on a match. Approving
with any other code is refused. If two waiting requests on one invitation show the
same code, both are rejected. A stranger holding a leaked invitation gets one
guess per approval, with probability 10⁻⁸ of matching.

**Approval.** The approving machine signs the admission: `member.add` for a new
person or `machine.add` for a new machine, holding the offer, the request and the
nonce. The hub checks expiry and single use at that moment, records the admission
and the joining machine's own agent label through its gate, and only then issues
that machine's sync credentials. The joining client then finishes on its next
retry. The invitation is used up; other waiting requests on it are rejected. An
admin on another computer approves the same way: their own machine signs, and the
hub records it.

The **People** panel (below) lists join requests, with their codes, to everyone
who may approve one: the owner and admins for new people, and the person's own
machines, the owner or an admin for a new machine. The header's **People** button
counts the requests waiting for this machine. Each request shows the name, email
and device, or, for a new machine, whose identity it joins (#155). A new person whose name or email matches
a member is flagged, in case it is that member's second computer. Pairing never
creates a second person.

### Joining from the CLI

```sh
node bin/pardner.js client join \
  --invitation-file /path/to/private-invitation --operation-id join-shared-board
```

Start the receiving client first. For a Human invitation, confirm its own identity
before joining. My device and Agent invitations link to an existing person, so the
client must have no identity yet or that same identity. In the browser, the
identity step offers **Link this device instead**, which accepts only a My device
invitation and says whose identity this computer will be linked as before
anything is sent; Human and Agent invitations pasted there are refused before any
request. `--wait SECONDS` keeps polling and prints the code to stderr when it
appears. If a response is uncertain, retry the same operation ID and unchanged
invitation. The request and its proof are stored privately, so a retry never uses
another place on the invitation.

The approver lists requests, which also adds their nonce, and approves with the
code the joining person reads out:

```sh
node bin/pardner.js client requests --project ID
node bin/pardner.js client approve --project ID --request REQUEST_ID --code "1234 5678"
node bin/pardner.js client reject --project ID --request REQUEST_ID
```

### Agents

Agents run under their machine's key. An Agent invitation joined on a computer
that is already in the project needs no approval: that machine signs an
`agent.name` record for the harness, and the hub records it through its gate.
Supply the agent's actual metadata, for example `--harness anthropic-claude-code
--name Gamma --model claude-opus-5-5 --managed-by T3`. It becomes a separate Actor
for the same person; the original setup agent, project and persisted runtime
remain. A later `client agent-grant` or `client operation` can select that harness
with `--harness`. Selecting a harness that has no label on this machine fails.
Private grants include that harness's configured model and manager when known.
These are reporting defaults, not proof of the active model: agents must report
their actual current model when opening or updating a presence session.

An Agent invitation used on another computer pairs that computer as a new machine
of the person, for their agents only: it is approved like a new device, and the
hub never lets it act as the person. An agent-only client cannot issue a human
browser launch; it uses its scoped agent grant to read and edit the board.

### The People panel

The header's **People** button opens a panel built from this machine's own
membership records, so it opens offline; the hub checks every action again when
it is taken. Roles decide only who may let people in or remove them: every member
may change anything on the board. The panel shows:

- **Counts** of people, machines, agents and removed entries in its heading.
- **Each person:** their role, email and who let them in (or that they started
  the project); their machines, with **This machine**, **Hosts the project**,
  **Agents only**, and online or last seen where the hub knows it (the hub keeps
  this in memory, so it resets when the hub restarts); and their agents with the
  machines they run on. A machine's short ID tells apart machines with the same
  name; a machine paired after its person joined says who paired it.
- **Waiting to join:** join requests with the confirmation code, **Approve** and
  **Reject**, as above.
- **Removed:** people and machines removed from the project, with who removed
  them or that the person left, distinct from offline (#175). The board's avatar
  stack no longer lists a removed person, and their profile says they were
  removed; their earlier work keeps their name.
- **Invitations:** newest first, with what each was for, who issued it and when,
  its state, and who used or revoked it. It shows ten at a time, up to the newest
  fifty, refreshes while open, and offers **Revoke** for unused ones (#183). The
  Invite dialog shows the same history.

Actions appear only to people who may take them, with a short reason where one is
not available on a particular entry:

| Action | Who sees it |
|---|---|
| Invite someone (the owner chooses member or admin) | Owner and admins |
| Pair another machine | Everyone, for themselves |
| Pair a machine for someone else | Owner; admins for people who never held admin |
| Remove a machine | The person's other machines; the owner; admins for people who never held admin |
| Remove a person, invite a removed person again | Owner; admins for people who never held admin |
| Make admin / Make member | Owner |
| Edit name and email | Each person, on their own entry |
| Stop an agent here (**Stop here**) | Each person, for their own agents running on this machine |
| Leave project | Everyone but the owner |

Nobody but the owner is offered controls on the owner's entry. The machine you are
using can't remove itself, and the machine that hosts the project can't be
removed. Removing, changing a role and leaving each ask first, and say what loses
access, that past work stays attributed, that people the person let in stay, and
how to come back: a new invitation or pairing, used from a fresh client directory
(#152).

**Profile.** **Edit name and email** writes a `profile` record for the project,
signed by this machine, and keeps the new details as this computer's identity for
projects it starts or joins later. Every member's board then shows the new name.
Agent names given at enrollment, such as "Maya's Codex", do not change.

**Owner nudge.** The owner of a project with one machine sees a suggestion to pair
a second: if the owner loses every machine, nobody can remove or demote an admin
any more. Dismissed on the board, it stays in the panel until a second machine is
paired.

### Removal, roles, leaving and re-admission

`client revoke --project ID --kind member --id PERSON_ID` signs `member.remove`
(the human Actor ID a profile shows works too; an agent's ID is refused with
advice, and a refused ID leaves the operation ID free for the corrected request);
`--kind machine --id MACHINE_ID` (or the device ID a profile lists) signs
`machine.remove`. The owner removes anyone but the owner; an admin removes members
who never held admin; a person's other machine removes one of their machines. A
machine cannot remove itself. `client role --project ID --person PERSON_ID --role
admin|member` is the owner's alone; each change names the role record it replaces.
People an admin admitted stay when that admin is removed or demoted.

**Leaving.** `client leave --project ID` (or **Leave project** in the panel) signs
`member.remove` for this machine's own person. All of the person's machines lose
access, as with any removal, and the people they let in stay. The owner can't
leave, and an agents-only machine can't leave on its person's behalf.

Removal ends the machine's sessions at the hub at once: its sync socket closes,
its signed HTTP sessions are dropped, its presence ends, its open invitations are
revoked, and the hub refuses its handshake, its requests and new records. A removed
computer keeps its local data and export. It learns of the removal when the hub
refuses its next handshake (within a few seconds while the hub is reachable) and
then refuses further writes, also after a restart; a write saved before that stays
on that computer and reaches nobody.

**What the removed computer shows (#154).** The hub's `REVOKED` answer carries who
removed the machine and whether its person left. The project then stays listed in
`removedProjects` (`client list`, and the browser's project switcher), and the
browser shows **You were removed from “…”**, **This computer was removed from
“…”** or **You left “…”**, with who removed it, what that means, how to come back
and the export command. It never shows the signed-out screen for a removal, and it
offers no Retry: removal is permanent for that machine and person.

Removals are permanent for that machine key and person ID. A removed machine
returns as a new machine: start Pardner with a fresh `--data` directory on that
computer and pair it. A removed person returns through a new Human invitation from
a fresh client directory, and is admitted as a new person with a new person ID.
The board and `client show` then list the new person; the old person stays in
`removedPeople`, and their earlier work stays attributed to the old Actor. Joining
from the removed directory is refused with this advice before it takes a place on
the invitation.

`client revoke --kind agent --id ACTOR_ID` revokes one of this machine's own agents:
its grants and sessions here end. It writes no record. Joining a new Agent
invitation on this machine restores it.

The CLI issues invitations with `client invite --project ID --purpose
human|agent|device --output-file FILE --operation-id ID`, with `--role admin|member`
for a Human invitation and `--person PERSON_ID` for pairing someone else's
machine. It writes the private artifact to the chosen file and prints only the
summary and file path.

After creating a project, Pardner suggests pairing a second machine: if the owner
loses every machine, nobody can remove or demote admins any more.

`client people --project ID` prints the panel's facts as text: each person with
their role, who let them in, machines (with short IDs and online or last seen),
agents and person ID, then removed entries. `--json` prints the same view as data.
`client invites --project ID [--limit N] [--offset N]` lists invitations newest
first, `client revoke-invite --project ID --invite INVITE_ID` revokes one, and
`client profile --project ID --name NAME --email EMAIL` edits this person's
profile.

## Actors and presence

The authenticated session determines the author. Assignment and board filters
do not change who is acting. An agent can obtain a project-bound API credential
through the local operator's `client agent-grant --project ID --output-file FILE`.
Keep that file private; it is distinct from the operator credential and native
replica admission. Coordination commands use it with `pardner --token-file FILE
task create …` (or `mentions pending`, `show`, …): the token stays out of
arguments, `--server` defaults to the file's `apiBase`, and the agent is the
author without `--actor`. A file holding only the token works with an explicit
`--server PROJECT_API_BASE`. The [API contract](PARDNER-ONBOARDING-CONTRACT.md#browserserver-contract)
documents operation, session, report and end routes.

An avatar shows identity, human/agent kind and active, idle or offline presence.
Active means connected and reporting activity; idle means connected without
current activity; offline means no live session observed. Focus markers come
from explicit reports. Profiles show Git details, the human relationship,
devices, harness and reported per-session models. A saved edit synchronizes;
unsaved typing stays local to its draft.

Pardner supplies the coordination surface. Starting, choosing or waking an AI
agent remains the responsibility of its external app or harness.

## Connectivity and recovery boundaries

Local client HTTP listens on numeric loopback. Other machines need an explicitly
configured reachable HTTPS gateway, supplied with `client serve --public-url`.
Plain HTTP is accepted there only for a loopback origin (`http://127.0.0.1:<port>`
or `http://localhost:<port>`), such as a relay on the same machine or the
acceptance network gate; any other origin must be HTTPS. An invitation
containing a loopback address works only on the originating machine. The option does not provision a relay, publish the client or establish
network reachability. Keep the browser/operator surface private and route only
the intended enrollment and authenticated replica endpoints.

Phone access is not currently offered: the board is served only on this
computer's loopback. It is planned through the hub over HTTPS.

A reachable private network can provide a direct route to the project authority;
an HTTPS relay can connect unrelated networks. Automatic discovery, NAT
traversal and arbitrary peer mesh are not implemented. The protocol retains the
existing hub/WebSocket synchronization path. See the plan's
[connectivity decisions](PARDNER-ONBOARDING-PLAN.md#connectivity-outage-and-recovery).

Enrolled clients retain local work during a hub outage. New enrollment and
delivery leases need the authority. Remote presence becomes unavailable. Local
save acknowledgement follows the existing disk barrier; synchronization requires
the hub's acknowledgement. An outage is any failure that is not an explicit hub
decision: an unreachable address, a gateway error page, a non-JSON body or a hub
5xx (including `SERVICE_STOPPING` and a restored hub's `HUB_WAITING`) all count.
Only the hub saying this machine was removed (`REVOKED`) revokes local membership;
an authentication failure, or a hub that does not know this machine, does not.

Before a local save, the client checks its own machine's membership in its record
store: the machine must be a current member, and the writing Actor one its records
let it act as (its person unless it is agents-only, or an agent it named). Nothing
is asked of the hub, so a save never waits on it and an enrolled member keeps
saving through an outage. Issuing an agent credential (`agent-grant`) uses the same
local check. A removal reaches the check when this machine holds the record or when
the hub refuses its handshake as removed; the hub stops syncing with it from the
moment the hub applies the removal.

How machines authenticate: the replica's project runtime opens its sync socket with
the machine handshake (both machines sign a transcript of the project, both machine
IDs, both nonces, both roles and the route dialled) and accepts nothing until the
hub proves it is a member machine of the project the invitation named. The client
service and the runtime sign every other request to the hub with the machine key,
inside a short session opened the same way. The client gives its machine key to its
own project runtimes over their IPC channel only. The hub accepts the handshake only
on routes it advertised: its loopback address and each `--public-url` it has given
to an enrolled machine. Two live sync sessions for one machine (a copied directory
running beside its original) are reported in the hub's project status and status
line; they are not refused.

A project runtime that fails
to start is reported as `LOCAL_SERVICE_UNAVAILABLE` and is not restarted again
for 5 s, so polling cannot fork it repeatedly; a runtime that crashes after
starting is restarted on the next authenticated request. Other machines' requests
never wake a runtime (their first message, the handshake's hello, is not yet
authenticated), so the client restarts a hosted project's runtime by itself after
the same 5 s, and other machines see an outage until then. Native replicas remain
trusted full document writers, so API author binding is not a signature on
arbitrary synchronized changes.
Revocation cannot erase an offline device's already received data.

Keep the complete private client directory for recovery: registry and sidecars,
the machine key, project directories with their record stores, metadata,
credentials and delivery state. A backup holding the machine key is a credential. Stop the client
before a cold backup and keep only one restored copy active. Synchronization is
not a backup. External files referenced by tasks need their own backup. Existing
standalone `.pardner` installations are preserved; use a fresh client directory.
Use the [client recovery procedures](PARDNER-CLIENT-RECOVERY.md) for private
content export, complete cold backup/restoration, owned-device revocation and
authority replacement at the same address. Qualification and real-agent rehearsal
remain separate evidence. Process-crash checks do not establish power-loss durability.
