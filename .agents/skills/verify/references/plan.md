# Verification plan, version 1

Run `npm --silent run verify:plan -- --base REF` from the repository root. Omit
`--base REF` to use the locally available `origin/main`. Stdout is one JSON object;
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

- `schemaVersion`: integer `1`. A breaking interface change increments this.
- `base`: `{ ref, commit, mergeBase }`, identifying the requested ref, its resolved
  commit, and comparison ancestor. The planner does not establish ref freshness.
- `head`: current HEAD commit, which alone does not identify uncommitted contents.
- `files`: sorted, unique repository-relative changed paths, including deletions.
- `scripts`: ordered, unique package script names for focused routine regression.
  Run each with `npm run NAME`. No acceptance repetition is automatically selected.
- `verify`: whether the diff calls for `npm run verify`. Unknown paths set this
  true; an empty diff sets it false and requires the skill's clean-baseline rule.
- `qualification`: `{ required, triggers }`. Each trigger is
  `{ kind, path, reason }`, where kind is `path`, `dependency`, `harness`, or `claim`.
  `required: false` means no mechanical trigger matched, not a semantic clearance.
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
regression/build/acceptance commands also trigger it. Unrelated dependency
changes still select broad routine regression. Unsupported lockfile formats
require classification support, not an assumed clearance.

Test with `npm run test:verification`. Scenarios cover divergent bases, rename
sources, staged reversals, untracked names, deleted paths, unknown modules,
foundation dependency changes, malformed inputs, and unresolved conflicts.
