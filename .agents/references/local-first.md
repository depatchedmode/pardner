# Local-first references

Shared sources for the [project rules](../../AGENTS.md#local-first) and [design skill](../skills/local-first-design/SKILL.md). Consult the relevant source when a decision needs evidence; reading the entire list is unnecessary. These sources inform technical choices, not project approval boundaries. Check documentation against the version in use before applying implementation details.

- [Local-first software: You own your data, in spite of the cloud](https://www.inkandswitch.com/essay/local-first/) — Ink & Switch’s statement of local-first ideals. Use when evaluating offline use, ownership, collaboration and long-term access. The repository’s defaults are a policy choice informed by these ideals.
- [Automerge concepts](https://automerge.org/docs/reference/concepts/) — An example of separating synchronization from storage and network adapters. Consult when evaluating this design or Automerge itself; adopting Automerge is not required.
- [Automerge conflicts](https://automerge.org/docs/reference/documents/conflicts/) — Consult when using Automerge to understand how concurrent values are represented and exposed. Do not assume its behavior applies to every merge strategy.
- [libp2p hole punching](https://docs.libp2p.io/concepts/hole-punching) — Explains connection establishment through NATs and coordination via relays. Use when assessing direct-peer feasibility and infrastructure dependencies; verify support for the chosen implementation and target networks.

For persistence, backup, identity and encryption decisions, also consult the actual storage engine and protocol documentation. This list does not establish the guarantees of a particular application.
