# Machine keys and membership library

The new modules have no product callers. Run `node --test test/machine-key.test.js
test/membership.test.js` (also included in `test:runtime`). Checks cover Ed25519
key round trips, raw-key machine IDs, 0600 files, corrupt/exposed/symlink refusal,
exact domain separation, project-bound genesis and record verification, authority
chains, admin protection, immutable owner role, permanent removals, mutual machine
removal, duplicate records, profile/agent authority and conflicting records.
Exhaustive small-set permutations and seeded larger-set shuffles establish
order-freedom. They do not establish arrival-time refusal or a transport gate.

`generateMachineKey`, `saveMachineKey(directory, key)` and `loadMachineKey` expose
keys with `sign(domain, bytes)`, base64url raw public keys and a 16-byte raw actor
prefix. Save is exclusive PKCS8 PEM creation with file fsync; it does not overwrite
an existing key or claim power-loss durability. Protocol domains are fixed constants.

`buildRecord(key, fields)` assigns metadata and signs canonical JSON.
`verifyRecord(record, projectId, signerPublicKey)` checks authenticity, not authority;
genesis needs only projectId. `computeMembership(records, { projectId }?)` returns
sorted active people, machines, agent names, removal IDs and rejected record IDs
with reasons. `isMember` checks the active machines. With no selector, a single
valid genesis supplies the project ID; ambiguous roots fail closed.

## Deterministic choices

- Signature input excludes signature and recordId; genesis hashing additionally
  omits projectId to break its self-reference. Hashes are lowercase SHA-256 hex;
  keys/signatures are unpadded base64url.
- Owner machines resolve first, then owner role decisions, then admissions to a
  fixed point. Greatest recordId wins competing owner roles, profiles and agent
  labels. Owner roles override admission roles and apply to the entire set.
- Final roles can invalidate an admin's prior admissions after demotion. For
  example, owner admits A, A admits B, owner demotes A: B is not admitted by the
  final set. The format has no causal history to distinguish past authority.
- First reachable certification in record-ID-ordered passes binds a person/key.
  Conflicting certifications cannot rebind keys or change roles. Authorized
  conflicting certifications participate only in removal history, preventing a
  second person ID from hiding a removed key association; they grant no authority.
- Removed signers retain authority for all kinds in this reducer; removals apply
  last. Genesis, owner admits A, owner removes A, A admits B cannot reveal whether
  B's admission arrived before or after removal. Future ingestion must enforce
  the design's arrival-time refusal. The reducer cannot reconstruct it.
- Machine removal requires another machine. Managing another person's machines,
  including addition, requires permission to remove that person. Agent IDs are
  scoped to the signing machine. Profiles require displayName and email.
- Offers, join requests and approvals are required signed JSON objects; their
  protocol schema, expiry, single-use and confirmation checks belong to enrollment.

No product storage, transport, recovery, board conflict or delivery guarantee is
changed. These API tests are the relevant feature exercise for this library.
