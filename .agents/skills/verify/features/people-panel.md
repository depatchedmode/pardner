# People panel, leaving, profiles and the removed state

Run `node --test test/trust-people.test.js` (in `test:runtime`),
`node --test --test-name-pattern "client people" test/client-cli.test.js` (in
`test:cli`) and `npm run ui:build && node --test test/people-panel-ui.test.js` (in
`test:ui`, Chromium and WebKit). The membership library's leave and attribution
rules are in `test/membership.test.js` and `test/enrollment.test.js`
([trust-library](trust-library.md)).

- **People view (API).** For an owner, an admin and a member: counts; role, email
  and who let each person in; machines with this machine, the hub, paired-by and
  short IDs; agents grouped across machines; the actions each viewer is offered,
  with reasons, and none on the owner's entry for non-owners. The hub reports a
  connected replica as online. `client people` states the same facts as text.
- **Removal shown as removal (#175, #154).** A machine and a person removed show
  under Removed with who removed them; removed people's Actors are marked removed.
  The removed person's and the removed machine's clients answer `REVOKED` with who
  removed them, list the project in `removedProjects`, and still do after a
  restart. The machine that hosts the project can't be removed.
- **Leaving.** The owner is refused; a member and an admin leave; leaving takes
  every machine of the person, people they let in stay, and the leaver's other
  machine learns it from the hub. The old identity can't rejoin.
- **Profiles.** A profile edit renames the person on another member's board and in
  the API, keeps agent names, and updates this computer's identity.
- **Invitation history (#183).** Issuer, user, reviser and times; newest first;
  paging through the API, the CLI and a replica admin's client; revoke.
- **Browser, both engines.** Each role's panel; a role change through a
  confirmation whose Cancel has focus; removing a machine by keyboard and a person
  with the stated consequences; the removed party's screen naming who removed
  them, surviving a reload, and the switcher marking it removed, never the
  signed-out screen; the removed person leaving another member's header; pairing
  and a new person's join approved from the panel with the code both sides show;
  invitation history and revoke; a profile edit made at phone width reaching the
  owner's header; leaving at phone width; the owner nudge on the board and, once
  dismissed, in the panel until a second machine is paired. Phone-width checks
  assert no sideways scrolling.

Not covered: separate physical machines; last-seen times after a hub restart
(kept in memory only); per-change signer lines and unattributed-change notices,
which need signed changes (#197).
