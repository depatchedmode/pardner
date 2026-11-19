# Automerge Repo 2.5.1 sync backport

Repo 2.5.1 schedules sends from the document handle’s visible `change` event.
Editing a hidden conflict alternative advances the heads without producing a
visible patch. [The backport](heads-sync.patch) moves the existing throttled send
listener to `heads-changed`. It leaves visible-patch events, peer admission,
sync messages, and saved document formats intact.

The archive is the official [2.5.1 npm package](https://registry.npmjs.org/@automerge/automerge-repo/-/automerge-repo-2.5.1.tgz)
with the two changes in the patch. Its original npm integrity is
`sha512-w242TXb2TaGHFux7dDtJIUVJMqSSq1iYvNia8FVYgVTUDvbm8chaGMe1kVdKMEINFiB/BNYPtsoJIPjJhQArLg==`.
The root lockfile pins the resulting archive's integrity. A fresh
`npm ci --ignore-scripts` installs it directly.
Pardner's npm package bundles the installed Repo dependency so a consumer
install does not have to resolve the archive path inside the package.

To reproduce the archive, verify the upstream tarball against that integrity
and extract it into an empty directory. From its `package` subdirectory,
apply `patch -p1` with `heads-sync.patch`, then run
`npm pack --ignore-scripts --pack-destination ..` with npm 11.11.0.
Compare the resulting archive with the checked-in tarball.

Retire this backport when upgrading to a release that passes the hidden-edit
regression in `test/signed-entries.test.js` through the real sync path.
