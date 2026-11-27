# Invitations, pairing and removal on signed records

Run `node --test test/enrollment.test.js test/trust-enrollment.test.js` (both in
`test:runtime`). `test/client-onboarding.test.js`, `test/client-recovery.test.js`,
`test/onboarding-flow.test.js` and the browser test in
`test/client-onboarding-ui.test.js` (Chromium and WebKit, approving from the
People panel) cover the same flows
through the existing public paths, and `npm run test:acceptance -- --seed 1`
enrolls the acceptance topology through approvals.

- **Library.** Offers verify only under their issuing machine's key; a version 3 join
  request verifies under the public key in its machine DID and its MAC only under the invitation
  secret, names the hash of its offer, and for a new person uses its machine DID as the person ID. Codes are eight digits
  that change with the offer, the joiner’s DID
  and the nonce. An approved request becomes a certification embedding the offer
  and the joiner's consent. Agents-only machines act only as agents they named for
  their own person and sign no other kind of record. The gate's refusal reasons,
  mayAuthor and the role chain's head.
- **Human invitation.** The joiner waits with no code and no project, sees the
  approver's code once the request is opened, and a wrong code is refused. The
  approval admits a member whose machine and agent label appear in the records.
  `test/client-onboarding.test.js` checks that unsigned and non-genesis replies
  cannot save the request, an unsigned success reports a possible version
  mismatch, a different native responder cannot publish the project, and missing
  invitation proof stops the private runtime. Retrying
  the same operation preserves its credentials and lets the client open a wait.
- **Leaked invitation.** A stranger's request shows a different code, is
  rejected, receives no credential or record, and the intended recipient still
  joins. Two requests forced onto one code are both rejected.
- **Bounds.** Expiry at request and at approval (an injected hub clock), single
  use, and five pending requests per offer.
- **Pairing.** By the person's own machine, by the owner for someone who lost
  every machine, and refusals for a member pairing into another person's
  identity, through the hub's routes and at its gate. A paired computer can't
  start a project or join another as a new person. A machine paired with no agent
  name labels its agent with the name it was enrolled under
  (`test/client-onboarding.test.js`).
- **DID continuity.** Pairing and first-machine removal preserve the person and
  Actor IDs. Returning on a fresh Human invitation after key loss or person
  removal uses a new DID and Actor IDs. Offline reopen keeps both DIDs, and the
  replica persists the signed hub checkpoint under the hub machine's DID.
- **Roles.** A member cannot invite people, an admin cannot offer the admin role,
  only the owner changes roles, and a demoted admin cannot admit anyone.
- **Removal.** The hub refuses the removed machine's signed requests and handshake,
  closes its sync session, and its own client then refuses its writes; its records
  are refused; people a removed admin admitted stay.
  `test/native-replica-auth.test.js` checks that both refusals disclose only the
  proof, that a locally refused record cannot confirm removal, and that durable
  removal stops native reconnects and HTTP acknowledgement polling.
- **Transport admission.** `test/native-replica-auth.test.js` and
  `test/machine-handshake.test.js`: a non-member is refused and served nothing; a
  recorded handshake fails on a new connection, another hub and another project; a
  captured signed request fails when replayed; a bearer token is refused; the
  joiner refuses a hub machine that is not a member; removal closes live sync and
  signed sessions; a removed replica derives the verdict from saved proof;
  peer IDs are owned by authenticated machines; two copies are reported; a restored hub waits
  and resumes; an unproven party gets the same answer for an unknown, a removed and
  a member's key. `test/client-local-admission.test.js`: writes check local records
  with no hub request. The v2 tests verify the independent wire vector,
  reject reordered and replayed records and test response binding before
  acknowledgement or HTTP retry. They also check exact successful session
  statuses, refusal metadata, and dispatch exceptions for live and queued
  frames. Failed dials and early closes preserve the authenticated restore
  notice. The handshake tests check that a restore prompt can obtain records
  only from a replica that already recognizes the responder.
  `test/ticket-reconnect.test.js` checks a slow sealed welcome alongside early
  local readiness. The TLS relay rehearsal is tracked in #215.
- **Re-admission.** A removed machine key and a removed person's directory are
  refused with advice before taking a place; a fresh directory pairs as a new
  machine, or joins as a new person with a new person ID.
- **Lifecycle.** `test/lifecycle-conformance.test.js` observes that the record
  gate answers only after the storage barrier.

Not covered: separate physical machines, and power-loss durability. A hostile
modified client writing records straight into the document is covered for
consent, person IDs and agents-only authority (`test/membership-harvest.test.js`);
such records are still harvested without the current-role check.
