# Verification plan, version 2

Run `npm --silent run verify:plan -- [--cwd CHECKOUT] [--base REF] [--overlay REF]`.
`--cwd` selects the checkout to plan (default: the current directory, which
`npm run` sets to the tooling checkout's root). The planner resolves it to that
repository's top level and fails rather than falling back to another checkout.
Omit `--base REF` to use that checkout's locally available `origin/main`.
`--overlay REF` names unmerged tooling applied to the subject checkout; see
below. Stdout is one JSON object;
errors go to stderr with a nonzero exit. The planner neither runs tests nor
changes Git/GitHub state. Exit zero means a plan was produced, not verification
passed. Consumers must inspect `unclassified` and complete semantic review.

The comparison includes the merge-base-to-HEAD diff, staged changes, unstaged
changes, and nonignored untracked files. Renames retain both source and destination
paths so a moved persistence module cannot lose its trigger. A staged change
reversed in the worktree still receives review. Conflicts, invalid refs, and
malformed changed dependency manifests fail planning. Resolve these rather than
silently falling back to an empty diff. Ignored files are outside the diff plan;
the candidate fingerprint separately includes built UI.

## JSON fields

- `schemaVersion`: integer `2`. A breaking interface change increments this.
  Version 2 added `repository`, `tooling`, `overlay`, `origins`, and
  `qualification.reviewRequired`, and stopped treating additive test inclusion
  as a harness trigger.
- `repository`: `{ root, gitDir }` of the planned checkout.
- `tooling`: `{ root, head, sameCheckout }` of the checkout whose planner ran.
  When it differs from `repository`, record both.
- `base`: `{ ref, commit, mergeBase }`, identifying the requested ref, its resolved
  commit, and comparison ancestor. The planner does not establish ref freshness.
- `head`: current HEAD commit, which alone does not identify uncommitted contents.
- `files`: sorted, unique repository-relative changed paths, including deletions.
  With an overlay this is still the complete combined change.
- `overlay`: `null`, or `{ ref, commit, mergeBase, files, missing }` for `--overlay`.
  `files` are the paths the overlay changes relative to its own merge base with
  the planning base; `missing` lists overlay paths absent from the combined diff
  (overlay not fully applied).
- `origins`: each path mapped to `subject`, `overlay` (unchanged from the overlay
  commit and not changed by the subject's commits), or `both`. Without an overlay
  every path is `subject`. Origins attribute paths; they never remove paths from
  checks or evidence.
- `scripts`: ordered, unique package script names for focused routine regression.
  Run each with `npm run NAME`. No acceptance repetition is automatically selected.
- `verify`: whether the diff calls for `npm run verify`. Unknown paths set this
  true; an empty diff sets it false and requires the skill's clean-baseline rule.
- `qualification`: `{ required, triggers, reviewRequired }`. Each trigger is
  `{ kind, path, reason, origin }`, where kind is `path`, `dependency`, `harness`, or `claim`.
  `required: false` means no mechanical trigger matched, not a semantic clearance.
  `reviewRequired` entries (`kind: 'additive-test-inclusion'`, with `script` and
  `added`) are not triggers. Each needs a recorded semantic review of what the
  added tests measure before it is considered cleared.
- `semanticReview`: paths the agent must inspect for changed behavior/guarantees
  and qualification claims. Includes guidance and UI code: retries and false save
  indicators can change outside storage modules.
- `unclassified`: paths lacking a maintained rule. Resolve before completing
  verification; do not use a broad fallback rule to conceal new modules.
- `guidanceOnly`: true only for a nonempty set of recognized guidance paths.
  This controls routine checks, not the evidence needed for qualification claims.

The plan is a proposal. Record semantic answers and resulting obligations in the
run report without overwriting the original mechanical plan. A future model may
produce this interface, but it must retain unknowns, justify scope, and cannot
produce test results or override mandatory checks by classification alone.

## Classification policy

[verify-plan.js](../../../../scripts/verify-plan.js) explicitly lists current
`lib/`, `scripts/`, and `support/` files. The coverage test fails for new files
without a classification. UI assets and test files have bounded directory rules;
their particular behavioral coverage still needs review. Guidance means known
root documents, Markdown below `docs/`, `skills/`, `.agents/`, and the shared
`.claude/skills` symlink. Executable code embedded in guidance needs semantic
review even though the file is documentation.

Persistence, transport, delivery, acceptance harness, and relevant durability
test paths conservatively require qualification. Domain, UI, bridge, and CLI
paths also receive semantic review. Goal-audit changes trigger a qualification
claim; evidence-log edits need review for what they actually claim.

For changed manifests and lockfiles, inspect merge base, HEAD, index, and working
tree versions. Node engines, Automerge packages, `ws`, Playwright packages, and
dependency overrides trigger qualification when changed. Lockfile comparisons
include nested installations and integrity/resolution metadata. Changes to core
regression/build/acceptance commands also trigger it, with one narrowing. When
the only difference in `test:qualification`, `test:runtime`, `test:cli`, or
`test:ui` is inserted `test/*.test.js` files not already listed, and every
other token is unchanged and in order, the planner records `reviewRequired`
instead of a trigger. Removed or replaced files, duplicates, non-test
arguments, changed options or build steps, deleted commands, and any change to
`test`, `verify`, `test:acceptance`, or `ui:build` remain harness triggers. If
any compared version (merge base, HEAD, index, working tree) has a non-additive
change, the trigger applies. Unrelated dependency
changes still select broad routine regression. Unsupported lockfile formats
require classification support, not an assumed clearance.

Test with `npm run test:verification`. It also covers invocation from another
directory with `--cwd`, overlay attribution, and the narrowing above. Scenarios cover divergent bases, rename
sources, staged reversals, untracked names, deleted paths, unknown modules,
foundation dependency changes, malformed inputs, and unresolved conflicts.
