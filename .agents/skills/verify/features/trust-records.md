# Signed genesis and the grow-only record store

Run `node --test test/client-machine-key.test.js test/record-store.test.js
test/trust-genesis-store.test.js test/membership-harvest.test.js test/hub-restore.test.js` (all in `test:runtime`). The join assertions in
`test/client-onboarding.test.js` and the `client status` and `client show`
assertions in `test/client-cli.test.js` cover the public outputs.

- **Machine key.** A client directory creates `machine-key.pem` on first start and
  loads it afterwards. The checks cover the machine ID in `client status`, no key
  material in session output, the same key bytes after restart, and refusals that
  never replace the key: exposed mode (`MACHINE_KEY_UNAVAILABLE`), another
  directory's key (`MACHINE_KEY_MISMATCH`), and a missing key (`INCOMPATIBLE_SCHEMA`).
- **Genesis and project ID.** The project ID is 64 hex characters derived from
  the signed genesis. A retried create returns the same ID, and a second create
  gets another. The stored genesis verifies from the ID alone and names the creator,
  whose person ID is derived from this machine's key, and this machine.
- **Prior installs.** Version 1, 2 and 3 client directories, whether cleanly
  closed or left with a write-ahead log by a killed process, and schema 6, 7 and 8
  storage directories are refused, and their paths, modes and bytes are compared
  before and after. A version 2 or 3 registry's version is read from a private copy.
- **Admission.** `test/record-store.test.js` stores a batch whose records
  certify each other in either order. It refuses a forged signature, another
  project, a non-record and a signer the store already holds as removed, with
  stated reasons, including a certification without its machine's consent. It
  keeps a member's self-promotion, which grants nothing. Every
  order of a log received at once (genesis, admin admitted, admin's admission,
  admin removed) gives the same membership with the admin's admission kept. SQLite
  triggers refuse updates and deletes.
- **Harvest and write-back.** Records written straight into the document are
  stored only when authentic: a tampered signature, another project, an
  uncertified signer and a record arriving after its signer's removal are refused
  and reported in `notStored`. A record deleted
  from the document, or the whole map, is written back, and the heads then settle.
  A deleted removal still holds after restart. `test/membership-harvest.test.js`
  runs a hub and replicas: unconsented certifications, a key admitted under
  another person's ID, and every membership record an agents-only machine signs,
  written straight into a replica's document, count for nothing on the hub and the
  replica.
- **Kill between save and use.** A child process is killed with SIGKILL the moment
  the store saves a record, before any write-back. On restart the record is in the
  store and back in the document. This is process-crash evidence, not power-loss.
- **Offline replica.** A replica stores the genesis it synced and reopens without
  the hub, with the same membership and a local save.
- **Restored hub state.** `test/hub-restore.test.js`: a restored hub stays waiting
  across four restarts, and a member whose checkpoint is ahead only by its start
  still vouches; an established hub without `hub-state.json` waits; a learned
  "behind" state survives restarts; a child process is killed with SIGKILL at each
  of seven steps of the sequence and the hub is waiting, or resumed only once that
  was saved; a server restored and restarted three times is caught up by the first
  member. Process-crash evidence, not power-loss.

These checks cover storage and harvest. Admission, enrollment and removal on
records are in [trust-enrollment.md](trust-enrollment.md).

`test/trust-genesis-store.test.js` also checks that membership write-back after
a process kill leaves no Automerge text anywhere in the document history.
