# Goals and veins

## Sub-features

Create a vein toward a goal; link a task to multiple veins; move a vein between
goals; surface concurrent moves; preserve unseen concurrent links; give a vein
a deliberate verdict and a goal a separate deliberate outcome.

## How to get to it (user POV)

Use `pardner vein create --title ... --goal ...`, `vein add`, `vein remove`,
`vein show`, `goal show`, and their `update`/`resolve` commands. `tasks --vein`,
`veins --goal`, and `goals --status` expose membership and outcomes. Read current
revisions before a mutation requiring them; register a human Actor first.

## Driving it with the CLI and domain fixtures

Run `node --test test/pardner-cli-veins.test.js test/veins-goals.test.js`.
The CLI workflow creates two veins sharing a goal, links tasks, filters lists,
removes an observed membership, marks work dead-end, and separately achieves
the goal. Expected: the right memberships and statuses, a vein ready for verdict
only when appropriate, and the goal still open until explicitly changed.

The domain fixture checks concurrent moves between goals: both destinations
retain the disputed vein until explicit resolution, including history at both
destinations. Concurrent link/removal preserves a link the remover did not
observe. These checks exercise domain commands; if CLI resolution changes,
also drive `vein resolve` through the real service with conflicting fixture state
and inspect the resulting CLI contexts.

## Gotchas

`npm run test:cli` currently omits `pardner-cli-veins.test.js`; run it explicitly
when relevant (the full Node suite includes it). The acceptance scenario's task
status conflict does not establish goal/vein conflict behavior. Do not invent a
browser entry point when the changed feature is exposed only through the CLI.
