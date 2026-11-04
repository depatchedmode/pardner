# Control pane and GitHub issue links

## Sub-features

Pair one T3 credential; register projects and map T3 threads to agent Actors with
explicit task and sender authorization; queue follow-ups as durable intent; show
fresh versus stale reads, approval blocks, held work and cancellation; capture
output; record artifacts and separate checker and human verdicts. Link tasks to
existing GitHub issues without contacting GitHub. See
[the control pane contract](../../../../docs/PARDNER-CONTROL-PANE.md).

## How to get to it (user POV)

Open `/pardner/` through the service computer's loopback address, choose an
**Actor**, then **Control**. Settings live under **Control settings**. Task issue
links are in a task's **GitHub issues** section, or `pardner issue link TASK
owner/repo#N` and `pardner issue unlink TASK owner/repo#N --revisions JSON`.

## Driving it with the service, CLI and Playwright

`node --test test/control-pane.test.js` runs the real service, `control.sqlite`
and MCP client over HTTP against `support/fake-t3-server.js`, polling manually
through `POST /pardner/control/poll`. It restarts the same data directory and
patches the ledger to simulate crashes. Expected: zero T3 sends for wrong or
revoked routes, one send per intent across lost replies and restarts, exact-run
interrupts without `stop`, and unchanged identity, output and verdicts after restart.

`node --test test/pardner-control-ui.test.js` (after `npm run ui:build`) drives the
same flow in Chromium and WebKit. Selectors: **Control**, **T3 address**, **T3
pairing code**, **Pair T3**, **Project ID**, **Map thread**, the thread region
`T3 thread <title>`, **Follow-up for <agent>**, **Queue follow-up**, **Cancel this
run**, **Verdict evidence**, **Release held work** and **Link GitHub issue**.

`node --test test/issue-links.test.js test/pardner-cli-issues.test.js` covers issue
links through the API, two merged replicas and the CLI.

## Gotchas

The fake T3 models the qualified behavior; it does not establish live T3 or
provider behavior. Live qualification is `npm run test:t3-qualification`, and live
human approval belongs to #79. Settings and owner decisions need a loopback page,
so a LAN browser sees the pane but not its settings. Control records are
host-local and never synchronize; issue links do.
