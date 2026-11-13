# STORY-116 walk report: Unknown outcome after a lost reply — look up, then retry or abandon

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-116/`.

**Setup.** Uses the fake T3 thread `thr_01JD8M4Q`. Two lost-reply cases were simulated in the fake T3:
- **(A) T3 accepted, then the reply was lost**: the fake's built-in `loseNextSendReply`.
- **(B, C, D) the request never reached T3**: a walker-side wrapper on the fake's request handler destroyed the connection for the next `t3_thread_send` without applying it. To Pardner this looks like a dropped connection mid-submission, which is what a Wi-Fi drop or T3 restart produces.

## Steps
- **Variation A, found automatically** (`screenshots/step-2-found-running.png`): the card went "Submitting" → "Running" with T3 run 8. Pardner's automatic reconcile found the request before an "Unknown outcome" state was ever visible to the 250 ms sampler. Confirmed (story step 2 / alternate path).
1. **Unknown outcome, B** (`screenshots/step-1-unknown.png`): amber "Unknown outcome", the reason box "Lost reply: T3 may have accepted this submission", and the session line "Dispatch held: Unknown outcome: context blocked until reconciled". Confirmed. The automatic reconcile had already run, so "Last lookup: No T3 record of this request; absence does not prove non-acceptance" was shown **before** Maya clicked anything. Geometry: clean.
   Clicking **Look for this request in T3** (`screenshots/step-1-lookup-click.png`) returns 200 `established:false`. The card looks the same as before the click (`screenshots/step-3-not-found.png`): the lookup line was already there and nothing shows that a new lookup just ran (no timestamp).
3. **Not found**: "Last lookup: No T3 record of this request; absence does not prove non-acceptance". Confirmed.
4–5. **Evidence, then Retry with the same request** (`screenshots/step-5-retry.png`, `screenshots/step-5-retried-running.png`): 200, the card goes to "Running" (T3 run 9) and T3 received the request once. The old "Last lookup: No T3 record…" line **stays on the now-running card**, contradicting its state. The freshness label "Not read from T3 yet" is in amber on a healthy run.
6. **Abandon, C**: with empty evidence, the native "Please fill out this field." appears (`screenshots/var-abandon-empty.png`). Confirmed. With evidence, the card shows "Ended: abandoned" with no verdict or artifact forms, and the session hold clears (`screenshots/step-6-abandoned.png`). Confirmed.
- **Edge: re-paired in the meantime, D** (`screenshots/edge-repaired.png`, `screenshots/edge-credential-changed.png`): with D in Unknown outcome, **Pair again** with a new fake code succeeds. The header shows no warning that this will strand D. The status line simply reads "valid · expires 12/9/2026". **Retry with the same request** then gives 409 `CREDENTIAL_CHANGED` "T3 deduplicates per credential, so retrying with another credential could run this twice". Confirmed. The message flashes off-screen (F-111-01), and **Retry stays on the card** even though it can only fail (`screenshots/edge-credential-changed-card.png`). **Abandon** works.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console: one 409 for the CREDENTIAL_CHANGED retry. There are no page errors.

## Flagged claim verdicts
None of the flagged claims touch STORY-116.

## Flow Log
- Ideal path: 2 (look up; if not found, retry with evidence). Actual: 2 (evidence and Retry), because the automatic lookup had already run. The manual **Look for this request in T3** click added nothing visible.
- Hesitation: Retry and Abandon are identical full-width grey buttons. Nothing says which is safer or what "same request" means. After a re-pair, Retry is still offered and fails.
- Stale information: "Last lookup: No T3 record…" stays on a run that is now established.

Status: pass
