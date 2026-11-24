# Filing and triaging issues

Choose **Bug report** for an observed failure, **Change or task** for a desired outcome, or **Investigation** for a question that needs evidence. The forms apply `bug`, `change` and `investigation` respectively. For a tracker, open a blank issue and describe the outcome, child issues and dependencies.

When filing through the CLI or API, supply the same information in the issue body. For a bug, include expected and observed behavior, an example and the environment. For a change, give the intended outcome and observable acceptance criteria. For an investigation, state the question and the evidence that would settle it. Remove tokens, invitations and private paths from examples.

## Maintainer triage

1. Read the issue, discussion and linked implementation evidence. Bring decisions that change the remaining work to the top of the body and link their sources. Preserve the original observations and measurements.
2. Select one work kind. Use `bug` for a correction, `change` for a capability or improvement, `documentation` for guides, references or diagrams, `maintenance` for internal work that preserves behavior, `investigation` for gathering evidence, `qualification` for proving an existing implementation in its required environment, and `tracker` for coordinating child outcomes. When a task form supplies `change`, replace it with the kind that describes the outstanding deliverable.
3. Select one primary `area/` label. For example, use `area/cli` for a guide to a specific command, `area/docs` for guides spanning subsystems, and `area/model` for shared thread records, relationships and derived task state. Preserve applicable severity, estimate and filing-source labels. Apply `needs-design` for a specific open choice. For qualification evidence, follow the [verification guidance](../.agents/skills/verify/SKILL.md).
4. Assign a milestone when the issue contributes to its verifiable finish line. Link broader trackers or dependencies in the description.

For example, a stopped-client CLI bug belongs in `is:issue is:open label:bug label:area/cli`. An internal change to represent receipt kinds belongs in `is:issue is:open label:maintenance label:area/delivery` after triage. A question about delayed sync belongs in `is:issue is:open label:investigation label:area/sync`.
