# Pinned control runtime

The operator uses control status, seal, start, restart and open with an explicit
home. The runtime is a Pardner client (`client serve` on one loopback port); people
enter through `control open` and agent Actors through `pardner-HARNESS` wrappers,
which run `pardner --token-file` with a 0600 client agent-grant credential.
Follow the [runtime guide](../../../../docs/PARDNER-CONTROL-RUNTIME.md) and
[readiness/cutover boundary](../../../../docs/PARDNER-CONTROL-READINESS.md).

The test:control-runtime script builds the UI and runs disposable Python fixtures.
It checks release/deployment identity, job ownership, guarded CLI behavior,
first-start identity/project creation, agent credential storage, open, and real
client recovery (doc, activity and delivery ledger) with a simulated launchd
boundary. `node --test test/client-cli.test.js` covers `--token-file` through
the client proxy: agent authorship, inbox, claim/ack and Actor mismatch. Schema compatibility
must match the selected release's literal SCHEMA_VERSION declaration, including
historical and future versions. Incompatible, missing or invalid schema fails
before sealing, starting or stopping for restart. Unknown declaration syntax fails
closed. Existing metadata and deployment bytes stay unchanged; no app storage
lease is acquired by the check. The app still validates the actual stored document
when opened; this preflight is not a complete integrity check.

Never run mutation tests, installs or builds inside the installed controller.
Use fresh fixture data. Installed status is read-only but contains live workspace
state: publish allowlisted readiness fields only, never raw connection or
credential files.
Historical recovery and T3/real-human proof are separate from these fixtures.
