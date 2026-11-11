# Invitations, pairing and removal on signed records

Run `node --test test/enrollment.test.js test/trust-enrollment.test.js` (both in
`test:runtime`). `test/client-onboarding.test.js`, `test/client-recovery.test.js`,
`test/onboarding-flow.test.js` and the browser test in
`test/client-onboarding-ui.test.js` (Chromium and WebKit) cover the same flows
through the existing public paths, and `npm run test:acceptance -- --seed 1`
enrolls the acceptance topology through approvals.

- **Library.** Offers verify only under their issuing machine's key; a join
  request verifies under its own key and its MAC only under the invitation
  secret; codes are eight digits that change with the offer, the key and the
  nonce. Agents-only machines act only as agents they named for their own
  person. The gate's refusal reasons, mayAuthor and the role chain's head.
- **Human invitation.** The joiner waits with no code and no project, sees the
  approver's code once the request is opened, and a wrong code is refused. The
  approval admits a member whose machine and agent label appear in the records.
- **Leaked invitation.** A stranger's request shows a different code, is
  rejected, receives no credential or record, and the intended recipient still
  joins. Two requests forced onto one code are both rejected.
- **Bounds.** Expiry at request and at approval (an injected hub clock), single
  use, and five pending requests per offer.
- **Pairing.** By the person's own machine, by the owner for someone who lost
  every machine, and refusals for a member pairing into another person's
  identity, through the hub's routes and at its gate.
- **Roles.** A member cannot invite people, an admin cannot offer the admin role,
  only the owner changes roles, and a demoted admin cannot admit anyone.
- **Removal.** The hub refuses the removed machine's signed requests and handshake,
  closes its sync session, and its own client then refuses its writes; its records
  are refused; people a removed admin admitted stay.
- **Transport admission.** `test/native-replica-auth.test.js` and
  `test/machine-handshake.test.js`: a non-member is refused and served nothing; a
  recorded handshake fails on a new connection, another hub and another project; a
  captured signed request fails when replayed; a bearer token is refused; the
  joiner refuses a hub machine that is not a member; removal closes live sync and
  signed sessions; two copies of one machine are reported; a restored hub waits
  and resumes. `test/client-local-admission.test.js`: writes check local records
  with no hub request.
- **Re-admission.** A removed machine key and a removed person's directory are
  refused with advice before taking a place; a fresh directory pairs as a new
  machine, or joins as a new person with a new person ID.
- **Lifecycle.** `test/lifecycle-conformance.test.js` observes that the record
  gate answers only after the storage barrier.

Not covered: separate physical machines, a hostile modified client writing records
straight into the document (harvested as history, without the role check), and
power-loss durability.
