# PR105 single full-UI failure capture

**Outcome: inconclusive.** The one authorized instrumented full UI invocation passed all 16 tests. The original WebKit replacement-pairing failure did not reproduce, so neither predeclared failure classification A nor B was reached. This diagnostic pass does not clear the original failure or supply final qualification. PR105 remains draft with `needs-qualification`.

The new 20-minute total budget began November 5, 2026 at 05:52:46 UTC, with a deadline of 06:12:46 UTC including setup, audit, cleanup and reporting. No earlier budget was extended. There was one full UI invocation, no repeated arm, baseline, intervention, full verify or 20-seed gate.

## Frozen conditions

Fetched refs matched starting documentation head `6dd4ecaddbc88bb0f92a890d30d1779646eb9081`, executable source `1c35881afc35b7c3d163c651400955a71622a0f9` and main `6d424e5114f51be2186ebb0e3ac2c553fc073d11`. Before/after/current source/test/lock/build fingerprint remains `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`. No production or test source changed.

Node 24.11.1 and both installed dependency trees matched their locks. The original command rebuilt its UI and actually launched pinned Chromium 151.0.7922.34 and WebKit 26.5. The exact package command remained:

```sh
npm run ui:build && node --test test/pardner-ui.test.js test/pardner-phone.test.js test/pardner-connection-ui.test.js test/pardner-control-ui.test.js test/markdown-privacy.test.js
```

The single invocation was `npm run test:ui`, under the normal 900-second watchdog. No name filter, concurrency flag, serialization, changed order/assertion, extra fixture, artificial load, host-admission condition or timeout change was used. The original final readiness wait remains 5,000 ms; offline acceptance remains the separately authorized 6,000 ms.

## Predeclared capture and observations

Before execution, the external observer was frozen at SHA256 `d5c72e2e62bf402c40980a64b3f48ee7bc8f434a7b0e2113e8aa4f131884fc62`, with these decisions:

- **A:** a reproduced failure shows an incomplete pairing/credential/configuration/document/status/ticket/socket/saved-state transition.
- **B:** a reproduced failure shows saved DOM present while navigation or a replacement document blocks the `goto`/locator boundary.
- A pass or stale/missing state evidence remains inconclusive; it authorizes no second run.

The observer retains original `goto` and exact saved-locator arguments and returns their original promises. It records invocation, resolution/rejection, frame and document identity, navigation/load, request outcomes, credential presence, socket events and recognized DOM state. Node events are buffered in memory and written asynchronously after browser close. On rejection, cached state is recorded immediately; a separate bounded snapshot may delay failure cleanup by at most 1,000 ms, outside the original assertion. **No rejection occurred, so that failure-snapshot path was not exercised.**

The instrumented WebKit pages recorded 11 `goto` starts and 11 resolutions, with no navigation-call or saved-locator rejection. The final 5,000 ms locator resolved after an observed 462 ms. During that wait, the trace recorded:

1. The original `goto` resolved and the saved locator began.
2. The fresh fragment was consumed, pairing succeeded and matching saved text appeared in the original document.
3. A replacement document navigated, validated the stored credential and connected again.
4. The saved locator resolved in that replacement document.

This observed sequence passed. It does not establish what stalled in the original failure, a browser/test defect, a Cloud regression or pre-existing failure. The observer's `savedVisible` field means matching DOM text presence, not computed visibility; only the original locator establishes visibility when it resolves. No direct internal Playwright navigation-barrier event was available on this pass. Browser wrappers and callbacks can still perturb event/microtask ordering despite avoiding synchronous Node writes on the timed path.

## Results and cleanup

The original full suite reported **16 passed, 0 failed, 0 skipped, 0 cancelled**; watchdog exit 0 after 41,599 ms. The WebKit replacement-pairing scenario took 6,437.563 ms for its entire multi-step workflow; that is distinct from its final 462 ms observed locator wait. These are diagnostic measurements, not qualification or evidence of a repaired performance problem.

All source fingerprints and observer hashes remained unchanged. The watchdog found no survivors, new scratch or timeout. Cleanup found no remaining owned descendant. Supervisor PID43624 explicitly released the advisory lock and exited 0, retaining the stable `/tmp/pardner-selfhost-heavy-tests.lock` file. No unrelated process or host setting changed.

[Allowlisted evidence](evidence/cursor-cloud-full-ui-diagnostic.json) contains the predeclared decisions, exact observer/driver source, command/counts, hashes, document/locator sequence and cleanup. Raw records remain private under `output/verification/cloud-full-ui-diagnostic-20261105/`. No pairing URL/fragment/code/token, headers, request body or arbitrary DOM is published. No screenshot or browser-trace attachment was needed for this passing capture.

The [original failed routine record](PARDNER-CURSOR-CLOUD-OFFLINE6000-QUALIFICATION.md), [isolated comparison](PARDNER-CURSOR-CLOUD-PAIRING-DIAGNOSTIC.md), and earlier startup failure remain unchanged. The source is unrepaired; final routine/full-gate qualification remains outstanding. Root owns any further investigation, repair and qualification scheduling. No merge, #104 handoff, live provider/credentials, paid/native work, production data/runtime change, human approval or issue closure occurred. This readiness investigation remains separate from the owner-deferred #107 startup profiling work.

Artifact-preservation limitation: the unchanged UI tests refresh shared screenshot paths under `output/playwright/` and `output/verification/cloud-ui/`. Their unpublished prior versions were not separately archived before this invocation. The original failure log, prior published reports/JSON, and all four committed historical Cloud screenshots were verified unchanged; this report does not claim preservation of the previous unpublished shared screenshot files.
