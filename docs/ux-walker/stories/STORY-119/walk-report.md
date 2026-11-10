# STORY-119 walk report: Credential expiring — pair again

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-119/`.

**Setup.** Two credential problems were produced with the fake T3:
- **Expiring**: a walker wrapper made the fake's token endpoint issue a credential with `expires_in` = 2 days instead of 30. That is a legitimate T3 response, and it lands inside Pardner's 3-day warning window. The client was re-paired with it through the UI.
- **Rejected**: the fake's `revoked` flag was set, so every MCP call returns 401, as T3 does after revoking a credential.

Both conditions were then removed and the client was re-paired normally. The T3 version is still 0.1.7 from STORY-117.

## Steps
1. **Open Control while the credential is expiring** (`screenshots/step-1-expiring.png`): the status line reads "T3 credential: expiring · expires 11/11/2026 · T3 0.1.7 · …". The amber notice reads "Pair T3 again before the credential stops working. Requests that may already be in T3 cannot be retried with a new credential." Confirmed. **Control settings** is collapsed because a session exists. Confirmed. The notice contains **no link or button**, and the collapsed "▸ Control settings" summary below it gives no hint that the fix is inside.
2. **Credential rejected (401)** (`screenshots/step-2-refused-top.png`, `screenshots/step-2-session-failed.png`): the status line reads "T3 credential: rejected · expires 11/11/2026 · …". The session shows "Stale: last read 6s ago (12:00:55 PM)" in amber and a red box "Last T3 pass failed: T3 credential is rejected; pair again to continue". Confirmed, with slightly different wording from the story's "T3 refused the credential (401)". **The header notice keeps the expiring copy, "Pair T3 again before the credential stops working"**, after the credential has already stopped working. "rejected · expires 11/11/2026" also puts a future expiry date next to a dead credential. Geometry: clean.
3. **Expand settings, enter a new code, Pair again** (`screenshots/step-3-settings-expanded.png`, `screenshots/step-3-pair-again.png`, `screenshots/step-3-valid.png`): 200. The status returns to "valid · expires 12/9/2026", the notice disappears and the session failure clears on the next pass. Confirmed. The "Last T3 pass failed" box stayed for one poll after the successful pairing.
- **Edge: in-flight work under the old credential**: this was exercised in STORY-116 (CREDENTIAL_CHANGED; see F-116-01).
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console/page errors: none.

## Flagged claim verdicts
- **#51 "The credential-expiry warning has no link to the collapsed Control settings that holds the fix" — CONFIRMED.** The notice contains 0 links or buttons, and Control settings stays collapsed. Maya has to know to expand it and scroll to the T3 credential form.

## Flow Log
- Ideal path: 3 (open settings, enter code, Pair again). Actual: 3, plus the discovery cost of working out that the fix is inside the collapsed "Control settings" disclosure.
- Hesitation: in the rejected state, the notice's "before the credential stops working" contradicts the red "credential is rejected" box below it.
- Duplicated information: the credential state appears in the status line, the header notice and each session's failure box.

Status: pass
