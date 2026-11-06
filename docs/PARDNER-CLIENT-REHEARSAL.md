# Rehearse client onboarding across machines

This is the onboarding-client version of the [real-agent rehearsal](PARDNER-REHEARSAL.md).
Use two actual humans and two actual agents, each with its real harness/model.
Record which steps were performed by a human, an agent or an automated fixture.
A technical rehearsal with two agents and one human is useful partial evidence,
but does not substitute for two human signoffs. Keep credentials out of captures.

## Prepare

Use the same recorded candidate revision on both machines, Node 24.11.1, matching
root/UI lockfiles and the built UI. Use fresh private client directories and keep
existing installations and projects running unchanged. An agent may prepare the
checkout and dependencies; record that work as part of the setup experience.

For different networks, prepare a reachable HTTPS gateway for the originating
client and start it with `--public-url HTTPS_ORIGIN`. Route only
`POST /pardner/client/v1/enroll` and the authenticated
`/pardner/client/v1/replica/` paths, including the native WebSocket upgrade. Keep
browser bootstrap, operator APIs, UI and unrelated host services private. Test
that unauthenticated access is rejected and those other paths are unavailable.
Preserve the public Host header; forwarded headers must not grant authority.
This setting provisions no relay. Retain or restore any pre-existing route.

An available trusted/private network with a reachable HTTPS authority can avoid
a public relay. Unrelated laptop/cloud networks need an explicit reachable route;
the client does not implement discovery, hole punching or a peer mesh. A private
gateway requiring extra provider authentication needs an explicitly supported
transport arrangement; do not silently strip that control or claim native support.

## Join through the product flow

1. Alice asks Alpha to set up and open the board. Alpha uses its actual harness:

   ```sh
   node bin/pardner.js client serve --data /private/path/alice-client \
     --harness openai-codex --name Alpha --managed-by T3
   # Another terminal; add --public-url to serve when using a remote gateway.
   node bin/pardner.js client open --data /private/path/alice-client
   ```

   Supply the actual model when known. Alice confirms the Git-derived identity
   and creates the project. Alpha is registered; it is not active until reporting.
2. Alice chooses **Invite → Human** and privately gives Bob the short setup
   prompt. Bob asks Gamma to act on it. Gamma prepares the same client revision,
   opens Bob's local board and joins with a stable operation ID. Bob creates his
   own identity. Record every manual repair, prerequisite and confusing step.
3. Check matching project IDs, distinct human identities, intended human/harness
   relationships and locally persisted replicas on both machines. Each agent
   obtains its own project grant through `client agent-grant --output-file`.
   Never give an agent the operator credential as its normal board identity.
4. Have both agents read and comment on one task as themselves. Report presence
   only while doing that work and end the sessions afterward. Verify the correct
   model/harness/device and focus, followed by idle/offline without stale focus.
5. Alice and Bob save different fields while keeping a draft open. Confirm both
   saved changes arrive and the draft remains. Switch projects and return. Check
   same-field alternatives and explicit resolution instead of silent overwrite.
6. Perform the handoff/durable-receipt sequence and outage/restart/retry exercises
   in the original rehearsal's **Exercise** section, using the client project API
   and bound credentials. Do not use the standalone author picker or raw tokens.
7. Exercise **Agent** for another harness and **My device** for an owned machine.
   Verify stable Actor grouping, then follow the [recovery procedures](PARDNER-CLIENT-RECOVERY.md)
   for revocation, private export and a complete cold restore. Stop only the
   rehearsal authority when testing outages; preserve unrelated services.

## Record and accept

Keep revision/fingerprint, exact commands, machine and provider versions, project
and task IDs, operation receipts, locally saved versus hub-acknowledged state,
actual actors' comments and observed failures. Link evidence in the Pardner task.
Record timings where measured; do not report acceptance thresholds as measurements.
Credential-bearing invites, grants and traces remain private.

Complete the final candidate's routine checks and 20-seed qualification before
claiming milestone acceptance. A changed executable candidate needs fresh evidence.
Each human records their own pass/fail decision after inspecting the result.
Until those decisions exist, describe technical evidence and outstanding human
acceptance separately. Never create a comment on a human's behalf to imply signoff.
