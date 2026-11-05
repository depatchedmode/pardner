# Issue #79: frozen qualification package

This is preparation for [#79](https://github.com/depatchedmode/pardner/issues/79),
not milestone completion. [Integrated automated qualification](PARDNER-SELFHOST79-QUALIFICATION.md)
records the scoped checker/Cloud binding and full-regression results. No provider attempt, real approval, runtime cutover or
human artifact acceptance was performed by this package. Six planned attempts and
two separately budgeted T3 crash probes start `not-run` in
[the proposed fixture](../support/selfhost79/fixture.json).

Sources reviewed: issues [75](https://github.com/depatchedmode/pardner/issues/75),
[76](https://github.com/depatchedmode/pardner/issues/76),
[77](https://github.com/depatchedmode/pardner/issues/77),
[78](https://github.com/depatchedmode/pardner/issues/78), #79 including
[the T3 crash comment](https://github.com/depatchedmode/pardner/issues/79#issuecomment-6549379418),
and [PR100](https://github.com/depatchedmode/pardner/pull/100).
PR100's scripted 39-check T3 qualification and real-provider smoke are historical
reports; neither exercised real human approval or this A/B/C acceptance sequence.
See [the control contract](PARDNER-CONTROL-PANE.md),
[T3 qualification](PARDNER-T3-QUALIFICATION.md) and
[automated acceptance](PARDNER-ACCEPTANCE.md). #58 routing and #66 review remain separate.

## Readiness gates before any live operation

1. Select and independently verify an exact controller candidate and compatible
   fresh workspace. The runtime track reported an installed schema-2 pin
   `eb66151ad57af45baf686909b1ab19ece58c7bad`, valid seal, absent managed launchd
   job, and no control ledger or T3 credential. This is a reported inventory,
   not readiness. Current merged main uses schema 5 and rejects schema 2/4 stores.
   The installed inventory is historical; do not silently adopt old identities/data.
   Preserve the runtime compatibility guard that checks before stopping a service;
   see [runtime readiness](PARDNER-CONTROL-READINESS.md).
2. Runtime owner must provide preservation/backup receipts, fresh managed-service
   doctor evidence, compatible schema, rollback procedure and explicit owner
   cutover decision. Leave old workspace and credentials intact. Control records
   live on the host, not in the browser or Automerge replication. A process
   restart does not establish power-loss durability.
3. Pin the selected runtime, adapter, provider, model, T3 version, protocol/schema
   hashes, Node 24.11.1, OS and repository baseline. Qualify actual Cloud access and
   T3 approval-required mode. Record absent Cloud cwd/host values as null. Any
   contract/version drift stops dispatch until requalification.
4. Run relevant deterministic adapter suites and this package; retain the exact
   candidate fingerprint. Run the required project verification and deliberate
   qualification for the selected integrated candidate. Separate track results
   do not qualify the combination. Respect the coordinator's serial slot and
   exclusive advisory lock `/tmp/pardner-selfhost-heavy-tests.lock` through the
   entire child process; acquire nonblocking and never unlink the lock.
5. Owner approves named provider accounts/access, isolated candidate locations,
   purpose-limited credentials, cost cap, replacements and disposable T3 crash
   target. No existing user T3 server may be killed. T3 crash probes require an
   isolated server/home with a real provider, not the scripted provider.
6. A real human agrees to native T3 approval decisions and later independent
   accept/reject decisions. No script or agent answers those prompts.
7. Freeze this checker package outside candidate/runtime checkouts. Put it and
   evidence behind a separate OS principal or read-only mount inaccessible for
   candidate writes. Keep its seal digest in a separately trusted operator
   record. Permissions `0444` alone are **not** immutability against the same UID.
   Node permissions reduce accidental access; they are not a hostile-code sandbox.
   Run checking in a credential-free, network-isolated disposable environment.

The exact remaining decision is selection of a compatible runtime/workspace plus
approval of the named access, isolated T3 kill scope, human participation and
budget below. The fixture/checker can be reviewed and tested before that decision.

## Fixture and independent checker

B adds one isolated utility, `lib/selfhost79-task-summary.mjs`, exporting
`summarizeTasks(tasks)` with `{total, closed, open}`. Closed statuses are
`completed`, `dead-end`, `abandoned`; all other status strings are open. C adds
exclusion of `deleted === true`. Empty inputs, every closed status, unknown
statuses, mixed lists, deleted-only and mixed-deleted inputs are independently
checked. No application caller is changed; human review decides whether this
bounded proposed utility is worth accepting into Pardner.

Use a baseline where this file is absent and where this new qualification
package is absent from the candidate checkout. Pin that baseline before A; a
compatible controller may have a different SHA. Keep the C prompt and external
oracle private from the executing agent until B is frozen. C is a fresh semantic
follow-up to that context, not a cosmetic edit or a new context with B copied in.
If the operator discloses C early, record the deviation and refreeze a new
independent semantic requirement before spending on another attempt; do not
claim the prepared C sequence still meets the freshness criterion.

The checker reads Git objects at full 40-character commit SHAs, confirms ancestry
from the frozen base, rejects changes outside the single path and rejects
symlinks/submodules. It extracts that blob into disposable scratch and invokes
Node with read access only to it and the trusted probe. No npm lifecycle, test
script or candidate-provided verdict is executed. The external Python oracle
compares returned data to expected results. Probe time is 5 seconds, stdout and
stderr each have a 64-KiB file limit, and inputs must not be mutated.

A checker receipt is exclusively created, with exact source, binary diff, test
results, source/diff/file SHA-256 hashes and tool seal. A claimed success or zero
exit with no valid function results cannot pass. C requires B's receipt and its
independently retained digest, checks B's archived files, checks B ancestry,
reruns the C oracle on B (must fail) and C (must pass, including B cases). Neither
provider `Run.git` nor a later branch read is accepted as B's history.

From the trusted tooling checkout, these offline commands require no credentials:

```sh
export PATH=/path/to/node-v24.11.1/bin:$PATH
node --test test/selfhost79.test.js test/selfhost79-cloud.test.js
python3 -B scripts/selfhost79.py freeze /private/tmp/reviewed-selfhost79-tools
python3 -B scripts/selfhost79.py audit support/selfhost79/fixture.json
```

Use a new freeze destination; the command refuses reuse. Keep the printed
`sealSha256` externally, not in a candidate-editable file. Copy the frozen fixture
JSON into a private external run directory for observation entry; retain its
original digest. For a real freeze choose durable storage, not temporary storage.
The approved run record must also pin the trusted launcher itself; launching
attacker-modified verification code cannot establish its own integrity.

After a candidate commit exists, use the **trusted launcher**, not a candidate
copy, with full immutable SHAs and a fresh evidence directory:

```sh
python3 -B /trusted/tooling/scripts/selfhost79.py check \
  --bundle /trusted/frozen --seal "$TOOL_SEAL_SHA256" \
  --repo /verifier/object-repository --base "$BASE_SHA" --sha "$B_SHA" \
  --phase B --node /path/to/node-v24.11.1/bin/node --output /evidence/t3-B

python3 -B /trusted/tooling/scripts/selfhost79.py check \
  --bundle /trusted/frozen --seal "$TOOL_SEAL_SHA256" \
  --repo /verifier/object-repository --base "$BASE_SHA" --sha "$C_SHA" \
  --phase C --node /path/to/node-v24.11.1/bin/node --output /evidence/t3-C \
  --previous /evidence/t3-B/receipt.json --previous-hash "$B_RECEIPT_SHA256"
```

Exit 0 means artifact assertions passed, 1 means rejected assertion results,
2 means verification could not be established (including integrity, scope,
timeout and malformed evidence errors). Keep stderr/exit status for failed
attempts as separate append-only operator evidence; errors do not create a
success receipt. Check each exit status. Never overwrite a previous directory.
Preserve the verifier's Git objects and an external Git bundle of baseline/B/C
refs as well as the receipt bytes, so repository deletion/GC cannot erase the
historical commits. Source/diff snapshots alone do not replace that backup.

## Six planned attempts, in order

For each route use an isolated candidate clone at the same frozen base, one
Pardner controller, distinct agent Actor, explicit task/sender authorization,
and one mapped provider context. Start T3 A/B/C first, then Cloud A/B/C.

1. **A:** Submit bounded work once; observe it genuinely active. Queue a separate
   follow-up in Pardner, never in the provider. Restart only the disposable
   controller while the provider is active. After startup, record fresh reads
   recovering the exact original run without another prompt or submission.
   Cancel that execution, confirm `cancelled`/`interrupted` in a subsequent fresh
   exact-run read, capture partial effects/output and show the queued follow-up
   still held with zero submissions. For Cloud, freeze A’s partial commit/diff,
   output and explicitly not-run/failed test evidence before B: the adapter holds
   every terminal run until capture, even a cancelled one. If partial changes need
   an operator-created snapshot commit, label that intervention and retain the
   original provider outcome. A capture is not artifact acceptance.
   Unknown/quarantine is a safety result but
   fails live automatic recovery. No rollback is inferred.
2. **B:** After A terminal confirmation, the owner explicitly disposes of A's
   partial changes in the isolated candidate and records the diff/decision,
   withdraws the sentinel held follow-up and authorizes this new attempt. Never
   silently drain it. T3 B must request a real native approval for a harmless,
   bounded operation in the disposable checkout; the person decides in T3.
   Record blocked/read/decision/resume evidence, without elevating its mode to
   avoid the request. Complete B, independently check exact SHA, freeze its
   receipt, provider snapshots, diff, tests and immutable objects before C.
3. **C:** Record the separate human release decision and supply C's fresh
   requirement in the same context, with a different run ID. Run the independent
   failing-B/passing-C check. Restart the controller after C is terminal, then
   recover both B and C with fresh exact-run reads and no new prompt. Recheck
   archived B hashes. If Cloud's artifact view changed, record the new view
   separately; do not replace B's captured evidence.

### Integrated Cloud evidence seam

The merged [Cloud adapter](PARDNER-CURSOR-CLOUD.md) supplies
`snapshot().cloud.contexts/executions`. It stores `executionId`, `contextId`,
`agentId`, exact `runId`, `createdAt`, `sentAt`, `acceptedAt`, `observedAt`,
`providerUpdatedAt`, `submissions`, transitions, optional `intervention` and
immutable `evidence`. It has no local cwd. Its fixture suite is
`node --test test/cursor-cloud.test.js` and is part of full regression.

Cloud capture establishes bytes and attribution, not truth of Actor-supplied
commit/diff/test claims. First run the exact-SHA independent checker, then supply
its `sha`, `diff.patch` bytes and **the exact `checks.json` text** to the authorized
Cloud freeze route. The adapter requires a fresh terminal exact run and unchanged
latestRunId across capture. Export the complete control snapshot privately and
retain its SHA-256 separately. The new offline binding command verifies the
snapshot digest, adapter capture hash (canonical JSON), exact identities, commit,
diff, test bytes and each captured artifact size/hash against the separately
pinned checker receipt and its archived files:

```sh
node /trusted/frozen/scripts/selfhost79-cloud.js \
  --snapshot /evidence/cloud-B-snapshot.json --snapshot-sha "$SNAPSHOT_SHA256" \
  --execution "$EXECUTION_ID" \
  --receipt /evidence/cloud-B/receipt.json --receipt-sha "$B_RECEIPT_SHA256"
```

Pin and check the trusted tool seal before invocation. Like the Python launcher,
the tool cannot authenticate itself after an attacker replaces its executable.
The command is read-only and makes no provider/controller calls. It rejects a
successful capture of false supplied diff/tests, corrupt artifact bytes, wrong-run
binding, nonterminal/unsuccessful execution and replaced snapshots. It can still
bind historical B after C changes the provider's mutable artifacts. The output is
an offline binding, not a live pass or authenticated human verdict. A native human
verdict in a snapshot is not imported as proof of a person's decision.

`createdAt` is durable intent creation, not `sentAt`. `acceptedAt` and `observedAt`
are local receipt timestamps; do not substitute provider timestamps or claim
synchronized clocks. `checkerFrozenAt` is the Cloud capture time only after it
contains the independent results. The command preserves `durableSubmissionCount`:
this counts persisted POST attempts, not actual provider receives. The live
manifest's `submissions` and zero queued submissions need independent provider
trace evidence. Manual `intervention` remains manual; neither a stored exact run
nor `reconciliation.established` alone proves automatic active restart recovery.

Creation uses a persisted random client agent ID; duplicate-create conflict does
not prove which prompt/run was accepted. Ambiguous follow-up POSTs lack documented
correlation/idempotency and quarantine permanently pending exact acceptance
proof. No blind retry or guessed identity is authorized.

### Schema-5 identities and preserved boundaries

Workspace request identity is separate from controller execution identity. The
API's incoming `operationId` is a retry key; schema 5 stores it as `requestId` and
returns a content-derived `operationId` (`op-…`) for the authored event. Preserve
both, plus the full returned receipt and actual revision IDs. Link task IDs from
receipts, never derive them from incoming retry keys or substitute Cloud/T3
execution IDs. Inspect `OPERATION_INTEGRITY_CONFLICT` variants and quarantine the
operation; do not guess a winning payload or retry to conceal the conflict.
This package's task summary is an isolated array fixture, not a new CRDT operation.

The integration retains native admission, private files, LAN pairing, local
cleanup approval, comment authorization, durable bridge context and two-stage
begin unchanged. No provider key, replica credential, controller mapping, active
service, or persistent workspace is read or modified by these offline commands.
The current automated bounds are acknowledgement 2,500 ms, UI visibility 2,000 ms,
offline restart 6,000 ms and convergence 10,000 ms. Pairing locator 5,000 ms and
helper startup 15,000 ms remain unchanged. Historical failures remain recorded in
[#107](https://github.com/depatchedmode/pardner/issues/107) and
[#108](https://github.com/depatchedmode/pardner/issues/108); the owner's deferrals
are not attribution, repairs, retroactive passes, or waivers for new failures.

## Two additional T3 crash probes

These explicitly address the #79 comment. They are **not** controller restarts,
and not substitutions for A or the successful native approval in B. Run only
against an owner-authorized disposable T3 server with a real provider, after the
six core attempts have preserved their evidence. Use two new isolated contexts
so crashes cannot destroy B/C history.

- **Active:** arrange a harmless append-only effect in the disposable checkout
  with a unique operation marker, recording actual append count independently.
  With the run active and a follow-up held in Pardner, kill only the identified
  disposable T3 server. Record PID/ownership, signal and whether the provider
  child survives; do not implicitly kill a whole process group. Restart T3, watch
  exact original and any T3-originated resume runs for 120 seconds. Record every
  run ID, timestamps, initiator evidence, provider actions, marker count and
  partial effects. A resume run is not the recovered original run. Prove zero
  further Pardner submissions whether or not a resume appears.
- **Approval-blocked:** with a genuine native pending approval, repeat the
  isolated T3 crash. Do not answer it synthetically before or after the crash.
  Record whether the original request survives, vanishes or is replaced, and
  whether a new run resumes. Prove the held queue remains held throughout.
  The human must make any new decision explicitly; record it separately.

A bounded absence of resume is only “not observed in 120 seconds,” never proof
it cannot happen. Unexpected autonomous resume freezes the normal sequence;
collect the bounded read-only observation window and halt further dispatch.
Repeated effects, automatic dispatch, lost ownership, or inability to confirm
termination are failures requiring reconciliation before reuse. A safe hold with
unknown provider effects is incomplete effect evidence. No arbitrary external
side-effect exactly-once guarantee is made. If the isolated real-provider T3
instance cannot be provisioned, mark both probes blocked; no exclusion is being
claimed and #79's crash coverage remains open.

## Time, spend and replacement limits (proposal, not authorization)

The frozen fixture declares acceptance 60s, active observation 120s, controller
recovery 60s, cancellation confirmation 60s, whole attempt 900s, native human
wait 300s, T3 crash observation 120s, artifact stage 30s and probe 5s. The operator
must enforce stage and whole-attempt deadlines externally; `audit` does not run
or time provider calls. On expiry stop new dispatch, attempt exact-run cancel
only where identity is known, retain evidence and escalate unconfirmed work.
Never call timeout a cancellation confirmation or lower a latency assertion.

Proposed USD 10 per attempt/probe; USD 100 total: six planned attempts, two T3
crash probes and at most two replacements, at most one replacement per route.
No automatic retries. Each replacement needs a recorded owner decision, reason,
link to its failed/interrupted predecessor, remaining budget and unchanged
fixture/checker seal (otherwise a new qualification campaign). Keep predecessor
records; count autonomous T3 resume usage against the originating probe's cap.
If cost visibility or a provider-side spending limit is unavailable, the spending
gate remains blocked. Prices are not estimated here; the owner must validate
that these proposed caps are enforceable for the chosen account/model.

## Evidence manifest and verdict boundaries

Keep raw evidence private outside all working checkouts. Use pseudonyms in the
curated public report; retain exact private identity mappings separately. Never
include credentials, pairing codes, authorization headers, private account
identifiers or raw browser traces. Record hashes only after sanitizing copies;
retain distinct raw/sanitized hashes privately. Review redaction, not just words
like “token.” Accepted control work remains locally persisted during hub outages;
new delivery leases still require the hub. Cloud loss blocks Cloud reads/cancel;
T3 loss blocks T3 reads/approval/cancel. Neither outages nor synchronization are
backup. This package changes no storage, admission, transport or P2P behavior.

Extend each attempt record with route/provider/model/environment/version,
controller/adapter/base SHAs, Actor/task authorization, `contextId`, `agentId`
(null on T3), `runId`, `executionId`, request correlation where supported,
`intentAt`, `acceptedAt`, `terminalAt`, `freshReadAt` (integer epoch ms), submission
count, execution status, `evidenceSha256`, queue history and manual interventions.
The evidence hash references an immutable private index of timestamped raw and
sanitized reads/actions, file hashes and capture provenance. Index all failed,
interrupted, replaced and not-run attempts as well as successful ones.

A adds `controllerRestartAt`, `recoveredAt`, `recoveredRunId`,
`cancelRequestedAt`, `partialEffectsSha256`, `queueHeld`, `queuedSubmissions`.
B/C add `releasedByHumanAt`, `commitSha`, `checkerReceiptSha256`, `checkerFrozenAt`, checker verdict;
T3 B adds `nativeApprovalRequestedAt`, `nativeApprovalDecidedAt`, and
`nativeApprovalEvidenceSha256`. C adds `previousReceiptSha256` and
`terminalRestartEvidenceSha256`. Each crash record includes its independent
kind, before/after original and resume IDs, server/provider process evidence,
pending approvals, observed effects, window, queue timeline and submissions.
Record private cost and remaining budget per entry, including replacements.

`python3 -B scripts/selfhost79.py audit /evidence/manifest.json` checks core
record completeness, timestamp ordering, exact recovered identity and B/C
linkage. It intentionally returns `record-complete`, **never live pass**. It
cannot authenticate hand-entered observations, verify human identity, enforce
provider deadlines, or inspect raw evidence from a digest alone. An independent
reviewer must open the indexed evidence, validate hashes and timing bounds,
confirm adapter provenance and approve dispositions. A zero audit exit means
only the JSON was processed; inspect every gap and crash probe disposition.

The checker emits execution `not-observed` and human `not-recorded` even when
artifacts pass. Execution completion, independent artifact verdict, and the
actual person's accept/reject with timestamp/evidence stay separate. The final
human verdict is never inferred, and no command merges, publishes comments or
closes issues. Proposed #79 disposition: keep open until all live criteria,
crash coverage and actual human acceptance are independently established.

## Deterministic coverage and remaining integration

`node --test test/selfhost79.test.js` covers the offline public freeze/check/audit
CLI with real Git objects and subprocesses: exact B/C semantics, dirty checkout
independence, false success, checker/probe/seal mutation, tampered historical
artifacts, branch refs, scope expansion, overwrite, timeout, symlinks, protected
locations, unknown recovery and absence of manufactured human acceptance.

The existing `test/t3-execution.test.js` and `test/control-pane.test.js` own wrong
route/zero send, competing receivers, crash-before-send, accepted-before-local
persistence, lost reply/idempotency, stale/out-of-order reads, cancellation races,
delayed cancel, held queues and unknown quarantine. They exercise real controller
code with scripted transport, not real-provider effects. The merged Cloud adapter has the
corresponding Cloud fixtures. The package’s Cloud binding fixtures exercise that
real adapter with a scripted transport and actual independent checker receipts,
including restart and B/C history; they do not use a real provider. Run the actual
candidate commands, preserve
counts and map each failure boundary; this package adds no replacement fake
controller whose behavior could be mistaken for the production adapter.
