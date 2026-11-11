# Signed genesis and the grow-only record store

Run `node --test test/client-machine-key.test.js test/record-store.test.js
test/trust-genesis-store.test.js` (all in `test:runtime`). The join assertions in
`test/client-onboarding.test.js` and the `client status` and `client show`
assertions in `test/client-cli.test.js` cover the public outputs.

- **Machine key.** A client directory creates `machine-key.pem` on first start and
  loads it afterwards. The checks cover the machine ID in `client status`, no key
  material in session output, the same key bytes after restart, and refusals that
  never replace the key: exposed mode (`MACHINE_KEY_UNAVAILABLE`), another
  directory's key (`MACHINE_KEY_MISMATCH`), and a missing key (`INCOMPATIBLE_SCHEMA`).
- **Genesis and project ID.** The project ID is 64 hex characters derived from
  the signed genesis. A retried create returns the same ID, and a second create
  gets another. The stored genesis verifies from the ID alone and names the creator
  and this machine.
- **Prior installs.** A version 1 client directory, whether cleanly closed or left
  with a write-ahead log by a killed process, and a schema 6 storage directory are
  refused, and their paths, modes and bytes are compared before and after.
- **Admission.** `test/record-store.test.js` stores a batch whose records
  certify each other in either order. It refuses a forged signature, another
  project, a non-record and a signer the store already holds as removed, with
  stated reasons. It keeps a member's self-promotion, which grants nothing. Every
  order of a log received at once (genesis, admin admitted, admin's admission,
  admin removed) gives the same membership with the admin's admission kept. SQLite
  triggers refuse updates and deletes.
- **Harvest and write-back.** Records written straight into the document are
  stored only when authentic: a tampered signature, another project, an
  uncertified signer and a record arriving after its signer's removal are refused
  and reported in `notStored`. A record deleted
  from the document, or the whole map, is written back, and the heads then settle.
  A deleted removal still holds after restart.
- **Kill between save and use.** A child process is killed with SIGKILL the moment
  the store saves a record, before any write-back. On restart the record is in the
  store and back in the document. This is process-crash evidence, not power-loss.
- **Offline replica.** A replica stores the genesis it synced and reopens without
  the hub, with the same membership and a local save.

These checks cover storage and harvest. Admission, enrollment and removal on
records are in [trust-enrollment.md](trust-enrollment.md).

`test/trust-genesis-store.test.js` also checks that membership write-back after
a process kill leaves no Automerge text anywhere in the document history.
