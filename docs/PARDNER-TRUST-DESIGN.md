# Pardner trust design: authentication and authorization that peers can verify

Status: **proposal**. Nothing here is implemented. Current behaviour is described in [README.md](../README.md#current-implementation) and [PARDNER-CLIENT.md](PARDNER-CLIENT.md).

## Goal

Any replica should be able to decide, on its own and offline, whether a change it receives is authentic and allowed. A hub then becomes one always-on peer that runs the same check. It stops being the only party that can vouch for a device, which opens a direct peer-to-peer lane without a second trust model.

**In scope:** authentication of people, machines and Actors, authorization of every write, membership and revocation, and transport admission.

**Out of scope for now:**
- End-to-end encryption. Content stays readable by every admitted peer, including the hub.
- Native mobile replicas.
- Automatic peer discovery.

The design leaves room for each of these (see [Later](#later)).

## What exists today

| Concern | Today | Problem |
|---|---|---|
| Who a person is | A typed name and email plus a random id | Self-asserted; duplicates and silent takeovers are possible (#150, STORY-016, STORY-018) |
| Who wrote a change | An `actorId` field inside each operation event | Unsigned. Enforced only by the local proxy and the hub's bearer `deviceToken` check |
| Sync admission | A bearer `deviceToken` / `replicaToken` held by the hub | Only the hub can check it; peers cannot check each other |
| What sync accepts | A message-shape check | Any well-formed change from an admitted machine is applied, including one that claims another Actor or skips a rule (comment delete by a non-author, STORY-090) |
| Membership and revocation | Hub-held admission records; CLI-only commands | Not replicated; revoked parties look like offline ones; no re-admission path (STORY-043, STORY-130) |

The useful property already in the code: `prepareOperation(doc, request, { replicaId, timestamp })` in `lib/workspace-commands.js` is a pure function. It validates a request against a document and returns both the event and the exact change to apply. Every write goes through it, and each operation becomes one Automerge change that records its event at `operations[opId]`.

## Design in one paragraph

Each person holds a git SSH signing key (the person key), and each machine running Pardner holds its own Ed25519 machine key, certified by its person. Every operation is signed by the machine that made it, and the signature travels inside the change. A replica receiving a change checks four things:
1. the signature is valid;
2. the signing machine was certified for an admitted person, and allowed to act as that Actor, at the change's causal position;
3. replaying the signed request through `prepareOperation` at the change's dependencies succeeds, so every authorization rule passes;
4. rebuilding the change from that replay gives the same change hash, so the change is exactly what the signed request produces.

Membership (who may sign, and as which Actors) is itself a set of signed operations in the same document, rooted in a self-certifying project ID. The check is a pure function of the document, so it gives the same answer whether the change arrived through a hub or directly from a peer.

Claims marked **(checked)** were tested during review with throwaway scripts against the pinned `@automerge/automerge` 3.2.3 and `@automerge/automerge-repo` 2.5.1. Nothing else has been run.

## Building blocks

### 1. Three kinds of key: person, machine, agent

Git is a hard requirement; no code forge is. Each step down the hierarchy costs less ceremony than the one above:

| Key | What it is | Who holds it | Used for | Ceremony |
|---|---|---|---|---|
| **Person key** | The person's git SSH signing key: `user.signingkey` with `gpg.format=ssh`, Ed25519 (or `sk-ed25519` on a hardware key) | The person: ssh-agent, a key file or a hardware token | Certifying a new machine, profile changes, membership actions an owner or admin takes | Rare, deliberate. A touch or passphrase prompt is fine |
| **Machine key** | An Ed25519 key that Pardner generates per machine | The client service, in the client directory (mode 0600; the OS keychain later) | Signing every operation made on that machine, by the person or by the agents delegated there | None after setup |
| **Agent delegation** | No new key: a signed record letting a machine act as an agent Actor | The machine key signs it | Creating an agent under the person's existing machine credential | Cheap: no person-key prompt |

**Person key, from git.**
- If git has no SSH signing key configured, Pardner offers to create one (`ssh-keygen -t ed25519`) and set `gpg.format=ssh` and `user.signingkey`. Nothing is uploaded anywhere.
- Pardner signs with `ssh-keygen -Y sign -n pardner` (SSHSIG). That works through ssh-agent and hardware keys, and the private key never enters Pardner.
- Verification is offline, against the public key pinned in the membership log.
- The same key signs the person's commits, so Pardner can check that a linked commit was signed by the person who claims it.

**Machine key.**
- The machine ID is `machine-<base32(sha256(pubkey))[:26]>`.
- On one machine, browsers, the CLI and agents keep authenticating to the local client with today's cookie, operator token and agent grants. That local trust boundary is the OS user account. The client service signs their operations with the machine key.
- No private key ever lives in a browser or agent process.

**Agents.**
- Starting a new agent on a machine the person already uses is a single `agent.delegate`, signed by that machine's key and scoped to that machine. There is no person-key prompt.
- An agent on a **different** machine (for example a build box) is a new machine. It goes through the high-verification path, certified as "agents only, no human authority".

### 2. Identity: git-native, with forge links optional

- **What a person is.** A person *is* their person key. Their display name and email default to git's `user.name` and `user.email`, published as an editable `member.profile` record signed by the person key. This fixes the uneditable-identity dead end (STORY-014). A person can't be duplicated within a project, because membership is keyed by the person key.
- **Identity checks at admission.** When someone is admitted, the admitting peer establishes that the person key belongs to the human it thinks it does. It uses either, or both, of:
  - **A confirmation code.** Both screens show a short code derived from both keys, compared face to face, by voice or in chat. This works with no forge at all.
  - **Forge attestation (optional, any forge).** The person names forge accounts such as `github.com/maya`, `gitlab.com/maya` or `codeberg.org/maya`. The admitting peerice checks online, once, that the person key is published there. Most forges list a user's public SSH keys at `https://<forge>/<login>.keys`; GitHub also exposes signing keys through its API. The result is recorded in the log as an attestation (`forge`, `login`, `checkedAt`, `checkedBy`). It strengthens trust and shows as a badge, and it is never required.
- **Offline thereafter.** Every later verification is offline, against the keys pinned in the membership log. No forge token is ever used or shared.

### 3. Signed operation envelope

`prepareOperation` already builds an event. The event gains:

```
envelope = {
  v: 1, projectId, requestId, type, actorId, payload,   // the request; payload keys in sorted order
  machineId, changeActor, deps,                          // where and by whom it was made
  timestamp                                              // the author's claim; never used to authorize
}
event.signature = Ed25519(machine key, "pardner/op/v1" ‖ canonical(envelope))
```

- **Binding to one change.** `deps` are the document heads the machine built on, and `changeActor` is the Automerge actor ID of the change that carries the event. With the rebuild check in section 4, the signed envelope and the document at `deps` determine the change byte for byte. Nobody can wrap a valid signature in a different change.
- **What the signature covers.** It covers the *intent*, not the change bytes, so there is no circularity.
- **Automerge actor IDs.** `changeActor` is the machine ID's bytes followed by 8 random bytes chosen at each process start.
  - The prefix ties the change to the machine.
  - The suffix stops two processes that hold the same key (a restored backup, a restart after a crash) from reusing an Automerge sequence number. Automerge refuses a second change with the same actor and sequence number **(checked)**.
  - automerge-repo picks a random actor every time it loads a document. Pardner sets its own after loading, with `handle.update(doc => clone(doc, { actor }))` **(checked)**.
- **Sorted writes.** Automerge returns map keys in sorted order, so a verifier cannot recover the order an author wrote them in. `prepareOperation` must write every map in sorted key order. Today it writes the payload in request order: 9 of 13 operation types failed to rebuild until payloads were sorted, and then all 13 matched **(checked)**.
- **Fixed change header.** The change's own time is set from `timestamp` and its message is empty, so the header carries nothing unsigned.
- **Timestamps.** `timestamp` is signed but is only the author's claim. It is used for display and for a new task's default order. No check reads a local clock. A member can misdate their own work; they cannot change anyone else's.
- **Retries.** The same request retried on another machine produces a second signed event under the same operation ID. Each verifies on its own, and they collapse as they do today.
- **Domain separation.** The `pardner/op/v1` prefix means a signature can never be reused as a git commit signature or an SSH login, and vice versa.

### 4. Verification rule (identical on every peer)

A peer receives each change `C` together with its signed event `E`, and checks them in causal order:

1. **Header.** Every dependency of `C` is already accepted. `C.deps = E.deps`, `C.actor = E.changeActor`, and that actor ID starts with `E.machineId`.
2. **Authenticity.** `E.signature` verifies against the key recorded for `E.machineId`.
3. **Authority at the causal point.** In the membership state at `C.deps`, all of the following hold:
   - `E.machineId` is certified for an admitted person (and that person's machine scope allows `E.actorId`);
   - it is delegated for `E.actorId`;
   - it is not revoked in `C`'s causal past.
4. **Replay.** On a fork of the document at `C.deps`, `prepareOperation(request(E), …)` succeeds and reports a new operation, so every existing rule passes.
5. **Exactness.** Applying that replay on the fork, with `C.actor` and the fixed header, produces a change whose hash equals `C`'s hash.

The document has exactly one change with no dependencies: the genesis (section 5). Any other root is rejected.

**Why compare hashes, not paths and values.**
- Pardner stores every string as Automerge text, one Automerge operation per character. A typical Pardner operation is about 1,000 Automerge operations, so comparing writes by path and value is neither simple nor complete.
- Two changes can show the same values and still differ. With the predecessor stripped from one field write, a change applied cleanly and showed the same value, but left the old value alive as an extra conflict alternative. The hash comparison caught it **(checked)**.
- Hash equality held for all 13 operation types, for two concurrent edits each checked at its own dependencies, and for a resolve built on their merge **(checked)**.

**What the check needs from Automerge.**
- **A true fork at `C.deps`, not `view`.** `getConflicts` on `view(doc, deps)` returns today's conflicts, not the ones at `deps` **(checked)**. `prepareOperation` reads conflicts for same-field alternatives and for retries, so a replay on a view gives wrong answers. A `clone` of the view is a true fork, but the objects it has already read keep answering from the old document until its first change **(checked)**.
- **Stable operation generation.** The rebuild relies on Automerge producing the same operations for the same writes. The Automerge version is part of what `v` names. An upgrade is a protocol change: it ships only after re-verifying recorded histories with the new version.

**Outcomes.**
- **Accept.** All five checks pass.
- **Reject.** Any check fails, or the strict revocation rule applies: a change from a revoked machine or person that is not in the revocation's causal past is rejected, including offline work that never saw the revocation. A rejected change is never applied, and neither is any change that depends on it.

Rejection is **visible, not silent**, as AGENTS.md requires:
- The receiving peer keeps the change in a local rejected-change log with its reason, its author and what it would have done.
- The board shows a notice to owners and admins.
- A lost-then-found machine's legitimate offline work must be re-entered by its person from a certified machine. The log shows what it was.
- This is a deliberate policy (decided), not an oversight.

> **Open question Q1: strict revocation cannot converge as written.**
> A peer can apply a change `X` from machine `A`, and other people can build on it, before the revocation `R` of `A` reaches that peer. Once `R` arrives, the rule says `X` is rejected. Automerge cannot remove an applied change, and a change whose dependency is missing is held back, never applied **(checked)**. Peers that saw `X` first and peers that saw `R` first would then hold different documents for good.
>
> The race is narrow when everyone syncs through one hub, and wide on a direct peer lane or after long offline periods. Two ways to close it:
> - **A. Strict at the gate, cut at the witness (recommended).** A peer that holds `R` never applies a not-yet-applied change from `A`. A change from `A` outside `R`'s causal past is kept only if an unrevoked machine had already built on it. A peer that merged such changes before `R` arrived records a small signed acknowledgement naming them, which is that witness. The notice lists them as "accepted before the revocation arrived", and an admin undoes any of them with ordinary operations. Every peer reaches the same document. The cost: revocation takes effect when each peer learns of it, not at one global instant.
> - **B. Strict to the letter.** On learning `R`, each peer rebuilds its document without `X` and without everything built on `X`, including valid work by unrevoked people. That work goes to the rejected-change log to be re-entered. This needs a document rebuild that automerge-repo does not offer, and it throws out honest work, visibly.
>
> Step 3 of the rollout needs this answered. Until then the text above states the decided rule.

Two consequences of the verification rule:
- Adding a rule to `prepareOperation`, such as "only the author may delete a comment", enforces it on **every peer** at once. There is no second rule engine to drift out of sync.
- Hub and direct peer paths run the same function on the same document, so they cannot disagree.

**Cost** (one laptop, 1,000 operations of about 120 characters each) **(checked)**:

| Step | Measured |
|---|---|
| Ed25519 verification | 0.14 ms |
| Rebuild in causal order on one kept document (`deps` equal its heads) | About 10 ms per operation, close to the 8 ms it costs to author one. All 1,000 hashes matched |
| Rebuild of a concurrent change, forking by save and reload | About 4 s per change. Not usable |
| The document itself | About 1 million Automerge operations, 480 KiB saved, 1.6 s to load |

- The signature is cheap. The rebuild costs as much as authoring, and both grow with the document because strings are stored as text. A 10,000-operation project was not measured.
- A peer verifies each change once and stores the verdict by change hash. Only a new replica verifies the whole history, and it needs a progress display.
- A cheap, correct fork for concurrent changes is unproven. Reading conflicts inside the change callback of a cloned view gave the right answer in a small test **(checked)**, but a full replay done that way was not measured.

### 5. Membership log (authorization)

Membership operations live in the same document and pass the same verification. They are new `prepareOperation` types with their own authority rules:

| Operation | Signed by | Effect |
|---|---|---|
| `project.genesis` | The creator's person key and machine key (first change) | Sets the single owner (person key) and the first machine. `projectId = base32(sha256(ownerPersonPubkey ‖ nonce))`, so anyone holding the project ID can check the genesis without asking anyone |
| `member.add` | An owner's or admin's person key, plus the new member's person key (both) | Admits a person key with role `admin` or `member`, the identity check used (code and/or forge attestations), and the person's first machine |
| `member.remove` / `member.role` | An owner's or admin's person key | Removes or re-roles a member from that causal point on. The owner can't be removed; ownership doesn't transfer in this version |
| `machine.add` | The member's own person key (**high verification**) | Certifies a new machine key for that person, with scope `full` or `agents-only`. No admin is needed for a member's own machines |
| `machine.revoke` | That person's person key, or an owner's or admin's | Revokes a machine from that causal point on |
| `agent.delegate` / `agent.revoke` | A machine key of the owning person (**low ceremony**) | Creates or retires an agent Actor owned by that person, with a name and harness, that only this machine may act as. Moving or sharing it to another machine needs that machine's own delegation |
| `member.profile` | The member's person key | Display name, email and forge links (defaulting to git's `user.name` and `user.email`) |

Roles are minimal: one `owner` (the genesis person), any number of `admin`s, and `member`s.
- All three may do board work.
- Only the owner and admins admit, remove or re-role members.
- Machines act for their person and that person's delegated agents. Agents act only as themselves and never change membership.

These records replace today's hub-held admissions (`actorIds`, `humanAllowed`) with records that every peer replicates and checks.

### 6. Invitations and enrollment

The three admission paths match the three kinds of key:

- **A new person (invitation, high verification).**
  - **The offer.** The owner or an admin issues a signed, single-use offer: `{projectId, role, inviterPersonKey, nonce, routes[], expiresAt}`. `routes` lists the ways to reach an admitting peer: an HTTPS hub URL, a LAN address, or a direct-peer address.
  - **Route check.** The issuer checks that at least one route is reachable from outside its own loopback. If none is, it says so instead of issuing an invite that can never work (STORY-041).
  - **The join request.** The newcomer's client produces a join request signed by their person key and their new machine key, with their profile and any forge links.
  - **Admission.** An **online** owner or admin countersigns `member.add` after the identity check: confirmation code and/or forge attestation. The hub does this automatically only when the inviter pre-approved the forge login on the invitation (for example "invite `github.com/marcus`"). Otherwise it waits for the code check.
  - **Expiry.** Expiry is enforced by the admitting peer at the moment of admission, never retroactively by peers, so peer clocks are never trusted.
- **A new machine for an existing member (high verification, no admin).**
  - **On the new machine.** Pardner generates a machine key and shows a pairing request.
  - **Approval.** The person approves it with their **person key**: on the new machine, if their git signing key is there or on a hardware token they carry; or on an existing machine, scanning or pasting the request, with a confirmation code shown on both screens.
  - **Recording it.** Any admitted peer that is online records the `machine.add`.
  - **What this fixes.** There is no invitation to copy, and nobody can link a machine into someone else's identity, because only that person's key can sign `machine.add` (STORY-016).
- **A new agent on an existing machine (low ceremony).** `agent.delegate`, signed by the machine key, takes effect immediately and needs no network beyond normal sync. The agent is named and owned at creation, for example "Maya's Codex" (#150).
- **Recovery after revocation.** A revoked machine is replaced by a fresh machine key through the new-machine path. A revoked agent is re-created with a fresh `agent.delegate`. A removed person is re-admitted with a new invitation. There are no dead ends (STORY-043, STORY-130).
- **Lost person key.** The owner or an admin can `member.remove` the old key and admit the person's new key through a fresh invitation. The person's past work stays attributed to the old key. A lost **owner** key cannot be replaced in this version, so the design asks owners to keep a second person key (for example on a hardware token) registered as an `admin`.

### 7. Transport admission (who may read and sync)

- **Handshake.** A sync connection, to a hub or to a peer, opens with a mutual challenge-response signed by machine keys. This replaces `deviceToken` and `replicaToken` bearers.
- **Who is served.** A serving peer sends data only to machines certified in its current membership view. The one exception is an enrolling machine presenting a valid invitation, and that device is limited to enrollment.
- **Same code for hub and peer.** A hub and a peer run the same handshake and the same check.
- **Confidentiality.** Without end-to-end encryption, read confidentiality depends on every serving peer applying this check. That is the same trust we place in the hub today, now applied uniformly.
- **Encryption on the wire.** Hub routes stay HTTPS. A direct peer route runs over an authenticated channel keyed by the machine keys (a Noise handshake, or TLS with pinned raw public keys). This means no certificate authority and no self-signed certificate prompts.

### 8. Change exchange

The verification rule needs changes one at a time and in causal order. automerge-repo applies an incoming sync message inside `receiveSyncMessage`, with no hook before the changes land **(checked)**, so it doesn't fit. Peers instead exchange changes over a small protocol:
- **Advertise.** Each side sends its heads.
- **Fetch.** A receiver asks for the heads it lacks, then for any dependencies it lacks, until what it has received connects to its own history. Heads alone do not say which ancestors are missing, so this takes more than one round. Frames and batches have size limits.
- **Frame.** Each frame carries one change and its signed event.
- **Verify, then apply.** The receiver verifies each change in causal order (section 4) and applies only the accepted ones, through `handle.update(doc => applyChanges(doc, accepted))` **(checked)**.
- **Rejected changes.** These are kept in a separate local rejected-change log with their reason, so they can be shown. They never enter the board document, and their hashes are remembered so they are not fetched again.
- **Retries.** A change is identified by its hash, so a repeated or interrupted exchange is harmless.

What stays the same:
- automerge-repo remains the storage layer. The board document simply has no automerge-repo network adapter between replicas.
- The disk persistence barrier is unchanged. A peer confirms receipt to the sender only after the accepted changes are verified and saved, so "saved locally" and "acknowledged by the hub" stay distinct.

The protocol is transport-agnostic: WebSocket to a hub, a direct WebSocket or QUIC connection between peers, or a file for backup. It gives up the compactness of Automerge's own sync messages, which is acceptable at this scale. The spike should also try the alternative of running Automerge sync into a staging document and verifying from there.

### What stays hub-coordinated

These are about liveness, not authority, so a hub keeps them for now:
- **Delivery leases.** Mention claims need one coordinator.
- **Presence relay.**

Both are documented as unavailable in a pure peer-to-peer session. Correctness (who wrote what, and whether it was allowed) never depends on the hub.

## How this addresses the walk's findings

| Finding (latest report) | Resolution |
|---|---|
| Built-in agents are all "Setup agent" (#150) | `agent.delegate` records the owner login, name and harness. The UI labels agents as "Maya's Codex" |
| My device invitation adopts another identity silently (STORY-016) | Only the person's own key can sign `machine.add`, so a machine can't be linked into someone else's identity. Approval shows a confirmation code on both screens |
| Identity can't be edited, duplicates are possible (STORY-014, STORY-018) | The person key is the identity, so a person is unique per project. Name and email come from git and stay editable through `member.profile` |
| Comment delete has no author check (STORY-090) | The rule moves into `prepareOperation`, and every peer enforces it by replay |
| Membership is CLI-only, revoked parties look offline, no re-admission (STORY-043, STORY-130) | Membership operations are replicated and have UI. Revoked state is explicit. Re-admission works with a new key |
| Revocation shown as "signed out" (STORY-005, STORY-140) | Revocation is a project-level record, distinct from local browser sessions |
| Loopback-only invitations (STORY-041) | Invitations list checked routes and refuse unreachable ones |
| Unremovable stuck request after FORBIDDEN (STORY-089) | Authorization refusals become definitive, so the pending request clears |

## Rollout (each step lands on its own)

0. **Spike.** Prove the exactness check in practice:
   - compare the path and value writes of a received change with a replay at its `deps`, across every operation type;
   - measure the verification cost on a 10k-operation project;
   - confirm how the client sets Automerge actor IDs.

   This is the main technical risk.
1. **Shadow signing.** Devices sign every operation. Receivers verify and log the result but don't enforce it. Run the acceptance and walker suites, and expect zero failed verifications.
2. **Membership log.** Add the genesis, member, machine and agent operations, the confirmation-code check and optional forge attestation. Today's admission records are derived from the log and the bearer tokens remain. This is a breaking change for existing projects, which is acceptable because no migration is needed.
3. **Enforce over the hub path.** Introduce the change-exchange protocol and the machine-key handshake, remove the bearer tokens, and add the rejected-change log. Hub and replicas now verify each other.
4. **Direct peer lane.** Allow the same protocol between two replicas given an explicit address (LAN or tailnet). Validate it on real separate machines, not loopback.
5. **People-facing surfaces.** Members, machines, agents, revocation, re-admission, the rejected-change log and agent naming in the board.

Steps 3 and 4 are storage, sync and delivery milestones: they need the lifecycle model check and the 20-seed acceptance qualification.

## Validation plan

| Scenario | Expected |
|---|---|
| A forged `actorId` in a change from an admitted machine | Rejected by every peer, over the hub or direct |
| A signed event copied into a change that writes extra fields | Rejected by the exactness check |
| A non-author deletes a comment | Refused locally, and rejected on receipt if forced |
| A machine revoked, then still syncing old offline work | Work in the revocation's causal past is kept; everything else from that machine is rejected on every peer and listed in the rejected-change log |
| Two replicas converge directly while the hub is down | Identical documents and identical verification results to the hub path |
| A revoked machine reconnects | Handshake refused; no new data served |
| Someone tries to add their machine under another person's identity | Refused: `machine.add` needs that person's own key |
| Fresh install restored from backup | The machine key is in the backup; it verifies, and runs as the same machine only once (the duplicate-copy guard from STORY-142) |

## Later

- **End-to-end encryption.** A project key wrapped to each certified machine key, recorded in the membership log and rotated on removal. Relays that hold no key store and forward ciphertext by change hash. The signing and verification above don't change.
- **Phones.** First through a trusted hub over HTTPS. The phone browser holds its own non-extractable WebCrypto Ed25519 key and is certified with `machine.add`, so even a hub that relays its changes can't forge its writes. A native app then becomes a full replica with its key in the Secure Enclave.
- **Discovery and NAT traversal** for the direct lane (mDNS on LAN, a relay that sees only ciphertext once encryption exists).
- **Moving machine keys into the OS keychain.**

## Decisions

- **One owner plus admins (decided).** The genesis person is the single owner. Admins share membership authority. Ownership transfer is out of scope for this version.
- **Git required, forges optional (decided).** The person key is the git SSH signing key. Forge attestation (GitHub, GitLab, Codeberg/Forgejo or any `/<login>.keys` host) is optional and recorded when used. Without it, admission rests on a confirmation code.
- **Ceremony by tier (decided).** A new person or a new machine needs the person key. A new agent on an existing machine needs only the machine key.

- **Revocation is strict (decided).** Any change from a revoked machine or person that isn't in the revocation's causal past is rejected on every peer. Rejections are logged and shown, never silently dropped.
