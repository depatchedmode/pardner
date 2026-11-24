# Pardner implementation detail

The full statement of what this repository enforces today, and what it does not.
[README](../README.md#current-implementation) carries the summary; a change to
behavior updates both, and neither may claim more than is enforced.

## Document values and schema

All document strings are immutable scalar values (Automerge `ImmutableString`),
including field registers, operation history and membership records. Reads expose
ordinary JavaScript strings. Different-field merging, authored same-field
alternatives and explicit resolution retain their existing behavior; Pardner
replaces whole values and does not splice collaborative text. Schema 11, whose
changes are signed by the machine that made them and whose signature cache keeps
equivocation reports with the signatures that prove them and the Activity entry
derived from each change, refuses earlier storage directories, and version 4 client
directories refuse earlier ones, without migrating or deleting them.

## Machine keys and membership records

Each client directory has its own Ed25519 machine key, created on first start and
reported as a machine ID by `client status`. Creating a project signs a
`project.genesis` record with that key, naming the creator as owner, and the
project ID is derived from that record, so anyone with the ID can check the
genesis. A person's ID is derived from the public key of the machine they were
first admitted with (the creator's, for the owner), so nobody can admit a new key
under an existing person. Further machines join a person only by pairing, and a
computer paired into someone's identity can't start a project or join another as
a new person. Signed membership records live in the project document. Each project
also keeps a grow-only local store of every valid record its client has seen,
saved before the client uses one. A record later removed from the document still
counts and is written back. Tampered or foreign records are not stored, and
`client show` reports them beside the membership computed from the store.

## Joining

**Joining is approved on signed records.** Invitations carry an offer signed by
the issuing machine; only the owner or an admin invites people, and an admin
offers only the member role. A new machine's join request waits in a bounded,
expiring queue on the hub, the project's host client, and receives nothing from
the project until approved. Approval follows a confirmation code that both sides
derive from the offer, the joiner's key and a nonce the approver adds; the
approving machine signs the admission. A person's own machine, the owner or an
admin pairs another machine into that person's identity, and pairing never
creates a second person. Every admission or pairing record carries the joining
machine's own signed join request, naming the project, the person and a hash of
the whole offer, and counts only with it: nobody can certify a key they don't
hold, and a consent can't be reused for another role or purpose. Certifications
never displace each other, whatever order records arrive in: a key certified twice
for one person is one machine, agents-only only if every certification says so; a
person admitted twice holds the highest role any admission gave; and a key
certified for two people is removed, while what it signed still counts. An
agents-only machine signs only its own agents' labels: it can't admit, pair,
remove, leave, change a role or edit a profile. Removal (`member.remove`,
`machine.remove`) and owner-only role changes are records too. Every new record enters through one gate on the hub
that refuses removed machines and signers without the needed role. A removed
machine or person returns only as a new machine key or a new person. A person
can leave a project from their own machine; the owner can't.

## Sync admission

**Only member machines sync.** Machines authenticate to each other with their
machine keys alone; no bearer token is issued, stored or accepted between machines.
Every sync connection opens with a mutual challenge and response: each side signs
a transcript of the project ID, both machine IDs, both fresh nonces, both roles and
the route dialled, so a recorded or relayed answer is useless elsewhere. The hub
serves only a current member machine of its records, and a joining machine accepts
nothing until the hub proves it is a member machine of the project its invitation
named. The hub answers every handshake alike and judges a machine only once it
has proved its key, so nobody can learn without the private key whether a key was
ever certified; a removed machine that proves its key is told who removed it. Every other request between machines is signed by the machine key within a
short session opened the same way, and a replayed request is refused. When the hub
applies a removal it closes that machine's proven sync and signed sessions at once.
Unproven pending sessions expire uniformly, so revocation does not reveal membership. The
Actors a machine may act as come from its records. A write checks this machine's
own records locally and never waits on the hub. A hub restored from a backup, or
shown by a member that it fell behind, serves no other machine until a member that
saw a later state has synced its membership, or its operator runs
`pardner client resume`. Without `hub-state.json`, a checkpoint must show more
records than the restored store, and verified records must bring the store up to
that count; an old start count cannot vouch. That waiting state is saved with the point checkpoints
are compared against, so it survives any number of restarts and a process kill at
any step, and an established hub whose state file is missing waits too. Two live
sync sessions for one machine are reported. Resume attempts are serialized and
serving stays blocked until the resumed state is saved; a failed write leaves it waiting.

## Record limits

Membership records are limited to 64 KiB of serialized UTF-8 JSON, nesting depth 16
(root depth 0), and 4,096 UTF-16 code units per string or property name, including
unknown fields, offers and join requests. `RECORD_LIMITS` in `lib/membership.js`
defines these rules. Oversized records are refused with a reason before
canonicalization or signature checks at the gate and during harvest. The reducer
uses append-only certification lists, aggregate authority and a queue of newly
gained authority; repeated certifications do not trigger whole-log rescans.

## People panel

**The People panel** in each board's header lists every person with their role,
who let them in, their machines (online or last seen where the hub knows it) and
their agents, and lists removed people and machines with who removed them. It
offers only the actions the viewer may take: inviting, approving join requests
with the code, pairing machines, removing machines and people, changing roles,
editing your own name and email (a `profile` record every member's board shows),
and leaving, each removal confirmed with its consequences. Invitation history
names who issued and used each invitation. A computer removed from a project
keeps it listed as removed, says who removed it and how to come back, and is
never shown as signed out. `client people` gives the same listing as text. Last
seen is held in the hub's memory only, so it resets when the hub restarts.

## Change signatures

**Every change shows which machine made it.** Each Automerge change carries an
actor ID that starts with its machine's ID and ends with 8 random bytes drawn each
time the document is loaded, so a restored backup and its original never reuse an
actor and sequence number. A machine signs only the changes its own write path makes
(operations, the record gate, record write-backs and the board's creation), each
at once with its key, over the project ID and Automerge's change hash; it never
infers authorship from a change's actor ID. It saves the signature in a local,
grow-only signature cache before the change can be saved, and writes it into the
project's signature document, a second document beside the board whose ID every
member derives from the project ID; that document is saved and synced in the
background, off the acknowledgement path, and at start-up and whenever an entry it
verified is deleted or overwritten a machine writes back the signatures it holds
that the document lacks. Every peer applies every change it receives, as before,
then checks that the signature verifies under the machine the actor names and that
this machine is or was a member, and keeps each signature it verified in its own
cache, so deleting an entry from the shared document unattributes nothing it
already checked. No change is refused, dropped or hidden. A change that carries
this machine's own actor but has no signature here is unattributed, and the machine
says so: another machine may have used its actor, or this machine lost power or
stopped before saving the signature.

## What a signer line means

**A signer line means: this machine signed exactly this content.** That is what
Pardner guarantees about every change, as a signed commit does in git: Activity
shows, for each change, the machine that signed it and that machine's person. What
an entry says the change did (its fields, values and words) is the author's own
description, like a commit message: Pardner compares it with what the change wrote
and flags a difference, but that check is best-effort, not a guarantee (below; its
known gaps are listed in [#228](https://github.com/depatchedmode/pardner/issues/228)).
None of those gaps lets a member fake who signed a change. Activity is a
log of the board's changes, as a git log is a log of commits. Each entry is derived
from one change. The change's decoded operations say only which keys of which of the
board's top-level maps it wrote; every value shown is what Automerge itself reads at
that key as of that change (with `getAll`, `keys` and `length` at the change's own
head, which `test/automerge-history-reads.test.js` pins as faithful in Automerge
3.5.0), so an entry holds exactly what that change put there and nothing later. A
value is accepted only as plain JSON, and a key such as `__proto__` is ordinary
data: a change holding several values at one key in its own state, text, a counter,
bytes, a date, a number JSON cannot hold exactly, or nesting deeper than 32 is
unrecognised, so an entry reads the same before and after storage and on every peer.
Its signer line is the verdict for that same change. No entry's content is taken from
the board's current state or chosen through an ID written inside it. Every peer
derives the same entry from the same change, whenever the change reached it, and
keeps it in its signature cache under the change's hash and derivation version (now
5), so a restart derives only new changes. The derivation runs in slices after the
board opens: a slice stops before a change that would take it past 2,000 Automerge
operations (one larger change is derived alone) and starts no change once 10 ms have
passed; one change is always derived whole, so its own time is not bounded
(`lib/change-log.js` states each bound). A change not yet derived is counted as being
checked and not shown, and a change that cannot be decoded or read is its own entry
for review.

## Description check

**An operation's description is checked against what its change did, on a
best-effort basis.** For each operation type,
`lib/operation-writes.js` states the exact writes its event implies (which maps and
keys, and the values or register contents), and the change's writes are compared
with them. A missing write, an extra write or a different value flags the entry as
not matching what its change did, in review, with each difference said in words:
what the entry says and what the change wrote. What an event says about the board
when its operation ran is checked against the board as of its change's dependencies
(the state its write path read), read with the same faithful history reads: each
field's previous value, the bookkeeping a field register carries over, the revisions
an operation retires (each `expectedRevisions` list), the alternatives a link and a
merged branch's status retire, which Actors a comment's @handles named and which
Actor a handle named, the fields `task.branch` and `task.merge` copy, the goals a
vein may leave, and whether a record it names was there. Where the board then held
several values the write path could have read (one operation written twice by a
retried request, or one Actor's concurrent records), a value any of them gives is
accepted, so honest work on several replicas is never flagged. Still exempt
(`EXEMPT` in `lib/operation-writes.js`): the event's own time and replica; a linked
commit's hash and message; and whether `task.unlink-issue` retires every link of its
issue (each revision it names must be one). Each entry carries its one reading
(`shows`), which every renderer reads: one value per field as its change wrote it,
the previous value only where the board then held it, `unchanged` only where every
value the field then held is the one written, and the comment text its change wrote.
An event naming one field twice is flagged. The board's creation may write only what
a new board holds and the Actors it starts with, which its genesis entry lists. An
unflagged entry is one this check found no difference in, not one proven to describe
its change: [#228](https://github.com/depatchedmode/pardner/issues/228) lists the
cases known to pass unflagged (earlier changes by the same author that a change's
`deps` do not name, a retried request whose changes read differently, a read
receipt naming a comment that does not exist, and a field written with a value of
the wrong kind). The browser and the CLI say so: only the signer line is called
verified, and a flagged entry says its description does not match what the change
wrote.

## Activity states and flags

Activity names each entry's signer, the person and the machine; says "signature
pending" while a signature may still be on its way, and lists a change pending for
more than a minute for review as pending, not flagged; says "unattributed" and names
the machine that relayed it once the machine that delivered the change has had a
second on a live connection to send one (five minutes at most while it stays
connected without catching up), or says "relayer unknown" for a change no machine
is known to have delivered, such as one found in storage after a restart; and says
"made by a removed machine" for a signed change that does not come before that
machine's removal in the board's history. Work from before a removal stays
attributed. An entry is flagged and listed for review when the key it was written
at is not the operation ID inside it, its
operation ID is not the one its request ID and content give, another change wrote
the same key (each such change is its own entry), its signer is not certified for
the Actor it names, its change also deleted content, wrote at the board's top
level, or wrote into what another change made, its writes do not match its entry, its
change's time is no time a date can show (shown as unknown), or a second change
claims to create the board. A change that wrote neither one well-formed operation
event nor a membership record, or that is too large to read (more than 20,000
operations or 8 MB), is listed for review as unrecognised, under its own signer,
saying what it altered. Changes share one entry only when their content is proven
equal: an Actor's own operation retried on two of its replicas (equal apart from
each change's replica and time, each listed with its own signer; or one request
whose events differ only in what each replica's write path read from its own time
and board, each change matching its own event, where the entry shows the first
change's reading and each other change whose reading differs carries its own), or one
membership record written back. An entry replaced or deleted later stays shown as its change
wrote it. Inside an entry, the time, words, field values and IDs are the signed
ones, and sorting, grouping and filtering use them; Actor names and task, goal and
vein titles are looked up now and marked as current. A comment deleted later keeps
its signed words; its note names the Actor who deleted it, with the signing machine,
only when the deleting change is that Actor's own signed, unflagged
`comment.delete`, and otherwise says a change that needs review (naming its signer),
an unsigned change (naming who relayed it) or a change still being checked marked it
deleted. A membership record's signer line is the record's own signature, which
covers exactly the record shown; the time beside it is when a machine wrote the
record to the board, which the record's signer did not sign, and says so. One
change's data never stops a view: an entry, a row, a CLI item or a record on the
board that cannot be read or described fails on its own and says so.

## Views of the board as it is now

Views of the board as it is now (the board itself, a task's fields, a comment's
current text, the alternatives of a conflicted field or comment) carry no signer
line. Where one names an author, it is the Actor the board records, and it says the
value was changed by someone other than that Actor when the change that wrote it, or
wrote into it (inside a list of the value included), is not that Actor's own signed,
unflagged operation; that change then has its own Activity entry under its own
signer. The edit form's "saved a newer …" notice credits the operation that the
field's current value names, confirmed only when that operation's own entry is
signed and unflagged, no other change wrote the value or into it, and nothing is
still being read; otherwise it says unconfirmed. Every read that hands records to
the CLI, the hub or the browser (the board, each record's context, the board's
Actors, the review list) reads each record on its own, as `SHAPES` in
`lib/workspace-schema.js` says: an Actor, task, goal, vein, comment, mention,
Activity entry, read receipt or vein link that is not a map, or has no ID it can be
known by, is left out; a field holding a value of the wrong kind (a number for a
task's tags, say, or a list with an element of the wrong kind), and a field with no
readable revision, read as that kind's empty value. Each is listed in `unreadable`
with its record and field, the board names it ("Not shown: …", "Shown empty: …"),
and a task's panel names its own fields shown empty. Nothing on the board is changed
or refused; the write path reads the board as it is, so an operation still records
the value the board held. A top-level part of the board
that a change rewrote with a value of the wrong kind (null, a number, text or a list
where a map belongs, or a map where the schema version, project ID, name or time
belongs) is listed with the changes that wrote it and their signers, the board names
it, and everything else still reads; a record or write that needs it is refused as
unreadable. A top-level key holding several values written concurrently is read as
the value Automerge picks (a map, when it picks one) and listed as such. The board is called by the project its metadata names, and reopens with
the schema version and project ID its creation wrote. The task context's
`history` (`pardner show`, and what agents read) lists the board's current operation
events and is not attributed. Browser Activity and task History, `pardner activity`,
`timeline`, `trace task` and `diff`, and `pardner client review` all read the same
entries, and every CLI item carries its entry's flags, its review state and each
signer as data; the standalone service checks no signatures, and its entries say so.
The board announces changes that need review, with a filter for them.

## What a signer line does not cover

What a signer line does not cover: whether its entry describes the change, beyond
the best-effort check above; the exempt values above; side effects of a
membership record change beyond its records (flagged, not described); the names and
titles shown beside it, which are current; and whether the act was allowed.

## Equivocation and acknowledgement

Two different changes signed by one machine with the same actor and sequence number
are reported as equivocation, naming the machine; the report is kept across restarts
with the verified signatures that prove it (each saved again until a save succeeds),
and is shown as proven as soon as the second signature arrives. Automerge refuses the second change, so board changes from
the peer that carries it stop applying until that machine is removed and its copy
rebuilt. The hub's persistence acknowledgement covers the heads of both the board and
the signature document. A replica asks for it only once every signature it made is
in the signature document, about the board and signature heads it captured together
at that moment; and a write is acknowledged locally only once its own signature is
saved in the signature cache.

## Signature document

Everything read from the signature document is checked for shape: only map shards,
change-hash keys and 64-byte values. Every concurrent shard map and value is read,
so no member can hide a valid signature behind others; a shard key's maps are read
once per change to that key, a change's candidate values (every concurrent value and
every position of a candidate list) once for each state of the document,
de-duplicated by content, and the hub makes a shard that holds more than one value
into one map holding every entry. Candidates are verified in passes: one slice of
background work, or one write into the signature document, makes at most 250 Ed25519
verifications, at most 32 of them (`CANDIDATES_PER_PASS`, about 3.5 ms) for one
change, and a change or shard with more is examined further in the next pass from
where it stopped. Each result is kept while its change is under examination, its
shard is being merged or it proves an equivocation report, and otherwise up to
50,000 results, so no examination starts again from the beginning; copies stored
ahead of a genuine signature delay it but never hide it. While a change's signer cannot
be established (its change has not arrived, or its actor names no known machine),
every distinct candidate for it is kept, as a list at its key, up to 16; once the
signer is known the hub keeps the one that verifies. Past 16, what may be genuine is
kept first: the cached value, then one value per known machine that may be the
change's signer, then values no known key verifies (a machine not known yet may have
made them), then the rest. A genuine signature is dropped from the shared document
only when 16 values rank before it, and its writer puts it back when it sees its
entry missing. A malformed shard is made again as a map
with its entries kept. A failed write-back is retried. A
failure in a background attribution task is contained, logged and shown in status
(`attribution.failures`), and never stops the service. A member asks the hub about
every change still waiting for a verdict in turn, 500 at a time.

## What is not enforced

What is not enforced: **a member may still change anything**, as in git. Peers
check who made a change, not whether it was allowed, and people review and undo a
bad change. **A machine's word is taken for which of its Actors acted:** peers
verify the machine and flag only a change claiming an Actor that machine is not
certified for, such as another person's Actor, or a person on an agents-only
machine; agent grants limit agents only on their own machine. **The sync stream
after the handshake is protected only by TLS** (#215): whoever terminates TLS in
front of the hub, such as a reverse proxy or tunnel provider, could relay a
member's handshake and then inject sync traffic, which peers apply and flag as
unattributed. Changes to the signature document are not signed themselves: a
member can delete or overwrite an entry, which unattributes a change only on peers
that never verified it. A member can also front-run another machine's next change
with an unsigned change under that machine's actor and sequence number; the real
change is then refused by Automerge where the forgery arrived first, which is
reported as a conflicting change, not proven equivocation. Whether a change came
after its machine's removal is read from the board's history, so a member who
deletes a removal record from the document can move that point when peers write
the record back; the machine stays removed either way. A member
running a modified client could still write a record signed by its own
machine straight into the document. The hub harvests that
as history, without the current-role check, so a demoted admin could still remove
a member that way; records from a removed machine are refused. Consent, derived
person IDs and the agents-only rule are part of computing membership, so they hold
for such records too. Records are enforced only at
the hub. A removed machine that synced after a hub's backup was taken, was removed
while offline, and is the first to reach the restored hub can still be served
until a member holding the removal connects. Peers do not sync directly, and hub
routes rely on HTTPS for confidentiality. After the handshake, sync frames are
protected only by TLS, so whoever terminates TLS in front of the hub (a reverse
proxy or tunnel) could relay a member's handshake and then inject its own sync
traffic on that socket
([#215](https://github.com/depatchedmode/pardner/issues/215)). Because the hub answers every hello, any
party can hold one of its 256 pending HTTP sessions for up to 30 seconds without
a member's key. The rest of the trust rollout remains a
[plan](PARDNER-TRUST-PLAN.md).

## Client, service and integrations

The [local client onboarding preview](PARDNER-CLIENT.md) adds a private
identity and project registry, isolated project runtimes, Start/Join, purpose-specific
invitations with approval, and authenticated Actor sessions. `pardner open` (or a bare `pardner`)
starts the client service when it is not running and signs the local browser in
through a one-time link, with no token screen or Actor picker. Git supplies profile defaults; the session
determines authorship. The browser can switch projects and show reported Actor
presence. This preview does not migrate existing standalone installations.
The local client is the only way people open the board, and it listens on this
computer's loopback only. Phone access is not currently offered; it is planned
through the hub over HTTPS.

The standalone service (`pardner serve`) is an agent and integration service: one
project on this computer whose attributed operation API agents and integrations use
through the `pardner` CLI. It serves no other machine, and its data is separate from
the client's projects. Its `/pardner/` page serves no board; it points people to
`pardner open`. Only the client hosts a project for other machines or joins one.
Each service owns a persisted Automerge replica; a hub relays changes and owns a
transactional SQLite delivery ledger. Actor identity is separate from replica
identity, so the same Actor can work from more than one machine.

Existing boards reopen with a direct, validated Automerge load of the stored
snapshot and incremental chunks. Read-only reopen does not rewrite the document.
Later edits are saved in the same layout as before: a small incremental chunk,
or a snapshot once the incremental chunks have reached the snapshot's size. A
stored chunk that fails validation stops the open with `DAMAGED_STORAGE` and
leaves every file as it is, to be restored from a
[cold backup](PARDNER-CLIENT-RECOVERY.md).

Local operations are acknowledged only after a disk persistence barrier. Enrolled
replicas reopen without the hub and reconnect with a fresh machine handshake.
Member machines are trusted full document writers: their synchronized changes bypass
operation validation, and each is attributed to the machine that signed it. Ordinary API and Actor credentials authorize only a machine's
own API and UI subscriptions; they are never accepted between machines.
Different-field edits merge; same-field alternatives retain their authors and
require explicit resolution. A synced indicator requires an explicit hub
persistence acknowledgement covering the displayed document heads.

The local client serves the task board at `/pardner/`: full task context,
revision-aware edits, atomic handoffs, comments, read receipts, conflict
alternatives, history, and commit evidence, authored by the signed-in Actor. The
browser authenticates with an HttpOnly session cookie and owns no separate
Automerge database. Task descriptions and comments support Markdown,
but images are displayed as alt text to prevent automatic tracking requests.
The browser image policy permits only same-origin assets and data images, and
outgoing links do not send a referrer.

Agent harnesses claim mentions through their local service, which forwards lease
requests to the hub. They must durably receive a message before acknowledging it.
New dispatch requires the hub; accepted work can continue and save locally while
the hub is unavailable. Delivery leases are not task-execution locks, and external
side effects still require harness-level idempotency.

An opt-in [local agent bridge](PARDNER-BRIDGE.md) can receive deliveries
durably and wake explicitly authorized, dedicated Codex App Server sessions.
It queues busy work and reconciles uncertain dispatch without model polling.
It attaches to a standalone service or, with an agent credential from
`client agent-grant`, to one agent Actor of a client project.
Real co-host rehearsals cover handoff and archive recovery; other adapters and
separate-machine qualification remain follow-up work.

The board's **Control** view is a [project control pane](PARDNER-CONTROL-PANE.md)
for development through T3 Code, available to people on this computer. It maps existing T3 threads to agent Actors with
explicit task and sender authorization, saves follow-ups before sending them one at
a time, and keeps intent, run identity, holds, output and verdicts on this host across
restarts. Execution completion, an independent check and human acceptance are
recorded separately. Tasks can link to existing GitHub issues; Pardner stores the
reference only and never changes GitHub. Live dispatch with a real provider is not
yet qualified.

For development coordination, use the separately pinned
[control runtime](PARDNER-CONTROL-RUNTIME.md), whose data and evidence live
outside candidate checkouts. Its historical compatibility pin is distinct from
the current implementation described here.
