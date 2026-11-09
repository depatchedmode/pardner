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
4. the change writes exactly what that replay writes, and nothing more.

Membership (who may sign, and as which Actors) is itself a set of signed operations in the same document, rooted in a self-certifying project ID. The check is a pure function of the document, so it gives the same answer whether the change arrived through a hub or directly from a peer.

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
  v: 1, projectId, requestId, type, actorId, payload,   // the request, as today
  machineId, automergeActor, deps,                        // where and by whom it was made
  timestamp                                              // advisory only
}
event.signature = Ed25519(machine key, "pardner/op/v1" ‖ canonical(envelope))
```

- **Binding to one change.** `deps` are the document heads the machine built on, and `automergeActor` is the Automerge actor ID of the change that carries the event. Together they bind the signature to a single change position.
- **What the signature covers.** It covers the *intent*, not the change bytes, so there is no circularity. The replay check in section 4 binds the change to the intent.
- **Domain separation.** The `pardner/op/v1` prefix means a signature can never be reused as a git commit signature or an SSH login, and vice versa.

### 4. Verification rule (identical on every peer)

For each incoming change `C`, in causal order:

1. **Shape.** `C` adds exactly one `operations[opId]` event `E` and its `operationRequests` entry.
2. **Authenticity.**
   - `E.signature` verifies against the public key of `E.machineId`.
   - `E.automergeActor = C.actor` and `E.deps = C.deps`.
3. **Authority at the causal point.** In the membership view at `C.deps`, all of the following hold:
   - `E.machineId` is certified for an admitted person (and that person's machine scope allows `E.actorId`);
   - it is delegated for `E.actorId`;
   - it is not revoked in `C`'s causal past.
4. **Replay.** `prepareOperation(view(doc, C.deps), request(E), { replicaId: E.replicaId, timestamp: E.timestamp })` succeeds, so every existing rule passes.
5. **Exactness.** The writes in `C`, compared by path and value, equal the writes the replay produces.

Outcomes:
- **Accept.** All five checks pass.
- **Reject.** Any check fails, or the change comes from a machine (or person) whose revocation is not in the change's causal future. In other words, every change a revoked machine made that isn't in the revocation's causal past is rejected, including offline work that never saw the revocation. A rejected change is never applied, and every change that depends on it is rejected too.

  Rejection is **visible, not silent**, as AGENTS.md requires:
  - The receiving peer keeps the change in a local rejected-change log with its reason, its author and what it would have done.
  - The board shows a notice to owners and admins.
  - A lost-then-found machine's legitimate offline work must be re-entered by its person from a certified machine; the log shows what it was.
  - This is a deliberate policy (decided), not an oversight.

Two consequences:
- Adding a rule to `prepareOperation`, such as "only the author may delete a comment", enforces it on **every peer** at once. There is no second rule engine to drift out of sync.
- Hub and direct peer paths run the same function on the same document, so they cannot disagree.

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

The verification rule needs changes one at a time and in causal order. The generic automerge-repo sync message would apply them before Pardner could check them, so it doesn't fit. Peers instead exchange changes over a small protocol:
- **Advertise.** Each side sends its heads, and the other side replies with the hashes it is missing.
- **Verify, then apply.** The receiver verifies each change in causal order with `Automerge.decodeChange` and `view`, then applies only the accepted ones.
- **Rejected changes.** These are kept in a separate local rejected-change log with their reason, so they can be shown. They never enter the board document.

The protocol is transport-agnostic: WebSocket to a hub, a direct WebSocket or QUIC connection between peers, or a file for backup. This replaces the native automerge-repo WebSocket sync between replicas; local storage stays as it is.

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
