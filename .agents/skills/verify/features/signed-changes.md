# Signed changes and attribution

Run `node --test test/change-signatures.test.js test/signed-changes.test.js test/attribution-rules.test.js`
(all in `test:runtime`), `node --test test/signed-changes-ui.test.js` (in `test:ui`,
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
  · relayed by Bob · Bob’s laptop". The task stays on the board. Then Bob's
  modified client rewrites Alice's comment inside her signed entry and signs its
  edit: Activity shows Alice's words, "Signed by Alice · this computer" and
  "altered after signing by Bob · Bob’s laptop", never Bob's words; Needs review
  lists Bob's change under his own signer. When Bob renames the task and his
  modified client rewrites one of Alice's comments and marks another deleted, the
  deleted comment's entry keeps Alice's words and signed time, says "This comment
  was later deleted by a change listed for review", and shows the task's current
  title with a dotted underline; the task panel says the rewritten comment was
  "Changed by someone other than its author".
- **CLI.** `client review` says no change needs review, then lists the unsigned
  change in words, with the change hash only as a detail; `--json` gives the data.
  `pardner activity`, `timeline`, `trace task` and `diff` print each entry with its
  change's signer line; a forged copy appears under its own signer (`cli-activity`).
- **Signing only own writes** (`attribution-rules`). A member continues another
  machine's current actor and sequence number and syncs the change to it (a member
  replica, then the hub): that machine never signs it, every peer shows it
  unattributed, and the machine reports another machine's use of its actor. Its own
  next change, the board's creation change, the record gate's change and a record
  write-back are each signed by the machine that made them.
- **Entries derived from their own change** (`change-log`, `activity-property`,
  `signed-entries`, `attribution-rules`). Each Activity entry is what its change
  wrote, under that change's signer. A copy of another person's event under an
  earlier key with other text, many concurrent values at one key, and an edit inside
  another person's entry each appear only under their own signer, on two running
  peers and a replica that joins later; the original stays as signed. A
  replacement, a deletion and a change that leaves no Activity entry are each their
  own entry listed with their signers; every ordinary operation type and record
  flow is never listed. A property test over random unusual writes by a second
  member checks every shown entry against Automerge's own reading of each change.
- **Malformed signature document.** Shards replaced by a list, text, a number,
  bytes, a counter or nested lists, junk keys, wrong-shape and oversized values and
  an unexpected top-level key: the services keep running with no contained
  failure, the shard comes back as a map holding the entry everywhere, and a later
  replica can check the change. Reads return at most eight concurrent values, only
  64-byte values under change-hash keys in map shards, and read concurrent shard
  maps. A failing cache write is contained, logged, shown in status, and checking
  resumes.
- **Repairs and polling.** Four deletions and overwrites applied before the repair
  runs are all put back. With 1,200 changes held pending by the hub, a member asks
  about every one within four polls of at most 500, and never again about settled
  ones.
- **Acknowledgement, restart, prefixes.** A replica holding back its own signature
  stays `syncPending` until it is written. An equivocation report survives a hub
  restart with its proof. A prefix two keys share attributes to neither.
- **Acceptance gate.** `test/acceptance-components.test.js`: the gate's stable
  attribution comparison ignores replica-specific labels, fails replicas that
  disagree on a signer, fails a signer other than the machine that performed the
  operation, checks baseline operations and records, and refuses a missing machine
  ID, an altered entry or anything listed for review.
