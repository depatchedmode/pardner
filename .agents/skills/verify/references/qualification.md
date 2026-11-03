# Deliberate qualification

Read only when qualification is explicitly requested, or when reporting the exact
pending gate. Follow [the acceptance contract](../../../../docs/PARDNER-ACCEPTANCE.md)
and [LAN requirements](../../../../docs/PARDNER-LAN.md). A merge request alone
does not invoke this tier.

## Preconditions and scope

- Routine verification must pass for the candidate, including behavior-specific
  checks and applicable Chromium/WebKit checks. Resolve relevant skips first.
- Use Node 24.11.1, matching root/UI dependencies, pinned Chromium and WebKit,
  and the current UI build. Check actual launches. LAN checks need a real
  non-loopback IPv4 interface; localhost is not a substitute.
- Record the baseline/current commits, uncommitted diff, environment, and
  candidate fingerprint. Keep the source, tests, dependencies, and build fixed
  through the run. Use a separate checkout if other work is actively editing it.
- Confirm that affected guarantees have direct coverage. Twenty repetitions of
  the existing task workflow do not demonstrate a new vein, goal, recovery, or
  delivery behavior that the scenario never exercises.

## Run the gate

```sh
npm run test:acceptance -- --repeat 20 --seed 1
```

Preserve the exact exit status and logs in the routine run's report directory.
The runner prints a directory under `output/acceptance/`. All twenty seeds must
finish in one successful run with the same candidate. Do not combine successful
seeds from failed attempts, skip seeds, or retry silently. Preserve failures and
their explanations; after repairs, establish the final candidate and rerun the
entire gate.

Inspect that directory's `summary.json`, `candidate.json`, all twenty
`seed-N/report.json` files, and any failure/cleanup artifacts. Verify twenty
reports for seeds 1–20, successful scenario outcomes, candidate identity, and
the asserted timing bounds. Extract measured maxima from the timing observations
in the seed reports; never report threshold values as observed measurements.
The existing runner checks candidate stability at the end too.

## Decide what passed

Record the gate result separately from routine checks and the overall milestone.
Milestone claims additionally require the contract's review of regression
applicability, retirement of legacy paths, documentation, and fresh-checkout
execution. Run the documented commands in a fresh checkout when that claim is
in scope; an already-installed working tree does not satisfy it.

Compare the final working candidate to the acceptance candidate before clearing
the obligation. Later source, harness, lockfile, or built-UI changes invalidate
that qualification evidence, even if they appear low risk. Guidance-only edits
outside the fingerprint need claim/link review and do not by themselves alter
the tested executable candidate. A commit-only change with identical candidate
contents can reuse the evidence, recording both commit identities.

Draft an entry for [PARDNER-EVIDENCE.md](../../../../docs/PARDNER-EVIDENCE.md)
in the run report for human review. Include date, candidate, exact commands,
observed counts/skips, report paths, measured maxima, and limitations. Do not
automatically rewrite the goal audit or assert that a milestone is complete.

Update the current PR's `Qualification` section with the candidate and evidence.
Remove `needs-qualification` only when all applicable obligations are satisfied;
otherwise preserve the label and name the remainder. Publishing a PR or sending
other messages is outside this procedure unless separately authorized.

The [two-machine real-agent rehearsal](../../../../docs/PARDNER-REHEARSAL.md),
physical iOS/Android checks, and power-loss durability are separate evidence
boundaries. Automated workers, browser emulation, and process-kill tests do not
establish them. A missing manual rehearsal blocks a claim that requires it,
not every unrelated change.
