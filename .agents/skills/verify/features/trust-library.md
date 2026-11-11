# Machine keys and membership library

The client and project runtime now call these modules; their product behavior is
in [the record store entry](trust-records.md). Run `node --test test/machine-key.test.js
test/membership.test.js` (also included in `test:runtime`) for the library itself. Checks cover Ed25519
key round trips, raw-key machine IDs, 0600 files, corrupt/exposed/symlink refusal,
exact domain separation, project-bound genesis and record verification, authority
chains, admin protection, immutable owner role, permanent removals, mutual machine
removal, duplicate records, profile/agent authority and conflicting records.
Exhaustive small-set permutations and seeded larger-set shuffles establish
order-freedom. The arrival-time helper is exercised separately; no running ingestion path or transport gate uses it. A 301-record admission/role chain also checks fixed-point completion within a generous five-second bound.

`generateMachineKey`, `saveMachineKey(directory, key)` and `loadMachineKey` expose
keys with `sign(domain, bytes)`, base64url raw public keys and a 16-byte raw actor
prefix. Save is exclusive PKCS8 PEM creation with file fsync; it does not overwrite
an existing key or claim power-loss durability. Protocol domains are fixed constants.

`buildRecord(key, fields)` assigns metadata and signs canonical JSON.
`verifyRecord(record, projectId, signerPublicKey)` checks authenticity, not authority;
genesis needs only projectId. `computeMembership(records, { projectId }?)` returns
sorted active people, machines, agent names, removal IDs and rejected record IDs
with reasons. It also reports who admitted each person and machine (`admittedBy`,
null for the genesis), which machines were paired to an existing person
(`paired`), each counted removal with its signer and whether the person left
(`removals`), and what removed people and machines were (`formerPeople`,
`formerMachines`); permutation tests cover these. A person's own machine may sign
`member.remove` for that person, to leave; the owner can't leave and an
agents-only machine can't leave for its person, in the reducer, `mayAuthor` and
`maySign` alike. Each person exposes `everAdmin`, including after demotion, so arrival-time policy retains target protection. `isMember` checks the active machines.
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
- First reachable certification in record-ID-ordered passes binds a person/key.
  Conflicting certifications cannot rebind keys or change roles. Authorized
  conflicting certifications participate only in removal history, preventing a
  second person ID from hiding a removed key association; they grant no authority.
- Removed signers retain authority for all kinds in this reducer; removals apply
  last. Genesis, owner admits A, owner removes A, A admits B cannot reveal whether
  B's admission arrived before or after removal. Future ingestion can use
  `maySign` to reject removed signers and newly arriving privileged records
  from demoted signers. The reducer cannot reconstruct arrival history.
- Machine removal requires another machine. Managing another person's machines,
  including addition, requires permission to remove that person. Agent IDs are
  scoped to the signing machine. Profiles require displayName and email.
- Offers, join requests and approvals are required signed JSON objects; their
  protocol schema, expiry, single-use and confirmation checks belong to enrollment.

No product storage, transport, recovery, board conflict or delivery guarantee is
changed. These API tests are the relevant feature exercise for this library.
