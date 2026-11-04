# Reliability initial-wave report

Source baseline: `bd55f246bacae5068b761c999e7b849501e7a5e3`.
Original PR86 head: `5cfe8e0cc605b5097ed661ae1fd1ca1f7de1c6f7`.
Integrity integration: `9f1c0d7`; baseline/tooling: `f2b6d33`.
The latter commits are on the isolated `t3/selfhost-reliability-baseline` branch.
No deployment, existing-data migration, issue closure, external agent spending,
or human approval was performed.

## Outcome

Routine outcome: **passed**. Final `npm run verify` passed 14 Python tests,
442 Node tests (zero failures, cancellations or skips), and one acceptance seed.
Focused counts: verification tooling 39, storage qualification 12, runtime 118,
CLI 12, UI 12, and integrity scenarios 2; all passed. CLI smoke, schema
compatibility and before/after diagnostics passed. Final fingerprint stayed
unchanged throughout the final batch. Watchdogs reported no survivors. Overall outcome: **incomplete**.
Qualification is required and not run; no merge recommendation. The final
combined security/Cloud/runtime candidate is not represented by this branch's
results. No full #63 profile is qualified. Human acceptance and paid real-agent
rehearsal remain separate, unperformed work.

The final source/dependency/built-UI fingerprint is
`e9633811b0bf476af68c871a0845074c6a11ef9ea468ce32c2c081231175c4b1`.
The initial full run used
`268f691f7202027ecb560ffc0330f36ef0066a0b7687e4f048154c61588dc19e`.
After that run, only integrity presentation/tests and the compatibility probe/
planner classification changed; affected checks and full verification were
rerun. The unchanged domain/runtime/CLI focused results remain relevant, and the
final discovered suite exercises them again. Exact final evidence is in
[evidence/reliability/validation.json](evidence/reliability/validation.json).

## Product behavior and evidence

- Incompatible offline requests retain separate derived identities and are grouped
  by the original retry key as an unresolved integrity conflict. Supported task
  context and both browser engines expose full requests, results and provenance.
- Equivalent retries retain one logical effect/history record and both original
  replica/timestamp observations. Ten local retries retain their result and stored
  operation ID. Local incompatible reuse adds no event. After merge, either
  variant retry returns the explicit conflict with both variants and no effect.
- Tests use two real persisted replica services, both reconnect orders, all-service
  restart and resynchronization. Expected fingerprints use an independent encoder.
  Browsers check complete variants and wrapped text. Screenshots were inspected
  in Chromium and WebKit after the wrapping correction.
- [Before](evidence/reliability/collision-before.json) records two acknowledged
  requests collapsing into one public task/history event without a group on the
  unchanged source. [After](evidence/reliability/collision-after.json) records both
  tasks/events and one unresolved group. This small diagnostic uses persisted
  in-process repositories; it does not substitute for the public service tests.
- [Compatibility evidence](evidence/reliability/schema-compatibility.json) creates
  an actual schema-4 workspace with the frozen source, acknowledges a task and
  closes it. Schema 5 returns `INCOMPATIBLE_SCHEMA`. Hashes of all data/metadata
  files remain identical, excluding runtime lease SQLite files. No live install
  was opened. This is rejection/preservation, not a migration or deployment test.

The [sequencing note](PARDNER-RELIABILITY-SEQUENCE.md) assesses every #61 criterion,
records PR86 reuse and main conflicts, and proposes #58/#59 contracts feeding
#60 and #62. Original PR86's failing qualification remains historical evidence;
these new results do not retroactively qualify its head.

## Baseline scope

[Baseline evidence](evidence/reliability/baseline.json) preserves both attempts,
independent intent/receipt manifests and per-second resource samples. The source
fingerprint remained
`834efce71e9447995de3b23982c203bdef9f1351e0f33cf106ac27e295d3c202`.
Node 24.11.1, macOS arm64 27.2.0, Apple M1 Max, ten CPU cores, 32 GiB RAM,
local temporary storage, loopback HTTP. Existing dependency installs were reused
only after both lockfiles matched. The untouched source archive's UI was built
before fingerprinting. Source and harness identities are separate in evidence.

The completed preliminary fixture has 60 preload, 10 warmup and 30 measurement
writes, zero retries, 100 successful acknowledgements and exact final
entity/event/payload accounting. Thirty scheduled-to-durable-response samples
have p50 20.447 ms, p95 31.348 ms, p99/max 38.251 ms, using nearest-rank
percentiles. Offered/accepted measurement rate is 1 write/s over 30 seconds.
Context preparation/client queue delay is included in acknowledgement latency.
There are 41 resource samples. These are single-hub micro-measurements; they do
not establish sustained capacity, browser latency or full-profile gates.

The first attempt stopped after 93 acknowledgements because the disk sampler
raced an atomic-file rename. Its failure and partial evidence remain retained.
The sampler now records vanished files while sampling, without treating that as
storage corruption; the rerun observed zero such races. A watchdog preflight was
also denied process enumeration by the sandbox; no command started in that
attempt. The authorized rerun used process-enumeration access, never a watchdog
bypass. No test assertions, workload rates or latency limits were relaxed.

| Profile | Full sustained matrix / capacity | UI/startup/convergence gates | Location/recovery baseline |
| --- | --- | --- | --- |
| Handful | Not measured | Not measured | Not comparable |
| Dozens + soak | Not measured | Not measured | Not comparable |
| Accumulated history | Not measured | Not measured | Not comparable |
| Stretch (500 Actors) | Not measured | Not measured | Not comparable |

No capacity failure is inferred from the sampler defect. No optimization or
capacity support claim is proposed. The full profiles, limits and reproducible
commands are in [the sequencing note](PARDNER-RELIABILITY-SEQUENCE.md) and
[configuration](../support/reliability/profiles.json). Receiver/Location
activation, three replicas, browser schedules, fault phases, drain, complete
receipt/handoff/traffic metrics and multi-profile workload implementation remain
necessary before full #63 qualification. New Location and recovery cases cannot
be retroactively claimed comparable to schema 4.

## Verification and qualification

| Tier | Commands |
| --- | --- |
| Routine | `npm run test:verification`, `test:qualification`, `test:runtime`, `test:cli`, `test:ui`; explicit `node --test test/operation-integrity.test.js`; `npm run verify:smoke`; `npm run verify:model`; `npm run verify` |
| Deliberate, required and unrun | `npm run test:acceptance -- --repeat 20 --seed 1` |

Semantic review: operation identity/replay **yes**; preservation/exposure of
conflicting authored alternatives **yes**; persistence acknowledgement ordering
**no**; leases/durable receipt ordering **no**; enrollment/recovery compatibility
**yes** (schema 5 rejects schema 4); milestone closure or weakening measurement
**no**. Acceptance tooling adapts only its expected stored operation identity;
its counts, limits and assertions remain enforced. Planner has no unclassified
paths or warnings. The bounded lifecycle model retains its actions and passes;
its old wider-bound/mutation evidence remains labeled historical.

Both batches hold the exclusive advisory lock at
`/tmp/pardner-selfhost-heavy-tests.lock` through all child processes. Tests use
owned disposable services only. Exact commands, watchdog exits, source
fingerprints, smoke report and screenshots are retained locally under
`output/verification/reliability/`. Raw acceptance output remains private under
`output/acceptance/`: traces contain disposable credentials and are not published.
The committed evidence contains synthetic operation payloads/receipts and hashes,
not authorization headers, connection files, tickets or credentials.

## Proposed dispositions and next dependencies

Keep all six issues open. #61 is implemented for review on current main but still
owes required 20-seed qualification and qualification of the eventual combined
candidate. Keep PR86 open until the coordinator chooses whether this integration
supersedes it; no automatic closure is requested. #58/#59 design decisions remain
proposals; #60 and #62 depend on implementing and testing those semantics.
Final #63 follows all integrations; its preliminary baseline is now reproducible.

Runtime/Cloud/security were notified of schema-5 and receipt/revision changes.
Callers retain original retry envelopes, use returned revision IDs, and cannot
implicitly enroll mixed schemas. The shared server change is only the integrity
HTTP 409 status; security transport/admission work must retain it and refresh the
combined lifecycle mapping. No access, spending or destructive decision is
needed to review this wave. Live schema adoption remains a separate explicit
runtime decision; preserve existing installs in the meantime.
