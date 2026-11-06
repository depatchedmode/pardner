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

An existing agent starts the service with its actual harness and name:

```sh
node bin/pardner.js client serve --data .pardner-client \
  --harness openai-codex --name Alpha --managed-by T3
```

Supported harness IDs are `openai-codex`, `anthropic-claude-code` and `cursor`.
Supply `--model` when the agent knows its active model. T3 is management metadata,
not an execution harness. In another terminal, open the remembered client:

```sh
node bin/pardner.js client open --data .pardner-client
```

The command launches a short-lived, one-time browser link without printing its
credential. The UI clears the fragment and remembers an HttpOnly session cookie.
If a platform has no supported browser launcher, `--output-file FILE` writes the
private launch URL for the local operator. Normal command output has no grant.

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

The default dialog shows purpose, project, expiry and state. **Copy invite** copies
a short setup prompt and private versioned enrollment data. The credential stays
out of the page until deliberately revealed. The receiving agent uses a trusted
onboarding-preview checkout; this flow does not assume a published npm release.
The Join form accepts either the complete prompt or the raw invitation.

For an agent-managed join, save the invitation in a private file and use a stable
operation ID:

```sh
node bin/pardner.js client join --data .pardner-client \
  --invitation-file /path/to/private-invitation --operation-id join-shared-board
```

Start the receiving client first. For a Human invitation, confirm its own identity
before joining. My device and Agent invitations prove the existing relationship;
do not initialize a conflicting new identity first. If a response is uncertain,
retry the same operation ID and unchanged invitation. Recipient proof and setup
progress are stored privately so a retry does not consume another invitation.

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
artifact to the chosen file and prints only the summary and file path.

## Actors and presence

The authenticated session determines the author. Assignment and board filters
do not change who is acting. An agent can obtain a project-bound API credential
through the local operator's `client agent-grant --project ID --output-file FILE`.
Keep that file private; it is distinct from the operator credential and native
replica admission. The [API contract](PARDNER-ONBOARDING-CONTRACT.md#browserserver-contract)
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
An invitation containing a loopback address works only on the originating
machine. The option does not provision a relay, publish the client or establish
network reachability. Keep the browser/operator surface private and route only
the intended enrollment and authenticated replica endpoints.

A reachable private network can provide a direct route to the project authority;
an HTTPS relay can connect unrelated networks. Automatic discovery, NAT
traversal and arbitrary peer mesh are not implemented. The protocol retains the
existing hub/WebSocket synchronization path. See the plan's
[connectivity decisions](PARDNER-ONBOARDING-PLAN.md#connectivity-outage-and-recovery).

Enrolled clients retain local work during a hub outage. New enrollment and
delivery leases need the authority. Remote presence becomes unavailable. Local
save acknowledgement follows the existing disk barrier; synchronization requires
the hub's acknowledgement. Native replicas remain trusted full document writers,
so API author binding is not a signature on arbitrary synchronized changes.
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
