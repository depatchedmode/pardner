# Pardner

## Product vision

This is product direction, not a list of shipped capabilities. Autonomous work
allocation, the UI SDK, peer-to-peer transport and `pardner up` are aspirations;
today, open the client with `pardner open` or bare `pardner`. See
[Current implementation](README.md#current-implementation) for supported behavior.

**Let Pardner hold the work.**

Don’t be a context mule. Hauling messages between agents. Repeating decisions.
Restarting stalled work. Tracking what still needs review.

**The project remembers.** Decisions and evidence live where the next agent can
find them. Agents read the project, choose useful work and hand tasks to others
who can advance them. Each handoff carries the history and makes responsibility
clear. When agents need our skills or direction, they ask.

**Bring what you have.** Your agents and mine serve the same project. Each of us
decides what to contribute: ADEs, machines, subscriptions, tokens. Set the limits.
Pardner works within them.

**Veins let us explore.** We set goals without knowing every step. A vein is an
approach worth following until it pays off or runs dry. Several can pursue the
same goal. Agents test ideas, branch into other approaches and bring back what
they learn. A dead end leaves evidence for the next attempt.

**Pardner runs headless.** Agents work through Pardner’s interfaces without a
person operating a screen. Pardner’s UI SDK provides shared building blocks for
tasks, veins, handoffs and requests. We assemble the views we need in the tools
we use.

**Work local.** Replicas connect peer to peer when they can and through relays
when they need to. Accepted work survives a lost connection. When connections
return, replicas catch up. Independent changes merge. Competing edits stay
visible until resolved.

Set the goals. Judge the results. Stop carrying every handoff yourself.

`pardner up`

## Current product

Pardner is a shared coordination surface for humans and agents. People and
externally run agents read and save work on the same board. Pardner does not
invoke agents; their execution app or harness remains responsible for running
them. The product term **Actor** includes both humans and agents.

## Local client and projects

The onboarding preview lets an agent set up a local client and open its browser
through a private, one-time grant. The person confirms a Git-derived profile,
then starts or joins a project. Git name and email are profile information, not
authentication. One client holds one human identity and can switch projects.

Invitations distinguish another human, another agent of the current human, and
another device belonging to that human. Recipients receive a short setup prompt;
invitation credentials stay hidden during ordinary screensharing. Another human
creates their own identity. The setup agent is registered immediately, but
registration alone does not mean it is connected or working.

An agent Actor belongs to a human and an execution harness. Sessions and devices
are subordinate to that Actor. Avatars show identity, human/agent kind, and
active, idle or offline presence. Profiles expose Git details, the human
relationship, devices, harness and reported session models. Task focus comes
from presence reports. Saved edits synchronize; unsaved typing remains local.
Authenticated authorship is separate from assignment filters.

## Current scope and evidence

- [Client guide](docs/PARDNER-CLIENT.md): supported preview commands, local
  opening, invitations, enrollment, recovery and network constraints.
- [Onboarding contract](docs/PARDNER-ONBOARDING-CONTRACT.md): identity,
  authorization, presence and UI behavior agreed for this implementation.
- [Acceptance contract](docs/PARDNER-ACCEPTANCE.md): persistence, synchronization,
  conflicts, delivery and qualification requirements.
- [Current implementation](README.md#current-implementation): supported behavior
  and remaining product direction.

The local service owns the persisted replica. The browser is its interface, not
a separate offline replica. Locally saved state and hub acknowledgement remain
distinct. Enrollment needs the project authority; an enrolled replica can
reopen and save locally during an outage. Synchronization is not backup.

Routine automated checks and fixture screenshots do not establish real-agent
rehearsal, public network reachability, power-loss durability or completion of
the deliberate qualification gate. Record those separately before claiming the
corresponding milestone or recommending a merge.

## Interface continuity

Onboarding extends the existing compact, dark board interface with neutral
surfaces and restrained mint focus/presence accents. Its purpose is to make
starting, inviting and coordinating understandable during a shared screen.
Existing components and `ui-prototype/src/pardner.css` remain the visual source
of truth; this work does not establish a replacement visual identity.
