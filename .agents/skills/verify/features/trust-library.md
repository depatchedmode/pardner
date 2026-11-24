# Machine keys and membership library

The client and project runtime now call these modules; their product behavior is
in [the record store entry](trust-records.md). Run `node --test test/machine-key.test.js
test/membership.test.js test/membership-rules.test.js` (also included in `test:runtime`) for the library itself.
Certification fixtures start with real keys and go through the enrollment code
(`support/trust-records.js`); `forge()` re-signs a changed record as a modified client could. Checks cover Ed25519
key round trips, raw-key machine IDs, 0600 files, corrupt/exposed/symlink refusal,
exact domain separation, project-bound genesis and record verification, authority
chains, admin protection, immutable owner role, permanent removals, mutual machine
removal, duplicate records, profile/agent authority and conflicting records, and
the section 2 rules: a certification counts only with its machine's consent; a
person ID is derived from the admitted key; certifications never displace each
other; agents-only machines hold no membership authority.
Exhaustive small-set permutations and seeded larger-set shuffles establish
order-freedom. The arrival-time helper is exercised separately; no running ingestion path or transport gate uses it. A 301-record admission/role chain also checks fixed-point completion within a generous five-second bound.

`generateMachineKey`, `saveMachineKey(directory, key)` and `loadMachineKey` expose
keys with `sign(domain, bytes)`, base64url raw public keys and a 16-byte raw actor
prefix. Save is exclusive PKCS8 PEM creation with file fsync; it does not overwrite
an existing key or claim power-loss durability. Protocol domains are fixed constants.

`rawPublicKey` rejects small-order Ed25519 points and non-canonical encodings.
`test/machine-key.test.js` covers both sign bits for each rejected y coordinate,
signature refusal, and rejection by `verifyRecord`, `joinRequestRefusal` and
`readHello`. It also checks that freshly generated keys keep their bytes and
verify signatures.

DID tests reproduce the RFC, did:key specification and freeq vectors. Both
identity kinds use the canonical Ed25519 DID profile. `buildRecord(key, fields)`
signs version 3 canonical JSON. The first certification requires the person and
machine DIDs to match. Pairing carries a separate person DID. The signed record
and its embedded join request carry their keys in their DIDs.
`verifyRecord(record, projectId, certifiedSigner)` checks authenticity and consent;
genesis needs only projectId. `computeMembership(records, { projectId }?)` returns
sorted active people, machines, agent names, removal IDs and rejected record IDs
with reasons. It also reports who admitted each person and machine (`admittedBy`,
null for the genesis), which machines were paired to an existing person
(`paired`), each counted removal with its signer and whether the person left
(`removals`), and what removed people and machines were (`formerPeople`,
`formerMachines`); permutation tests cover these. A person's own machine may sign
`member.remove` for that person, to leave; the owner can't leave. An agents-only
machine signs only `agent.name` for its own person's agents: every other kind it
signs counts for nothing, in every reducer pass, `mayAuthor` and `maySign` alike. Each person exposes `everAdmin`, including after demotion, so arrival-time policy retains target protection. `isMember` checks the active machines.
`maySign(membership, record)` checks authenticity and current signer membership/role, plus the kind's target restrictions; it is not used by the reducer and does not persist records. With no selector, a single
valid genesis supplies the project ID; ambiguous roots fail closed.

## Deterministic choices

- Signature input excludes signature and recordId; genesis hashing additionally
  omits projectId to break its self-reference. Hashes are lowercase SHA-256 hex;
  keys/signatures are unpadded base64url.
- Owner machines resolve first, then owner role records, then admissions to a
  fixed point. Roles require `replaces` (recordId or null); only the owner may
  sign them. A person's role is the greatest unreplaced valid role record for
  that person, falling back to admission role. Missing predecessors and concurrent
  heads use the same rule; cross-person and invalid records cannot replace a head.
  Profiles and agent labels still use greatest recordId.
- Admission authority survives demotion/removal: admission as admin or any valid
  owner-signed admin grant establishes `everAdmin`. Other admins cannot remove
  that person or manage their machines even after demotion. Same-person machine
  control remains available. Owner admits A as admin, A admits B, owner demotes
  A therefore leaves B admitted in every permutation.
- Consent is a pure check of one record (the embedded join request is signed by
  the certified key for this project, this person and the hash of the embedded
  offer, and the offer gives this role or purpose), so it runs once before any
  pass and no pass sees an unconsented certification.
- Every consented, authorized certification counts; record order and record IDs
  decide nothing about who is certified. A key certified more than once for one
  person is one machine, agents-only only if every certification says so; a person
  admitted more than once holds the highest admission role (a role record still
  decides the current role); a key certified for two people is removed, and acts
  for either person in judging what it signed. The authority fixed point is
  monotone: `everAdmin` is fixed after the owner pass, and agents-only marks only
  lift as certifications are added. `admittedBy` and `paired` choose a display
  certification (genesis, then admission, then pairing, then smallest recordId),
  which no authority depends on.
- Removed signers retain authority for all kinds in this reducer; removals apply
  last. Genesis, owner admits A, owner removes A, A admits B cannot reveal whether
  B's admission arrived before or after removal. Future ingestion can use
  `maySign` to reject removed signers and newly arriving privileged records
  from demoted signers. The reducer cannot reconstruct arrival history.
- Machine removal requires another machine. Managing another person's machines,
  including addition, requires permission to remove that person. Agent IDs are
  scoped to the signing machine, and an agent label counts only for an agent of a
  person the signing machine is certified for. Profiles require displayName and
  email.
- Offers, join requests and approvals are required JSON objects. The reducer checks
  the join request's signature and fields and that the offer matches its hash;
  expiry, single use, the offer's own signature and confirmation checks belong to
  enrollment.

No product storage, transport, recovery, board conflict or delivery guarantee is
changed. These API tests are the relevant feature exercise for this library.

`test/membership-limits.test.js` checks record byte, nesting and text bounds before
cryptography, and bounds reducer work for 3,001 records (1,000 repeated
certifications and a 1,100-machine chain), including duplicate/shuffled input.
`test/machine-handshake.test.js` checks that revocation removes proven sessions
while pending member, removed and unknown keys get identical invalid-confirmation
and expiry responses.
