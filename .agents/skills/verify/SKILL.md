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
script is a focused regression suite and is part of routine verification; the
plan's `tiers` table states this per command. Copy that table into the report
so an approver can see which commands are routine and which single command is
the deliberate gate.

## Select the role

When implementing a change, repair defects within the authorized scope. When
verifying someone else's PR, preserve its source: report defects and propose
separate patches instead of editing the subject unless repairs are authorized.
Run experimental mutations in disposable copies and restore them. Coverage
exercises may live outside the subject; record their source and exact commands.

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
as a staged patch, without merging or committing it. For example, in a clean
subject checkout, save `git diff --binary BASE...OVERLAY` outside the checkout,
then use `git apply --3way --index PATCH`. Review conflicts and preserve both
changes. Record the subject HEAD before application; it must remain unchanged.
Do not use a merge commit to combine the candidates. Declare every overlay,
repeating `--overlay` for each one:

```sh
npm --silent run verify:plan -- --cwd "$PWD" --base origin/main \
  --overlay "$tooling_ref" --overlay "$repair_ref" > "$run_dir/plan.json"
```

`--overlay REF` diffs the overlay from its merge base with the planning base.
When an overlay already contains the subject (for example added coverage
committed on top of the PR head), declare it as `--overlay HEAD..REF` so only
its own changes are attributed; the planner warns when the merge-base form
would repeat subject content. Record both commits and how the overlay was
applied, including any conflict and its resolution; never drop either side to
make it apply. Investigate every `warnings` entry, especially a merge HEAD or
`unattributed-paths`, before interpreting attribution. The plan keeps every
path and lists each path's sources (`subject`, one `overlay:REF` per overlay,
`environment`, or `unattributed`); `overlays[].missing` lists overlay paths
that were not applied and `overlays[].divergent` the paths merged by hand. An
`unattributed` path is explained by neither the subject's commits nor a
declared overlay: declare its source or record why it is present, never treat
it as subject work. All checks run against, and all
evidence describes, the **combined candidate**. Do not exclude overlay files,
tests, or scripts from the run or its fingerprint. A failure is attributed to
the subject or to the overlay only through the diagnostics below. Report subject
results, overlay effects, and combined-candidate results separately.

Reusing matching installs through symlinks at `node_modules` and
`ui-prototype/node_modules` is permitted; the plan records them under
`environment.dependencyLinks` and attributes them to `environment`. Confirm the
linked install's lockfile matches the checkout's and record that identity.

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
Node, and record `node -v` with each log. In zsh run `hash -r` after
changing versions so cached command paths do not retain the previous Node. From an unprepared checkout:

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

### Artifact privacy

The acceptance runner (`npm run verify` and `test:acceptance`) starts browser
tracing before credential entry. Its `browser-N.zip` traces therefore contain
the disposable service tokens in `Authorization` headers, the credential fill
action, DOM snapshots of the password field, and WebSocket tickets; the seed
report carries delivery claim tokens. Treat everything under
`output/acceptance/` as private. Never copy raw traces into a shared run
directory, attach them to a PR, or describe them as safe.

To retain trace evidence, produce a sanitized copy with the dedicated tool:

```sh
npm --silent run verify:sanitize -- --source output/acceptance/<run>/seed-1 --target "$run_dir/acceptance-seed-1"
```

It never edits the source. It collects credential values from structured
positions (authorization and cookie headers, credential-named JSON keys,
credential input actions, password inputs in DOM snapshots, bearer schemes,
and credential query parameters), redacts them in place, replaces every
collected value in retained text, decoded JSON strings, filenames, ZIP entry
names and manifest metadata, and removes screenshot frames and entries it
cannot read as text. Numbered and named Playwright trace entries are parsed
record by record. It checks all output before writing; a surviving value or
colliding redacted name prevents all output, including the manifest. Very short
values that also occur in fixed metadata or hashes can therefore block a copy.
Source and target are checked through filesystem aliases before writing.
`sanitization.json` in the
target records counts, hashes, and the transformation, never a value. Link
that manifest from `report.md`, state that the copies are sanitized and lack
screenshot playback, and keep the originals private. The tool detects what it
can recognize: review its counts against what the run captured (for example
one token per browser context and one ticket per WebSocket connection), and
report a mismatch as unresolved rather than assuming the copy is clean.

Failure watchdog records can capture descendant command lines, including
`--hub-token` arguments. Keep those raw records private too: command-line
credentials are not a recognized sanitizer pattern unless their exact value
was collected elsewhere. Inspect them independently before sharing a copy.

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

The record's `outcome` states what the watchdog itself established. Before
spawning anything it reads the process table and the scratch root; when that
preflight fails (for example a sandbox denying `ps`), it records
`preflight-failed`, starts no command, and exits `3`, because a command it
cannot enumerate cannot be reclaimed. If enumeration fails after the spawn,
it records `supervision-failed` with the raw error, signals only the child's
own process group (which cannot be reused while the child is alive), lists
observed descendants whose exit cannot be established under `unverifiedProcesses`,
including those in the same group, without
signalling them, and exits `3`. Resolve the permission and rerun; do not treat
either record as a command result. A command that never starts records
`spawn-failed` (exit `127`). The process-group reclaim is a conservative
fallback: `SIGTERM` to the group, then `SIGKILL` if the child is still alive
after `--grace` seconds.

The watchdog supports macOS/Linux. It snapshots `$TMPDIR/pardner-*` before
and after each run without deleting directories. New names are cleanup leads,
not proof of ownership when other agents are active. Retain only attributable
scratch paths, and remove only disposable data created by your run. It tracks
observed descendants, including detached ones; children that detach and exit
the parent chain between samples can escape detection. Inspect leftovers too.

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

Node test discovery does not honor `.gitignore`: saved `*.test.js`, `*-test.js`,
and other matching files under `output/` can enter the suite. Even
`support/workspace-test.js` matches discovery. Save probes and copied tests
outside the repository or with a `.txt` suffix; use explicit paths when
executing them. Do not save runnable test copies inside evidence directories.

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

For visual inspection, drive the affected UI with representative content, wait
for loading to settle, and capture and inspect screenshots at the relevant
viewport in each required engine. Check layout, readable text, focus/error
states, and nearby behavior against the stated expectation. Pair images with
DOM/network/state readback; an uninspected screenshot is not visual evidence.

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

A node:test timeout cancels the test but does not necessarily settle its async
body. If that body is awaiting an unresolved promise, its `finally` cleanup
may never run. This timeout-with-unfinished-cleanup pattern can leak service
processes and scratch directories. Test adverse paths under the watchdog from
the first attempt, including mutation checks.

A hung test can leave descendants after its runner is gone. Before terminating
anything, confirm ownership: the process descends from a command you started,
or its working directory or listening ports belong to your scratch checkout.
Record the process tree and open sockets first (`ps`, `lsof -p PID -a -i`),
because they are diagnostic evidence. The watchdog records this for processes it observes during cleanup. Do not kill processes you cannot attribute to the run. A descendant that
was reparented after its parent died can escape the watchdog's tree, so check
for leftover processes from the scratch checkout before finishing.
Do not touch an existing `.pardner` or a previous install. Keep evidence outside
scratch directories. After cleanup, read the saved report and confirm artifacts
still exist; `verify:smoke` performs this check itself.

## Report and enforce

Write `report.md` in the run directory. If the harness cannot write files,
return the same report in the response, state that limitation, and identify
which evidence could actually be retained. Never claim inaccessible artifacts
were saved. Include:

- Scope, base/HEAD and candidate identity, subject and overlay identities when
  used, environment, and artifact locations, including linked smoke and
  exercise reports.
- Two outcomes, stated separately. The **routine outcome** covers the checks
  this skill ran on the final candidate. The **overall outcome** also counts
  required qualification and any other obligation: when qualification is
  required but was not run, the routine outcome can be `passed` while the
  overall outcome is `incomplete`. Each uses:
  - `passed`: every applicable check passed on the final candidate.
  - `failed`: a check failed and the cause is the change, or not yet known.
  - `incomplete`: required evidence is missing.
  - `blocked`: required evidence cannot be obtained until something outside the
    change is resolved, such as a reproducible defect in unchanged code exposed
    by the run, an inaccessible prerequisite, or a product decision. Name the
    blocker, its evidence, and the separate repair or decision it needs. A
    blocked run is not a pass and does not release a merge recommendation.
  When overlays were declared, say what the results establish for the
  combined candidate and that they establish nothing for the subject alone or
  for each overlay alone unless those arms were actually run.
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
`needs-qualification` label. Preserve other PR content. When a repair or
coverage overlay was declared, the section must separate what the subject PR
still owes (its own qualification on its own final candidate) from the
obligations that belong to the overlay's own PR; a combined-candidate result is
not a standalone assessment of the subject. If no PR exists yet,
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
