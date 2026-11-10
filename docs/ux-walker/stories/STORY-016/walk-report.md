# STORY-016: Pasting the wrong kind of invitation on the Link this device page

Walked 2026-11-09 in Chromium 1440×900. Rosa's hub (`--public-url http://127.0.0.1:47818`) owns "Q4 Pricing Experiments" and issued Human, Agent and My device invitations via `client invite`. Daniel's fresh client is Git-prefilled "Daniel Kim"; a second fresh client was used for the cross-person variation. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-016/`. All invitation text is masked in screenshots.

## Steps

1. **Into the link page.** On **Welcome to Pardner**, Daniel first edits Name to "Daniel K." (to test Back), then clicks **Link this device instead** and reaches **Link this device**.
2. **Human invitation pasted → refused.** Pasting Rosa's whole Human setup prompt and clicking **Link device** shows "This is a Human invitation. Confirm your identity first, then join with it." plus the hint "Linking this device needs a My device invitation from your own client. Human and Agent invitations work after you confirm your identity." (`screenshots/step-2-human-refused.png`). No `/join` request was sent (request log empty across all refusals). The textarea keeps the pasted text. Geometry: clean. The hint repeats the headline's instruction in different words.
3. **Back to confirming my identity.** The Name field still shows the edited "Daniel K.", so the story's claim that edits are lost is **not** reproduced (`screenshots/step-3-back.png`). Returning to the link page shows an empty textarea: Back discards the pasted text.
4. **Continue as Daniel Kim** → **Welcome, Daniel Kim** (`screenshots/step-4-welcome.png`).
5. **Join a project.** The form shows Invitation and the hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you." (`screenshots/step-5a-join-form.png`). Pasting the same Human invitation → **Joining…** → the board for "Q4 Pricing Experiments" (`screenshots/step-5-board.png`). This proves the refused Human invitation stayed usable. Clicking **You** as soon as it rendered opened the profile dialog immediately. Geometry: task-card false positive only.

The board header shows two identical "SA" avatars, Rosa's and Daniel's agents both called "Setup agent", told apart only by hovering or opening them.

Variations:
- **Agent invitation** → "Agent invitations are for your agent, not this browser." plus the same hint (`screenshots/var-agent-refused.png`).
- **No invitation line / truncated line / two invitation lines** → "Paste one complete My device invitation." each time (`screenshots/var-no-invite-text.png`, `var-truncated.png`, `var-two-invites.png`). For a *Human* line that was truncated, the advice to paste a "My device invitation" is still the wrong advice for Daniel.
- **Rosa's My device invitation on another fresh computer of Daniel's** (Git-prefilled "Daniel Kim"): accepted with no confirmation. The board opens as **You: Rosa Alvarez**, and `/session` identity is Rosa's (`name:"Rosa Alvarez", email:"rosa@q4labs.io"`, Rosa's identity id) (`screenshots/var-became-rosa.png`). Nothing before or after linking shows whose identity the invitation carried, and the prefilled "Daniel Kim" is silently discarded.

Mobile 390×844 (board, `mobile-check.png`): no page overflow.

Console errors: none.

## Flagged claim verdicts

- **#12 A My device invitation from another person passes the Link-page check and adopts the sponsor's identity; nothing shows whose identity an invitation carries — CONFIRMED.** Daniel's computer became "Rosa Alvarez" with full board access as Rosa (`screenshots/var-became-rosa.png`).

## Flow Log

- Ideal 3 (Continue, Join a project, paste/Join). Actual: 3 wasted actions (Link this device instead, paste, Link device), then Back, Continue, Join a project, paste, Join project, for 9 actions in total.
- Re-entry: the invitation had to be pasted twice, because Back clears the link textarea.
- The refusal message is good: specific, immediate, no network call, and the invitation stays usable. But the page doesn't offer a direct "Confirm identity and join with this invitation" action carrying the pasted text forward, so the person retypes.
- Duplicated copy: the error headline and the hint restate the same rule.

Status: fail
