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

## Invite and join

The board's **Invite** menu offers:

- **Human:** another person creates or reuses their own identity and joins with
  their local client and setup agent.
- **Agent:** another execution harness works for the inviting human. Sessions
  and devices of the same human/harness share one Actor.
- **My device:** another of the inviting human's machines links to that identity.

Human and My device invitations are used by a client on another computer, so they
need a route other computers can reach. A client started without `--public-url`
refuses to issue them with `PUBLIC_URL_REQUIRED`: the message names the loopback
address the invitation would have carried and says to restart the client with
`pardner client serve --public-url <https origin>`. On a joined computer the
invitation is issued by the hub, so the message asks for the hub's client to be
restarted. Agent invitations stay available without `--public-url`, for an agent
on the same computer. An explicit `--public-url` is always honoured, including a
loopback relay or test gate (see
[Connectivity and recovery boundaries](#connectivity-and-recovery-boundaries)).

The default dialog shows purpose, project, expiry and state. **Copy invite** copies
a short setup prompt and private versioned enrollment data. The credential stays
out of the page until deliberately revealed. The receiving agent uses a trusted
onboarding-preview checkout; this flow does not assume a published npm release.
The Join form accepts either the complete prompt or the raw invitation.

During a hub outage the dialog's invitation list says it couldn't load and offers
**Retry**; it raises no alert until the person acts. Creating an invitation then
fails under the heading "The project's hub is unreachable", which explains that a
joined project's invitations are issued by its hub, the computer of the person who
started it.

For an agent-managed join, save the invitation in a private file and use a stable
operation ID:

```sh
node bin/pardner.js client join \
  --invitation-file /path/to/private-invitation --operation-id join-shared-board
```

Start the receiving client first. For a Human invitation, confirm its own identity
before joining. My device and Agent invitations prove the existing relationship;
do not initialize a conflicting new identity first. In the browser, the identity
step offers **Link this device instead**, which accepts only a My device
invitation and adopts the inviting identity; Human and Agent invitations pasted
there are refused before any request. If a response is uncertain, retry the same
operation ID and unchanged invitation. Recipient proof and setup progress are
stored privately so a retry does not consume another invitation. The authority
validates a recipient before binding an invitation to them, so an attempt it
rejects (for example the wrong person pasting a My device invitation) leaves the
invitation usable by its intended recipient. A revocation that lands while an
enrollment is still registering its Actors wins; the recipient receives
`REVOKED` and no admission activates.

If no connection can be made to an invitation's loopback address, joining fails
with `INVITATION_UNREACHABLE`. The error names the address and says it belongs to
the computer that created the invitation, which is the only place it works; ask
for a new invitation from a client started with `--public-url`. Retrying cannot
help from another computer, so the error does not suggest it. A hub that answers
as down (a gateway error page or a 5xx response), or an HTTPS address that does not
answer, is a temporary outage: joining fails with `HUB_UNAVAILABLE`, and retrying
the same operation ID later is safe.

Revoking a member or device ends that admission permanently. The same identity
cannot be re-admitted by a new Human invitation, and a revoked device is not
re-linked by a later My device invitation into the same local project entry.
Recovery after revocation means a fresh client directory and new invitations.
Re-linking revoked devices in place is tracked as follow-up work.

When another harness joins an existing client, supply its actual metadata on
`client join`, for example `--harness anthropic-claude-code --name Gamma --model
claude-opus-5-5 --managed-by T3`. It becomes a separate Actor for the same human;
the original setup agent, project and persisted runtime remain. A later
`client agent-grant` or `client operation` can select that enrolled harness with
`--harness`. Selecting a harness that has not enrolled on this device fails.
Private grants include that harness's configured model and manager when known.
These are reporting defaults, not proof of the active model: agents must report
their actual current model when opening or updating a presence session.
An agent-only client cannot issue a human browser launch; it uses its scoped
agent grant to read and edit the board.

The CLI can also issue invitations through `client invite --project ID --purpose
human|agent|device --output-file FILE --operation-id ID`. It writes the private
artifact to the chosen file and prints only the summary and file path. The same
`PUBLIC_URL_REQUIRED` refusal applies, and no file is written.

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
containing a loopback address works only on the originating machine, which is
why Human and My device invitations need `--public-url`. The option does not provision a relay, publish the client or establish
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
5xx (including `SERVICE_STOPPING`) all count. Only an explicit `AUTH_REQUIRED` or
`REVOKED` answer revokes local membership.

Before a local save on a replica, the client confirms with the hub that the
writing Actor is still admitted (`/policy`, bounded by a 3 s timeout). A positive
answer is reused for 10 s per project and Actor; each reuse starts at most one
background check, so a slow hub does not hold up the save. Once that answer is
older than 10 s the save waits for a fresh check, except while the project
runtime reports the hub disconnected: then the last positive answer stands and
the save is not delayed. With no earlier positive answer the hub is asked as
before, and an outage still allows the local save. The window this opens is
bounded: a revocation is enforced from the first check that observes it, which
for an Actor writing continuously is the next background check, and otherwise is
at most 10 s after the last positive answer while the hub is reachable. A write
accepted in that window is saved locally but its Actor's synchronization still
depends on the hub, which checks the device credential on every sync and
delivery call. Revoking from this computer clears the cached answers for that
project, and issuing an agent credential (`agent-grant`) always checks the hub.

A project runtime that fails
to start is reported as `LOCAL_SERVICE_UNAVAILABLE` and is not restarted again
for 5 s, so polling cannot fork it repeatedly; a runtime that crashes after
starting is restarted on the next authenticated request. Native replicas remain
trusted full document writers, so API author binding is not a signature on
arbitrary synchronized changes.
Revocation cannot erase an offline device's already received data.

Keep the complete private client directory for recovery: registry and sidecars,
project directories, metadata, credentials and delivery state. Stop the client
before a cold backup and keep only one restored copy active. Synchronization is
not a backup. External files referenced by tasks need their own backup. Existing
standalone `.pardner` installations are preserved; use a fresh client directory.
Use the [client recovery procedures](PARDNER-CLIENT-RECOVERY.md) for private
content export, complete cold backup/restoration, owned-device revocation and
authority replacement at the same address. Qualification and real-agent rehearsal
remain separate evidence. Process-crash checks do not establish power-loss durability.
