# Reliability wave: dependency contracts and evidence boundaries

The initial-wave evidence below is historical. See the [post-#102 integration
and qualification report](PARDNER-RELIABILITY-QUALIFICATION.md) for the current
#106 merge candidate. Capacity and later policy work remain separate.

Starting source: `bd55f246bacae5068b761c999e7b849501e7a5e3` (main on
2026-11-04). PR86 subject: `5cfe8e0cc605b5097ed661ae1fd1ca1f7de1c6f7`.
This wave prepares #61 and a bounded baseline; it does not close #58–63.

## Sequence and proposed decisions

Co-design [#58](https://github.com/depatchedmode/pardner/issues/58) and
[#60](https://github.com/depatchedmode/pardner/issues/60), implement #58 alongside
[#59](https://github.com/depatchedmode/pardner/issues/59), then integrate #60.
[#62](https://github.com/depatchedmode/pardner/issues/62) consumes those contracts.
[#61](https://github.com/depatchedmode/pardner/issues/61) is independent, but belongs
in the final integrated qualification. Capture comparable
[#63](https://github.com/depatchedmode/pardner/issues/63) baseline now; qualify the
full matrix only after integration. No speculative performance optimization.

These are proposed contracts, not implemented guarantees:

- #58: Actor identifies the person/agent; Location identifies a registered durable
  destination; replica identifies its service storage. Generate/persist Location
  identity independently; permit multiple Locations per replica. Retirement is
  explicit, preserving receipts/history. Proposed history policy: new human
  Locations can inspect historical notifications but do not schedule historical
  agent work. Test this separately from the fixed three-Location fixture.
  Reject qualified addressing until a qualified-address grammar/API exists;
  never reinterpret a targeted request as broadcast. Multi-Location agent Actors
  require an explicitly selected execution Location; notification availability
  cannot authorize multiple harness submissions. Eligibility must be checked
  before claim consumption, not after Actor-only claiming.
- #59: replace unconditional deletion visibility with causal revision alternatives.
  A deletion observing an edit may hide it normally; deletion concurrent with an
  unobserved edit exposes both full revisions and provenance. Resolution names
  the observed revision set, retains history, and restores the original comment
  identity or keeps it deleted. A later third edit reopens incompatible conflict.
  API, CLI and browser must expose and resolve the same alternatives.
- #60: notification intent needs an explicit causal generation and targeted
  revocation. Add/remove before publication may suppress publication; receivers
  must still enforce definite revocation before the last cancellable handoff.
  Remove/re-add creates a new generation. Disputed removal does not revoke all
  alternatives. Retaining resolution preserves eligible intent; do not mint a
  generation on every resolution. Restore after definite removal creates fresh
  intent; restore of a losing disputed deletion must not inherit its tombstone.
  Decide this from observed causal facts, not message arrival order. Persist
  publication, Location receipt, queue and handoff separately. Deterministic
  barriers must stop tests immediately before adapter submission. Conflicted
  context must carry all revisions and require clarification before work.
- #62: replicate identities, generations, definite revocations and Actor read
  facts; explicitly enumerate any durable receipt/handoff evidence available on
  each survivor. Recover from survivor plus newly supplied configuration and
  retained receiver state, without restoring lost hub SQLite. Fence the old
  authority by replacement configuration/credential epoch before delivery;
  clients must reject its claims until explicit reenrollment. Retry unknown
  delivery with the original notification ID. Retained uncertain handoff evidence
  blocks resubmission pending positive/explicit reconciliation. Lost receiver
  evidence may allow repeated work; downstream idempotency is still necessary.
  Expose unfinished work at unavailable Locations and explicit reassignment;
  retirement must not erase it or recreate a lost agent session implicitly.

For #58 use Ryan's three registered Locations, Alice, two independent agent
Actors, one hub and two persisted replicas, including two Locations on one
replica. Run both orders/restart, 20 ineligible-first polls, ten receipt retries,
shared observed-revision read state and unseen concurrent revision. #59 needs
both resolution choices in both orders, full restart and delayed third edit.
#60 needs every issue matrix row with facts recorded at each deterministic
boundary, including busy receiver/restart and old revocation after re-add.
#62 needs current/lagging survivor, retained/lost receiver state, uncertain
handoff, missing acknowledgement and two complete recoveries. Every scenario
uses independent intent accounting, not only equal replica hashes.

## Current boundaries to preserve

The local service owns the replica, not the browser. Browsers cannot reopen
independently of that host (the LAN companion has since been removed). Acknowledgement follows local disk
flush; hub acknowledgement is separate. Enrolled replicas may reopen offline;
new enrollment and delivery leases require the hub. Accepted work can save
locally during outages. SQLite claims are leases, not execution locks, and
receipts/read facts do not prove work completion. These tests establish no
power-loss guarantee or universal live-model compliance.

No transport replacement is proposed here. Future #62 transport changes must
assess authenticated direct peers: trusted LAN peers may be reachable with
configured addresses, while discovery, NAT traversal, phone background
execution and relay access remain concrete constraints. Browser clients have
no persisted peer database. Keep shared-secret admission; do not infer direct
peer feasibility from loopback tests.

Synchronization is not backup. Preserve old directories, metadata, credentials,
receiver evidence and any attachment dependencies. Recovery must document which
facts reached the survivor and cannot recover unseen facts. No active controller
data, credentials, mappings or services are changed by this wave.

## #61 reconciliation against PR86

| Issue criterion | PR86 assessment | This integration / required evidence |
| --- | --- | --- |
| Canonical type/resolved Actor/payload | Implemented; replica/time excluded | Retained; independent fingerprint oracle |
| Ten local identical retries, stable results | Existing replay tests, not full issue fixture | Public persisted fixture repeats ten times per replica |
| Local incompatible reuse has no effect | `OPERATION_ID_REUSED` | Retained, count asserted |
| Equivalent disconnected retries, truthful provenance | One logical effect; public reader selected one origin | `origins` now preserves every recorded replica/time |
| Different same-ID task creates in explicit group | Separate task IDs but no integrity group | `integrityConflicts` in task context, unresolved, both variants |
| Full payload/type/Actor/hash/key/origin/result | Events retained; origin collapsed on equivalent retries | Full events and origins exposed in each group |
| Colliding derived entity IDs marked | Fingerprint-derived IDs avoid the reproduced collision | Both tasks link to the same integrity group; no claim of cryptographic collision resistance proof |
| Both orders, persisted restart/resync | In-process merge/import coverage, not complete service matrix | New real-service fixture, both reconnect orders, all reopened |
| Retry after collision explicitly references both | Generic reused-ID error without details | HTTP 409 `OPERATION_INTEGRITY_CONFLICT`, all variants in details |
| No generated repair IDs/replay/dispatch | No automatic repair | Exact three-event fixture (two variants + equivalent retry), zero pending mentions; inspection is read-only |
| Supported history/browser indication | History retained; no browser integrity indication | Task browser shows full expandable variants; both engines covered |

Original PR86 is reused, not independently reimplemented. Three-way application
preserves main's issue-link imports/behavior, comment ownership check (Alice
edits Alice's comment), and CLI issue-link documentation. `issueLinkIndex` now
uses the conflict-aware operation reader. Fresh results belong to this combined
current-main candidate, not to the original PR86. Its reported failing full
verification and 2,097 ms acknowledgement against a 2,000 ms gate remain historical
failures, not erased by targeted success.

Schema 5 is an intentional compatibility break. All participating services must
match. Old installs remain preserved and rejected; no migration or deployment.
The caller's `operationId` stays the retry key. Receipts/history expose it as
`requestId`; stored `operationId` and revision/entity IDs bind key and request
fingerprint. Cloud/native callers must use returned revision IDs and retain the
original retry envelope. Runtime must not implicitly deploy schema 5. Security's
admission changes are separate; passing schema 4 or gated-credential tests is
not qualification of the combined schema 5 runtime.

Lifecycle review: `Workspace.apply` still prepares once, mutates only on first
application, awaits the same flush and then acknowledges. Only receipt fields
and snapshot projection changed. Server error mapping adds the integrity 409;
admission, handler lifetime, flush and shutdown order do not change. The bounded
model actions/guards/atomicity and mutation anchors therefore remain unchanged;
source mapping is refreshed after review, with implementation tests still owed.

## Preliminary baseline and full qualification

`support/reliability/profiles.json` freezes all four issue profiles and limits.
`baseline.mjs` deliberately runs only its `preliminary` fixture: one persisted
hub, eight Actors, ten tasks, twenty initial comments, exactly sixty preload
operations (registrations/creates then description updates), ten warmup writes
and thirty measured writes. All requests use public HTTP. The steady mix is
50% updates, 30% comments (one-third mention), 20% observed reads. Scheduled
submission includes context-building/client queue delay. JSONL intents precede
submission; receipts and failures are separate. Final exact entity/event/payload
sets are independently checked. No automatic retries. Resource samples are
per second; stops preserve partial artifacts.

This is a comparable micro-baseline, not Handful qualification: no replicas,
Location clients, receiver handoffs or browsers are driven. Location and hub-loss
recovery scenarios are **not-comparable** before implementation. UI, convergence,
startup, receipt/handoff, traffic and queue metrics are **not-measured** by this
harness. Runtime fingerprints include built UI even though it is not exercised.
The short fixture cannot establish maximum sustainable capacity or any full
profile's latency gates. No profile is yet qualified.

Reproduce with Node 24.11.1 and matching dependency installs, from this checkout:

```sh
# Archive fixed source into a fresh disposable directory; never copy live data.
git archive bd55f246bacae5068b761c999e7b849501e7a5e3 | tar -x -C "$subject"
# Prepare matching dependencies and build UI inside $subject before fingerprinting.
python3 support/reliability/locked.py node scripts/verify-watchdog.js \
  --timeout 180 --log "$evidence/baseline.log" --record "$evidence/watchdog.json" \
  -- node support/reliability/baseline.mjs "$subject" "$evidence/run" 1
```

The lock wrapper acquires `/tmp/pardner-selfhost-heavy-tests.lock` nonblocking and
holds it through the entire child. Exit 75 means deferred, no run started. Never
unlink it. Use one declared serial batch per coordinator slot. Resource limits
are 2 GiB RSS and 1 GiB disposable data; preliminary watchdog is 180 seconds.
The baseline samples the in-process HTTP server and client together, so RSS/CPU
cannot be attributed to server alone. Host topology/resource contention is an
experimental condition, not justification to loosen assertions.

Full #63 remains substantial work: implement three replicas/two browser views,
all active Locations/production polling, independent receipt/handoff manifests,
per-Actor five-minute activity, >=100 scheduled UI samples, exact preload/history
mix per profile, three fixed seeds/profile with 5-minute warmup/30-minute load,
60-minute Dozens soak, 5-minute idle sampling, three offline restarts/partitions
and fixed 100-operation backlog, stopped-write and live-write catch-up, then
hub-loss recovery. Resource/queue/traffic/context/disk/CPU/RSS/loop measurements,
no dropped stalled requests, all maximum gates and final exact accounting remain
mandatory. Do not run the preliminary harness with enlarged numbers and call it
that matrix. Final integration also owes normal `npm run verify` and the full
20-seed acceptance gate; human/real-agent acceptance remains separate.
