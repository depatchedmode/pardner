# Onboarding implementation verification

This report accompanies the local client, invitation and presence implementation
for [issue #109](https://github.com/depatchedmode/pardner/issues/109). It records
routine evidence, not milestone acceptance or a merge recommendation.

## Candidate

- Verified implementation: `874e7f37b03fb8a71683a7231d7ab6d4ab09e006` for the sections below through “Documentation-only PR preparation”; see “Interrogation repairs” for the current candidate `ddd65331`.
- Comparison base: `4a7ae50e4a1a114c242c1f34936ee3979a7c4f40` (`main`).
- Node: `24.11.1`; Playwright: `1.62.1`, with its pinned Chromium and WebKit.
- Source/test/dependency-lock/built-UI fingerprint:
  `7ec19f6802477a60bbe83a061b08491b0462a7f814f7513ed09a9434a1c0fd75`.
- Final verification completed on 2026-11-06 UTC.

Full test discovery ran in a private checkout of the exact implementation commit
because the retained coordination runtime under `output/` contains historical
test files. Dependency installs were linked only after checking both lockfiles.
Source and verification-copy fingerprints matched before and after the run.
The PR preparation adds documentation only; it does not change that executable
candidate. Final documentation checks are recorded separately.

## Results

| Check | Observed result |
| --- | --- |
| `npm run verify` on the final implementation | Built UI, 17 Python tests, 602 Node tests and one complete acceptance scenario passed; zero failed, cancelled or skipped Node tests |
| `npm run test:verification` | 39 passed |
| `npm run test:runtime` | 120 passed |
| `npm run test:qualification` (routine regression) | 12 passed |
| `npm run test:cli` | 12 passed |
| `npm run test:ui` | 24 passed |
| New client browser suite | 8 passed: six unit cases and complete real-service journeys in Chromium and WebKit |
| Post-repair client/service/browser/recovery exercise | 21 passed |

The final full run includes the latest versions of all constituent tests above.
The control-runtime build/Python check also runs within `npm run verify`.

An intermediate full run timed out in the browser WebSocket admission test.
A deterministic reproduction sent the initial document in the same network
packet as the upstream upgrade and failed with “Initial upstream document was
lost.” The proxy had attached forwarding after an awaited open continuation.
Binding forwarding synchronously in the open handler fixed the race. The
reproduction and real browser/service journeys then passed, followed by the
complete final verification. The failed attempts remain in private diagnostics;
they were not relabeled as successful runs.

## What the evidence establishes

Two independent local client services exercised private browser opening,
bootstrap replay denial, Git-derived profiles, project creation, human/device/
agent invitations, recipient-bound retry recovery, Actor-bound operations,
revocation, per-harness enrollment and scoped delivery/presence access. A second
harness joins an existing client without replacing its original runtime or
revoking the human when that agent is revoked.

Recovery coverage stops the authority, reopens an enrolled client, saves work
offline, restarts again and reconnects to convergence. It distinguishes the
local persistence barrier from hub acknowledgement. Existing conflict and
delivery behavior remains covered by the full suite.

Both browser engines use actual local services without mocked APIs. They cover
start/join, hidden invitation text, another client's saved edits, drafts across
reload and project switches, keyboard focus, task focus and reported models.
Chromium also checks clipboard copying; WebKit uses explicit reveal/hide because
it lacks the same clipboard permissions. Missing backend/browser prerequisites
fail the suite rather than skip it. Separate invitation and recovery tests
exercise the short setup prompt's real redemption.

Nine images were inspected at desktop CSS widths 1440 and 1246 and mobile width
390. They show identity, start/join, invitation choices, task focus, an Actor
profile, hidden invitation text, mobile layouts and project switching. The
original PNGs and interactive gallery remain in the delivered local evidence
folder, `output/verification/onboarding-flow/`; no credential-bearing runtime
files or browser traces are committed. Screenshot actors and their reported
agent sessions are explicit fixtures, separate from the real collaborating
agents who developed this change.

## Qualification

**Qualification required, not run.**

| Tier | Commands or obligation |
| --- | --- |
| Routine | Affected `test:verification`, `test:qualification`, `test:runtime`, `test:cli`, `test:ui`, `test:control-runtime`; focused client/presence/invitation exercises; `npm run verify` |
| Deliberate | `npm run test:acceptance -- --repeat 20 --seed 1` on the final candidate |

The `test:qualification` script is routine regression coverage. It does not
replace the deliberate 20-seed gate. Follow the
[qualification procedure](../../.agents/skills/verify/references/qualification.md)
when that work is requested. The PR carries `needs-qualification` and remains a
draft while this obligation is open.

Semantic review found qualification obligations in stable operation/retry
identity, persisted client/enrollment recovery, Actor-bound delivery access and
new transport/admission boundaries. Existing merge, authored alternative,
resolution and edit/delete semantics were not changed. No mapped lifecycle
implementation file changed. The added UI test inclusion strengthens coverage;
it removes no check, assertion or qualification command.

Also outstanding: a real public route for the **new** client and a real-agent
rehearsal of this onboarding flow. Alpha's successful cloud participation used
the earlier coordination runtime and is not evidence of the new client's public
route. The public HTTPS option was tested as configuration, not over the
Internet. Neither process-restart tests nor screenshots establish power-loss
durability. Human acceptance remains separate.

See the [multi-agent retrospective](../PARDNER-ONBOARDING-RETROSPECTIVE.md) for
contributor experience, attribution and follow-up work.

## Interrogation repairs (2026-11-06)

An adversarial multi-model review of the PR found five merge-blocking defects
and several hardening items. The repairs landed as six commits on top of the
retrospective and were rebased onto the concurrent recovery, reporting and
shutdown commits (through `e591b7b8`). The final executable candidate is the
last code commit `ddd65331`; later commits are documentation only. The
acceptance runner's candidate identity (source, tests, lockfiles and built UI)
for it is `ee4fb01330582b4cdf356b9cce74801cf7dea710c0c601c9dea1bc44d70a622d`.

| Repair | Evidence |
| --- | --- |
| Invitation bound to its recipient only after validation, in the admission transaction; revocation during enrollment wins; WebSocket upgrade authenticates before waking a runtime | `client-onboarding`: rejected enrollment leaves the invitation unbound and usable; revoke-during-redeem returns `REVOKED` with no active admission; anonymous upgrade cannot replace a dead runtime |
| Hub failures classified: network errors, gateway error pages, non-JSON bodies and hub 5xx are outages; only `AUTH_REQUIRED`/`REVOKED` revoke; service-side codes are 5xx; child errors carry string codes | `client-onboarding`: HTML 502 and `SERVICE_STOPPING` 503 keep local saves and board loads working; `AUTH_REQUIRED` still revokes |
| Draft rebase keeps a collaborator's newer field for untouched fields and remounts the form | `client-onboarding-ui` (Chromium and WebKit): rebase then save; hub document keeps the collaborator's title |
| Identity step links a device with a My device invitation; Human/Agent invitations refused there before any request | `client-onboarding-ui` (both engines): refused Human paste leaves the invitation unbound; device link adopts the sponsor identity |
| Upstream socket tracked from creation and torn down on abandoned or aborted handshakes; start-failure backoff; enrollment metadata normalised | `client-onboarding`: invalid `Sec-WebSocket-Key` handshake leaves zero tracked sockets; second request inside the backoff does not fork; non-text agent metadata is refused with the invitation unbound |

Routine results for `ddd65331` under Node 24.11.1 with pinned Chromium and WebKit:

| Check | Observed result |
| --- | --- |
| `npm run verify` | Built UI, 17 Python tests, 617 Node tests and one complete acceptance scenario passed on the rebased candidate; zero failed, cancelled or skipped Node tests. The pre-rebase repairs alone had passed the same run with 611 tests |
| `test/client-onboarding.test.js` | 19 passed (12 prior, 7 new), three consecutive clean runs |
| `test/client-onboarding-ui.test.js` | 10 passed: six unit cases, the two-client journey and the device-linking journey in Chromium and WebKit |
| `npm run test:cli` | 15 passed (now includes `client-cli`) |
| `npm run test:verification` | 16 passed (verify-plan) |
| Verification plan | No unclassified paths; three additive-test-inclusion review items answered in the run report |

The client, presence and invitation suites now run in `npm run test:runtime` and
`npm run test:cli` as well as full discovery. During this work the onboarding
suite stalled twice without reporting a timeout while another verification run
from a separate checkout was exercising the same machine; the stall did not
reproduce in three consecutive isolated runs or in the full `verify`, and a
handler/fetch detector attached to `verify` reported nothing. It is recorded as
unexplained environment interference, not as evidence about the candidate.

### Deliberate qualification: attempted three times, not satisfied

`npm run test:acceptance -- --repeat 20 --seed 1` was run twice against the
pre-rebase candidate `2c160242ae8d…` (commit `b931f093`, the same repairs before
they were rebased onto the concurrent commits) and once against the current
candidate `ee4fb0133058…` (commit `ddd65331`). All three attempts failed a timing
bound while this shared machine was running other sessions' test suites, builds
and a vitest process at several cores; 1-minute load averages were 44 at the
first failure, above 130 at the second and 41 at the third, after dipping to 9
when the third attempt started. The acceptance scenario imports none of the
changed client modules.

| Attempt | Outcome | Reports |
| --- | --- | --- |
| 1 | seed 1 passed; seed 2 failed `Local acknowledgement took 54733 ms` (bound 2500 ms) | `output/acceptance/2026-11-06T07-59-26.552Z` |
| 2 | seeds 1–4 passed; seed 5 failed `Offline restart took 8086 ms` (bound 6000 ms) | `output/acceptance/2026-11-06T08-04-26.036Z` |
| 3 (current candidate) | seeds 1–4 passed; seed 5 failed `Local UI visibility took 2600 ms` (bound 2500 ms) | `output/acceptance/2026-11-06T08-25-25.595Z` |

Measured maxima from the passed seed reports of attempts 1 and 2, not thresholds: attempt 1 (agent-effect-ack 0.17 s, convergence 3.04 s, local-ack 0.26 s, local-ui-visible 0.06 s, offline-start 2.02 s);
attempt 2 (agent-effect-ack 0.17 s, convergence 3.14 s, local-ack 0.37 s, local-ui-visible 0.07 s, offline-start 2.67 s). Seeds were not combined across attempts and no seed was
skipped. **Qualification remains required and open**: rerun the complete gate on
an otherwise idle machine against the current candidate `ee4fb0133058…`, then
record the result here. The PR stays a draft with `needs-qualification` until that run succeeds,
and the public-route and real-agent rehearsal obligations below also remain.


## Documentation-only PR preparation

The retrospective, attributed source records and this report were added after
the verified implementation. The planner classifies that delta as guidance only,
with no unknown paths or warnings. Local Markdown links and JSON parsing passed;
the publication files contain none of the task's known private credential values.
The source/test/built-UI fingerprint remains exactly the value recorded above.
No runtime test result is claimed for a different executable candidate.
