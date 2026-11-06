# Onboarding implementation verification

This report accompanies the local client, invitation and presence implementation
for [issue #109](https://github.com/depatchedmode/pardner/issues/109). It records
routine evidence, not milestone acceptance or a merge recommendation.

## Candidate

- Verified implementation: `874e7f37b03fb8a71683a7231d7ab6d4ab09e006`.
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

## Documentation-only PR preparation

The retrospective, attributed source records and this report were added after
the verified implementation. The planner classifies that delta as guidance only,
with no unknown paths or warnings. Local Markdown links and JSON parsing passed;
the publication files contain none of the task's known private credential values.
The source/test/built-UI fingerprint remains exactly the value recorded above.
No runtime test result is claimed for a different executable candidate.
