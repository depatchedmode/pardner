# Failure diagnostics

Use this procedure when a check fails or hangs and the change is not plainly the
cause, including intermittent failures and failures that appear only with a
tooling overlay. The goal is a causal conclusion, or an honest statement that
there is none yet. A green run is not the goal.

## Preserve first

Keep the failing log, the watchdog record, and any trace before running anything
else. Name later attempts distinctly (`verify.attempt2.log`); never overwrite.
Record the candidate fingerprint and `candidate.diff` for every tree you run.

## Bounded diagnostic reruns

Decide the budget before rerunning. As a default, rerun the failing command at
most three times on the unchanged candidate, plus any focused reruns of the
failing file. Record every result. Reruns measure how often the failure happens;
they do not clear it. A run that passes after a failure leaves the outcome
`failed` or `blocked` until the failure is explained. Do not increase timeouts,
skip or narrow tests, or reduce concurrency to obtain a pass.

## Baseline comparison

Run the same command, the same number of times, on the comparison base in a
separate scratch checkout, under matched conditions: the same Node, dependencies
(symlinked from the candidate checkout is acceptable; record it), and machine
load, with runs done one after another rather than concurrently. When a subject
and an overlay are involved, also compare the subject alone, the overlay alone
(or the base plus overlay), and the combination. Report each arm's count of
runs and failures and the failing test names. Small counts give weak evidence;
say so.

A difference between arms is correlation. It narrows the search but does not
establish what causes the failure, and an unchanged failing test file does not
establish that the change is unrelated.

## Controlled experiments

Form a specific hypothesis for each distinct failure signature and test it with
the smallest experiment that could falsify it:

- **Load or timing**: run the failing file alone in a loop, with and without
  synthetic CPU load (for example busy worker threads) and with and without the
  suspected extra work (such as the overlay's new tests). If synthetic load
  alone reproduces it, the trigger is generic load, not that specific work.
- **Mechanism**: add temporary tracing outside the repository, for example a
  preload passed with `NODE_OPTIONS=--import=...` that wraps the method under
  suspicion and logs timestamps, in-flight requests, and open sockets when a
  step stalls. Do not leave tracing in the candidate.
- **Intervention**: in a scratch checkout, apply the smallest change that the
  mechanism predicts will remove the failure. Then compare failure rates under
  the same conditions. A rate that drops from repeated failures to none over a
  stated number of runs is causal evidence. It is not proof, and it is not an
  approved fix.
- **Deterministic reproduction**: where possible, force the suspected
  interleaving (for example delay one response with a route handler) so the
  failure reproduces every time without load.

Run experiments with the watchdog and keep their scripts and outputs under the
run directory.

## Deciding and reporting

- Caused by the subject: repair it as part of the change.
- Caused by the overlay: repair the overlay. Its verification is a separate
  obligation.
- Pre-existing defect exposed by timing: report it as a separate defect with
  its evidence and the proposed repair, scoped to a separate PR when it belongs
  to product code or unrelated tests. Until that repair lands, the combined
  candidate's routine outcome is `blocked`, naming the dependency.
- Unexplained after the budget: the outcome is `failed`. State what was ruled
  out and what remains.

Report what each experiment showed, its run counts, and what it cannot show
(for example, that one machine's timing may not generalize).
