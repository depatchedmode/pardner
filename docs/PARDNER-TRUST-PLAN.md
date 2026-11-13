# Pardner trust implementation plan

Status: **plan**. Nothing here is implemented. The design is in [PARDNER-TRUST-DESIGN.md](PARDNER-TRUST-DESIGN.md); this file breaks it into pull requests.

## Prerequisites

- The client-mode stack (#189, #190, #191) merges first.
- #190 still owes its real-agent rehearsal.

## Pull requests

| # | PR | What it does | Closes | Gates |
|---|---|---|---|---|
| 0a | Agent naming | Agents are created as "<owner>'s <harness>" | #150 | verify |
| 0b | Comment author check | Only the author deletes a comment; fix the prompt shown to non-authors | #160 | verify |
| 0c | Loopback invitations | Refuse loopback-only invitations; report failing routes | #162 | verify |
| S | Spike (no product code) | Choose how signatures travel. Measure signing and verification cost at 1k, 10k and 50k operations and at agent write rates. Decide Automerge text against plain values. Written up in `docs/research/` | — | The decision rule in the design's Rollout section |
| 1a | Keys and records library | Machine-key and membership modules: create and load keys, sign and verify records, compute membership. Pure code and tests, no behaviour change | — | verify |
| 1b | Genesis and record store | Project creation writes a signed genesis and derives the project ID from it. Adds the grow-only record store to the client directory and its backup. Breaking: prior installs are refused and preserved | — | lifecycle model, 20-seed |
| 1c | Invitations and pairing on records | Join-request queue, the confirmation code with the approver's nonce, `machine.add` pairing, removal, role change, re-admission. Hub admission derived from records | #153, #155, #156 | verify, runtime and CLI suites |
| 1e | Plain string values | Store every string as a plain value in place of Automerge text. Breaking storage change | — | lifecycle model, 20-seed |
| 1f | Open time | Open a 10,000-operation board in under 3 seconds | — | lifecycle model, 20-seed |
| 1d | Signed changes | Machine-prefixed Automerge actor ID, a signature per change, verification on receipt, the unattributed path, the equivocation report | — | lifecycle model, 20-seed |
| 2 | Board surfaces | People panel with machines and agents, join requests, pairing dialog, remove and re-invite, removed state shown as such, a signer line in Activity | #152, #154, #175, #183 | UI suites (Chromium and WebKit) |
| 3 | Handshake | Replace `deviceToken` and `replicaToken`. Sign hub HTTP requests. Close sessions on removal. Make `/policy` a local check. A restored hub waits for a peer. Retire the hand-run hub and replica roles. Reword the AGENTS.md admission rule | #187, part of #165 | lifecycle model, 20-seed, acceptance contract update |
| 4 | Direct peer lane | An opt-in listener, the same handshake over a machine-keyed channel, and sync between two machines at a given address | — | lifecycle model, 20-seed, two real machines on separate networks |

## Ordering

- 0a, 0b, 0c and the spike start now, in parallel.
- The spike is done (#193). Its results add 1e and 1f, which come before 1d.
- PR 2 follows 1c directly, so the membership fixes are visible before the handshake lands.

## Checks along the way

- `scripts/control-runtime.py` and `scripts/remote/rehearse.py` use the hub token. PR 3 ports or retires them.
- Each PR updates README's current-implementation section, so it never claims more than is enforced.
- Storage, sync and delivery milestones (1b, 1e, 1f, 1d, 3, 4) need `npm run test:acceptance -- --repeat 20 --seed 1` on an idle machine, and the lifecycle model check when they touch its four files.
