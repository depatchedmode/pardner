# Issue #79 preparation and artifact qualification

Run `node --test test/selfhost79.test.js` with Node 24.11.1. It drives the public
Python CLI in isolated Git repositories with a separately frozen checker. Expect
exact-SHA acceptance for B/C, C failing on B, no history overwrite, and rejection
of false success, checker tampering, scope expansion, modified evidence, symlinks
and nontermination. Execution and human verdicts remain unset.

The full commands, provider adapter boundary, budgets, manifests and unrun live
gates are in [the qualification package](../../../../docs/PARDNER-SELFHOST79.md).
These fixtures do not exercise live providers or authenticate a human. Existing
[T3 control tests](control.md) and the separately owned Cloud tests establish
deterministic adapter behavior. Their results must match the integrated candidate
before live readiness; no separate branch result qualifies the combination.
