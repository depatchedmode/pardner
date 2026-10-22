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
3. Create a unique report directory and run the planner against the checkout
   under verification:

   ```sh
   mkdir -p output/verification
   run_dir=$(mktemp -d "$PWD/output/verification/run-XXXXXX")
   npm --silent run verify:plan -- --cwd "$PWD" --base origin/main > "$run_dir/plan.json"
   ```

   `--cwd` selects the checkout; the plan records the resolved `repository` and,
   separately, the `tooling` checkout whose planner ran. Confirm `repository.root`
   is the checkout you meant. See the [plan contract](references/plan.md) for
   fields and classification rules. Resolve every `unclassified` path by
   inspecting it and updating the map/tests; unknown does not mean low risk.
   Every `qualification.reviewRequired` entry needs a recorded semantic answer
   before it can be cleared. An empty diff proves nothing:
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

### Subject and tooling overlay

Sometimes the change under verification (the **subject**, such as a PR head) is
checked with tooling or guidance that is not yet merged (the **overlay**, such
as an unmerged version of this skill). Check out the subject, apply the overlay
without committing it, and plan with `--overlay REF`:

```sh
npm --silent run verify:plan -- --cwd "$PWD" --base origin/main --overlay "$overlay_ref" > "$run_dir/plan.json"
```

Record both commits and how the overlay was applied, including any conflict and
its resolution; never drop either side to make it apply. The plan keeps every
path and attributes each to `subject`, `overlay`, or `both`; `overlay.missing`
lists overlay paths that were not applied. All checks run against, and all
evidence describes, the **combined candidate**. Do not exclude overlay files,
tests, or scripts from the run or its fingerprint. A failure is attributed to
the subject or to the overlay only through the diagnostics below. Report subject
results, overlay effects, and combined-candidate results separately.

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

The planner does not trigger on test files merely added to an otherwise
unchanged regression command. It lists them under `reviewRequired` instead.
For each, record what the new tests measure and confirm that none of the
questions above becomes yes. Removed or replaced coverage, changed options or
build steps, and changes to `verify`, `test`, or `test:acceptance` still trigger
qualification.

## Prepare, launch, and doctor

Check Node against `.node-version` (currently 24.11.1), both dependency installs,
and the pinned Playwright browsers. A shell's default `node` is often a different
version. Select the pinned one with your version manager (for example
`nvm use "$(cat .node-version)"`, `fnm use`, or `volta run --node "$(cat .node-version)"`),
or put its `bin` directory first on `PATH`. Agent shells often do not keep
environment changes between commands, so select it in every command that runs
Node, and record `node -v` with each log. From an unprepared checkout:

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
npm run verify:smoke -- --report-dir "$run_dir"
```

It starts the real `pardner serve` process with a new temporary data directory
and OS-assigned HTTP/WebSocket ports, uses the public CLI, and strips inherited
`PARDNER_*` settings through the existing fixture. Readiness requires an owned
live child, matching workspace identity, and a successful authenticated `status`
read with locally saved state. It registers its own Actor, verifies create/replay
and restart, then writes `smoke-*/report.json` inside the run directory and
prints its path; link it from `report.md`. This is a small feature
exercise, **not a substitute** for the checks selected by the change.

For another feature, reuse [cli-resources.js](../../../support/cli-resources.js)
in an owned exercise: `startCliService(directory)` launches and waits for service
readiness; `cli(directory, ['status'])` is the read-only doctor. Compare the
returned `workspaceId` to the launch result and inspect `savedLocally` and
`storageError`. Repeat the doctor whenever a drive looks wrong. For a browser,
open the returned `httpUrl + '/pardner/'`; use the selectors in the feature map.
Read only the disposable instance's connection file for authentication and keep
its tokens out of artifacts. A fresh service has no Actors until registered.
Searching artifacts for a word such as `token` does not show they are free of
credentials. Prefer never writing secrets: mask them in screenshots, record
receipts rather than request headers, and inspect any artifact that captured
request or connection data. Report what was checked and how.

## Run, repair, and collect evidence

For implementation changes, run the focused scripts in `plan.scripts`, any
additional behavior-specific checks, then `npm run verify`. The latter builds
the UI, runs all discovered Node tests, and runs one acceptance seed. Focused
scripts give earlier feedback; they do not replace that final check.

Run each long command under the watchdog so a hang becomes a recorded outcome
rather than a stalled session:

```sh
npm --silent run verify:watchdog -- --timeout 900 --log "$run_dir/verify.log" \
  --record "$run_dir/verify.watchdog.json" -- npm run verify
```

It writes output to the log, records exit status and duration, and exits `124`
on timeout after recording the hung process tree. That tree includes
descendants in other process groups, such as browsers. It then terminates them
(`SIGTERM`, then `SIGKILL` after `--grace` seconds). Set a timeout well above
the normal duration, never as a substitute for a test's own timeout. A timeout
is a failure to investigate, not a slow pass.

For guidance-only work, check paths, links, and `git diff --check`; also inspect
new untracked text because Git's diff check does not include it. Qualification
claims in documentation still require their own evidence.

Capture the final candidate after preparation and before running checks:

```sh
node --input-type=module -e 'import { candidateFingerprint } from "./support/acceptance/candidate.js"; console.log(JSON.stringify(await candidateFingerprint(), null, 2))' > "$run_dir/candidate.before.json"
```

Repeat into `candidate.after.json` after all checks. Compare `sha256`; preserve
Node/platform metadata, Git HEAD, the plan, and the diff identity too. Capture
the complete source diff, including untracked files, without touching the real
index:

```sh
tmp_index=$(mktemp -u) && GIT_INDEX_FILE="$tmp_index" git read-tree HEAD \
  && GIT_INDEX_FILE="$tmp_index" git add -A && GIT_INDEX_FILE="$tmp_index" git diff --cached --binary HEAD > "$run_dir/candidate.diff"
rm -f "$tmp_index"
```

A plain `git diff HEAD` omits untracked files, which may include an applied
overlay or new tests. The
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
- Where a new assertion's ability to fail is in doubt, a targeted mutation check
  is useful but not universally required. Temporarily reintroduce the specific
  defect, confirm the assertion fails for that reason, restore it, and confirm
  the restored candidate matches the fingerprint. Record it as evidence about
  the assertion, not about the product.
- Keep expected results grounded in the task and contracts. Explain any justified
  assertion correction; do not weaken an expectation to match a faulty result.
- When a check fails and its cause is not plainly the change, follow the
  [failure diagnostics](references/diagnostics.md): bounded diagnostic reruns,
  a baseline comparison under matched conditions, and controlled experiments
  before deciding whether the change caused it. An unchanged failing test file,
  or correlation with the change, establishes neither relatedness nor
  unrelatedness.
- Reproduce unrelated defects and report them separately. Stop for an unresolved
  product decision, inaccessible prerequisite, or unrelated blocker after
  independent work is done.
- Record every skip and its relevance. A skipped applicable LAN/browser check
  leaves that behavior incomplete even if the command exits zero. A successful
  rerun without an explanation does not erase an intermittent failure: report
  the failing attempt alongside it.
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

A hung test can leave descendants after its runner is gone. Before terminating
anything, confirm ownership: the process descends from a command you started,
or its working directory or listening ports belong to your scratch checkout.
Record the process tree and open sockets first (`ps`, `lsof -p PID -a -i`),
because they are diagnostic evidence. The watchdog does this for commands it
runs. Do not kill processes you cannot attribute to the run. A descendant that
was reparented after its parent died can escape the watchdog's tree, so check
for leftover processes from the scratch checkout before finishing.
Do not touch an existing `.pardner` or a previous install. Keep evidence outside
scratch directories. After cleanup, read the saved report and confirm artifacts
still exist; `verify:smoke` performs this check itself.

## Report and enforce

Write `report.md` in the run directory containing:

- Scope, base/HEAD and candidate identity, subject and overlay identities when
  used, environment, and artifact locations, including linked smoke and
  exercise reports.
- The overall outcome:
  - `passed`: every applicable check passed on the final candidate.
  - `failed`: a check failed and the cause is the change, or not yet known.
  - `incomplete`: required evidence is missing.
  - `blocked`: required evidence cannot be obtained until something outside the
    change is resolved, such as a reproducible defect in unchanged code exposed
    by the run, an inaccessible prerequisite, or a product decision. Name the
    blocker, its evidence, and the separate repair or decision it needs. A
    blocked run is not a pass and does not release a merge recommendation.
- Each changed behavior: expected result, exercised check, observed result, and
  `passed`, `failed`, or `incomplete` status.
- Commands/counts/skips, repairs, unrelated defects, and evidence gaps. Keep
  every failing attempt, diagnostic rerun, and baseline result, with the causal
  conclusion each supports and what remains uncertain.
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
or the user or task instructions forbid GitHub updates (comments, descriptions,
labels, pushes), make no GitHub change. Instead write the exact proposed
description section and label change to `$run_dir/pending-github-update.md`
and report it as pending. Apply the label when required
evidence is missing, failed, or stale; remove it only after the final candidate
satisfies all applicable qualification obligations. Record the source of any
previous evidence before reusing it.

Withhold a merge recommendation while relevant checks are failed, incomplete, or
blocked, while a failure remains unexplained, or while required qualification is
pending. PR creation/review can proceed. Enforcement
is by the agent; this skill does not configure GitHub branch protection or CI.
Report real-agent rehearsal, physical devices, and power-loss limitations
separately, without treating automated results as those observations.

## Maintain the map

When a feature, entry point, or assertion changes, update its map entry alongside
the code. For a wider audit, use `maintain-verification-skill` when available;
otherwise reconcile the map directly against current commands, routes, tests,
and contracts. Keep known gaps visible until exercised.
