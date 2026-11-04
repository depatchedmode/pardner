# Control runtime readiness and #77 disposition

This is the 2026-11-04 reconciliation of [#77](https://github.com/depatchedmode/pardner/issues/77)
and [PR100](https://github.com/depatchedmode/pardner/pull/100), merged at
`bd55f246bacae5068b761c999e7b849501e7a5e3`. It separates implementation evidence
from installed readiness and the human proof assigned to #79. No issue was closed,
no production data was created, and no installed service, mapping or credential
was changed by this work.

## Pins and read-only observation

| Item | Observed identity and result |
| --- | --- |
| Installed app | `eb66151ad57af45baf686909b1ab19ece58c7bad`, schema **2**, Node 24.11.1 |
| Installed controller | SHA-256 `656593b9d58064c7a49f05d51cea6b7b452786c6c50b17673d6730c74ea9c552`; matches the controller at PR100 |
| Inactive baseline app candidate | `bd55f246bacae5068b761c999e7b849501e7a5e3`, schema **4**; independent detached clone, no production data or launch configuration |
| T3 installed version | `t3 v0.1.6`; version read only, no pairing or model turn |
| Installed control records | No `control.sqlite` or `t3-credential.json` found in the configured data directory |

At **16:28:49 UTC**, the installed controller's read-only `status` returned exit 1.
Release verification and launch-configuration identity passed. The selected
launchd job was not loaded; there was no verified managed PID/listener and
`apiChecked` was false. Authentication, identity and saved-state readiness were
therefore unestablished. This was repeated outside the filesystem sandbox to
avoid mistaking restricted visibility for service failure. It does **not** prove
that the ports are free or that no unrelated process is serving there. Do not kill
or replace a listener discovered later merely because it uses the desired port.

The [#75 report](PARDNER-CONTROL-RUNTIME-EVIDENCE.md) records successful schema-2
recovery on October 30. Those historical observations do not establish present
liveness or recovery of the newer control ledger. Status output was filtered
before reporting: no tokens, workspace contents or Actor identities were emitted.

The candidate is a baseline for review, not the final multi-track deployment.
Reliability's PR86 proposes schema **5**. If selected, it supersedes this schema-4
candidate and needs a new exact pin, build, fresh workspace and combined
qualification. Neither schema-2 nor schema-4 data may be opened as schema 5 by
editing metadata. Controller checks follow the selected release declaration;
they do not assume schema 4.

## #77 acceptance reconciliation

The following is an evidence map, not a claim that the installed schema-2 app has
the pane. Test counts below describe PR100 and committed fixtures; fresh results
for this tooling change are recorded separately in the validation report.

| #77 criterion | Landed evidence | Remaining boundary / proposed disposition |
| --- | --- | --- |
| Existing GitHub issues link to one or more tasks; usable without GitHub; no mirrored transitions or publication | `test/issue-links.test.js` (2 fixtures), `test/pardner-cli-issues.test.js` (1), and both-engine pane UI flow. Links are local operation references, add-wins on merge, and make no GitHub request. | Implementation satisfied. Broader publication/synchronization is #52. New workspace needs deliberately recreated task links. |
| Registry/UI preserves provider identity and rejects ambiguous/unauthorized routes before submission | `test/control-pane.test.js`: registry identity, refused child/broader-mode mapping, wrong/revoked routes with zero sends. `test/t3-execution.test.js`: route/ownership checks. UI exposes recorded identity. | Satisfied for qualified top-level T3 sessions under shared-secret trust. Worktree/long-read/other-provider qualification remains bounded; Cloud is #78, general routing #58. |
| Restart reconstructs intent, queue, session/run, evidence and review without a new prompt; fresh reads reconcile | Pane fixture “holds follow-ups, shows approval blocks and verdicts, and rebuilds everything after a restart”; startup-outage fixture; ledger reconstruction and reconcile tests. `control.sqlite` and credential stay host-local. | Automated implementation evidence satisfied. Real-provider controller restart, T3 reconnect and human recovery proof remain #79. |
| Crash boundaries/lost acknowledgements do not blindly replay; queue survives; uncertainty blocks reuse | Pane lost-reply, crash-before-local-acceptance and interrupted-cancel fixtures; execution ledger crash-before-send, lost-ack quarantine, credential-bound retry fixtures. | Satisfied within deterministic fixture bounds. Patched ledger rows are simulated controller crash boundaries; they are not power-loss or live-provider recovery proof. |
| Wrong routes, competing receivers, stale/out-of-order events, cancel races and delayed cancel are deterministic | 64 fixtures in `test/t3-execution.test.js`, plus 10 pane fixtures: wrong routes have zero submissions, competing owners fail, stale reads cannot authorize dispatch, delayed cancel names its original run, no `stop: true`. | Automated implementation evidence satisfied. A foreign dispatcher is detected after its run appears; the pane cannot prevent direct T3 writes. |
| Browser/API shows timestamps, approval blocks, held work, terminal cancel/partial output, separate execution/checker/human verdicts | `test/pardner-control-ui.test.js` runs one flow in Chromium and WebKit; pane API fixtures check the same states, non-self checker and human-kind verdict. | Fixture evidence satisfied. Scripted “human” Actor is not a person's acceptance; live smoke had no approval and no captured cancel output. #79 must supply actual human/real-provider proof. |
| Publish schema/state contract, tested SHA, fixture counts, commands/results and limits | [Pane contract](PARDNER-CONTROL-PANE.md), [T3 qualification](PARDNER-T3-QUALIFICATION.md), PR100 exact candidate and results; summarized below. | Implementation documentation satisfied with this reconciliation. Do not claim deployment or milestone completion from the closed implementation slice. |

The issue's October 31 wiring checklist is also accounted for: `ControlPane.poll`
drives observation, startup/lost-reply reconciliation, interrupted cancellation
and pumping; default polling is 2 seconds with a 50-run window. Mapping checks
`approval-required`; authorization/routes and one expiring credential persist.
Expiry, re-pairing and dedupe scope are documented and tested, but token renewal
is not qualified. The five deferred #96 items landed in PR100: refused cancel
restores observed state, direct SQL row lookup, shared SQLite transaction helper,
HTTP status checked before pairing JSON, and tolerant provider-log/UTF-8 handling.
They need no duplicate implementation here.

**Proposed issue disposition (not posted):** Close #77 as implemented by PR100,
using the bounded automated/API/browser evidence above. Keep deployment readiness,
fresh-workspace selection and live approval/restart/human acceptance tracked as
separate obligations, especially #79. Do not close #58, #66, #78 or #79 and do not
claim the self-development milestone is complete. If closure is intended to mean
“the installed controller has the pane,” leave #77 open with that explicit
remaining deployment condition instead of rebuilding landed functionality.

## Historical evidence versus fresh qualification

PR100 reports its pushed head `002844a0` (merged with `6f4a5736`) and candidate
fingerprint `834efce71e9447995de3b23982c203bdef9f1351e0f33cf106ac27e295d3c202`:
438/438 Node tests, 14/14 controller tests, all focused suites, both browser
engines, lifecycle checks, and 20/20 acceptance seeds. These are the PR author's
recorded results, not reruns performed by this reconciliation. The reported live
smoke sent one prompt and cancelled another exact run, retaining a follow-up in
Pardner. It involved no human approval, restart recovery or human acceptance.

The committed T3 0.1.6 evidence reports **39/39 checks** and 10 observations not
counted as checks. Its contract-file fingerprint still matches this baseline:
`479b57443de03ee71b744e0cc79ed16e299841fccb2e165e443a70accaaf9293`.
This matches four source files, not the whole app or the installed T3 binary.
The provider and browser approvals were scripted. A version match alone is not
fresh qualification; T3 upgrades, output paging and worktree behavior need their
own evidence. PR100's historical 20 seeds cannot qualify a combined schema-5,
Cloud, security or collaboration candidate.

## Preservation-first deployment proposal

Recommend a **new workspace using the final selected release's schema**, in a
new private controller home, with the schema-2 installation retained unchanged.
This is a proposal, not an executed migration or an authorization to cut over.
The inactive baseline build has no production `data/`, credential, paired client,
launchd job, wrappers or active-home selection.

No historical tasks, comments, mentions, operation history, workspace/replica IDs,
delivery records, authored attribution, Actor IDs or authorization mappings carry
over automatically. Historical #75 evidence counted 4 tasks, 3 Actors, 13 comments,
8 mentions and 22 operations; those are historical counts, not a fresh inventory.
The absence of a control ledger means there is no observed pane registry/queue to
transfer from this installation. Register new Actors and recreate selected working
tasks/links only after explicit approval, keeping references to the preserved
history. Do not silently substitute a new Actor for historical authorship, copy
old connection credentials into a new identity, or enroll a schema-5 peer against
a schema-2/schema-4 hub.

**Exact operator decision, once the final pin and security review are available:**
authorize a separate fresh workspace at the selected schema, accept that prior
history remains in the preserved schema-2 installation, name which working tasks
and Actor/route mappings to recreate, and approve the new home/ports and serial
cutover window. Alternatively request a separately designed and qualified migration;
none is provided or implied here. T3 pairing and paid/human #79 attempts need their
own access/spending approval. Initial-wave tooling work needs none of these decisions.

### Cutover checklist (not performed)

1. Select the exact combined app pin and controller hash after the other tracks.
   Inspect its schema declaration; install locked dependencies and UI only in a
   new inactive independent clone. Record source, lockfile and build hashes.
   Run required regression/20-seed qualification under the shared heavy-test lock.
   Separate test fixture data from any proposed production home.
2. Read-only inventory the current installation, all listener ownership, launch
   metadata, identities, old wrappers and outstanding accepted work. Do not rely
   on this report's snapshot for cutover. Do not answer pending approvals.
3. After explicit cutover authorization, stop only the verified owned job if it
   exists. Verify that no writer remains. Cold-copy the entire original installation
   metadata and data, including WAL/journals, credentials, Automerge repo, ledgers,
   attachments and execution evidence. Hash-check every retained file. Keep an
   independent/off-machine protected copy for machine-loss recovery.
4. Prepare the approved new private home with fresh data through the selected app's
   supported initialization path. Retain schema-2 data in place. Configure new
   workspace/replica identity, explicit Actors and ports. Never change `schemaVersion`
   in an old manifest. Seal with the updated controller; incompatible or
   unrecognized schema must fail before stopping or launching any service.
5. Select only one `app.pardner.control` job. Install new paths/plist and Actor
   wrappers deliberately; do not overwrite the original home. Start, obtain fresh
   authenticated status, verify both listener PIDs, schema/identity, locally saved
   state, and Chromium/WebKit readback. Record timestamps. Fresh workspace means
   expected *absence* of old records, not an equality claim with old data.
6. Pair a new `approval-required` T3 credential for the new controller only with
   explicit access. Register projects and approved routes. Do not map a thread
   already controlled elsewhere. Reconcile/quarantine accepted/unknown work before
   admitting follow-ups; never copy client request IDs across credentials and retry.
7. Perform #79's separately approved real-provider/human proof: blocked approval
   through T3 UI, held work, restart/reconciliation, exact-run cancellation, separate
   checker and person verdicts, retained receipts and sanitized evidence. Publication
   and issue transitions remain explicit. Accept the deployment only after these
   required observations and fresh qualification are recorded.

### Rollback and recovery checklist

If the candidate fails before any writes or dispatch, stop only its owned job,
retain its logs, verify its process exited, and explicitly select the untouched
old home/pin. Fresh status must pass before relying on it; the current snapshot
shows that it is not managed-ready. If the candidate accepted any local writes or
T3 submissions, preserve and cold-back up the new workspace first. Reconcile exact
runs and held queues before reuse. Never overwrite new data with the old backup,
translate records implicitly, or describe cancellation as rollback.

Recover either workspace only with its compatible app pin, full cold data and
metadata, source/build identity and protected credentials. For a control-pane
workspace this includes `control.sqlite`, its WAL/journals and `t3-credential.json`.
Keep the same identity for recovery; a fresh identity refuses the old ledger.
Never serve a restored copy concurrently with its original. Restoring to a new
machine or T3 installation may require fresh pairing and review of unknown work;
old request IDs are not safely retryable with a new client. Synchronization does
not back up control records. No power-loss or fresh-machine recovery was performed.

## Fresh tooling validation

The implementation candidate is PR100 plus the controller guard and three focused
preservation tests, with fingerprint
`b298bdff3da16ed005075d3ad1700d74c3a43414d6d85fe8c2b477e5f786c827`.
It was unchanged before/after the bounded batch under Node 24.11.1 on macOS arm64.
The controller source SHA-256 is
`b895ba0be042dcec1d2a6e20710521226e6cd3a60d031a83388c702e4ae2c5df`; it is prepared beside the inactive clone, **not installed**.

| Tier | Command | Observed result |
| --- | --- | --- |
| Routine | `npm run test:control-runtime` | 17/17 Python tests passed, no skips; UI build passed |
| Routine | `npm run verify` | 17/17 Python and 438/438 Node tests, 0 skipped; UI build and one acceptance seed passed |
| Deliberate | `npm run test:acceptance -- --repeat 20 --seed 1` | Required, not run for this candidate |
| Preparation | Independent clone: both `npm ci --ignore-scripts` installs, `npm run ui:build` | Passed; clean exact detached pin, no Git alternates, no data or service launch |
| Guidance | Local link resolution and `git diff --check` | Passed |

The routine batch held the exclusive OS advisory lock at
`/tmp/pardner-selfhost-heavy-tests.lock` throughout both child processes. Watchdogs
had 240-second and 900-second bounds, exited 0, and reported no surviving owned
processes. The lock-holder exited and handed the slot to reliability without
unlinking the lock. An initial sandboxed unit attempt could not bind its fixture
sockets (14 setup errors); rerunning with permission passed. No assertion or
latency bound was changed. No installed runtime was exercised by these tests.

Routine outcome: **passed**. Overall outcome: **incomplete**; no merge or deployment
recommendation. The mechanical planner selects only `test:control-runtime` and
finds no unclassified paths. Semantic review adds a qualification obligation
because preflight changes the operator recovery/upgrade gate. Merging, operation
identity, persistence acknowledgement, delivery leases and transport are unchanged;
no mapped lifecycle source was edited. Qualification is **required, not run** for
this tooling candidate and must be renewed for the final combined app candidate.
Human acceptance, paid rehearsals, real launchd cutover, live schema transition,
fresh-machine recovery and power-loss behavior remain unexercised.

Local evidence is retained in `output/verification/runtime-readiness/`: command
logs, watchdog records, before/after fingerprints, planner output, build/lockfile
hashes, candidate path and detailed report. Raw acceptance artifacts remain private
under `output/acceptance/`; no traces or credentials are published. The inactive
clone is temporary staging, not a backup or approved deployment. Rebuild it from
the exact pin and locked dependencies if it expires.

## Cross-track handoff

- **#79:** use a finally qualified pin and fresh approved workspace; retain the
  execution → independent checker → person verdict distinction. Scripted tests and
  PR100 live smoke are inputs, not the missing human/recovery proof. Do not assume
  the old installation has a pane, token or live service.
- **Security #80–88:** select the security-integrated pin before cutover; retain
  shared-secret admission and explicit loopback administration. The schema guard
  parses the pinned source without executing it or opening old storage; it is not
  a storage-integrity audit or a recursive dependency tamper check. The inactive
  PR100 baseline still has its original dependency/security surface.
- **Reliability PR86:** controller schema compatibility is release-driven. No
  `operationId` receipt consumer is changed here. Schema-5 integration invalidates
  the schema-4 build as a final deployment candidate; require new combined evidence.
- **Cloud #78:** no pane/adapter implementation changed here. Integrate and qualify
  its records/recovery with the final deployment pin; do not infer it from T3 results.
