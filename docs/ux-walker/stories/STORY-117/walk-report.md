# STORY-117 walk report: Unqualified T3 version holds every thread

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-117/`.

**Setup.** The fake T3's reported `serverVersion` was changed from 0.1.6 to 0.1.7, which simulates Maya updating T3. One thread (`thr_01JD8M4Q`) is mapped. A second mapped thread needs a second agent Actor. The only other agent on this client (Cora, enrolled through an Agent invitation) was kept unmapped for STORY-121, because a mapping cannot be removed (F-112-05).

## Steps
1. **Open Control** (`screenshots/step-1-status.png`): the status line reads "T3 credential: valid · expires 12/9/2026 · T3 0.1.7 · qualified 0.1.5, 0.1.6. …". The session shows "Dispatch held: T3 0.1.7 is not qualified (qualified: 0.1.5, 0.1.6); requalify it before dispatch". Confirmed. A newly queued follow-up stays "Queued in Pardner", **in green**, while it is blocked. Neither the status line nor the hold says how to "requalify" (`screenshots/step-1-hold-form.png`). Geometry: clean.
2. **Release without the checkbox**, with the evidence "Read the T3 0.1.7 changelog; MCP thread tools unchanged.": 409 `VERSION_ACCEPTANCE_REQUIRED` "Accepting T3 0.1.7 is a separate decision; release with acceptVersion after requalifying it" (`screenshots/step-2-no-accept.png`). Confirmed. The message names the API field `acceptVersion` rather than the on-screen checkbox, and, like other errors, it appears off-screen and briefly (F-111-01).
3. **Tick "Accept this T3 version for this controller"** (`screenshots/step-3-checked.png`): the checkbox is shown only while a version hold exists. Confirmed. It sits between Reviewed runs and the button, at the default 13 px size. Release returns 200, the hold clears and the queued follow-up becomes "Running" (T3 run 10) (`screenshots/step-3-dispatched.png`). Confirmed.
4. **Other mapped threads**: **BLOCKED**. Only one thread could be mapped without using up the agent needed for STORY-121.
- **Edge (flag #49)** (`screenshots/edge-status-after-accept.png`): after acceptance the status line still reads "T3 0.1.7 · qualified 0.1.5, 0.1.6." There is no sign anywhere that 0.1.7 is now accepted.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console: one 409 for the deliberate release without acceptance. There are no page errors.

## Flagged claim verdicts
- **#49 "After accepting T3 0.1.7 the status line still says 'qualified 0.1.5, 0.1.6'" — CONFIRMED.** The status line is unchanged after a successful release with acceptance, and no other surface lists accepted versions.

## Flow Log
- Ideal path: 3 (evidence, tick, release). Actual: 4. The first release fails because the checkbox is easy to miss, and the error refers to `acceptVersion` instead of the checkbox.
- Hesitation: "requalify it before dispatch" suggests an external process that the UI never explains. The checkbox is the actual mechanism.
- Duplicated information: the hold text appears as the "Dispatch held" notice and again as a bullet.

Status: pass
