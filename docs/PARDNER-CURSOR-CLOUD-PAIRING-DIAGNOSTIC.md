# PR105 bounded replacement-pairing investigation

**Outcome: inconclusive. The original routine failure remains unresolved; PR105 stays draft with `needs-qualification`.** One instrumented candidate run and one instrumented actual-main run passed the unchanged, isolated WebKit scenario. Neither pass clears the original failure. No repair, additional intervention, full verification or acceptance gate followed.

The newly authorized budget began November 5, 2026 at 05:40:42 UTC and ends at 06:10:42 UTC, including setup, cleanup and reporting. Experiments stopped after the initial pair because they did not establish a failure mechanism. This investigation is separate from the owner-deferred acknowledgement/startup profiling work in #107. No timeout or policy changed.

## Identity and preparation

- Published starting head: `4fe917545a1c009e4a941fd1379dc7cc5cc4876d`; executable source/policy commit: `1c35881afc35b7c3d163c651400955a71622a0f9`.
- Fetched actual main: `6d424e5114f51be2186ebb0e3ac2c553fc073d11`. No drift from either expected ref.
- Candidate source/test/lock/build fingerprint before and after: `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`.
- Main fingerprint before and after: `a531e2fd1853185a33de61d51bce88d0fcc4b8a4e7c875ef7141dce1038dd459`.
- Node 24.11.1 and actual pinned WebKit 26.5. Root/UI dependency locks and the original test file are byte-identical between arms; the baseline archive used the matching installed dependencies through symlinks. Each source built its own UI. No production data or service was used.

The [original failed routine report](PARDNER-CURSOR-CLOUD-OFFLINE6000-QUALIFICATION.md), [published evidence](evidence/cursor-cloud-offline6000.json), and private raw UI log remain unchanged. The raw log includes disposable pairing material and is not republished. Its digest is retained in the new evidence.

## Path reviewed and observations

`Workspace` in `ui-prototype/src/Pardner.jsx` listens for `hashchange`, reads the replacement fragment, immediately clears it with `history.replaceState`, and calls `pairDevice`. `createConnection.pair` posts the code and stores the returned credential. Token state then drives configuration, document/status reads, ticket acquisition and WebSocket startup. The saved label requires a connected socket, locally saved state, matching heads and no pending synchronization.

The external observer records only allowlisted state: fragment presence, credential presence, route path without query/fragment, HTTP status, socket events and recognized save-state text. It records no pairing code, credential value, headers, body, full URL or arbitrary DOM. Its complete source and driver are embedded in the [scoped evidence](evidence/cursor-cloud-pairing-diagnostic.json), with hashes and selected phase records.

In both arms the original sequence and assertions ran unchanged: aborted first pairing request, retry with the same code, unused code preserved for another device, credential rotation with Actor preservation, reload without duplicate pairing, forgetting credentials, expired-code rejection, then direct navigation with a fresh replacement fragment. The five-second final locator wait was not changed.

Both traces show the expired request returning HTTP 400, then a same-document `hashchange` consuming the fresh fragment. The fresh request returned 200; credential presence became true; configuration/document/status/ticket requests succeeded; the socket opened and supplied saved state; the expected label rendered. Both retained all five expected pairing attempts and no page errors, as asserted by the original test.

The baseline additionally recorded a later navigation into a new document after its first saved-state render. That document validated the existing credential and connected successfully without another pairing POST. This is an observed transition worth distinguishing in a future failure capture, not evidence of the original timeout's cause or a demonstrated pre-existing defect.

## Every executed arm

Both UI builds passed. Candidate and main each ran exactly:

```sh
node --import <external-trace.mjs> --test \
  --test-name-pattern '^recovers pairing after network failure, credential rotation, and replacement links in webkit$' \
  test/pardner-connection-ui.test.js
```

Each arm reported **1 test passed, 0 failed, 0 skipped, 0 cancelled**. Candidate test duration was 3,093.143 ms; main was 3,467.893 ms. These durations cover the entire instrumented scenario, not the five-second final readiness observation. Build plus comparison commands completed in 11.447 seconds. Each command used the normal 900-second watchdog. The name filter intentionally isolates the single authorized scenario; it does not establish the rest of the UI suite.

No third arm or controlled intervention was justified by these results. No implementation or test source changed. No fresh full verification or 20-seed qualification ran.

## Limits and next falsifiable question

The observer wraps fetch, history, storage and WebSocket operations and adds a MutationObserver. Playwright bindings and synchronous Node trace writes also add work to the process hosting the test service. These can affect event/microtask ordering and scheduling. The traces are diagnostic observations, not uninstrumented performance qualification. Driver timestamps indicate delivery; browser timestamps must be interpreted within their recorded document identity.

The original failed wait has no phase trace or DOM snapshot. These isolated arms omit the original concurrent UI-suite conditions. The observer did not capture Playwright `goto` invocation/resolution or locator navigation-wait internals. One passing sample per condition cannot establish failure rates, that Cloud is unrelated, a test defect or a pre-existing failure.

The next falsifiable question is: during a failing readiness wait, is the saved DOM already present while a replacement document navigation remains pending, or has the pairing/credential/read/socket chain not completed? Capturing navigation completion alongside phase/render state in the original failing scope would distinguish those possibilities before selecting a repair. That further work is not performed or assumed authorized by this report.

## Cleanup and disposition

The single nonblocking acquisition used supervisor PID16885 and the stable `/tmp/pardner-selfhost-heavy-tests.lock`. All four watchdogs ended naturally with no surviving children, new scratch or timeout. Cleanup verified both fingerprints, found no remaining owned descendant, and removed only the exact owned main archive. The supervisor explicitly released the lock and exited 0; the stable file remains. No unrelated process, host setting or live runtime changed.

This publication adds documentation/evidence only. Existing manual classification of four historical evidence PNGs remains unchanged; no planner rewrite or new image files. The new JSON contains allowlisted observations and script source, with raw logs/traces retained privately. Root retains the next investigation/qualification decision, exact-head review, merge and downstream scheduling. No #104 handoff, merge, live credentials/provider call, paid/native session, deployment, production schema/data change, human approval or issue closure occurred.
