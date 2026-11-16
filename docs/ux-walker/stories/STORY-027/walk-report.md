# STORY-027: Join errors: expired, used, revoked, and pasted wrong

Setup: hub client "Tom Becker" served with `--http-port 52101 --public-url http://127.0.0.1:52101`, project "Mobile onboarding v3". Raj's client redeemed one Human invitation first. Hannah's client (`--harness openai-codex --name Cobalt`) had a confirmed identity and no project, so the walk used the Welcome page's **Join a project** (same JoinForm). Invitation text was masked (transparent) in every screenshot. Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-027/`.

## Steps
0. **Join form.** `screenshots/step-0-join-form.png`: Invitation textarea, hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you.", **Join project**. Geometry clean.
1. **Expired invitation.** BLOCKED: invitations last 24 h and there is no way to move the hub's clock here without editing its live database.
2. **Used invitation (Raj had redeemed it).** `screenshots/step-2-used.png`: red box "Invitation belongs to a different recipient" / "This invitation was already used by someone else. Ask for a new one." pending-join absent afterwards. Geometry clean. Matches catalog; wording contradiction logged (F-027-01).
3. **Revoked invitation (revoked by Tom).** `screenshots/step-3-revoked.png`: "Invitation revoked" / "This invitation or membership was revoked. Ask for a new invitation." pending-join absent. Geometry clean. Matches.
4. **Half the envelope line.** `screenshots/step-4-half.png`: "Invalid invitation" / "Check that you pasted the whole invitation, exactly as it was sent." Geometry clean. Matches (catalog listed "Invalid invitation" as one possible message).
5. **Valid invitation.** `screenshots/step-5-joining.png` then `screenshots/step-5-joined.png`: board "Mobile onboarding v3", switcher "Project: Mobile onboarding v3. Switch project", "Saved locally · synced". Geometry clean. Two indistinguishable "Setup agent" agents (F-027-05).
- **Variation: Tom's My device invitation.** `screenshots/var-device-invite.png`: "Destination already belongs to another identity" plus the IDENTITY_MISMATCH hint about My device vs Human. Matches catalog; jargon noted (F-027-03).
- **Variation: Tom's Agent invitation.** `screenshots/var-agent-invite.png`: identical message to the device case. The hint never mentions Agent invitations (F-027-03).
- **Variation: Hannah's OWN Agent invitation pasted into Join project** (from the switcher's Start or join). `screenshots/var-own-agent-invite.png`: no error and no message; she is returned to the same board. The invitation is now "redeemed", actor count unchanged (6). F-027-02.
- **Edge: two invitations in one paste.** `screenshots/edge-two-invites.png`: "Paste one complete Pardner invitation" + truncation hint (F-027-04).
- Console: only the 4xx resource errors from the deliberate refusals. Video: `videos/join-errors.webm`.

## Flagged claim verdicts
- **#13 (Welcome Join form has no purpose check; what the server does with your own Agent invitation):** CONFIRMED that the form has no purpose check: Tom's My device and Agent invitations are both submitted and refused only by the hub with IDENTITY_MISMATCH. For her own Agent invitation, the server accepts it silently, marks it redeemed and adds no new Actor (same harness ID re-maps to Cobalt); the browser shows nothing.

## Flow Log
- Ideal path 3 (open Join, paste, submit). Actual with the valid invitation: 3. Each refusal cost one more paste plus an out-of-band request for a new invitation; the messages did say "ask for a new one" in each case, so no dead end.
- Hesitation: "belongs to a different recipient" for a used invitation; "Destination already belongs to another identity" for wrong-purpose invitations.
- No data re-entry beyond the invitation itself.

Status: pass
