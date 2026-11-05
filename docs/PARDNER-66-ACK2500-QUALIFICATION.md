# PR101 qualification under the approved acknowledgement policy

**Routine verification and the fresh 20-seed gate passed** for the candidate
below under the owner's approved **2,500 ms local operation acknowledgement
bound**. This qualifies the scoped automated implementation for merge review.
The original 2,384.036 ms failure remains a failed historical result against its
then-current 2,000 ms contract. Its cause remains unexplained; this is a policy
decision, not a diagnosed performance repair.

The owner explicitly deferred deeper timing/root-cause work to
[#107 — reusable performance monitoring and slow-operation diagnostics](https://github.com/depatchedmode/pardner/issues/107).
That follow-up is not another PR101 merge gate and starts no experiment here.
No historical failure, diagnostic result or raw artifact was changed or
retroactively passed. The [historical readiness record](https://github.com/depatchedmode/pardner/blob/b5a6058f7a6a4667a84ce57329baa258ae9385f1/docs/PARDNER-66-READINESS.md)
and [interleaved diagnostic report](PARDNER-66-INTERLEAVED-DIAGNOSTIC.md) retain
those results and link the preceding investigations.

## Candidate and policy scope

- Tested policy commit: `03c92167c2f38a0c5c6cad7b73715aec2f7afbd8`.
- Actual fetched main/base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`; it matched the expected base.
- Previous documentation head: `b5a6058f7a6a4667a84ce57329baa258ae9385f1`; the fetched PR head matched it before this change.
- Frozen source/test/lock/build fingerprint: `a531e2fd1853185a33de61d51bce88d0fcc4b8a4e7c875ef7141dce1038dd459`.
- Node **24.11.1**, matching root/UI dependency installs, current UI build,
  actual pinned Chromium **151.0.7922.34** and WebKit **26.5** launches; LAN IPv4
  was available. Before/after candidate fingerprints and installed-lock identities were checked.

The atomic policy commit changes acknowledgement enforcement in
`support/acceptance/expected-operations.js`, `limits.localAckMs` in
`scripts/acceptance.js`, and current normative documentation/feature mapping.
The only executable changes are those two 2,000→2,500 constants. The dedicated
boundary check accepts exactly 2,500 ms and rejects 2,500.001 ms, while retaining
saved-locally and originating-replica checks. Existing component expectations
and all routine tests passed; no implementation-mirroring test suite was added.

Local UI visibility remains **2,000 ms**, offline restart **5,000 ms** and
convergence **10,000 ms**. HTTP timeouts, retries, watchdogs, healthy dispatch,
the independent reliability offered-load profile and SSH round-trip gate are
unchanged. Persistence barriers, fixture sizes, coverage, main-comment authority,
cleanup approval/revocation, schema5 identity/provenance and bridge coordination
are unchanged from the reconciled implementation. No provider or #105/#104
union was added.

Semantic review explicitly classified the harness/policy change as requiring
fresh qualification. The refreshed plan has no unclassified paths, warnings or
unresolved semantic-review entries. All planner-required routine suites ran;
qualification was deliberately invoked by the owner. No diagnostic preflight,
phase preload, observer or synthetic CPU load ran in this batch.

## Routine verification

| Command/check | Result |
| --- | --- |
| `node --test (bridge/security/acceptance union)` | 145/145 passed |
| `npm run test:verification` | 39/39 passed |
| `npm run test:qualification` | 12/12 passed |
| `npm run test:runtime` | 118/118 passed |
| `npm run test:cli` | 12/12 passed |
| `npm run test:ui` | 14/14 passed |
| `npm run verify:model` | 174,614 states, 679,456 transitions; mapping, invariants, progress and coverage witnesses passed within declared bounds |
| `npm run verify` | Current UI build, 17 Python + 522 Node tests, then one full acceptance seed passed |
| External policy boundary/metadata check | 11 checks passed, including unchanged non-acknowledgement limits |

There were no test failures, skips or cancellations. The routine seed's separate
audit verified **719 operations** and three recorded replica results, with a
receipt-inclusive acknowledgement maximum of
**351.060 ms**. Its result is not combined
with the deliberate gate's seeds. Model and conformance evidence do not claim
properties beyond the mapped lifecycle model's declared bounds.

## Fresh deliberate qualification

Exactly one invocation ran:

```sh
npm run test:acceptance -- --repeat 20 --seed 1
```

It completed all **20 seeds**, **14,380 acknowledged operations** and
**60 recorded live replica verifications**, exiting 0 after
**2498.689 seconds**. No retry, skipped seed, excluded failure or
combination with earlier runs supplied this pass.

| Observed maximum across all 20 seeds | Measured ms | Current bound ms |
| --- | ---: | ---: |
| Local acknowledgement, including all receipt records | 688.665 | 2,500 |
| Local acknowledgement timing entries | 688.665 | 2,500 |
| Agent-effect acknowledgement timing entries | 266.547 | 2,500 |
| Local UI visibility | 87.255 | 2,000 |
| Offline restart | 2158.834 | 5,000 |
| Convergence after reconnection | 4480.872 | 10,000 |

The audit opened the summary, candidate record and all twenty reports. Every
report declares exactly `localAckMs: 2500`, `localVisibleMs: 2000`,
`offlineStartMs: 5000`, and `convergenceMs: 10000`. Report and snapshot digests,
seed cardinality/order, success flags, every timing value and every receipt's
elapsed value were checked. Schema5 request IDs were reconciled with stored
operation/revision identities and originating replicas. Intended effects were
reverified against retained snapshots; both deterministic agent ledgers had
exactly one completed/acknowledged inbox record and one effect record per seed.
No failure or cleanup-error artifact appeared.

Only the first replica snapshot per seed is retained for offline re-verification.
The other two replicas have recorded live verification results; this is not a
claim that three separate snapshots per seed were retained. Snapshot equality
was checked only after the independent intended-effect checks. The candidate
fingerprint matched before routine work, after routine work and after the gate.

## Cleanup, publication and remaining boundaries

The single nonblocking advisory-lock acquisition covered preparation, all test
children, the gate and cleanup. Routine commands used the normal 900-second
watchdog; the deliberate gate used 7,200 seconds, without changing any scenario
limit. All watchdogs completed with exit 0, no timeout, hung process, survivor or
new fixture scratch. The final ownership audit found no attributable survivor.
The lock was explicitly released with wrapper exit 0, retaining the stable file;
there was no reacquisition or downstream handoff.

[Allowlisted evidence](evidence/issue-66-ack2500.json) records the identities,
counts, digests, timing maxima, browser/dependency preparation and cleanup.
Exact commands, source copies, semantic review and raw logs remain private under
`output/verification/issue-66-ack2500/`; acceptance reports/browser traces remain
private under their recorded `output/acceptance/` paths because they contain
disposable credentials. Guidance-only publication does not change the tested
fingerprint; its links, claims, JSON and diff are checked separately.

The original 2,000 ms failure is preserved and its unexplained cause explicitly
deferred by the owner; it is no longer an unconditional blocker after this fresh
revised-contract pass. This does not diagnose or repair latency. #107 remains a
separate investigation. Root owns the head-guarded merge and subsequent tracks.
No merge, deployment, migration, production-data/credential change, live cleanup,
issue closure, native/paid provider session or human approval was performed.

#50/#66 native/human acceptance and #67 remain separate. Deterministic workers,
process-crash tests and emulated browsers do not establish native model behavior,
arbitrary external-effect idempotency, power-loss durability or physical-device
acceptance. This report makes no new overall milestone-completion claim.
