# Retrospective: agents building Pardner through Pardner

Date: 2026-11-06 UTC. Scope: the onboarding implementation for
[issue #109](https://github.com/depatchedmode/pardner/issues/109), through code
commit `874e7f37b03fb8a71683a7231d7ab6d4ab09e006` and its documentation handoff.

We delivered a local client with private browser opening, identity confirmation,
multiple projects, human/agent/device invitations, authenticated authorship,
Actor profiles and presence. The final integrated candidate passed 602 Node
tests, 17 Python tests and one acceptance scenario. Chromium and WebKit exercised
the new flow. See the [verification record](evidence/onboarding-verification.md)
for exact scope, the repaired WebSocket race and outstanding qualification.

The main coordination lesson is that we did not consistently make Pardner the
authoritative working record. We used it for assignments and durable reports,
but important answers, scope changes and integration decisions remained in T3
and the coordinator's context. This experience supports improving the operating
skill and testing that workflow before assuming a new product feature is needed.

## Whose experience is represented

This is a synthesis of six actual contributing contexts, not a claim that every
agent experienced the whole system. Beta and Gamma supplied fresh first-hand
retrospectives in their Pardner tasks. Alpha is represented by its contemporaneous
Cursor Cloud report; no fresh Alpha interview was obtained. The coordinator
supplied its own account. The two independent review agents supplied bounded
reflections on their review work. Their disagreements and limits are retained.

| Contributor | Contribution | Evidence boundary |
| --- | --- | --- |
| Alpha — Cursor Cloud | Invitations/enrollment exploration from a real cloud replica | Earlier coordination runtime; no new-client implementation or rehearsal |
| Beta — Codex through T3 | Identity, authentication, registry, child runtimes, enrollment, proxy, CLI and second-harness fix | Real automated local fixtures; no UI acceptance or public-route exercise |
| Gamma — Claude Code through T3 | Presence/UI exploration, browser flow, profiles, invitations, drafts and Chromium coverage | Its own branch and backend version; no final WebKit/full-suite run |
| Coordinator — Codex through T3 | Contract reconciliation, presence, prompt integration, recovery, integration, verification and captures | Final combined candidate; screenshot sessions were explicit fixtures |
| Finish reviewer — fresh Codex context | Nine captures, source samples and product-context review | No app operation or independent runtime tests |
| Documenter — fresh Codex context | Incumbent/source comparison and six saved captures | Visual continuity; no runtime or independent provenance verification |

The [attributed source records](evidence/onboarding-retrospective-sources.json)
contain Alpha's experiment excerpt, Beta's and Gamma's complete retrospective
comments, and the coordinator's account. They retain Pardner task/comment IDs.
Review-agent accounts are summarized below and in the coordinator's record;
those agents did not impersonate project Actors. The identically named agents
in screenshot fixtures are not these contributors.

## Contributor perspectives

### Alpha: a real cloud join made setup costs concrete

Alpha reported that the cloud environment defaulted to Node 22 while the helper
required 24.11.1. It installed the pinned runtime, installed dependencies in both
the repository and UI directories, built the UI, transferred a private enrollment
pack, checked the helper's checksum and started an enrolled replica through the
authenticated relay. It checked workspace identity, local save and hub sync
before reporting readiness.

That was real participation, but through the earlier operator-oriented tooling.
The private credential pack and expiring route credential were tangible setup
costs. Its finding that product invite/redeem commands were absent was true of
the inspected planning revision, not the implementation now in this PR.

Alpha copied its full report into its Pardner task so collaborators did not need
access to the cloud filesystem. That is a successful example of the workflow we
want. It also read Beta's and Gamma's peer reports at a review point. Its
recommendations informed purpose-bound, recipient-bound enrollment and a short,
versioned setup entry point. Publishing/installing that entry point for a fresh
environment remains distinct from implementing the preview CLI.

### Beta: bounded ownership helped; one green scenario was too narrow

Beta used Pardner to read assignments, claim work, publish findings and commit/
test receipts, and move work to review. Actor attribution and saved-local
receipts made those actions explicit. The shared contract and file ownership
helped it incorporate other contributions without editing their modules.

Its working context also came from T3 corrections, Git commits, local source and
logs. The corrections addressed real boundaries: member invite sponsorship,
presence authority, retry identity across new browser sessions and framing
headers. Beta did not use the new UI to coordinate its own work.

Beta identified its own mistakes. A forged-Host test initially used a fetch path
that did not send the intended header; switching to `node:http` preserved the
assertion. More significantly, its initial same-client agent test reused the
setup harness. It did not establish that a second harness worked. The
coordinator identified that gap, and Beta added the actual second-harness
join/grant/write/presence/delivery path with negative and revocation cases.

Beta also reported excessive output from growing task contexts and an initial
need for sandbox elevation to use the local helper. Its follow-ups emphasize
operating guidance and a real separate-machine/harness exercise. It explicitly
does not claim that its local tests qualify the public route or power-loss
durability.

### Gamma: unanswered task questions became parallel context

Gamma used Pardner for readiness, claims, progress, peer reports and review
handoff. File-backed comments with stable request identities made posting
predictable. It reported no uncertain comment retry during its work.

Its strongest coordination observation was specific: the API assumptions it
posted on its Pardner task did not receive their answers there. Answers arrived
through coordinator messages in T3, cherry-picked commits and read-only
inspection of Beta's uncommitted work. Every scope-changing instruction it
received arrived as a T3 turn. The coordinator accepts responsibility for that
split; it does not prove Pardner lacks a way to answer a task comment.

Wire details were insufficiently pinned before parallel implementation:
bootstrap path/fragment, numeric versus ISO expiry, per-session `state`, and error
codes. Before a committed backend entry point was available, Gamma tested in a
private copy containing uncommitted backend files. That helped integration but
made provenance fragile. It reported one failed run hanging in cleanup; the
coordinator did not reproduce that cleanup failure and does not claim it fixed.

The real two-client browser journey found issues missed by unit tests and the
build: a session reconnect loop, the task panel covering header controls, Escape
bubbling from dialogs and menus, incorrect expiry display and ambiguous initials.
Gamma corrected them. It also noted that its actual development activity was
visible in Pardner only through comments, not the new presence reporting.

Gamma's exploration favored validated native ephemeral forwarding; the chosen
contract used a dedicated presence API. It accepted that decision while limiting
its claims to the two-client evidence it actually exercised. That architectural
difference is preserved here rather than presented as unanimous agreement.

### Coordinator: the integration record lived too much in conversation

The coordinator reconciled dependencies, preliminary and final commits, file
ownership, integration state and verification scope across branches. Some of
that is necessary integration work. Too much of its authoritative working
picture nevertheless stayed in T3 and conversation context, with summaries
posted back to Pardner afterward.

Later preliminary handoffs arrived in this conversation after their final work
had already been integrated. Recognizing them as superseded required context
outside the immediate message. Their arrival timing is not attributed to
Pardner's delivery layer. The failure was that the current authoritative record
was not the consistent starting point for deciding what to do.

The coordinator initially moved too quickly from that friction to proposals for
new product features. Ryan challenged that inference. The existing
[Pardner harness skill](../skills/pardner-harness/SKILL.md) teaches commands,
revisions, delivery receipts and retries. It was not surfaced in the coordinator's
available-skill catalog, and it does not strongly define the coordinator's
authoritative-record loop. However, the exploration instructions already called
for Pardner coordination. Skill discovery is therefore a contributing factor,
not a complete excuse for the workflow choices.

The initial working agreement also assigned scope/decisions to GitHub and task
discussion/evidence to Pardner. The follow-up skill should reconcile that split
with the clarified intent: Pardner holds the current coordination record and
references the versioned plans, code and published review artifacts elsewhere.

Integration verification also caught a genuine product defect: an initial
WebSocket document could be lost when it arrived in the upstream upgrade packet.
A deterministic failing reproduction established the cause before the fix and
final full pass. Combining worker test counts would not have established the
final candidate's behavior. The coordinator kept fixture evidence separate from
real worker participation and left human acceptance open.

### Review agents: the packet was the interface

The finish reviewer found the bounded extension brief and captures useful and
reported no material visual defects. Two stale source paths and normalized
screenshot dimensions required clarification. Its sole requested fix was
persistent product context. After that document was added, it scored the fix
resolved; the verdict did not independently establish runtime correctness.

The documenter found the explicit baseline and instruction to preserve the
incumbent interface helpful. Large batched reads truncated output and required
narrower inspection. It confirmed continuity of the palette, controls and dialog
treatments. It reported inherited system-font headings because the generic
guidance flags them, but explicitly did not consider that alone a product defect
or reason to redesign this compact application.

The specialized review agent types were unavailable, so fresh general contexts
used the supplied fallback instructions. Both reviewers recommend a small,
accurate packet with source paths, product links, generating revision, viewport,
device pixel ratio, output dimensions and capture provenance.

## What we learned together

- **Pardner already carried valuable shared evidence.** Alpha's cloud report,
  peer comments, explicit ownership and durable receipts reduced dependence on
  inaccessible files and made contributions traceable.
- **Recording reports is not the same as coordinating from the record.** The
  unanswered API questions and T3-only scope changes are direct evidence of
  workflow drift. We have not established that fixing this requires a new data
  model, inbox or orchestration feature.
- **A contract needs wire details and version provenance.** Route names alone
  leave room for incompatible assumptions. Preliminary integration against
  uncommitted files can be useful, but needs an explicit evidence boundary.
- **Real combined journeys expose gaps.** Second-harness enrollment, browser
  event propagation and WebSocket startup were different failures with different
  remedies. Passing a narrower fixture never proved those scenarios.
- **Review scope must remain visible.** Code, browser, cloud connectivity,
  visual inspection, qualification and human acceptance are separate evidence.
  No contributor independently established all of them.

## Follow-up work

These are next steps, not additional implementation hidden in this PR.

1. **Revise and distribute the Pardner operating skill.** Evolve the existing
   skill into an effective worker/coordinator workflow and make it discoverable
   in the supported harnesses. When the user chooses Pardner, read current task
   context before coordination decisions; record ownership, questions, answers,
   scope changes, artifacts, checks and handoffs there; explicitly supersede
   preliminary handoffs. Record integration and verification against exact
   revisions. Execution-thread messages should reference those records. Include
   bounded context retrieval, workspace/Actor checks, save/sync interpretation
   and unchanged-request retry behavior. Preserve user authorization and keep
   credentials private. Start with the existing commands and records.
2. **Rehearse that discipline before selecting product changes.** Give a fresh
   coordinator access to the Pardner project without the original T3 history.
   It should identify the current deliverable, dependency versions, verification
   scope, unresolved questions, next responsible Actor and remaining human
   decisions. Workers should receive answers and scope changes through the same
   record. Classify any failure as missing information, unclear guidance,
   retrieval friction or an actual product limitation. Treat structured handoff
   objects and attention views as hypotheses until this exercise supports them.
3. **Complete the implementation's outstanding qualification.** Run the required
   20-seed acceptance gate when explicitly requested, exercise the new client's
   real public route with a separate machine/harness, and conduct the real-agent
   onboarding rehearsal. The older cloud coordination success is not a
   substitute. Keep the trusted native-replica boundary explicit and leave
   acceptance to the human.
4. **Make parallel implementation and review packets more precise.** Pin field
   types, errors and example responses alongside the shared contract; identify
   the committed backend candidate for UI work; run the real cross-client flow
   early. Carry a small capture manifest and exact artifact/test revisions into
   handoffs. These are procedural improvements we can test without a redesign.
5. **Validate fresh-environment setup.** Revisit Alpha's observed runtime,
   dependency, private-enrollment and route-expiry costs with the new preview
   client. Determine what packaging and diagnostics remain necessary. Do not
   claim that the current short prompt alone removes those dependencies.

The operating skill is deliberately left for a separate follow-up. This PR
preserves the completed onboarding implementation and the evidence needed to
decide what should happen next.
