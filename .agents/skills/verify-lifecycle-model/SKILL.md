---
name: verify-lifecycle-model
description: Check the code-mapped lifecycle model of Pardner's request admission, persistence acknowledgement and shutdown ordering, keep its source mapping current, and demonstrate that the workflow catches source mutations. Use when changing automerge-sync-server.js, lib/workspace.js, lib/workspace-runtime.js or lib/durable-repo.js, or when the model check reports drift.
---

# Verify the lifecycle model

Run from the repository root with Node 24.11.1. Read
[PARDNER-LIFECYCLE-MODEL.md](../../../docs/PARDNER-LIFECYCLE-MODEL.md) for the
model, its mapping, bounds, assumptions and limits before interpreting a result.
This skill complements the [project verification skill](../verify/SKILL.md); it
is not an additional merge gate.

## Routine check

```sh
npm run verify:model
```

The command first compares the four mapped source files with
`formal/lifecycle/mapping.json` and verifies every mapping anchor, then explores
the bounded model and prints the state count, the property results and the
coverage witnesses. Exit codes: `0` pass, `1` property violation with a
counterexample, `2` source/model drift or a missing anchor, `3` usage error or
state limit, `4` an unreachable coverage witness (the bounds no longer cover a
scenario, so the result is vacuous for it).

`npm run test:runtime` includes the implementation checks
(`test/lifecycle-conformance.test.js`) and the checker self-test
(`test/lifecycle-model.test.js`). Keep both passing; the model alone establishes
nothing about the JavaScript.

## When the check reports drift

Drift means a mapped file changed since the recorded revision. Do not accept it
mechanically:

1. Read the diff of each listed file and the `re-review model actions` list.
2. For each affected action in `formal/lifecycle/model.js`, confirm its guard,
   effect and atomicity note still describe the code. Update the action, its
   `maps` anchors and, when semantics changed, the invariants or witnesses.
3. Update `formal/lifecycle/mutations.js` if a mutation's `find` text no longer
   matches; the runner refuses a mutation whose anchor is not found exactly once.
4. Run `npm run verify:model` with `--skip-drift` until it passes, then record
   the new mapping with `npm run verify:model -- --accept-drift` and rerun the
   routine check.
5. Record in the PR what changed in the model and why.

## Reading a counterexample

A violation prints the action sequence from the initial state with one line per
state. Reproduce the ordering with a real Node test before treating it as a
product defect; the model abstracts heads as counters and treats several
asynchronous steps as atomic (listed in the report). Report a confirmed
counterexample separately from the change that found it.

## Mutation demonstration

```sh
npm run verify:model:mutations -- --json output/verification/lifecycle-mutations.json
```

The runner copies the mapped sources, support files and tests into a disposable
directory, applies one textual mutation at a time, runs the implementation check
there, runs the drift check against the copy, runs the mirrored model mutation,
restores the copy, and removes it. The working tree is never modified; the
report records its mapped-file hashes before and after. Every row must show
`caught`, `reported` and `counterexample`. Use `--only NAME` for one mutation and
`--keep` to inspect the copy. A single model mutation can be inspected with
`npm run verify:model -- --mutate NAME`.

## Extending the model

Add an action with its `maps` anchors, a witness that shows the new scenario is
reachable, and an implementation check that observes the same boundary in real
Node. Keep the default bounds cheap (seconds); wider bounds are documented in
the report and can be requested with `--replica-edits`, `--hub-ops`,
`--ack-attempts`, `--storage-failures` and `--max-states`. Update the report's
results and the evidence record in `docs/evidence/lifecycle-model.json` when the
mapping revision, bounds or results change.
