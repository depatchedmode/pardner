---
name: verify
description: Verify Pardner changes through applicable regression checks and observable CLI, browser, and service behavior. Use before reporting implementation complete or recommending a PR merge; run the qualification tier only when explicitly requested.
---

# Verify Pardner

Run from the repository root. Follow [AGENTS.md](../../../AGENTS.md), the
[acceptance contract](../../../docs/PARDNER-ACCEPTANCE.md), and the current
implementation in [README.md](../../../README.md#current-implementation).

`/verify` means routine verification. `/verify qualify` additionally requests the
deliberate qualification tier. A path trigger, a merge request, or a failed check
does **not** implicitly request that tier. The existing `test:qualification`
script is a focused regression suite and is part of routine verification.

## Plan and state the expected behavior

1. Read the task, diff, and affected contracts. Name each intended behavior and
   affected guarantee, its observable expected result, and the evidence that
   would establish it. Set expectations before driving the code.
2. Select the comparison base: normally `origin/main`; for a stacked PR use its
   actual base branch. Record the ref and commit. Fetch when needed; the planner
   uses the locally available ref and does not fetch or change branches.
3. Create a unique report directory and run the planner:

   ```sh
   mkdir -p output/verification
   run_dir=$(mktemp -d "$PWD/output/verification/run-XXXXXX")
   npm --silent run verify:plan -- --base origin/main > "$run_dir/plan.json"
   ```

   See the [plan contract](references/plan.md) for fields and classification
   rules. Resolve every `unclassified` path by inspecting it and updating the
   map/tests; unknown does not mean low risk. An empty diff proves nothing:
   when verification is explicitly requested on a clean baseline, run routine
   verification and the relevant feature exercise, recording that scope.
4. For every changed behavior, inspect relevant entries in the
   [feature map](features/README.md). Existing checks count only when their
   assertions cover the expected result. Add or adapt a focused exercise for
   uncovered behavior through its relevant public CLI, browser, or service path.
   Keep useful regression coverage; do not add tests just to mirror a trivial
   implementation detail. A UI presentation change also needs visual inspection.
5. Answer the semantic questions below, including for guidance-only changes.
   Preserve the original plan as the mechanical result; record additional
   semantic triggers and coverage decisions in the report.

### Semantic qualification questions

Record yes/no/unknown, the affected paths, and a short reason for each applicable
question. Inspect callers beyond the diff where a guarantee crosses modules.

- Does this change different-field merging, authored same-field alternatives,
  conflict resolution, or edit/delete behavior for tasks, veins, or goals?
- Does it change operation identity, duplicate retries, or replay effects?
- Does it change acknowledgement versus the persistence barrier, locally saved
  heads versus explicit hub acknowledgement, or enrolled offline reopen?
- Does it change durable receipt before delivery acknowledgement, leases,
  interrupted delivery, or the behavior of accepted work during a hub outage?
- Does it change transport, admission, enrollment, or recovery in a way that
  affects the acceptance guarantees?
- Does the task or PR claim milestone completion, update the goal audit, or close
  acceptance criteria requiring qualification? Do changed instructions, tests,
  or tooling weaken how a guarantee is measured?

Any yes adds a qualification obligation. Unknown remains incomplete until
investigated; it cannot become a no by omission. Path/dependency/harness triggers
are conservative requirements, not suggestions to dismiss because the diff is
small. Qualification remains deliberate even when required.

## Prepare, launch, and doctor

Check Node against `.node-version` (currently 24.11.1), both dependency installs,
and the pinned Playwright browsers. From an unprepared checkout:

```sh
npm ci
npm ci --prefix ui-prototype
npx playwright install chromium webkit
npm run ui:build
```

Use existing matching installs when available. A missing prerequisite is a setup
problem to resolve or report; changing pins, skipping assertions, or substituting
localhost for LAN does not resolve it. Browser launch must work, not merely an
executable-path existence check. Read the [LAN guide](../../../docs/PARDNER-LAN.md)
when companion/browser checks apply.

The reusable launch/doctor/drive/cleanup example is:

```sh
npm run verify:smoke
```

It starts the real `pardner serve` process with a new temporary data directory
and OS-assigned HTTP/WebSocket ports, uses the public CLI, and strips inherited
`PARDNER_*` settings through the existing fixture. Readiness requires an owned
live child, matching workspace identity, and a successful authenticated `status`
read with locally saved state. It registers its own Actor, verifies create/replay
and restart, then prints the retained report path. This is a small feature
exercise, **not a substitute** for the checks selected by the change.

For another feature, reuse [cli-resources.js](../../../support/cli-resources.js)
in an owned exercise: `startCliService(directory)` launches and waits for service
readiness; `cli(directory, ['status'])` is the read-only doctor. Compare the
returned `workspaceId` to the launch result and inspect `savedLocally` and
`storageError`. Repeat the doctor whenever a drive looks wrong. For a browser,
open the returned `httpUrl + '/pardner/'`; use the selectors in the feature map.
Read only the disposable instance's connection file for authentication and keep
its tokens out of artifacts. A fresh service has no Actors until registered.

## Run, repair, and collect evidence

For implementation changes, run the focused scripts in `plan.scripts`, any
additional behavior-specific checks, then `npm run verify`. The latter builds
the UI, runs all discovered Node tests, and runs one acceptance seed. Focused
scripts give earlier feedback; they do not replace that final check.

For guidance-only work, check paths, links, and `git diff --check`; also inspect
new untracked text because Git's diff check does not include it. Qualification
claims in documentation still require their own evidence.

Capture the final candidate after preparation and before running checks:

```sh
node --input-type=module -e 'import { candidateFingerprint } from "./support/acceptance/candidate.js"; console.log(JSON.stringify(await candidateFingerprint(), null, 2))' > "$run_dir/candidate.before.json"
```

Repeat into `candidate.after.json` after all checks. Compare `sha256`; preserve
Node/platform metadata, Git HEAD, the plan, and the diff identity too. The
fingerprint includes source, tests, locks, and actual built UI, but not guidance.
For guidance-only work record HEAD and the guidance diff instead of requiring a
UI build. Never treat a matching fingerprint as evidence that a command ran.

- Preserve exact commands, exit codes, observed pass/fail/skip counts, and logs
  under the run directory. Preserve a failing attempt before a repaired rerun.
  If using a pipe to `tee`, enable `pipefail` so the log command cannot hide a
  failed check.
- Repair defects introduced by the change, including affected callers, and
  rerun the checks whose evidence the repair invalidated. The final implementation
  must pass `npm run verify`. Refresh the plan if the repair changes scope.
- Keep expected results grounded in the task and contracts. Explain any justified
  assertion correction; do not weaken an expectation to match a faulty result.
- Reproduce unrelated defects and report them separately. If they block required
  evidence, verification is incomplete. Stop for an unresolved product decision,
  inaccessible prerequisite, or unrelated blocker after independent work is done.
- Record every skip and its relevance. A skipped applicable LAN/browser check
  leaves that behavior incomplete even if the command exits zero. A successful
  rerun without an explanation does not erase an intermittent failure.
- If the candidate changed during checks, do not combine results into a pass for
  the final code. Establish the final candidate and rerun affected evidence. A
  qualification run must match the final candidate exactly.

Capture actions and resulting state: CLI arguments/results, browser actions and
readback, or service receipts and restart recovery. Screenshots alone cannot
establish persistence. Mock only boundaries already isolated in production and
state what the mock excludes. The automated gate uses deterministic workers;
it does not establish real-agent or arbitrary external-effect behavior.

## Cleanup

Use disposable data directories and owned subprocesses. Put `await service.stop()`
and scratch removal in `finally`; use the handles returned by the launch helper,
never a process-name kill. Attempt cleanup after failed runs too. If stopping
fails, retain scratch state and report the owned process/directory for recovery.
Do not touch an existing `.pardner` or a previous install. Keep evidence outside
scratch directories. After cleanup, read the saved report and confirm artifacts
still exist; `verify:smoke` performs this check itself.

## Report and enforce

Write `report.md` in the run directory containing:

- Scope, base/HEAD and candidate identity, environment, and artifact locations.
- Each changed behavior: expected result, exercised check, observed result, and
  `passed`, `failed`, or `incomplete` status.
- Commands/counts/skips, repairs, unrelated defects, and evidence gaps.
- Qualification: `not required` only after semantic review, `required, not run`,
  `failed/incomplete`, or `passed for <candidate hash>`, with reasons/evidence.
- Whether a merge recommendation is blocked and exactly what remains.

When qualification is required but not explicitly requested, report
**Qualification required, not run** and link the
[qualification procedure](references/qualification.md). Continue routine work.
When explicitly requested, follow that procedure after routine verification.

Maintain a `Qualification` section in the current PR description and the
`needs-qualification` label. Preserve other PR content. If no PR exists yet,
include the section in the local report and carry it into the PR when created;
verification alone does not authorize publishing a PR. If GitHub is unavailable,
retain the pending update locally and report it. Apply the label when required
evidence is missing, failed, or stale; remove it only after the final candidate
satisfies all applicable qualification obligations. Record the source of any
previous evidence before reusing it.

Withhold a merge recommendation while relevant checks are failed/incomplete or
required qualification is pending. PR creation/review can proceed. Enforcement
is by the agent; this skill does not configure GitHub branch protection or CI.
Report real-agent rehearsal, physical devices, and power-loss limitations
separately, without treating automated results as those observations.

## Maintain the map

When a feature, entry point, or assertion changes, update its map entry alongside
the code. For a wider audit, use `maintain-verification-skill` when available;
otherwise reconcile the map directly against current commands, routes, tests,
and contracts. Keep known gaps visible until exercised.
