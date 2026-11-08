# What Pardner can learn from Kortix

[Kortix](https://kortix.com/) ("CompanyOS") is a platform for running many
agents on behalf of a company. A project is a git repository whose
`kortix.yaml` manifest declares the agents, what each may use, triggers and
sandboxes. Each session runs in its own disposable sandbox on its own branch
and lands work as a change request that a person reviews. It is a cloud-first
product with a self-hosted Docker Compose option, not a local-first one, and it
is much larger than Pardner. This document records what it does well, where
Pardner already goes further, and which ideas are worth keeping in mind. It
describes product direction, not implemented behaviour; the
[README](../README.md#current-implementation) and the
[acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for what
Pardner guarantees today.

This is a research record only. No feature work is planned from it; the
candidates at the end are recorded so a later decision can start from them.

Kortix is licensed under the Elastic License 2.0, with a separate white-label
licence tied to a compute provider. Some third-party listings describe it as
Apache-2.0; the repository's `LICENSE` says otherwise. Ideas and interface
conventions may be borrowed; code may not be copied into Pardner.

Observations below come from the `kortix-ai/CompanyOS` repository at commit
`f41338e` on `main` (`VERSION` 0.15.2), its `MANIFESTO.md`, the
[Introducing Kortix](https://kortix.com/markdown/blog/introducing-kortix.md)
post and the first part of [llms-full.txt](https://kortix.com/llms-full.txt),
read on 2026-11-08. Marketing claims were checked against source where this
document relies on them; the source references below are paths in that
repository.

## Where the two projects overlap

| Concern | Kortix | Pardner |
| --- | --- | --- |
| Source of truth | A git repository per project; session state lives in the sandbox and is mirrored to a database for the UI | An Automerge replica owned by each local service |
| Unit of work | A session: one branch, one disposable sandbox | A task, never larger than a branch, inside veins toward goals |
| Landing work | A change request; an agent may not merge its own without an explicit grant | Commit evidence; execution, independent check and human acceptance recorded separately in the Control pane |
| Goals | Done criteria, an owner session that reports evidence, a separate verifier session, daily wake caps | Veins get verdicts; goals are closed deliberately; a vein is flagged ready for a verdict when its tasks end |
| Identity | Users, groups, roles and per-agent grants; session tokens are bound to a session | Actors separate from replicas; shared-secret admission with flat permissions |
| Credentials | Brokered on the server; the sandbox holds handles, not secrets | Agents hold their own credentials; Pardner stores none for external services |
| Offline | None; the hosted or self-hosted control plane is required | The core differentiator |

Pardner's differentiators are offline work, merge semantics and the delivery
contract. Nothing in Kortix challenges them. Its strengths are in governance:
who may do what, which actions wait for a person, and how that is recorded.

## Lessons worth keeping

### 1. Separate doing work from landing it, and enforce it

Kortix's sharpest rule is that an agent may work freely inside its sandbox but
may not land the result. Merging a change request needs the
`project.gitops.merge` permission, checked for the person's role and again for
the agent's grant. A session may not merge a change request it opened unless
the manifest grants merge explicitly; the refusal names the grant it would need
(`CR_SELF_MERGE_REFUSED`, `apps/api/src/projects/change-request-policy.ts`,
`apps/api/src/projects/routes/change-request-actions.ts`). The origin session is
bound from the credential, never from the request body.

Pardner already draws the same line in prose. The CLI guide says "a person then
records the vein's verdict", goals are closed deliberately, and the Control pane
requires human acceptance from a human Actor. In the workspace, however, the
rule is a convention: vein and goal status changes are validated against the
status list, not against the Actor's kind.

What to keep in mind:

- Treat "ends a task", "records a vein verdict", "closes a goal" and "accepts
  work" as distinct capabilities, not one write permission.
- When the shared-secret model gives way to capabilities, these are the first
  candidates for grants that agents do not hold by default.
- Until then, the Control pane's honest wording is the model: the human-Actor
  rule keeps records consistent but does not authenticate the person.

### 2. No agent may widen its own grant

Kortix records a real incident in a comment: an agent holding both
`project.agent.write` and `project.gitops.merge` merged a change request that
raised its own grant to `all`, and another granted itself a secret outside its
list. The fix is a non-escalation rule: any write to an agent's grant may only
add what the writer already holds, removing is always allowed, and a merge that
changes agents or triggers needs the same permission as the direct route
(`apps/api/src/iam/agent-grant-ceiling.ts`). A short list of actions is never
grantable to agents at all: minting credentials, moving money, deleting the
project (`HUMAN_ONLY`, `packages/shared/src/workspace-actions.ts`).

What to keep in mind:

- Pardner's Control pane keeps authorization changes on the local loopback
  page. That is the same idea expressed as a place rather than a rule; it
  should survive any move to finer-grained authorization.
- If Actors ever gain grants, the rule "you can only grant what you hold" and a
  small fixed set of human-only actions are cheap to state and hard to retrofit.

### 3. Goals with explicit done criteria and an independent verifier

A Kortix goal has one to eight done criteria. The owning session reports each
criterion met with an evidence file under the goal's `evidence/` folder, and
may ask for verification only when every criterion has both. A verifier session
then records a verdict that must cover each current criterion exactly once.
Automatic wakes are capped per day, a goal waiting on a person wakes only to
chase after a bounded delay, and a blocked goal shows the one control that
unblocks it (`apps/api/src/projects/goals/rules.ts`).

Pardner's goals are deliberately lighter: a goal is a state a vein pursues, and
a person decides when it is achieved. The Control pane already separates
execution, independent check and human acceptance for a run.

What to keep in mind:

- Done criteria on a goal would make "ready for a verdict" checkable rather
  than inferred only from task endings. Each criterion with an evidence link
  fits Pardner's existing commit evidence.
- "A verdict covers every current criterion exactly once" is a precise rule
  worth borrowing if criteria are ever added, including when criteria change
  concurrently on two replicas.
- Pardner must not adopt Kortix's implication that a verifier closes the goal.
  A proven vein never closes a goal on its own, and that should stay.

### 4. One three-way policy for consequential actions

Each Kortix connector tool is matched by name or pattern and set to
`always_run`, `require_approval` or `block`
(`packages/manifest-schema/src/policy-sets.ts`). Malformed rules are rejected on
save, because "a never-matching `block` rule is an outage-shaped security hole"
(`packages/manifest-schema/src/policy-rules.ts`). Messages between sessions can
also be held for approval.

Pardner has narrower versions of this: Control-pane holds, version holds and
per-thread task and sender authorization.

What to keep in mind:

- If Pardner grows more actions with external effects (bridge dispatch,
  cross-Actor mentions that create delivery leases, outbound integrations),
  one vocabulary for run, ask or refuse is clearer than a separate hold for
  each feature.
- Validate policy at write time. A rule that silently never matches is worse
  than no rule.

### 5. One inbox for everything waiting on a person

Kortix's Review Center gathers change requests, held connector calls and agent
submissions into one per-project queue, with each kind keeping its own table
and an adapter producing a common item (`apps/api/src/projects/review-items.ts`).

Pardner has the same kinds of item spread over several views: unresolved
same-field alternatives, veins ready for a verdict, Control-pane runs awaiting
an independent check or human acceptance, and held threads.

What to keep in mind:

- A single "needs a person" view, built from existing records rather than a
  new store, is probably the most visible improvement this comparison
  suggests.
- The adapter shape matters: each source keeps its own authority and
  semantics, and the inbox only reads them.

### 6. Credentials as handles, with refusals that say why

Kortix agents never hold connector credentials. The sandbox receives signed
handles; the broker swaps them for real secrets on outbound calls and logs
each call. A refused handle is classified as `forged`, `stolen` or
`host_denied`, because "collapsing them into 'not substituted' is how a live
credential-theft attempt becomes indistinguishable from a misconfigured host
list" (`apps/api/src/secrets/handle-substitution.ts`).

Pardner holds no third-party credentials and should not start doing so for its
own sake. Its agent credentials are Pardner credentials, kept private per agent.

What to keep in mind:

- If the bridge or a future adapter ever makes external calls for an agent, a
  broker in the local service is the right shape, and it fits the existing
  boundary that external side effects need their own idempotency.
- Classify refusals by cause in Pardner's own errors too. A stale revision, an
  unauthorized Actor and an unknown Actor are different incidents.

### 7. Audit records name routes, not paths

Every Kortix request is audited under the matched route template, never the raw
path, because a path can carry an id or a link token
(`apps/api/src/middleware/audit.ts`, `apps/api/src/shared/audit-scope.ts`).
Actions use a `domain.resource.verb` naming scheme and can be filtered by
prefix, exported and streamed.

Pardner already keeps its one-time client sign-in credential in the URL
fragment, which the browser clears, and keeps no request log. WebSocket
tickets travel in the query string.

What to keep in mind:

- If Pardner adds request logging or an audit export, record route templates
  and never query strings, so tickets and invitation secrets cannot land in a
  log.
- A consistent action name scheme would make Pardner's activity and history
  easier to filter, without changing what is recorded.

### 8. Resuming lost work elsewhere is a named action

Kortix lists "continued lost session on a new computer" as an action of its
own. Pardner's separation of Actor and replica already supports an Actor
picking up a task from another machine, and does so offline. Naming that as a
user-facing flow, rather than leaving it implicit, would show off a real
strength.

## Where Kortix's choices would be wrong for Pardner

- **Git as the coordination store.** "Only committed, merged work survives"
  suits code but would serialize tasks, comments and presence behind merges.
  Automerge's different-field merges are the better fit; git stays evidence.
- **Disposable cloud sandboxes as the default.** They conflict with offline
  reopen of enrolled replicas. Local worktrees per task give similar isolation.
- **Permissive starter defaults.** The starter manifest grants its `worker`
  agent `"*"` for tools, skills, connectors, secrets and permissions, which
  includes merge. A project that declares no agents runs ungoverned, with the
  launcher's authority minus the human-only actions
  (`packages/starter/templates/base/kortix.yaml`,
  `apps/api/src/iam/agent-principal.ts`). The careful merge rules apply only
  once someone narrows the grant. If Pardner adopts capabilities, the default
  should be the narrow one.
- **Dashboard edits that commit straight to the default branch.** Kortix makes
  this exception to its own review rule. Any Pardner equivalent should be
  attributed and visible in history like every other operation.
- **A required control plane.** Kortix needs its API for every action. Pardner
  requires its hub only for enrollment and new delivery leases, and that
  boundary should not move.

## Candidates if this is revisited

None of these is scheduled.

1. Distinguish ending a task, recording a vein verdict, closing a goal and
   accepting work as separate capabilities in the authorization design.
2. Optional done criteria with evidence links on goals, and a verdict rule that
   covers each current criterion exactly once.
3. One run, ask or refuse vocabulary for actions with external effects.
4. A read-only "needs a person" inbox over existing records.
5. Route templates, not paths, in any future request log or audit export.
