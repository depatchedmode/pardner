# Recover a local client

Use the recorded Pardner revision, Node 24.11.1 and matching dependency locks.
Keep prior installations intact. The [local client's](PARDNER-CLIENT.md) private
registry, machine key and project runtimes must be recovered together.

## Inspect and export retained work

```sh
node bin/pardner.js client list --data /private/path/client
node bin/pardner.js client show --data /private/path/client --project PROJECT_ID
node bin/pardner.js client export --data /private/path/client --project PROJECT_ID \
  --output-file /private/path/project-content.json
```

`show` includes public Actor/device metadata. The private
`pardner-workspace-view-v1` export contains the materialized workspace document,
including task content and authored history. It requires a confirmed local save
and performs no remote read. The **local operator** can export retained work after
revocation; browser and agent credentials cannot invoke this route. Keep the
project ID from a prior receipt when a revoked project disappears from `list`.

The export excludes service/enrollment credentials, but user-authored content
can still be sensitive. It is not an Automerge replica, excludes external files,
and cannot restore enrollment or delivery leases. Copying its content into a new
project does not reproduce operation identity or history. Use a cold backup below.

## Make a complete cold backup

1. Record the code revision, Node version, both lockfile hashes and `client list`.
   Keep the machine ID (`device.machineId`), project IDs, Actor IDs, roles and
   local save/sync status. Require
   `savedLocally: true` and no storage error; record pending sync as pending.
2. Stop the client gracefully with Ctrl-C in its owning terminal and wait for
   exit. Its supervised project children stop with it. Do not copy a live
   directory or kill unrelated services. Diagnose a failed stop before backing up.
3. Copy the **entire** directory to a new private destination outside the source:

   ```sh
   umask 077
   client_source=/private/path/stopped-client
   client_backup=/private/path/client-backup-2026-11-06
   test ! -e "$client_backup" && cp -Rp "$client_source" "$client_backup"
   ```

   Keep `client.sqlite` and its sidecars, `machine-key.pem`, all `projects/`
   directories, each `workspace.json`, Automerge `repo/`, each project's
   `records.sqlite` membership record store, hub `deliveries.sqlite` and other
   private files. Copying only `repo/` loses identity, admission, retry and
   delivery state. Without `machine-key.pem` the restored directory is refused.
   Without a project's `records.sqlite`, records since deleted from that
   project's document are lost.
   **A backup is a credential.** It holds the machine key, so anyone with a copy
   can sign as this machine. Keep backups as private as the original, with the
   key at mode 0600.
4. Back up external files/attachments separately and record restore paths. Save
   browser drafts first: browser storage and unsaved drafts are separate. Preserve
   external harness inbox/effect ledgers when used; the hub delivery database does
   not replace those durable receipts and effects.

Keep an independent backup. Synchronization can propagate deletion or corruption.

## Restore into a fresh installation

1. Install the recorded revision and Node/dependencies, then build the UI. Stop
   the original client. Only one active copy of a restored device/replica identity
   may run: restoration replaces a device rather than enrolling another one.
   Running both copies duplicates the machine key.
2. Copy the complete backup into a **new** private directory with the no-overwrite
   command above. On another machine, transfer it securely, preserve private modes
   and make files owned by the account running Pardner. Do not delete old installs.
3. Start and open the recovered client:

   ```sh
   node bin/pardner.js client serve --data /private/path/restored-client
   # In another terminal:
   node bin/pardner.js client list --data /private/path/restored-client
   node bin/pardner.js client open --data /private/path/restored-client
   ```

   The saved port is reused. A non-authority client may choose another local port
   with `--http-port`; issue a fresh `client open` link there. Do not initialize a
   new identity or create replacement projects in restored data. Incompatible
   formats fail instead of migrating old installations automatically. A client
   directory made before machine keys has no `machine-key.pem` and is refused,
   unchanged; recover its content with `client export` from the release that
   made it, and start this one with a fresh directory. A missing, exposed or
   foreign key also refuses to start. Restore the directory's own key at mode
   0600; Pardner never generates a replacement for an existing directory.
4. Compare identity, device and machine IDs, project IDs and content with the
   backup record. A restored client is the same machine and signs as it.
   Enrolled replicas reopen without their authority; new local edits remain
   pending sync. Enrollment and delivery claims require the authority. Remote
   presence cannot be inferred while it is unavailable.
5. Reconnect and check convergence and explicit hub acknowledgement. Retry an
   uncertain operation with its original ID and payload. Retain the source backup
   until the restored content, external files and dependencies are confirmed.

## Replace the authority host

Restore its **complete cold backup**, including admission and delivery databases.
Preserve the public HTTPS origin and route it to the replacement host's allowed
enrollment/replica endpoints. Enrolled clients retain that origin; automatic
discovery or replica promotion is not provided. For a local fixture, preserve the
authority port. Stop or isolate the old authority before exposing its replacement.

Check project identity and content locally, reconcile revocations made after the
backup, then restore the route. A stale backup can roll back credential revocations
and delivery acknowledgements. Synchronized task data cannot reconstruct those
decisions. Use a current complete backup and separately preserved security/receipt
records, or keep admission closed until those decisions are reconciled.

The hub admits a machine only while the records it holds say that machine is a
member. A stale hub backup lacks removals made after it was taken; it learns them
from the first member replica that syncs, because every replica writes back the
records it holds. Until then, a machine removed after the backup can still
connect. Waiting for a member peer before serving is a later trust step, so keep
the restored hub isolated until a surviving member replica has synced, or until
you have confirmed nothing newer exists.

Peers can supply newer document changes after reconnecting. Check every expected
acknowledged operation, not just equal heads. A replica's document alone cannot
recreate hub admission/lease state. Without a complete authority backup, preserve
and export surviving work; a new project and explicit re-enrollment are a separate
recovery decision.

## Lost or removed machine

On a surviving machine of the same person, use `client show` to select the lost
machine's **machine ID** (or the device ID its profile lists), not its display name:

```sh
node bin/pardner.js client revoke --data /private/path/surviving-client \
  --project PROJECT_ID --kind machine --id LOST_MACHINE_ID \
  --operation-id remove-lost-machine-2026-11-06
```

This signs a `machine.remove` record, which the hub records through its gate. The
hub must be reachable. Retry uncertain requests with identical IDs and arguments.
The owner or an admin can also remove the machine. A machine cannot remove
itself. Removal also ends that machine's bearer admission at the hub, and the
invitations it issued.

Pair the replacement as a new machine: start Pardner with a fresh client directory
on the new computer, join a **My device** invitation from a surviving machine, and
approve it there after comparing the confirmation code. A removed machine key never
returns; a restored backup of the removed directory is refused too.

**A person who lost every machine.** The owner or an admin pairs a new machine for
them: create a My device invitation for that person (`client invite --purpose
device --person PERSON_ID`), join it from a fresh client directory, and approve it
after comparing the code. The new machine joins the same person, so their past
work stays attributed to them. Remove the lost machines as well. Matching Git name
or email proves nothing; only an approval links a machine to a person.

**The owner lost every machine.** Admins keep admitting and removing members, but
nobody can remove or demote an admin any more, because only the owner can. Owners
should pair a second machine early; Pardner suggests it when a project is created.
If the owner's machines are all gone, the remedy is a new project. A cold backup
of an owner machine restores that machine (below), which avoids this.

`client revoke --kind agent` revokes one of this machine's own agents locally; a
new Agent invitation joined on this machine restores it. Downloaded data cannot be
erased remotely. A removed machine's local operator may export retained content
but cannot acquire new remote authority. Offline clients keep last-known access
until they reconnect. These steps do not claim full key rotation or recovery from
compromise of the hub or of a complete client backup.

## Evidence boundary

`test/client-recovery.test.js` exercises cold copies restored into new directories,
offline work/retries, authority replacement at the same address, project isolation,
invitation recovery, delivery acknowledgement replay, removal of a lost machine by
its owner's other machine and private local export after removal.
`test/trust-enrollment.test.js` covers pairing by an admin for a person who lost
every machine, and re-admission as a new machine key or a new person. These process/filesystem tests do not prove
power-loss durability, live-backup safety or backup of external files/harness state.
