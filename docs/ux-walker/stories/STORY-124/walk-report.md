# STORY-124 walk report: Grant refused for a second harness, then enroll it through an Agent invitation

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-124/` (redacted CLI transcript `cli.log`, video of the browser invitation flow in `videos/`). Same client as STORY-123 ("Ledgerline Billing", setup agent `openai-codex`). Invite text was captured from the clipboard into a private scratch file and is blurred in screenshots.

## Steps
1. **`client agent-grant --harness anthropic-claude-code`** → exit 1, `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`. No file written. Matches.
2. **Invite ▾** (`screenshots/step-2-invite-menu.png`): menu "Human / A person and their agent", "Agent / Another agent of yours", "My device / Another computer you use". Geometry clean. **Agent** (`screenshots/step-2-agent-dialog.png`): dialog "Connect another of your agents", "Ledgerline Billing", "For an agent you already run in another app. It joins as your agent; Pardner doesn't start or instruct it.", **Create invitation**, history "None yet." Geometry clean.
3. **Create invitation** → state line "Waiting to be used · Expires in 24 h · Nov 10, 11:39 AM", **Copy invite**, **Show invite text**, **Revoke**, "The invitation stays hidden so it can't be read from a shared screen." Matches.
4. **Copy invite** (`screenshots/step-4-copied.png`) → "Copied. Treat it like a password and send it privately; it works once." The copied prompt begins "Join project "Ledgerline Billing" as my agent using your actual harness and model… this invitation does not grant human browser access" and gives the `client join --data CLIENT_DIR …` line. Geometry clean. (My first scripted attempt also created an invitation, so the history showed two identical "Agent · Waiting to be used" rows that cannot be told apart; F-124-03.)
5. **CLI alternative** `client invite --purpose agent --output-file … --operation-id inv-claude-1` → exit 0, `{invite:{id,purpose:"agent",projectName,expiresAt,state:"issued"}, invitationFile}`. Matches.
6. **`client join --invitation-file … --operation-id join-claude-1 --harness anthropic-claude-code --name Gamma --model claude-opus-5-5 --managed-by T3`** → exit 0, `{project:{id,…,actorId:"actor-6fe8…"}}`. The result's `actorId` is Priya's human Actor; nothing in the output names the new agent Actor (F-124-04).
7. **Browser** (`screenshots/step-7-avatars.png`, `screenshots/step-7-gamma-profile.png`): the avatar stack gains "G" with a bot glyph, aria "Gamma, agent, offline". Profile: "Agent · Priya Raman's agent · Offline", Harness "Claude Code", Devices "filament.local". The Invite → Agent history (`screenshots/step-7-invite-history.png`) shows one row "Agent · Used" with no who/when (F-124-03). Geometry clean on all three.
8. **Grant again** → exit 0, `actorId:"actor-63ca…"`. File has `harnessId:"anthropic-claude-code", model:"claude-opus-5-5", managedBy:"T3"`. Matches.
9. **`--token-file claude.json tasks --json`** → both tasks and `status`. Matches.

### Variations and edge cases
- Join retried with the same `--operation-id` and file → success replay. Matches.
- Same `--operation-id`, different invitation file → `OPERATION_ID_REUSED: Operation ID belongs to different input`. Matches.
- Already-used invitation with a new operation ID → `INVITE_USED: Invitation belongs to a different recipient`. The code is right but the message is confusing: the same person and harness redeemed it (F-124-02).
- **Own Agent invitation pasted into the browser's Join a project** (switcher → **Start or join a project…** → **Join a project**; `screenshots/variation-join-pasted.png`, `screenshots/variation-join-result.png`): no client-side refusal. **Join project** returned straight to the existing Ledgerline board with no message. Server side the invitation became `redeemed`, and no new Actor appeared: the actor list stayed Priya, Setup agent (Codex) and Gamma, so it re-enrolled the setup agent and silently used up the invitation (F-124-01). Geometry clean.
- Not walked: `INVITE_EXPIRED` (needs 24 h), `REGISTRATION_PENDING`, the `--harness cursor` variation, and joining from another machine (covered in STORY-125).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the Agent dialog fits; history rows reflow with the state right-aligned. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#13 The Welcome/Start Join a project form has no purpose check, so an Agent invitation is not refused there — CONFIRMED.** The browser sent my own Agent invitation, the server accepted it (`state:"redeemed"`), the page returned to the board without any message, and no new Actor was created. STORY-124's original claim that it is refused is wrong.

## Flow Log
- Ideal 4 (create invitation, join, grant, use). Actual 5 in the CLI path: the first grant fails, which is how she learns she needs an invitation. The error names "Agent invitation", which matches the menu label, so recovery is direct.
- Hesitation: neither the join output nor the browser shows the new agent's Actor ID. The agent learns it only from the second grant.
- Re-entry: the invitation round trip asks her to copy a secret out of her own browser into her own CLI on the same computer to enrol a harness she already owns.
- Duplicated information: invitation creation exists in both the dialog and `client invite`. Used/expired state is visible only in the dialog, whose rows carry no creator, recipient or time.

Status: pass
