# Pardner trust design: one gate, signed attribution

Status: **proposal**. Nothing here is implemented. Current behaviour is described in [README.md](../README.md#current-implementation) and [PARDNER-CLIENT.md](PARDNER-CLIENT.md).

This version replaces an earlier, larger design: person keys, UCAN delegation chains, scoped authority, and per-operation authority checks by replay. The owner judged that design overcomplicated for what Pardner needs (see [Decision history](#decision-history)). The earlier text is in git history at commit `2aacfbf0`.

## Goal

Pardner works the way a shared git repository does:
- **A strict gate.** Only member machines may sync a project, through the hub now and directly between peers later.
- **Free work inside.** Once in, any member, or any agent on a member's machine, may change anything on the board. There are no per-action permission checks between members.
- **Exact attribution.** Every change is signed by the machine that made it, so any peer can tell who did what, however the change reached it.
- **Roles only for the gate.** Owner, admin and member decide who may admit and remove. They do not limit board work.

The gate and the attribution check are pure functions of signed records. A hub and a direct peer run the same code and reach the same answer.

**Out of scope for now:**
- end-to-end encryption, so content stays readable by every member machine, including the hub;
- native mobile replicas;
- automatic peer discovery.

See [Later](#later).

## What exists today

| Concern | Today | Problem |
|---|---|---|
| Who a person is | A typed name and email plus a random id | Self-asserted; duplicates and silent takeovers are possible (#155, #156, STORY-016, STORY-018) |
| Who wrote a change | An `actorId` field inside each operation event | Unsigned. Enforced only by the local proxy and the hub's bearer `deviceToken` check |
| Sync admission | A bearer `deviceToken` / `replicaToken` held by the hub, plus a pre-save `/policy` check cached for `ADMISSION_CACHE_MS` (`lib/client-service.js`) | Only the hub can check it; peers cannot check each other |
| Membership and revocation | Hub-held admission records; CLI-only commands | Not replicated; revoked parties look like offline ones; no re-admission path (STORY-043, STORY-130) |
| Hand-run topologies | `pardner serve --role hub\|replica` with `--hub-token` and `PARDNER_REPLICA_TOKEN` | A second admission path beside client mode |

## Design

### 1. Machine keys

- **One key per machine.** Each client directory has its own Ed25519 machine key (mode 0600; the OS keychain later). A "machine" means one client directory, not one computer.
- **Machine ID.** `machine-` followed by the first 26 characters of the lowercase RFC 4648 base32 encoding of `sha256(publicKey)`, without padding.
- **What signs.** The client service signs with the machine key. Browsers, the CLI and agents keep authenticating to their local client with today's cookie, operator token and agent grants. No private key is ever given to a browser or an agent.
- **No person key.** A person is the set of machines they have linked. There is no passphrase and no recovery file.
- **Only Node's crypto.** Signing and verifying use Node's built-in Ed25519. No OpenSSH, GnuPG, UCAN or CBOR library is involved.

### 2. Membership records

Membership is a log of small signed records, kept in the project document and replicated like everything else.

```
record = { v: 1, projectId, kind, subject, ...fields, signer: machineId }
record.signature = Ed25519(signer's machine key, "pardner/member/v1" ‖ canonical(record))
recordId = sha256(canonical(record) ‖ signature)
```

`canonical()` is the sorted-key JSON already used in `lib/workspace-schema.js`.

| Kind | Signed by | Effect |
|---|---|---|
| `project.genesis` | The creator's first machine | Names the owner (a person ID and display name) and certifies that machine. `projectId = sha256(canonical(genesis record))`, so anyone holding the project ID can check the genesis without asking anyone |
| `member.add` | A machine of the owner or an admin | Admits a person with role `admin` or `member` and certifies their first machine. Holds the offer, the join request and the confirmation-code approval (section 4) |
| `member.role` | A machine of the owner (changes involving `admin`), or of an admin (other changes) | Changes a person's role. The owner's role never changes |
| `member.remove` | A machine of the owner (for anyone), or of an admin (for members only) | Removes a person and all their machines. The owner can't be removed |
| `machine.add` | Another machine of the same person, or a machine of the owner or an admin | Certifies a new machine for that person, after a confirmation code on both screens |
| `machine.remove` | Another machine of the same person, or a machine of whoever may remove that person | Removes one machine |
| `agent.name` | The machine the agent runs on | Records an agent's display name and harness, for example "Maya's Codex" (#150). It grants nothing; it is a label |
| `profile` | Any machine of that person | Sets display name and email. These default to git's `user.name` and `user.email` |

**How membership is computed.** It is a pure function of the set of valid records, and does not depend on order:
- **Signature.** A record counts only if its signature verifies and its `projectId` matches. Records from another project never count.
- **The gate.** A machine is a member if a valid `project.genesis`, `member.add` or `machine.add` certifies it, and no valid removal of it or its person exists.
- **Authority.** A signer's authority comes from the admission and role records alone, read without removals. Removals then form a grow-only set applied on top. If two machines remove each other, both are removed, and the person re-pairs a machine through an admin. Every peer gets the same answer whatever order the records arrived in.
- **Grow-only store.** Each peer keeps every valid record it has seen in a local store that only grows. The store is saved before the peer acts on a record, and is part of the cold backup. A record that later disappears from the document still counts. A member cannot erase a removal.
- **Earlier admissions stay.** Removing an admin removes only that admin's person and machines. People and machines the admin admitted earlier stay (decided).
- **Stale signers.** A removed machine can still sign records, so the hub and every peer refuse any new record or change from a removed machine from the moment they hold the removal ("enforced from arrival"). Until the direct lane exists, every record arrives through the hub, so this closes the gap. On the direct lane, a removed admin could hand a back-dated record to a peer that has not yet heard of the removal. That is a known limit, stated in [Direct peer lane](#direct-peer-lane).

### 3. Signed changes (attribution)

- **What is signed.** Every Automerge change a machine makes is signed: `Ed25519(machine key, "pardner/change/v1" ‖ projectId ‖ changeHash)`. The signature covers the change bytes exactly, so nobody can wrap it around different content.
- **Actor IDs.** The change's Automerge actor ID starts with the machine ID's raw 16-byte digest and ends with 8 random bytes chosen at each process start. A restored backup and its original therefore never reuse an actor and sequence number, which Automerge refuses **(checked)**. automerge-repo picks a random actor every time it loads a document, so Pardner sets its own after loading, with `handle.update(doc => clone(doc, { actor }))` **(checked)**.
- **What a peer checks.** The signature verifies, and the signer was a member machine when the peer received the change. The board shows the change as made by that machine's person, or by the agent the machine names. Peers take the machine's word only for *which* Actor on that machine acted (see [The local trust zone](#the-local-trust-zone)).
- **What a peer does not check.** Whether the operation was "allowed". Members may change anything, as in git. The local service still enforces the board's rules (for example, only the author deletes a comment, #160) on every write it makes, and the operations log shows every change with its signer, so a bad change can be reviewed and undone.
- **Where signatures travel.** A signature cannot sit inside the change it signs. The spike chooses between:
  - a signature store, either a second Automerge document or a map keyed by change hash, synced alongside the board;
  - a small change exchange that sends each change with its signature, verifies it, then applies it.
- **Unsigned or badly signed changes are never silent.** With the exchange, they are refused and logged. With a store, they are applied and then flagged on the board as "unattributed: relayed by <machine>" for review. The spike decides which; AGENTS.md's rule against silently discarding edits applies to both.
- **Equivocation (known limit).** A member machine can send two different changes with the same actor and sequence number to two peers. Each change verifies, but Automerge refuses the second on each side. Two signed changes for one actor and sequence number are proof, and the machine is reported. The remedy is `machine.remove` and rebuilding the minority replica.

### 4. Joining: invitations and pairing

- **New person (an admin approves).**
  1. **Offer.** The owner or an admin creates an invitation. It holds the offer `{projectId, offerId, role, routes[], expiresAt}`, signed by their machine, and a one-time secret. `routes` lists ways to reach the hub. The issuer refuses invitations whose only routes are loopback, and the recipient reports routes that fail (#162, STORY-041).
  2. **Join request.** The newcomer's client generates a machine key and sends a join request, keyed with the invitation secret, to the enrollment point. The enrollment point holds pending requests in its local queue, with at most 5 per offer, and stores the request before anything else happens.
  3. **Confirmation code.** Once the request is stored, the approving admin's client adds a fresh random nonce. Both screens then show a code derived from the offer, the joiner's machine key and that nonce. The admin compares them face to face or by voice, ideally not over the channel the invitation travelled on. Because the nonce is chosen after the request is fixed, someone holding a leaked invitation gets only one guess at matching the code. If two pending requests on one offer show the same code, both are rejected.
  4. **Approval.** The admin's machine signs `member.add`. Expiry and single use are checked by the enrollment point when it approves; other peers never check clocks.
- **New machine for an existing person (your own machine approves).** The new machine generates its key and shows a pairing request. The person approves it from one of their existing machines, comparing a confirmation code built the same way, and that machine signs `machine.add`. An admin can do the same for someone who has lost every machine. Pardner never offers to start a second identity on a computer joining an existing person (STORY-016, STORY-018).
- **New agent (no ceremony).** Agents run under their machine's key. `agent.name` gives them a label, and agent grants limit them locally, as today.
- **Re-admission.** Removals are permanent, so a removed machine comes back as a new machine key, and a removed person comes back through a new invitation. There are no dead ends (STORY-043, STORY-130).
- **Forge checks.** None. Admission always rests on an admin and a confirmation code, so no forge is ever required (decided).

### 5. Transport admission (the gate)

- **Handshake.** Every sync connection, to the hub or to a peer, opens with a mutual challenge and response. Each side signs a transcript with its machine key: `"pardner/hello/v1"`, the protocol version, `projectId`, both machine IDs, both fresh nonces, and the route as dialled. On the direct lane the transcript also includes the channel's own key hash. A recorded answer is useless elsewhere.
- **Who is served.** A serving peer sends data only to member machines in its current membership state. An enrolling machine receives the document only after its `member.add` or `machine.add` is recorded.
- **The joiner checks the server too.** Before accepting a document, an enrolling machine checks that the responder's key is a member in a log rooted at the `projectId` from its invitation.
- **Removal ends sessions.** When a peer applies a removal, it closes any open session belonging to a machine that is no longer a member.
- **Hub HTTP routes.** `/people`, `/policy`, `/presence`, `/invites`, delivery leases and WebSocket tickets authenticate with a machine-key signed request header in place of `deviceToken`. A delivery lease goes to a member machine for an agent it names.
- **No bearer fallback.** Once the handshake ships, `deviceToken` and `replicaToken` are refused. The pre-save `/policy` call becomes a local membership check. The AGENTS.md admission rule is reworded in that PR to "do not weaken admission: every sync connection must authenticate as a member machine" (Q2, decided).
- **Hand-run hubs and replicas are retired.** `pardner serve --role hub|replica`, `--hub-token` and `PARDNER_REPLICA_TOKEN` go away. Client mode is the only way to host or join a project. `pardner serve` remains the client's internal per-project runtime and agent service, behind the client's machine key (decided).
- **Enrollment point.** The hub stays the only place enrollment is recorded until the direct lane is qualified (Q3, decided).
- **Encryption on the wire.** Hub routes stay HTTPS. A direct peer route uses a channel keyed by the machine keys (a Noise handshake, or TLS with pinned raw public keys), so there is no certificate authority and no self-signed certificate prompt.

## The local trust zone

| Question | Who can answer it | Strength |
|---|---|---|
| Which machine made this change? | Any peer, from the signature | Cryptographic |
| Was that machine a member? | Any peer, from the membership records | Cryptographic |
| Was it the person, or one of their agents on that machine? | Only that machine's client service (cookie, operator token, agent grant) | Local. Peers take the machine's word |

Consequences:
- Any process running as the same OS user can read the machine key and the operator token, and an agent with shell access is such a process. Agent grants limit a cooperative agent; they are not a boundary against a hostile one.
- An admin's machine can admit and remove people with no further prompt, and so can an agent running on it. A stolen, unlocked admin laptop can therefore open the gate until another admin or the owner removes it. This is accepted, as with a git host where an admin's logged-in session can add collaborators. The record names the machine that did it.
- A build box or shared host should be a separate machine with role `member`, so it never holds admin authority.

## Backup, restore and loss

- **What a cold backup holds.** The client directory, including the machine key and the grow-only record store. A backup is a credential, as it is today.
- **Restoring.** A restored client is the same machine and resumes signing. Each process picks its own actor suffix, so a restored copy and its original cannot corrupt each other's history. Running both is still a duplicated credential (#165, STORY-142). A peer that sees two live sessions for one machine reports it, and the remedy is `machine.remove` and a fresh key.
- **A stale hub backup.** A restored hub does not serve, accept or enroll until it has synced membership with at least one member peer, or until its operator confirms that no newer state exists. Removals live on every peer, so the hub then catches up and cannot roll them back. The delivery lease ledger still needs its own current backup.
- **Fresh install with no backup.** The computer pairs as a new machine through one of the person's machines or an admin. It fetches the document and checks the membership log from the genesis, needing only the project ID.
- **Lost machine.** Remove it from another of the person's machines, or have an admin or the owner remove it.
- **A person who lost every machine.** An admin pairs a new machine for them (section 4). Their past work stays attributed to their person.
- **The owner lost every machine.** Admins keep managing members. Nobody can remove or demote an admin any more, because only the owner can (Q4, accepted). Owners should pair a second machine early, and Pardner suggests it at project creation. The remedy for a lost owner is a new project.
- **Export.** The readable export is unchanged. It is not a replica and holds no keys.

The [recovery guide](PARDNER-CLIENT-RECOVERY.md) is updated in the step that introduces machine keys.

## Required services and outages

| Service | Needed for | While it is down | Replacing it |
|---|---|---|---|
| Hub | Enrollment (until the direct lane is qualified), new delivery leases, presence relay, and sync between machines that cannot reach each other | Member replicas reopen, sign, edit and save locally with only their machine key. New dispatch and presence are unavailable and say so | Restore its cold backup at the same origin. It waits for a member peer before serving (above) |
| git | Name and email defaults, and commit evidence | Pardner still runs; names are typed by hand and commit evidence is unavailable | Any git |

## Direct peer lane

| Aspect | Assessment |
|---|---|
| Platforms | The Node client service on desktop computers. No phone or browser replica |
| Discovery | None. A person supplies the address |
| Reachability | The same LAN or a tailnet. Across NAT without a tailnet it does not work |
| Exposure | A second listener on a chosen interface, off by default, that speaks only the handshake and sync |
| Background running | Both services must be up at once. Nothing stores and forwards without a hub |
| Unavailable without a hub | New delivery leases and presence; enrollment until the lane is qualified |
| Known limit | A removed admin can hand a back-dated record to a peer that has not yet heard of the removal. The peer drops it once the removal reaches it, but by then any admission in it has taken effect there. This is acceptable for an opt-in lane between machines that know each other, and is stated in README |
| Evidence needed | Two real machines on separate networks. Loopback shows nothing about reachability |

**Decision.** Offer it as an explicit opt-in after stage 1. It adds a lane and does not replace the hub.

## How this addresses the walk's findings

| Finding | Resolution |
|---|---|
| Built-in agents are all "Setup agent" (#150) | `agent.name`, shown as "Maya's Codex" |
| My device invitation adopts another identity silently (STORY-016, #155) | A new machine joins a person only when one of that person's machines, or an admin, approves it with a code on both screens |
| Duplicate people, uneditable identity (STORY-014, STORY-018, #156) | Pairing never creates a second person. `profile` is editable from any of the person's machines |
| Comment delete has no author check (STORY-090, #160) | A local service rule, like every board rule. Every deletion is signed and attributed |
| Membership is CLI-only, revoked parties look offline, no re-admission (STORY-043, STORY-130, #152–#154, #175) | Replicated records with board surfaces in step 2. Removal is explicit. Re-admission works through a new invitation or pairing |
| Revocation shown as "signed out" (STORY-005, STORY-140) | Removal is a project record, distinct from local browser sessions. The board must show it as such |
| Loopback-only invitations (STORY-041, #162) | Refused, and failing routes are reported |

## Rollout

README states each stage's guarantee as it lands, so no stage claims more than it enforces.

**Stage 0: fixes that need no trust work.** Ship now, in parallel:
- name agents by owner (#150);
- add the comment author check (#160);
- refuse loopback-only invitations (#162).

**Spike (before step 1).**
- Choose how signatures travel (a signature store or a verify-then-apply exchange) and what an unsigned change does.
- Measure signing and verification cost per change at 1, 10 and 50 operations per second, and at 1k, 10k and 50k operations.
- Measure a new replica's first full check.
- Measure whether Automerge text should stay (Q7: keep it unless the numbers cross the rule below).

Decision rule: keep the chosen mechanism and Automerge text if, at 10,000 operations, all of these hold:
- signing adds under 10% to authoring time;
- verification keeps up with 50 operations per second;
- the document opens in under 3 seconds;
- the README acceptance bounds (6 s offline open, 10 s convergence) still hold with verification on.

**Stage 1: the gate and attribution.** The guarantee: only member machines sync, and every change shows which machine made it. Members may change anything.
1. **Keys, records and signed changes.**
   - Machine keys, the membership records and the grow-only store.
   - The deterministic genesis, the machine-prefixed actor ID and signed changes, using the spike's mechanism.
   - Invitations and pairing with confirmation codes.
   - Hub admission derived from the records.
   - A breaking change: prior installs are rejected and preserved, not migrated (AGENTS.md).
   - Updates `docs/PARDNER-CLIENT.md`, `docs/PARDNER-CLIENT-RECOVERY.md` and README.
2. **Board surfaces, straight after.** Members, machines and agents; removal and re-admission; pairing a new machine; unattributed-change notices.
3. **Machine-key handshake.**
   - It replaces the bearer tokens.
   - It retires the hand-run hub and replica roles.
   - It replaces `/policy` with a local check.
   - The AGENTS.md admission rule is reworded in the same PR.
   - Updates `docs/PARDNER-CLI.md` and the acceptance contract.

**Stage 2: direct peer lane.**

4. The handshake plus sync between two member machines at an explicit address, validated on real separate machines. After this, owner and admin peers may record enrollments (Q3).

**Qualification.**
- Steps 1, 3 and 4 change `automerge-sync-server.js`, `lib/workspace.js`, `lib/workspace-runtime.js` or `lib/durable-repo.js`, so each needs the lifecycle model check.
- Each of those steps is a storage, sync or delivery milestone, so each needs the 20-seed acceptance qualification on an idle machine.
- Automated suites supply keys through a test-only fixture, never through flags or the environment of a real install.

## Validation plan

This is a plan. None of these scenarios has been run.

| Stage | Scenario | Expected |
|---|---|---|
| 1 | A non-member machine connects to the hub | Handshake refused; nothing served |
| 1 | A removed machine reconnects, or holds an open session when the removal arrives | Refused; the open session is closed |
| 1 | A recorded handshake is replayed against another hub or project | Refused |
| 1 | A bearer token is presented after step 3 | Refused |
| 1 | A member machine writes a fake membership entry straight into the document | Ignored; only signed records count |
| 1 | A member machine deletes a removal record from the document | The removal still holds from the grow-only store |
| 1 | A record from another project is replayed | Refused |
| 1 | Two of a person's machines remove each other while offline | Both are removed on every peer; an admin pairs a new machine |
| 1 | An admin is removed | Their machines are out; people they admitted stay |
| 1 | A leaked invitation is used by a stranger | The confirmation code does not match; one guess only; the admin rejects |
| 1 | An expired invitation is used | Refused by the enrollment point |
| 1 | Someone pairs a machine into another person's identity | Refused: only that person's machine or an admin can sign `machine.add`, after a code match |
| 1 | A change is relayed by a second member | Shown as made by the original machine; the signature verifies |
| 1 | A change with a missing or bad signature | Refused or flagged as unattributed, per the spike's mechanism; never silently dropped |
| 1 | The same field is edited on two disconnected machines | Both changes verify; both alternatives are kept for explicit resolution, as today |
| 1 | An enrolled replica reopens with the hub unreachable, edits and restarts | Opens, signs and saves locally; the edits survive |
| 1 | A restored stale hub backup, with a removed machine connecting first | The hub waits for a member peer; the removed machine is not served |
| 1 | Restore from a cold backup while the original also runs | History stays intact; the duplicate is reported |
| 1 | Fresh install with no backup | Pairs as a new machine and checks membership from the project ID |
| 1 | Two different changes with one actor and sequence number | Reported as equivocation, with both signed changes as proof |
| 2 | Two machines on separate real networks converge directly while the hub is down | The same documents and membership as the hub path; leases and presence report as unavailable |

## Later

- **End-to-end encryption.** A project key wrapped to each member machine key, rotated on removal. Relays without the key store and forward ciphertext.
- **Phones.** First through the hub over HTTPS, with a non-extractable WebCrypto Ed25519 key per phone browser certified by `machine.add`. Then a native app as a full replica.
- **Stronger admin authority.** A passkey or hardware key that admins must touch to admit or remove, if a stolen admin laptop becomes a real concern. The record format leaves room for a key type.
- **Linked git keys** as profile badges for commit linking.
- **Discovery and NAT traversal** for the direct lane.
- **Machine keys in the OS keychain.**

## Decisions

| # | Decision |
|---|---|
| Model | One strict gate (member machines only), free board work inside, exact attribution by signed changes. Roles (owner, admin, member) govern only admission and removal |
| Keys | Machine keys only. No person key, passphrase or recovery file |
| Encoding | Plain Ed25519-signed JSON records. No UCAN |
| Removal | An admin's removal leaves the people they admitted in. Removals are grow-only and order-free; if two machines remove each other, both go |
| Admins | Only the owner removes or demotes admins. A lost owner freezes the admin list (Q4) |
| Invitations | Admin approval with a confirmation code only, with no forge check. The code includes an approver nonce added after the request is stored |
| Signing | Every change is signed from stage 1. The spike picks how signatures travel |
| Hand-run roles | Retired. Client mode is the only way to host or join |
| Admission rule | The handshake replaces bearer tokens, and AGENTS.md is reworded with it (Q2) |
| Enrollment | Hub-only until the direct lane is qualified (Q3) |
| Revocation | Enforced from arrival: new records and changes from a removed machine are refused once a peer holds the removal (Q1) |
| Text storage | Keep Automerge text unless the spike's numbers cross the decision rule (Q7) |

## Decision history

- **Q1–Q7 and R1–R6** shaped the earlier design: person keys sealed with a passphrase, scoped delegation of membership authority, UCAN 1.0 encoding, and per-operation verification by replaying `prepareOperation`.
- **The third review.** A later review found that this machinery still had unresolved blockers: membership before stage 3, cross-project binding, UCAN cascade semantics, and mutual revocation between delegated machines.
- **The owner's decision.** The owner concluded that the access-control model was overcomplicated. Pardner needs a strict gate to sync, then free participation with strict attribution, like git.
- **What was dropped.** The person key, scopes, UCAN, cascade and per-action replay are gone.
- **What carried over.** Q1 (enforcement from arrival), Q2 (handshake), Q3 (hub-only enrollment), Q4 (owner-only admin removal) and Q7 (measure text storage first).
- **Where the earlier text is.** The earlier text, including its measurements of replay cost and fork behaviour, is in git history at `2aacfbf0`.
