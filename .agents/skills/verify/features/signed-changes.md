# Signed changes and attribution

Run `node --test test/change-signatures.test.js test/signed-changes.test.js` (both
in `test:runtime`), `node --test test/signed-changes-ui.test.js` (in `test:ui`,
Chromium and WebKit) and the `client review` test in `test/client-cli.test.js`
(in `test:cli`). `scripts/signing-benchmark.js` measures the costs; it is not a
gate.

- **Primitives.** A signature covers `pardner/change/v1`, the project ID's 32
  bytes and the raw change hash, verifies only under its key, project and change,
  and is deterministic. A machine actor is the machine ID's 16-byte digest and 8
  fresh bytes. The signature document's URL comes from the project ID alone, and
  it is created with all 256 shards. A sync message's changes are read whether
  Automerge packs chunks together or sends a whole document. The signature cache
  only grows (triggers refuse update and delete), belongs to one project and is
  mode 0600.
- **Actors.** Every change, the creation changes of both documents included,
  carries its machine's prefix; a reopen draws a new suffix and starts its
  sequence again. A backup run beside its original in one process gets another
  actor; the hub then holds no actor and sequence number twice, and both copies'
  changes are signed.
- **Relay.** A change made on one member and relayed by the hub shows its writer,
  not the hub, on another member. A change claiming another person's Actor is
  flagged and listed for review; one claiming the machine's own person's Actor
  is not.
- **Pending, then unattributed.** A bare peer that never signs: every node holds
  the change, shows it pending first and unattributed after, names the machine that
  relayed it, and lists it for review; the peers converge. A late signature turns
  pending into signed on the hub and on a reader. A signature made by another key,
  and random bytes, are flagged `invalid`.
- **Cut and slow links.** With the writer's signature held back and its link cut
  after the change reached the hub, the hub and a reader stay pending, never
  unattributed, for four quiet periods, and sign it once the link returns. With
  every frame delayed by more than the quiet period, no change is ever
  unattributed.
- **Hub acknowledgement.** A write while the hub is unreachable is saved and
  signed locally. With the signature document's frames held back, the hub has the
  change but not the signature, and the writer stays `syncPending`; once they flow
  the hub acknowledges both documents' heads.
- **Deleted entry.** A member deletes an entry from its copy of the signature
  document: peers that verified it stay attributed, write it back, and a replica
  that joins later can check it.
- **Removed machine.** A removed machine's change, carried to the hub by another
  member with its signature, is applied everywhere, flagged as made by a removed
  machine and listed; the machine's earlier work stays signed; heads converge.
- **Same field offline.** Two machines cut off from the hub edit one title; both
  alternatives are kept for explicit resolution, and both changes are signed by
  their machines.
- **Kill between saves.** A child hub is killed with SIGKILL after acknowledging a
  write whose signature never reached the signature document. On disk the change
  is present and the signature absent; on reopen the entry is written back with
  the same bytes and the change is signed. Process-crash evidence, not power-loss.
- **Equivocation.** Two different changes with one actor and sequence number,
  both signed by one member's key, reach the hub from two members: the hub reports
  it once, names the machine, calls it proven, and keeps syncing with others.
- **Board.** In the browser, Activity shows "Signed by Bob · Bob’s laptop",
  People and machines lists "Alice let Bob in as a member" signed by this
  computer, and an unsigned change from a modified client brings up the review
  notice, whose button opens Needs review with "Unattributed: no signature arrived
  · relayed by Bob · Bob’s laptop". The task stays on the board.
- **CLI.** `client review` says no change needs review, then lists the unsigned
  change in words, with the change hash only as a detail; `--json` gives the data.
