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

Each person holds a person key that Pardner creates and seals with a passphrase, and each machine running Pardner holds its own Ed25519 machine key, certified by its person. Every operation is signed by the machine that made it, and the signature travels inside the change. A replica receiving a change checks four things:
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
| **Person key** | An Ed25519 key that Pardner creates for the person, always sealed with a passphrase, with an exported recovery file | Pardner, sealed, on the person's machines; the recovery file with the person | Certifying a new machine, profile changes, membership actions an owner or admin takes | Rare, deliberate. A touch or passphrase prompt is fine |
| **Machine key** | An Ed25519 key that Pardner generates per machine | The client service, in the client directory (mode 0600; the OS keychain later) | Signing every operation made on that machine, by the person or by the agents delegated there | None after setup |
| **Agent delegation** | No new key: a signed record letting a machine act as an agent Actor | The machine key signs it | Creating an agent under the person's existing machine credential | Cheap: no person-key prompt |

**Person key: created and sealed by Pardner (decided, R1).**

The review found that reusing SSH or OpenPGP keys costs more than it buys. It puts two external toolchains and an OpenPGP verifier into the rule every peer must agree on. Its benefit, commit-to-person linking, reaches at most the 6–10% who sign commits. And it works against presence, because an agent can use a loaded signing key silently.

- **Creation.** Pardner generates an Ed25519 person key the first time someone confirms their identity.
  - It is always sealed with a passphrase the person chooses.
  - It is exported as a recovery file the person keeps somewhere safe (see [Backup, restore and key loss](#backup-restore-and-key-loss)).
- **Signing.**
  - Pardner unseals the key only for a membership action, after the person types the passphrase. It signs with Node's crypto and discards the unsealed key.
  - The board can complete membership actions itself; there is no terminal detour.
  - A stolen disk, a backup, or an agent on the machine holds no membership authority without the passphrase.
- **Verifying.** Peers verify in-process and offline, against the public key pinned in the membership log. Every peer needs only Node's crypto: no OpenSSH, no GnuPG and no OpenPGP library.
- **Key types.** Each key record carries a type (`pardner-ed25519` now). Hardware-backed types, such as a passkey or an `sk-` SSH key, can be added later as a protocol version.
- **Linked keys (optional, later).** A person may link an SSH or OpenPGP key they already use. They prove possession once, locally, and Pardner shows it as a badge, used for:
  - commit linking (a linked commit signed by that key is attributed to the person);
  - forge attestation (the linked key is published on their forge account).

  Linked keys never enter the verification rule.
- **Git.** Pardner relies on git being installed: for name and email defaults, and for commit evidence. It never edits git's configuration.

**Machine key.**
- The machine ID is `machine-<base32(sha256(pubkey))[:26]>`.
- On one machine, browsers, the CLI and agents keep authenticating to the local client with today's cookie, operator token and agent grants. The client service signs their operations with the machine key.
- Pardner never hands a private key to a browser or an agent. [The local trust zone](#the-local-trust-zone) says what that does and does not protect.

**Agents.**
- Starting a new agent on a machine the person already uses is a single `agent.delegate`, signed by that machine's key and scoped to that machine. There is no person-key prompt.
- An agent on a **different** machine (for example a build box) is a new machine. It goes through the high-verification path, certified as "agents only, no human authority".

### 2. Identity: git-native, with forge links optional

- **What a person is.** A person *is* their person key. Their display name and email default to git's `user.name` and `user.email`, published as an editable `member.profile` record signed by the person key. This fixes the uneditable-identity dead end (STORY-014).
- **Duplicates.** Membership is keyed by the person key, so one key is one person. A person who makes a second key on a second computer would still appear twice. The new-machine path (section 6) therefore never offers to create a person key on a computer that is joining an existing identity (STORY-018).
- **Identity checks at admission.** When someone is admitted, the inviter establishes that the person key belongs to the human they think it does. They use either, or both, of:
  - **A confirmation code.** Both screens show a short code derived from the offer, both person keys and the new machine key, compared face to face, by voice or in chat. This works with no forge at all. The join request is also signed with the invitation's own key (section 6), so a relay that never saw the invitation cannot swap in its own keys and search for a pair that produces the same short code.
  - **Forge attestation (optional, any forge).** The person names forge accounts such as `github.com/maya`, `gitlab.com/maya` or `codeberg.org/maya`. A checking machine confirms online, once, that one of the person's **linked keys** (an SSH or OpenPGP key they proved they hold) is published there. Most forges list a user's public SSH keys at `https://<forge>/<login>.keys` and OpenPGP keys at `https://<forge>/<login>.gpg`. The result is recorded in the log as an attestation (`forge`, `login`, `checkedAt`, `checkedBy`). It is that machine's claim, which other peers cannot re-check later. It strengthens trust and shows as a badge, and it is never required.
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
- **Sorted writes.** A peer must be able to verify from the stored document alone, for example when it re-serves a change after a restart. Automerge writes map keys in the order given and reads them back sorted, so a verifier cannot recover the author's order. `prepareOperation` must write every map in sorted key order. Today it writes the payload in request order: with the event read back from a reloaded document, only 4 of the 23 operation types rebuilt to the same hash. With sorted payloads all 23 did **(checked)**.
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
- Hash equality held for all 23 operation types, for two concurrent edits each checked at its own dependencies, and for a resolve built on their merge **(checked)**.

**What the check needs from Automerge.**
- **A true fork at `C.deps`, not `view`.** `getConflicts` on `view(doc, deps)` returns today's conflicts, not the ones at `deps` **(checked)**. `prepareOperation` reads conflicts for same-field alternatives and for retries, so a replay on a view gives wrong answers. A `clone` of the view is a true fork, but the objects it has already read keep answering from the old document until its first change **(checked)**.
- **Stable operation generation.** The rebuild relies on Automerge producing the same operations for the same writes. The Automerge version is part of what `v` names. An upgrade is a protocol change: it ships only after re-verifying recorded histories with the new version.

**Outcomes.**
- **Accept.** All five checks pass.
- **Reject.** Any check fails, or the revocation rule applies: a peer that holds the revocation `R` of a machine or person never applies a not-yet-applied change from them that is outside `R`'s causal past. That includes offline work that never saw the revocation. A rejected change is never applied, and neither is any change that depends on it.
- **Revocation is enforced from arrival (decided, option A).** A change from the revoked party that a peer had already merged before `R` reached it stays in the document. Automerge cannot un-apply it, and other people may have built on it. That peer records a small signed acknowledgement naming such changes (the witness), so every peer converges on the same document. The notice lists them as "accepted before the revocation arrived", with who, what and when, and an admin can undo any of them with ordinary operations. Revocation therefore takes effect as each peer learns of it, not at one global instant.

Rejection is **visible, not silent**, as AGENTS.md requires:
- The receiving peer keeps the change in a local rejected-change log with its reason, its author and what it would have done.
- The board shows a notice to owners and admins.
- A lost-then-found machine's legitimate offline work must be re-entered by its person from a certified machine. The log shows what it was.
- Changes merged before the revocation arrived are listed separately, as above, for an admin to review.

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

Membership operations live in the same document and pass the same verification. They are new `prepareOperation` types with their own authority rules.

**Two signatures.** A membership operation travels like any other, in a change signed by a certified machine (the carrier). Its authority comes from *statements* inside the payload, each signed with a person key.
- A statement names the project, the action, its subject and a unique statement ID.
- A statement ID is accepted once. An old `machine.add` or `member.add` statement cannot be replayed to undo a later revocation.
- A machine may carry the operation that certifies it, so a new machine does not wait for another one to write on its behalf.

| Operation | Authority | Effect |
|---|---|---|
| `project.genesis` | The creator's person key; carried by the first machine in the root change | Sets the single owner (person key) and the first machine. `projectId = base32(sha256(ownerPersonPubkey ‖ nonce))`, so anyone holding the project ID can check the genesis without asking anyone |
| `member.add` | An owner's or admin's person key, plus the new member's person key (both) | Admits a person key with role `admin` or `member`, the identity check used (code and/or forge attestations), and the person's first machine. Creates their human Actor |
| `member.remove` / `member.role` | The owner's person key for anyone; an admin's for members only | Removes or re-roles a member from that causal point on. The owner can't be removed; ownership doesn't transfer in this version |
| `machine.add` | The member's own person key (**high verification**) | Certifies a new machine key for that person, with scope `full`, `agents-only` or `relay`. No admin is needed for a member's own machines |
| `machine.revoke` | That person's person key, or the key of someone who may remove that person | Revokes a machine from that causal point on |
| `agent.delegate` / `agent.revoke` | A machine key of the owning person (**low ceremony**); no statement | Creates or retires an agent Actor owned by that person, with a name and harness, that only this machine may act as. Moving or sharing it to another machine needs that machine's own delegation |
| `scope.grant` / `scope.revoke` | The person's person key (passphrase, once) | Lets one of that person's machines or agents perform a named set of that person's membership actions with its machine key, until revoked (R3) |
| `member.profile` | The member's person key | Display name, email and forge links (defaulting to git's `user.name` and `user.email`) |

Roles are minimal: one `owner` (the genesis person), any number of `admin`s, and `member`s.
- All three may do board work.
- Only the owner and admins admit, remove or re-role members.
- Machines act for their person and that person's delegated agents. Agents act only as themselves and never change membership.

Rules the table implies:
- **Removal runs downhill only.** The owner acts on anyone, an admin on members, and each person on their own machines and agents. Two admins can therefore never remove each other at the same moment, which would leave no deterministic outcome. Only the owner removes or demotes admins (Q4, decided).
- **A removal against a concurrent action by its target** follows the revocation rule: whichever arrives first at a peer decides there, and the witness keeps every peer on the same document.
- **Where the state lives.** Membership operations write `members`, `machines`, `agents` and the used statement IDs into the document. The exactness check means only a verified membership operation can write there. "Membership at `C.deps`" is those maps on the fork.
- **A deterministic genesis.** The root change is built from the genesis statement alone, with the fixed header, so any peer can rebuild it. Today `repo.create` stamps the wall-clock time, and two builds of the same data have different hashes **(checked)**.
- **Actors.** `member.add` and `agent.delegate` create Actors. `actor.register` and its first-Actor exception are retired.
- **The hub's own machine.** A hub is a certified machine like any other. Today it is a member's computer running the client in the hub role. A headless hub is certified by the person who operates it, with scope `relay`: it may sync and serve, and never authors board work.

These records replace today's hub-held admissions (`actorIds`, `humanAllowed`) with records that every peer replicates and checks.

### 5a. Encoding delegations as UCAN 1.0 (decided)

The membership operations above form a delegation chain, so they are encoded as real [UCAN 1.0](https://ucan.xyz/specification/) delegations. Outside UCAN tooling can then read and check them. The causal membership log stays the source of order: it is where delegations and revocations are stored and replicated, and what every peer verifies against.

| Pardner record | UCAN 1.0 delegation |
|---|---|
| `project.genesis` | The owner's person key (`did:key`, Ed25519) is the root issuer and the subject for project authority, with command `/` |
| `member.add` / `member.role` | Owner or admin → the new person key, with command `/pardner/member/...` or `/pardner/board`, attenuated to the role |
| `machine.add` | Person key → machine key, with `/pardner/board` and, when scoped, membership commands; `agents-only` attenuates to agent commands |
| `agent.delegate` | Machine key → agent Actor key or identifier, attenuated to `/pardner/board` acting as that one Actor |
| `scope.grant` | Person key → machine or agent, with the named `/pardner/member/...` commands (R3) |
| `*.revoke`, `member.remove`, `scope.revoke` | A UCAN revocation (`ucan/revoke`, naming the delegation's CID), stored in the log |

- **Envelope and keys.**
  - The spec requires DAG-CBOR for signing, a Varsig header, SHA-256 CIDs, and `did:key` identities.
  - Ed25519 is the recommended algorithm, and P-256 is also required by the spec. That keeps a later passkey person key (P-256) inside the same format.
- **No clocks.**
  - Every delegation sets `exp: null`, which the spec allows for tokens that never expire, and omits `nbf`. So validity never depends on a peer's clock.
  - The spec's ±60 s drift guidance never applies.
  - Invitation expiry stays outside the token and is checked only by the admitting device (section 6).
- **Revocation.**
  - UCAN revocation is an immutable `ucan/revoke` record that verifiers keep in a cache. The spec says it may run in eventually consistent systems, and that a CRDT may store revocations at a well-known path. The membership log is that place.
  - The Q1 rule (enforce from arrival, with a signed witness for work already merged) sits on top. UCAN itself notes that revocation cannot undo actions already taken.
- **Chain resolution.** The spec fails validation when a proof cannot be dereferenced. Every peer holds the full log, so every proof CID resolves locally and offline.
- **Operations.** Board operations keep the lightweight signed envelope from section 3, which names the CID of the signing machine's delegation as its proof. Encoding each operation as a UCAN invocation (`ucan/inv`) is possible later, but would add a DAG-CBOR encode per write. The spike measures that cost before anything is decided.
- **Risks the spike must clear.**
  - *Dependencies.* DAG-CBOR, Varsig and multiformats become runtime dependencies that every peer must agree on, pinned like Automerge. Their footprint and audit surface need to be measured.
  - *Library maturity.* A JavaScript library that implements the final 1.0 envelope must be confirmed. `iso-ucan` is a candidate; `@ucanto/*` and `ts-ucan` predate 1.0 or target older drafts. Otherwise, a small in-repo encoder and verifier must be checked against the spec's test vectors.
  - *Spec status.* The spec's published pages differ on whether `exp` is required and do not all state a version. Pin the exact spec revision.

### 6. Invitations and enrollment

The three admission paths match the three kinds of key:

- **A new person (invitation, high verification).**
  - **The offer.** The owner or an admin creates a one-time invitation key pair and signs an offer with their person key: `{projectId, offerId, role, invitePublicKey, identityCheck, routes[], expiresAt}`. The invitation text carries the offer and the invitation's private key. It is the shared secret that admits a newcomer, as today's invitation secret is, and no hub needs to see it. `routes` lists the ways to reach an admitted peer: an HTTPS hub URL, a LAN address, or a direct-peer address.
  - **Route check.** The issuer refuses to issue an invitation whose only routes are loopback, and checks that each route answers. It cannot prove a route is reachable from the recipient's network, so the recipient's client reports which routes failed (STORY-041).
  - **The join request.** The newcomer's client produces a join request signed by the invitation key, their person key and their new machine key, with their profile and any forge links.
  - **The identity check**, chosen by the inviter in the offer:
    - `forge`: the inviter named a forge login (for example "invite `github.com/marcus`"). Their client fetched that login's keys when issuing and pinned them in the offer. The join request must be signed by one of them. Nobody needs to be online to approve.
    - `code`: the inviter or another admin compares the confirmation code and signs an approval with their person key. This needs an admin online at the same time.
  - **Recording it.** `member.add` holds the offer, the join request and any approval. Every peer verifies it offline from those signatures. A hub can record it, and holds no authority of its own.
  - **Single use.** The offer ID is recorded in the document. If two different join requests use one offer on peers that have not yet synced, both are shown to the owner and admins, and neither person is admitted until one is chosen.
  - **Expiry.** Expiry is enforced by the recording peer at the moment of admission, never retroactively by peers, so peer clocks are never trusted. The inviter can also revoke an unused offer.
- **A new machine for an existing member (high verification, no admin).**
  - **On the new machine.** Pardner generates a machine key and shows a pairing request.
  - **Approval.** The person approves it with their **person key** on an existing machine, typing its passphrase, after scanning or pasting the request and comparing a confirmation code shown on both screens. Or they approve it on the new machine by importing their recovery file. Whether pairing may also copy the sealed person key to the new machine is open (R6).
  - **Recording it.** The new machine carries its own `machine.add` to any admitted peer, which verifies it before serving anything.
  - **No key within reach.** If the person key is neither on the new machine nor on a machine at hand, Pardner says so. It does not offer to start a new identity, which is how duplicates arise today.
  - **What this fixes.** There is no invitation to copy, and nobody can link a machine into someone else's identity, because only that person's key can sign `machine.add` (STORY-016).
- **A new agent on an existing machine (low ceremony).** `agent.delegate`, signed by the machine key, takes effect immediately and needs no network beyond normal sync. The agent is named and owned at creation, for example "Maya's Codex" (#150).
- **Recovery after revocation.** A revoked machine is replaced by a fresh machine key through the new-machine path. A revoked agent is re-created with a fresh `agent.delegate`. A removed person is re-admitted with a new invitation. There are no dead ends (STORY-043, STORY-130).
- **Lost keys.** See [Backup, restore and key loss](#backup-restore-and-key-loss).

### 7. Transport admission (who may read and sync)

- **Handshake.** A sync connection, to a hub or to a peer, opens with a mutual challenge-response signed by machine keys. Each side signs a fresh challenge from the other together with the connection's own identity, so a recorded or relayed answer is useless elsewhere.
- **What it replaces.** Today's bearer `deviceToken` and `replicaToken`. Each thing they separate today keeps a counterpart:

  | Today | With machine keys |
  |---|---|
  | A device token admits a machine to the hub API | The handshake proves the machine key |
  | A separate replica token admits a full document writer | A certified machine with scope `full`, `agents-only` or `relay` |
  | A per-agent token limits a machine to one agent Actor | The `agent.delegate` record for that machine |
  | Revoking an admission ends access | `machine.revoke` and `member.remove`, checked at every handshake |

  AGENTS.md says shared-secret admission must not be relaxed. The owner confirmed (Q2) that this handshake satisfies the rule: admission is per-machine, revocable and checkable by every peer, so it is stronger than a shared secret, not a relaxation. The PR that lands step 4 also rewords the rule in AGENTS.md to "do not weaken admission: every sync connection must authenticate as a certified machine".
- **Who is served.** A serving peer sends data only to machines certified in its current membership state. The one exception is an enrolling machine that presents a valid join request or `machine.add`. It receives the document only once the operation that admits it is recorded.
- **Hub-coordinated requests.** Delivery lease and presence requests ride the same authenticated connection. A lease is granted only to a machine delegated for that Actor.
- **Same code for hub and peer.** A hub and a peer run the same handshake and the same check.
- **Enrollment point.** Any admitted, reachable peer could record an enrollment. AGENTS.md currently requires the hub for enrollment, so the hub stays the only enrollment point for now (Q3, decided). Once the direct lane is qualified on real separate machines, any admitted, reachable owner or admin peer may record enrollments, and AGENTS.md is updated in that PR.
- **Confidentiality.** Without end-to-end encryption, read confidentiality depends on every serving peer applying this check. That is the same trust we place in the hub today, now applied uniformly. A revoked machine keeps what it already downloaded, as today.
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

## The local trust zone

Peer verification proves which **machine** signed a change. Everything inside one machine rests on the local client service and the OS user account.

| Question | Who can answer it | Strength |
|---|---|---|
| Which machine made this change? | Any peer, from the signature | Cryptographic |
| Was that machine allowed to act as this Actor? | Any peer, from the membership and delegation records | Cryptographic |
| Was it the person or one of their agents on that machine? | Only that machine's client service (cookie, operator token, agent grant) | Local. Peers take the machine's word |

Consequences:
- A rule such as "only the author may delete a comment" holds between people and between machines. Between a person and their own agent on one machine, it holds only as far as the local service enforces it.
- Any process running as the same OS user can read the machine key file and the operator token. An agent with shell access is such a process. Agent grants limit a cooperative agent. They are not a security boundary against a hostile one.
- The person-key tier is a real boundary only when using the key takes a deliberate act. Pardner's person key is always sealed with a passphrase, so every use needs the person to type it.
- **Membership authority can be delegated (decided, R3; softens Q6).** People routinely hand management to an agent, so a per-action passphrase costs more than it guarantees.
  - **The grant.** Once, with the passphrase, the person key signs a revocable scope, "may manage membership", for one of their machines or agents. The scope can be narrowed, for example to "may add machines and agents" or "may admit members".
  - **Using it.** That machine or agent then signs membership actions with its machine key. There is no per-action prompt.
  - **Verifying it.** Peers verify the chain person key → scope → machine. The log records who acted and for whom, for example "added by Maya's Codex for Maya".
  - **Revoking it.** Revoking the scope, or the machine, ends it from that causal point on.
  - **What stays guarded.** The person key itself stays sealed at rest. It is needed only to grant or revoke scopes, to certify machines, and to manage the person's own membership, so a stolen disk or backup still holds no membership authority.
  - **Peer-checkable presence.** No longer planned for the first release. The key-type field leaves room for hardware keys or passkeys later.
- A build box or shared host should be its own machine with scope `agents-only`, so it never holds human authority.
- The cookie, operator token and agent grants work as they do today and never leave the machine.

## Backup, restore and key loss

- **What a cold backup holds.** The client directory, now including the machine key. A backup is a credential, as it is today. The sealed person key is in it too, which is safe because it is useless without the passphrase. The exported recovery file is the person's own copy, kept off the machine.
- **Restoring.** A restored client is the same machine and resumes signing. Because each process picks its own actor suffix, a restored copy and its original cannot corrupt each other's Automerge history even if both run.
- **Two live copies.** Running both is still a duplicated credential. No guard against it exists today (#165, STORY-142). A peer that sees two sessions for one machine reports it, and the remedy is `machine.revoke` plus a fresh machine key.
- **A stale backup.** Revocations live in the document on every peer, so restoring an old backup cannot roll them back. That removes a hazard the [recovery guide](PARDNER-CLIENT-RECOVERY.md) warns about for the authority host today. The delivery lease ledger still needs its own current backup.
- **Fresh install with no backup.** The computer joins as a new machine with the person key. It fetches the document from any peer and verifies it from the genesis, needing only the project ID.
- **Lost machine.** Its person revokes it from another machine, or the owner or an admin does.
- **Lost person key.** The owner or an admin removes the old key and admits the person's new key through a fresh invitation. The person's past work stays attributed to the old key.
- **Lost owner key.** It cannot be replaced in this version. An owner should register a second person key, for example on a hardware token, as an `admin`. That keeps ordinary membership manageable. Losing the owner key freezes the admin list: no admin can then be removed or demoted. This is an accepted, documented limitation of this version (Q4, decided); the remedy is a new project.
- **Export.** The readable export is unchanged. It is not a replica and holds no keys.

The recovery guide is updated in the same step that introduces machine keys.

## Required services and outages

| Service | Needed for | While it is down | Replacing it |
|---|---|---|---|
| Hub | Enrollment (until the direct lane is qualified; Q3), new delivery leases, presence relay, and sync between machines that cannot reach each other | Enrolled replicas reopen, verify, edit and save locally with only their machine key. Accepted work continues. New dispatch and presence are unavailable and say so | Restore its cold backup at the same origin. Peers resupply the document, including membership and revocations. The lease ledger needs the backup |
| git | Name and email defaults, and commit evidence | Pardner still runs; names are typed by hand and commit evidence is unavailable | Any git |
| A forge | Optional attestation | The `code` check still admits people | Not needed |

Delivery leases and presence are about liveness, not authority, so a hub keeps them for now. Correctness (who wrote what, and whether it was allowed) never depends on the hub.

## Direct peer lane: feasibility

| Aspect | Assessment |
|---|---|
| Platforms | The Node client service on desktop computers. No phone or browser replica |
| Discovery | None. A person supplies the address. Automatic discovery is out of scope |
| Reachability | The same LAN, or a tailnet. Across NAT without a tailnet it does not work, and a relay would be a new service to run |
| Exposure | The client listens on loopback only today. A direct lane needs a second listener on a chosen interface, off by default, that speaks only the handshake and the change exchange. OS firewall prompts apply |
| Background running | Both services must be up at the same time. Nothing stores and forwards without a hub |
| Unavailable without a hub | New delivery leases and presence; enrollment until the direct lane is qualified (Q3) |
| Evidence needed | Two real machines on separate networks. A loopback test shows nothing about reachability |

**Decision.** Offer the direct lane as an explicit opt-in once the hub path enforces the same rule (rollout step 5). It adds a lane; it does not replace the hub.

## How this addresses the walk's findings

| Finding (latest report) | Resolution |
|---|---|
| Built-in agents are all "Setup agent" (#150) | `agent.delegate` records the owner, name and harness. The UI labels agents as "Maya's Codex" |
| My device invitation adopts another identity silently (STORY-016) | Only the person's own key can sign `machine.add`, so a machine can't be linked into someone else's identity. Approval shows a confirmation code on both screens |
| Identity can't be edited, duplicates are possible (STORY-014, STORY-018) | One person key is one person. Name and email come from git and stay editable through `member.profile`. A second computer joins through the new-machine path, which never creates a second identity |
| Comment delete has no author check (STORY-090) | The rule moves into `prepareOperation`, and every peer enforces it by replay. A person and their own agent on one machine are told apart only locally |
| Membership is CLI-only, revoked parties look offline, no re-admission (STORY-043, STORY-130) | Membership operations are replicated and get UI in step 6. Revoked state is explicit. Re-admission works through a fresh statement or a new key |
| Revocation shown as "signed out" (STORY-005, STORY-140) | Revocation is a project-level record, distinct from local browser sessions. The board still has to show it as such |
| Loopback-only invitations (STORY-041) | Invitations refuse loopback-only routes and report which routes failed |
| Unremovable stuck request after FORBIDDEN (STORY-089) | Not fixed by this design. A local refusal is already final; the stuck request is a board defect tracked in #151 and #160 |

## Rollout (each step lands on its own)

0. **Spike.** The review showed that the rebuild check works for every operation type and for concurrent edits once payload keys are sorted. Still to prove:
   - UCAN 1.0 delegations ([section 5a](#5a-encoding-delegations-as-ucan-10-decided)): a pinned library or in-repo verifier passes the spec's test vectors, dependency footprint, and verification cost per chain;
   - a cheap, correct fork at `deps` for concurrent changes;
   - verification time and memory on a 10,000-operation project, including a new replica's first full verification;
   - whether strings should be stored as plain values rather than Automerge text (Q7: measure first, decided). See [Cost in context](#cost-in-context);
   - signing and verifying with a hardware key.

   Verification cost is now the main technical risk.

   <a id="cost-in-context"></a>**Cost in context (what the spike must measure).**

   Today Pardner never edits text in place. Every edit writes a whole new value into a field register (`register(change.new, …)` in `lib/workspace-commands.js`), and concurrent edits to one field become explicit alternatives. Automerge text therefore adds per-character operations without providing character-level merging. The owner wants to keep Automerge text if the numbers allow, because agents work fast. So the spike measures both storage modes and reports each cost alongside **how often it is paid**:

   | Cost | When it is paid | Measure at 1k / 10k / 50k operations |
   |---|---|---|
   | Signature check | Once per incoming change, per peer | Time per change |
   | In-order rebuild | Once per incoming change, per peer (verdict cached by hash) | Time per change, as a share of authoring time, and peer CPU at a realistic agent write rate (e.g. 1, 10 and 50 operations per second) |
   | Concurrent-change rebuild (fork at `deps`) | Only for changes concurrent with local heads: simultaneous human and agent edits, or after offline work | Time per change, and the share of changes that are concurrent in a realistic mixed human-and-agent session (taken from the acceptance and walker workloads) |
   | Document open | Every runtime start | Load time and memory |
   | First full verification | Once per new machine joining | Total time and memory, and how a progress display would read |
   | Document growth | Continuously | Bytes and Automerge operations per typical edit (short title, 2,000-character description, comment) |

   **Decision rule.** Keep Automerge text if, at 10,000 operations:
   - in-order verification stays under the authoring time;
   - concurrent-change verification stays under a second at the measured concurrency rate;
   - the document opens in under 3 seconds.

   Otherwise switch to plain values. If character-level merging of concurrent text edits is wanted later, it is a separate feature (splice-based edits), not a reason to keep today's storage.
1. **Deterministic writes and shadow signing.** Add sorted map writes, the fixed change header, the machine key and the machine-prefixed actor ID. Machines sign every operation and include their public key. Receivers rebuild, verify and log the result but don't enforce it. Sync stays as it is. Run the acceptance and walker suites, and expect zero failed verifications.
2. **Membership log.** Add the genesis, member, machine and agent operations, the invitation key, the confirmation-code check and optional forge attestation. Today's admission records are derived from the log and the bearer tokens remain. Update the recovery guide for machine and person keys. This is a breaking change for existing projects, which is acceptable because no migration is needed.
3. **Enforce over the hub path.** Introduce the change exchange with the verification gate, and the rejected-change log with its board notice and a CLI listing. A rejection must be visible from the first day one can happen. It also adds the revocation witness and its "accepted before the revocation arrived" notice. Bearer tokens still admit connections.
4. **Machine-key handshake.** Replace the bearer tokens, and reword the AGENTS.md admission rule in the same PR (Q2, decided).
5. **Direct peer lane.** Allow the same protocol between two replicas given an explicit address (LAN or tailnet). Validate it on real separate machines, not loopback.
6. **People-facing surfaces.** Members, machines, agents, revocation, re-admission and agent naming in the board.

Qualification:
- Steps 1, 3, 4 and 5 change `automerge-sync-server.js`, `lib/workspace.js` or `lib/workspace-runtime.js`, so each needs the lifecycle model check.
- Steps 3, 4 and 5 are storage, sync and delivery milestones and need the 20-seed acceptance qualification.
- Step 3 ends "native replicas are trusted full document writers". README and the acceptance contract change with it.

## Validation plan

This is a plan. None of these scenarios has been run.

| Scenario | Expected |
|---|---|
| A forged `actorId` in a change from an admitted machine | Rejected by every peer, over the hub or direct |
| A signed event copied into a change that writes extra fields, drops a predecessor or alters the header | Rejected by the exactness check |
| A client sends payload keys in unsorted order | The change still rebuilds to the same hash on every peer |
| A non-author deletes a comment | Refused locally, and rejected on receipt if forced |
| An enrolled replica reopens with the hub unreachable, edits and restarts | It opens, signs with its machine key and saves locally. No person key, forge or hub is needed, and the edits survive the restart |
| The same field is edited on two disconnected machines | Both changes verify at their own dependencies. Both alternatives are kept for explicit resolution, as today |
| An exchange is interrupted mid-batch and retried; the same request is retried on a second machine | No change is applied twice, the retried operation collapses to one, and acknowledged edits survive |
| A machine revoked, then still syncing old offline work | Work in the revocation's causal past is kept; later work is rejected by every peer that holds the revocation, and listed in the rejected-change log |
| A peer applies a machine's change before that machine's revocation arrives | The change stays, a signed witness names it, every peer ends with the same document, and the notice lists it as accepted before the revocation arrived |
| An old `machine.add` statement is replayed after the machine was revoked | Rejected: the statement ID was already used |
| Two different join requests use one offer | Both are shown; neither person is admitted until one is chosen |
| Two replicas converge directly, on two real machines on separate networks, while the hub is down | Identical documents and identical verification results to the hub path. Leases and presence report as unavailable |
| A revoked machine reconnects | Handshake refused; no new data served |
| Someone tries to add their machine under another person's identity | Refused: `machine.add` needs that person's own key |
| Fresh install restored from a cold backup | The machine key is in the backup. The restored copy verifies and signs as the same machine. If the original also runs, history stays intact and the duplicate is reported |
| Fresh install with no backup | The computer joins as a new machine and verifies the whole history from the project ID alone |
| An Automerge upgrade | Recorded histories re-verify with identical verdicts before the upgrade ships |

## Later

- **End-to-end encryption.** A project key wrapped to each certified machine key, recorded in the membership log and rotated on removal. Relays that hold no key store and forward ciphertext by change hash. They cannot verify, so they cannot reject; every peer that holds the key still does. The signing and verification above don't change.
- **Phones.** First through a trusted hub over HTTPS. The phone browser holds its own non-extractable WebCrypto Ed25519 key and is certified with `machine.add`. A change is fully determined by the signed envelope and the document at `deps`, so the hub can build the change the phone signed, every peer can verify it, and the hub cannot forge the phone's writes. A native app then becomes a full replica with its key in the Secure Enclave.
- **Discovery and NAT traversal** for the direct lane (mDNS on LAN, a relay that sees only ciphertext once encryption exists).
- **Moving machine keys into the OS keychain.**

## Decisions

Three stand as decided; revocation was revised after the review showed the strict rule could not converge.

- **One owner plus admins (decided).** The genesis person is the single owner. Admins share membership authority. Ownership transfer is out of scope for this version. Only the owner removes or demotes admins, and a lost owner key freezes the admin list (Q4, accepted).
- **Git required, forges optional (decided).** Pardner relies on git being installed, and never edits its configuration. The person key is created and sealed by Pardner (R1, decided, replacing Q5). SSH and OpenPGP keys may be linked later as badges for commit linking and forge attestation, never as part of verification. Without a forge, admission rests on a confirmation code.
- **Ceremony by tier (decided).** A new person or a new machine needs the person key. A new agent on an existing machine needs only the machine key. Membership authority can be delegated once, by a scope the person key signs, to a machine or agent that then acts without prompts (R3, decided).
- **Revocation is enforced from arrival (decided, revised).** Each peer refuses a revoked party's changes from the moment it learns of the revocation. Work already merged stays, is named by a signed witness and listed for an admin to undo. Rejections are logged and shown, never silently dropped. This replaces the original strict rule, which could not converge on Automerge.

## Review notes

Reviewed against AGENTS.md (Local-first), the local-first design skill, README, the client, recovery and acceptance docs, the latest walk report and the code named in the brief. The reference sync branch `cursor/native-automerge-ws-sync-cda6` is an ancestor of this branch, so the two do not differ. Checks were throwaway scripts outside the repository; no product code changed.

**What changed, and why**

- **Exactness is now "rebuild the change and compare hashes".** Path-and-value comparison missed a tampered change that showed the same values, and strings are stored as per-character text.
- **Sorted map writes are required.** Without them only 4 of 23 operation types rebuild from a stored document.
- **Replay runs on a true fork, not `view`.** `getConflicts` ignores a view's heads, and `prepareOperation` depends on it.
- **The Automerge actor ID is machine prefix plus a per-process suffix.** It binds the change to the machine without risking a reused sequence number after a restore or crash.
- **The signature fixes the whole change.** The header time and message are fixed too, so a valid signature cannot be wrapped in a different change.
- **Measured costs replace the "measure it" placeholder.** Signatures are cheap; the rebuild costs as much as authoring, and forking for concurrent changes is the unsolved part.
- **The change exchange has a real fetch step.** Heads alone do not reveal missing ancestors. Rejected hashes are remembered, and receipt is confirmed only after verify and save.
- **Membership operations carry person-signed statements inside a machine-signed change.** Statements are single-use, so an old one cannot undo a revocation.
- **Removal authority runs downhill only.** Otherwise two admins removing each other at once has no deterministic outcome.
- **Genesis is deterministic, and the document has one root.** Today's creation change embeds the wall-clock time.
- **The hub has an identity.** It is a certified machine; a headless one gets scope `relay`.
- **Invitations use a one-time key and a pre-signed offer.** The earlier text had the hub admit people automatically, which needed the hub to hold an admin's authority.
- **The confirmation code is bound to the invitation key.** A code derived from two static keys alone can be matched by a relay that tries many keys.
- **Person-key signing is specified.** Accepted key types, in-process verification, the need for a terminal or ssh-agent, and never overwriting an existing git signing setup.
- **Bearer tokens are mapped one for one to machine-key checks**, and their removal became its own rollout step.
- **New sections: local trust zone, backup and key loss, required services and outages, direct peer feasibility.** The skill and AGENTS.md ask for each; the trust zone states plainly that peers verify machines, not which Actor on a machine.
- **The backup row no longer cites a duplicate-copy guard.** None exists; STORY-142 is the open finding (#165).
- **Rollout reordered.** Deterministic writes come before shadow signing; the rejected-change notice lands with enforcement, not two steps later.
- **The STORY-089 claim was removed.** That defect is in the board, not in authorization.
- **The validation plan gained the skill's scenarios**: offline reopen, concurrent same-field edits, interrupted exchange, real-network direct sync, restore with and without a backup.

**Open questions for the owner**

- **Q1 (decided: option A).** Revocation is enforced from arrival, with a signed witness for work merged before it. Section 4.
- **Q2 (decided: yes).** The machine-key handshake satisfies the admission rule. The PR that lands step 4 updates AGENTS.md to say so. Section 7.
- **Q3 (decided: hub-only now, peers later).** The hub stays the only enrollment point. Once the direct lane is qualified, admitted owner and admin peers may enroll too, with an AGENTS.md update. Section 7.
- **Q4 (decided: owner only, freeze accepted).** Only the owner removes or demotes admins. A lost owner key freezes the admin list; that limitation is documented, not engineered around. Section 5.
- **Q5 (superseded by R1).** Was: SSH or OpenPGP person keys. Replaced by a Pardner-made, passphrase-sealed person key, with SSH and OpenPGP as optional linked keys. Section 1.
- **Q6 (superseded by R3).** Was: a deliberate act for every membership action. Replaced by delegable, revocable membership scopes signed once by the person key. The local trust zone.
- **Q7 (decided: measure first).** Keep Automerge text unless the spike's numbers, read against how often each cost is paid, cross the decision rule in [Cost in context](#cost-in-context). Rollout step 0.

## Simplification review (proposal)

Status: **proposal from a second review**. It answers the owner's question "are we overcomplicating the person-key direction?". It changes no decided section above. Where it disagrees with a decision, the disagreement is put as a question in [Questions for the owner](#questions-for-the-owner), and the decision stands until the owner answers.

### Verdict

Partly, yes.

- **Keep the three tiers.** Person, machine and agent, with ceremony that falls at each step, is the right shape. A person key separate from the machine key is worth having (see [Is a person key needed at all?](#is-a-person-key-needed-at-all)).
- **The overbuilt part is where the person key comes from.** Making it an SSH or OpenPGP key puts two external toolchains and a second signature format inside the rule every peer must agree on. The benefit that justifies this, linking commits to people, reaches at most the 6–10% of developers who sign commits, and it can be had without putting those formats in the verification rule.
- **The plan's order is overbuilt for the current stage.** Everything, including the board surfaces that fix the walk's findings, waits behind the riskiest unknown (the replay check). The findings need far less.

### What this review checked

Throwaway scripts outside the repository, on macOS with its bundled OpenSSH 10.5 and Node 24. No product code changed. Nothing here was run on Linux or with GnuPG or a hardware key.

| Check | Result |
|---|---|
| A key loaded in ssh-agent, signing from a process with no terminal, given only the public key | Signs silently **(checked)** |
| The same key loaded with confirmation (`ssh-add -c`), on a machine with no askpass program, which is the macOS default | The agent refuses. Nothing is signed and nothing is asked **(checked)** |
| Creating an `sk-ssh-ed25519` key with the OpenSSH that macOS ships | Fails: "No FIDO SecurityKeyProvider specified". Hardware keys need a different OpenSSH build or a provider library **(checked)** |
| GnuPG on the review machine | Not installed, so no OpenPGP path could be tried. This is itself a data point about developer machines |
| A Pardner-made Ed25519 key, sealed with a passphrase using only Node's built-in crypto (scrypt and AES-256-GCM) | About 20 lines. Opening takes about 0.3 s, a wrong passphrase is refused, and verification takes 0.11 ms **(checked)** |
| SSHSIG verification for `ssh-ed25519` in Node | Works, as the first review found **(checked)** |
| The `openpgp` package on npm | 17 MB unpacked, against five runtime dependencies today. Not installed or run |

### Is a person key needed at all?

Yes, but a small one.

**Machine keys alone do not quite work.** If a person is simply the set of their machines, there are two ways to arrange them, and each has a flaw:
- **Flat.** Any of a person's machines may add or revoke another. A stolen laptop can then revoke the good one while the good one revokes it, and no rule decides the outcome. This is the problem "removal runs downhill only" solved for admins.
- **Rooted at the first machine.** This has a clear outcome, but the first machine's key is now a person key by another name. It must stay unencrypted, because the service signs with it all day. It cannot be exported apart from the machine. Losing that one computer loses the person, and for the owner it freezes the project.

A separate person key fixes both. It is used rarely, so it can be sealed with a passphrase, and it can be exported.

**What the person key protects against, by where it is kept:**

| Where the person key lives | Someone with the disk or a backup | An agent or other process running as the same user | Visible to other peers |
|---|---|---|---|
| Unencrypted file, or loaded in an agent without confirmation | Has it | Can use it silently | No |
| Sealed with a passphrase, never cached | Does not have it | Cannot use it without capturing the passphrase | No |
| Hardware token with touch | Does not have it | Cannot use it | Yes, for `sk-` SSH keys only |

With SSH or OpenPGP keys, Pardner cannot tell which row a person is in. gpg-agent caches a passphrase for ten minutes by default (from GnuPG's documentation; not tested), macOS pinentry can store it in the keychain, and ssh-agent signs silently unless the key was added with `-c`. With a key Pardner makes, Pardner can require the second row for everyone.

### Comparison of the alternatives

"Walk findings" means the identity findings: takeover through a My device invitation (#155), duplicate people (#156), revocation and re-admission (#153, #154, #175), and no board control to remove members (#152).

| Alternative | Walk findings | Protection it adds | Build and test cost | Ceremony | Local-first and peer-verifiable |
|---|---|---|---|---|---|
| **(a) Machine keys only**, new machines approved from an existing one | Fixed, given a pairing flow with a code on both screens | None between tiers. Flat sets have no deterministic outcome for mutual revocation; a rooted set makes the first machine an unsealed person key | Lowest | Lowest: confirm a code | Fully in-process and offline |
| **(b) A Pardner-made person key**, sealed with a passphrase, exportable | Fixed, and the board can complete membership actions itself | A stolen disk, a backup or a local agent does not hold membership authority. Not visible to peers | Low: Node crypto only, one format, testable in the existing suites | A passphrase at rare actions; one recovery file to keep | Fully in-process and offline. No external tool |
| **(c) SSH keys only** | Fixed, but every membership action ends in a terminal (Q6) | Depends on the person's agent setup, which Pardner cannot observe. Visible to peers only with a hardware token | Medium: `ssh-keygen` as a subprocess; file, agent, confirmation and hardware paths to test | Varies. `ssh-add -c` fails on a default macOS; hardware keys need a non-system OpenSSH | Verifies in-process. Signing needs OpenSSH |
| **(d) SSH or OpenPGP keys** (the current decision) | As (c) | As (c). OpenPGP never gives peers evidence of presence, even from a smartcard | Highest: adds an OpenPGP verifier every peer must agree with, and gpg-agent, pinentry and smartcard paths | As (c), plus pinentry failures when there is no terminal | As (c). Signing needs OpenSSH or GnuPG; verifying needs a pinned OpenPGP library |
| **(e) Option (b) now, with room for more key types**, and git keys linked as badges | As (b) | As (b) now. Presence that peers can check arrives later through a hardware key type | As (b) now. Each later key type is priced when it is wanted | As (b) | As (b) |

Two observations about (c) and (d):

- **(c) is the weakest choice, not a middle one.** If the point of reuse is the key git already signs with, SSH-only reuse reaches about 1% of the 6–10% who sign: roughly one developer in a thousand. The owner's reasoning for Q5 was sound: if Pardner reuses signing keys, it must take OpenPGP. The real choice is between (d) and no reuse.
- **Under (d), reuse and presence pull against each other.** Agents work fast and commit often. A git signing key that agents can use at that speed is, by construction, a key that signs without a deliberate act: the first row of the table above. A signing key that does demand a touch or a prompt for every signature stops agents from signing commits. So the people for whom reuse works smoothly are the people for whom Q6 means least.

### Does reusing git's signing key buy anything real?

Less than it costs, when the key is the root of identity.

- **Commit-to-person linking does not need the person key to be the git key.** Checking a commit's signature needs the commit object, so it already happens beside a git checkout, with git at hand. It is a local check that produces a badge, as forge attestation does. It never needs to be part of the rule all peers must agree on.
- **A link is enough.** A person publishes "my git signing key is this fingerprint" in their profile, and the git key signs a statement naming the person. A machine that has git, `ssh-keygen` or `gpg` checks both and records an attestation, as section 2 already does for forges. Other peers show the badge and never verify it. This works for OpenPGP and SSH alike, with no OpenPGP library inside Pardner, and it serves the same 6–10%.
- **Forge-pinned invitations** ("invite `github.com/marcus`") are the one feature that needs the person's own key to be an SSH key. It is optional in the design, and the walk found no problem it solves. Leaked invitations (STORY-043) are already covered by the confirmation code.
- **"The private key never enters Pardner"** is a real property of reuse and is lost under (b). Pardner already holds the machine key and every token, so the loss is small.

### Is OpenPGP from the start justified?

Not as a person-key format.

- **It joins the rule every peer must agree on.** If two versions of the verifier ever disagree about one membership statement, peers split: one admits a person and the other rejects everything that person writes. A library upgrade, including a security fix, becomes a protocol change, as an Automerge upgrade already is.
- **The format invites disagreement.** Each of these is a rule Pardner would have to fix and test: v4 against the newer and mutually incompatible v5 and v6 keys; primary keys against signing subkeys; signature subpackets that are not covered by the signature; accepted hash algorithms; three public-key algorithms. Ignoring expiry and keyservers is the right call and removes only part of this.
- **It is used rarely.** A person signs with this key a handful of times per project: at genesis or admission, for each new machine, and for the occasional role change or removal.
- **It cannot be tested where the suites run.** Neither GnuPG nor a FIDO provider was present on the review machine. The first review also left OpenPGP signing and hardware keys untested.

### What happens to presence (Q6)?

| Alternative | What "a deliberate act" means |
|---|---|
| (a) | The local service checks that a human session clicked Confirm. The same service holds the key, so this stops accidents only |
| (b), (e) | The person key is always sealed, so every membership action needs the passphrase, typed in the terminal or in the board. Pardner enforces this for everyone. It stops agents, accidents and a stolen disk. It does not stop a process that can capture the passphrase |
| (c), (d) | One of three different guarantees, depending on agent settings Pardner cannot see. Only a hardware `sk-` key is strong, and only it is visible to peers |

**The simplest honest version:** membership actions need the person-key passphrase, every time. That is a local guarantee, and the document should say so plainly. Presence that peers can check is an optional hardening for owners and admins, added as a hardware-backed key type when someone wants it. Two candidates, neither tested:
- `sk-ssh-ed25519`, as designed above. It needs a FIDO token and an OpenSSH that supports one.
- A passkey (WebAuthn) created in the board. The laptop's own fingerprint reader would do, and the signed data carries presence and user-verification flags that peers can check with Node's crypto. The client serves on `127.0.0.1` today; WebAuthn is expected to need the name `localhost` instead. To be checked before proposing it.

### Is the rest of the plan overbuilt for this stage?

The verification rule delivers three separate properties. The document treats them as one, so the cheapest waits for the dearest.

| Level | What every peer can decide alone | What it needs | Open risk |
|---|---|---|---|
| **1. Admission** | Whether a machine may connect and sync, and who may change membership | Machine keys, the person key, signed membership statements, the handshake (section 7) | None found. It is signature checks only |
| **2. Authentic changes** | Which machine made each change, even when another peer relays it | A signature per change, and an exchange that verifies before applying (section 8) | The exchange replaces automerge-repo's sync between replicas |
| **3. Allowed changes** | That each change is a legal operation by an Actor that machine may act as | Replay and exact rebuild, sorted writes, a pinned Automerge, a true fork at `deps` | A concurrent change costs about 4 s today, an in-order one about 10 ms, and 10,000 operations are unmeasured |

- **The walk's identity findings need level 1 and board surfaces, nothing more.** The comment-delete rule (#160) is one check in `prepareOperation`, which the local service and the hub already enforce on every API write. Agent naming (#150, 18 stories) needs no trust work at all. In the current rollout these land at step 6, behind every other step.
- **Level 1 is a firm boundary, honestly stated.** "Certified machines are trusted writers, and everyone else is out." That is today's README posture ("native replicas are trusted full document writers"), made per-machine, revocable and checkable by every peer. It is enough for a direct peer lane: two certified machines can run the handshake and then ordinary Automerge sync, with no custom exchange.
- **Level 1 has limits that must be written down.**
  - A certified machine can still write anything, including a change that claims another Actor.
  - A relayed change is vouched for by the machine that relayed it.
  - A revoked machine is refused at the handshake, which matches "enforced from arrival" (Q1) for everything it sends directly. The witness arrives with level 2.
  - A trusted writer could delete a membership statement from the document. Each peer must therefore treat valid statements as grow-only: once seen, never forgotten. Membership is the result of verifying statements, never the current content of a map.
- **Membership does not need replay.** Statements are signed by person keys and are single-use, so they certify themselves.
- **Level 2 may not need replay either.** A machine could sign the hash of the change itself, with the signature carried beside the change in the exchange frame. That proves the change is exactly what the machine made without rebuilding it, so it needs no sorted writes and no pinned Automerge. The cost is that signatures must be stored, served again and backed up next to the document. The document chose to sign the intent "so there is no circularity", and did not weigh this option. The spike should.
- **Replay stays worth pursuing.** One rule engine enforced by every peer is the best property in this design. It should arrive last and be gated by the spike, not gate everything else.
- **The step 0 spike is the right work in the wrong place.** Run it alongside level 1, as the gate for level 3 only. Its hardware-key item goes away under (b).

### Recommended direction

1. **Adopt (e).** The person key is an Ed25519 key that Pardner creates, always sealed with a passphrase and exportable as a recovery file. Each key record in the membership log carries a type, so hardware-backed types can be added later as a protocol version.
2. **Take SSH and OpenPGP out of the verification rule.** Offer them later as linked keys, checked locally and shown as badges, for commit linking and forge attestation. "Pardner never edits git's configuration" stays, and is satisfied trivially.
3. **Stage the rollout by level.**
   - **Now, with no trust work:** name agents by owner (#150), add the comment author check (#160), refuse loopback-only invitations (#162).
   - **Stage 1, admission:** machine keys, the person key, the signed membership log, the pairing flow for a new machine, and the board surfaces for members, machines, agents, revocation and re-admission (#152–#156, #175). Then the machine-key handshake, replacing the bearer tokens.
   - **Stage 2, direct lane:** the handshake plus ordinary Automerge sync between two certified machines, validated on real separate networks.
   - **Stage 3, after the spike:** authentic changes, then allowed changes.
4. **State each level's guarantee in README as it lands**, so no stage claims more than it enforces.

**What this removes:** OpenSSH and GnuPG as required services, the OpenPGP library, the key-selection rules, the agent and pinentry guidance, and the terminal detour for every membership action.

**What it gives up:** forge-pinned invitations with no admin online; the property that Pardner never holds the person's private key; presence that peers can check, until a hardware key type is added; and, for the few who have one, using the hardware key they already own on day one.

### Questions for the owner

These revisit decisions. None is changed until answered.

- **R1 (decided: adopted).** The person key is a key Pardner creates and seals. SSH and OpenPGP keys become optional linked keys that produce badges and never enter the verification rule. Section 1 now says this.
- **R2 (clarifies "git is a hard requirement").** Does this mean Pardner may rely on git being installed, for name and email defaults and for commit evidence? Or that identity must be rooted in a key git uses? The recommendation satisfies the first reading only.
- **R3 (decided: scoped delegation).** Presence is softened. The person key grants revocable membership scopes to machines or agents, peers verify the chain, and the log names who acted for whom. Peer-checkable presence is not planned for the first release.
- **R4 (revisits the rollout).** May the first shipped boundary be level 1, with per-change verification staged behind the spike? This narrows what the Goal section promises at first, and README would say so.
- **R5 (revisits the rollout).** Should the board's membership surfaces move from step 6 to directly after the membership log?
- **R6 (follows from R1, touches Q4).** The person key would sit on the first machine. Should pairing be able to copy the sealed key to a new machine, so that either can manage membership and losing one computer does not lose the owner key? And should creating a project require exporting the recovery file?

### Corrections to the text above, whatever is decided

*Applied with R1: the overview now describes the Pardner-made person key, the `ssh-add -c` guidance is gone, and the missing FIDO provider in macOS's OpenSSH is noted under presence.*

- "Design in one paragraph" still says each person holds "a git SSH signing key". Q5 widened this to SSH or OpenPGP.
- The Q6 guidance to load the person key with `ssh-add -c` should say that it needs an askpass program, which macOS does not provide by default. Without one the agent refuses to sign.
- The hardware-key recommendation should say that the OpenSSH shipped with macOS has no FIDO provider.
