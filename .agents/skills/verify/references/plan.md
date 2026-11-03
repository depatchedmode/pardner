# Verification plan, version 3

Run `npm --silent run verify:plan -- [--cwd CHECKOUT] [--base REF] [--overlay REF | --overlay BASE..REF]...`.
`--cwd` selects the checkout to plan (default: the current directory, which
`npm run` sets to the tooling checkout's root). The planner resolves it to that
repository's top level and fails rather than falling back to another checkout.
Omit `--base REF` to use that checkout's locally available `origin/main`.
`--overlay` is repeatable and names unmerged work applied to the subject
checkout (tooling under trial, a declared repair, added coverage); see below.
Stdout is one JSON object;
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

- `schemaVersion`: integer `3`. A breaking interface change increments this.
  Version 2 added `repository`, `tooling`, `overlay`, `origins`, and
  `qualification.reviewRequired`, and stopped treating additive test inclusion
  as a harness trigger. Version 3 replaced the single `overlay` with the
  `overlays` list, made every `origin` a list of sources, and added
  `unattributed`, `environment`, `focusedCommands`, and `tiers`. A consumer of
  version 2 must read `overlays[0]` and `origins[path][0]` instead; the CLI
  flags remain accepted.
- `repository`: `{ root, gitDir }` of the planned checkout.
- `tooling`: `{ root, head, sameCheckout }` of the checkout whose planner ran.
  When it differs from `repository`, record both.
- `base`: `{ ref, commit, mergeBase }`, identifying the requested ref, its resolved
  commit, and comparison ancestor. The planner does not establish ref freshness.
- `warnings`: diagnostic entries requiring investigation, including a merge HEAD
  that may obscure subject identity. This is not a qualification waiver.
- `head`: current HEAD commit, which alone does not identify uncommitted contents.
- `files`: sorted, unique repository-relative changed paths, including deletions.
  With an overlay this is still the complete combined change.
- `overlays`: one entry per `--overlay`, in order:
  `{ ref, commit, base: { ref, commit }, files, missing, divergent, includesSubject }`.
  `files` are the paths `base..commit` changes. For `--overlay REF` the base is
  the merge base of the planning base and `REF`; for `--overlay BASE..REF` it is
  exactly `BASE`. `missing` lists overlay paths absent from the combined diff
  (overlay not fully applied); `divergent` lists overlay paths whose working
  tree content differs from the overlay commit (merged by hand, or not applied
  to a path the subject also changed). `includesSubject` is true when the
  overlay commit descends from the subject HEAD; declaring such an overlay from
  its merge base repeats the subject's content and produces an
  `overlay-includes-subject` warning that names the `HEAD..REF` form to use.
- `origins`: each path mapped to a list of sources: `subject` (changed by the
  subject's committed diff), `overlay:REF` for every declared overlay whose
  `files` include the path and whose content is present in the working tree,
  `environment` for a dependency link, or `unattributed` when nothing declared
  explains the path. Without `--overlay` every path is `subject`, because the
  working tree is then the implementer's own change. With overlays the subject
  is its committed diff and anything else must be declared or explained; the
  planner never labels an undeclared repair `subject`. Origins attribute paths;
  they never remove paths from checks or evidence.
- `unattributed`: the paths whose origin is `unattributed`; also reported as an
  `unattributed-paths` warning.
- `environment`: `{ dependencyLinks }`. Each link is `{ path, target, resolved }`
  for an untracked symlink at `node_modules` or `ui-prototype/node_modules`.
  Git ignores only real directories at those paths, so a link to a matching
  install elsewhere appears as an untracked path; the planner classifies exactly
  that case as `dependency-link` (origin `environment`, no scripts) and leaves
  every other unknown path unclassified. Record the linked install's lockfile
  identity in the report; the candidate fingerprint still covers the lockfiles.
- `scripts`: ordered, unique package script names for focused routine regression.
  Run each with `npm run NAME`. No acceptance repetition is automatically selected.
- `focusedCommands`: `{ command, note }` entries for classified files whose
  coverage is not a package script (for example `node --test
  test/t3-execution.test.js`, or the T3 qualification harness that needs the
  pinned T3 app). Run or record them alongside `scripts`.
- `tiers`: a command-to-tier table. `routine` lists `scripts`,
  `focusedCommands`, and `npm run verify`; `deliberate` names the only
  qualification command, `npm run test:acceptance -- --repeat 20 --seed 1`, with
  `required` mirroring `qualification.required`. The `test:qualification`
  script is routine despite its name; copy this table into the report so an
  approver does not mistake it for the deliberate tier.
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
directory with `--cwd`, single and multiple overlay attribution with explicit
bases, dependency-link classification, and the narrowing above. Scenarios cover divergent bases, rename
sources, staged reversals, untracked names, deleted paths, unknown modules,
foundation dependency changes, malformed inputs, and unresolved conflicts.
