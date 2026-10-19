---
name: local-first-design
description: Design or review storage, synchronization, collaboration, and remote-service dependencies with a local-first bias. Use for architecture decisions or changes to offline, persistence, sync, or recovery behavior; not routine edits unrelated to these concerns.
---

# Local-first design

Follow the adopted [project policies](../../../AGENTS.md#local-first); these govern this repository. Consult [shared references](../../references/local-first.md) only for the questions at hand. Library documentation illustrates mechanisms, not required dependencies.

## Establish the boundary

Read the relevant code, requirements and existing architecture decisions. Identify the affected user operations, supported devices, stored data and current service dependencies. Separate observed behavior from proposed changes and unknowns.

For a small change, address only the affected decisions. A single-device application does not need networking merely to satisfy this workflow. For an existing system, distinguish improvements within scope from a migration proposal.

## Trace data and decisions

1. **Local authority and persistence.** Trace an edit from user action through storage to the saved indicator. Identify the authoritative data, transaction boundary and failure conditions covered by the durability promise. Specify behavior for storage failure and restart. Distinguish pending, locally saved and synchronized states wherever users need that distinction.
2. **Offline operation.** List the core operations available without connectivity, including startup, access to existing data and creating changes. Identify operations that need remote authority and how the interface explains their unavailability. Check whether authentication expiry or missing assets accidentally block promised offline use.
3. **Synchronization semantics.** Work through concurrent edits and deletion versus editing with concrete examples. Choose merge rules, user resolution or coordination according to domain invariants. Explain how retries, duplicate delivery and interrupted exchange affect those rules. Choose a CRDT or another technique only after establishing the required behavior.
4. **Communication options.** Assess direct peer operation on the actual platforms and networks, including discovery, reachability, background execution, resource use and support burden. Offer it where feasible and practical; record concrete reasons when excluded. Keep data and merge semantics independent of transport where practical. Describe any discovery, signaling or relay dependencies and fallback behavior. A direct connection does not by itself establish independence from infrastructure.
5. **Trust and control.** For shared data, identify who may read and write, how devices join, how peers authenticate, and what revocation can enforce. Account for data already held by offline peers. State what intermediaries can observe and which keys or credentials are needed for recovery.
6. **Service loss and recovery.** For each dependency, describe outage behavior and replacement options. Walk through export and restoration on a fresh installation, including attachments, metadata and keys needed to make the recovered data useful. Distinguish synchronization from backup: examine whether deletion or corruption propagates to other copies.

## Validate the promises

Select scenarios relevant to the changed behavior and state the expected outcome before testing:

- Disconnect, edit, restart and reopen: locally acknowledged edits remain available under the stated durability guarantee.
- Edit the same data on disconnected devices, then reconnect: the documented conflict behavior preserves or explicitly resolves competing edits.
- Interrupt synchronization and retry: acknowledged edits survive and retries do not duplicate user actions.
- Block a required service or relay: promised local operations still work, and communication follows the documented fallback or reports its limitation.
- Exercise direct peer communication on representative supported networks; do not infer reachability from a loopback test.
- Export and restore on a fresh installation: the promised data is usable with only the documented dependencies.

For implementation work, run the applicable checks and report observed results and gaps. For design-only work, provide a validation plan; do not claim these scenarios have passed.

## Deliver a decision note

Use an existing architecture record, PR description or a short response appropriate to scope. Include the chosen behavior, concrete tradeoffs, P2P feasibility decision when communication is involved, required services, unresolved questions and validation evidence or plan. Link to existing decisions instead of restating them. Separate proposed migrations from the current change.
