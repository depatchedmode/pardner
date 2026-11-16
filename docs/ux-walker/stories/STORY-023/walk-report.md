# STORY-023: End-to-end: a new teammate's first day across two computers

Walked 2026-11-09 in Chromium 1440×900. Clients:
- Ben's hub (`--public-url http://127.0.0.1:47821`, project "Atlas Search Relevance");
- Sofia's work laptop "sofia-work" (Git: Sofia Marchetti / sofia@atlas-search.com);
- Sofia's home desktop "sofia-home" (Git: Sofia Marchetti / sofia.m@fastmail.com).

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-023/`. Invitation text is masked.

## Steps

1. **Ben: Invite → Human.** The dialog **Invite a person** says "For someone joining with their own identity. Their agent sets up their own board connected to this project." (`screenshots/step-1a-invite-person.png`). **Create invitation** → **Copy invite** (`screenshots/step-1b-copied.png`). Geometry: task-card false positive only.
2. **Laptop identity step.** Prefilled "Sofia Marchetti" / "sofia@atlas-search.com", "This device: sofia-work" (`screenshots/step-2-laptop-identity.png`).
3. **Continue** → **Welcome, Sofia Marchetti** (`screenshots/step-3-welcome.png`).
4. **Join a project → paste → Join project** → the board "Atlas Search Relevance" with **You: Sofia Marchetti** and Ben's "BC" avatar in the stack (`screenshots/step-4-laptop-board.png`). Clicking **You** the moment it rendered opened the profile immediately (`screenshots/step-4b-you-immediately.png`). The stack again shows two identical "SA" agents. Geometry: false positive only.
5. **Desktop identity step.** Prefilled with the *personal* email "sofia.m@fastmail.com" (`screenshots/step-5-desktop-identity-personal-email.png`). She clicks **Link this device instead**.
6. **Laptop: Invite → My device → Create invitation → Copy invite** (`screenshots/step-6-laptop-device-invite.png`). It succeeded while Ben's hub was up.
7. **Edge: hub down.** With Ben's hub stopped, Create invitation on the laptop → "Project authority unavailable; retry this attempt / The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." Meanwhile:
   - the history section stays on "Loading…" indefinitely;
   - the board header keeps reading **Saved locally · synced**, still after 25 s, while `client status` reports `hubConnected:false` and `syncError:"Could not reach sync server: fetch failed"`;
   - the only outage cue is the small "Remote presence unavailable" next to the avatars.

   (`screenshots/edge-hub-down-create-device-invite.png`, `screenshots/edge-hub-down-header-after-25s.png`). The message never says that Ben's computer is the hub or that Sofia needs Ben's computer online.
8. **Desktop: paste → Link device** → the board opens (`screenshots/step-8-desktop-board.png`). The desktop identity is now `sofia@atlas-search.com`, and the Git-prefilled personal email was discarded with no notice or preview of which identity was being adopted.
9. **Desktop profile.** **Sofia Marchetti (you)**, Git email "sofia@atlas-search.com", Devices "sofia-work", "sofia-home" (`screenshots/step-9-desktop-profile.png`).
10. **Ben's view.** Ben opens Sofia's avatar and sees the same profile: "Human · Active", both devices (`screenshots/step-10-ben-sees-sofia.png`).

Mobile 390×844 (desktop board, `mobile-check.png`): no page overflow.

Console: 503s during the deliberate hub outage only; no page errors.

Tooling note: the first `client stop` of Ben's hub exited with a Node error (its output was lost to a `tail`) and left the hub running; an immediate retry stopped it cleanly. It was not reproduced, so no finding is logged.

## Flagged claim verdicts

- **#12 A My device invitation from another person adopts the sponsor's identity; nothing shows whose identity it carries — CONFIRMED** (walked in STORY-016 with the same mechanism: Daniel's computer became "Rosa Alvarez"). In this story the identity preview is also missing on the legitimate path: the Link page never shows "you will appear as Sofia Marchetti, sofia@atlas-search.com" before replacing the Git-prefilled personal email.
- **#46 (You button silent no-op before your Actor syncs) — REFUTED here.** It was clicked immediately after a fresh Human join (step 4) and the dialog opened.

## Flow Log

- Ideal 9; actual 9 on the happy path (Ben 2, laptop 3, laptop invite 2, desktop 2), plus one context switch, because Sofia had to go back to the laptop to create the device invitation after already reaching the desktop's Link page. The desktop's Link page doesn't tell her in advance where the invitation comes from.
- The hesitation predicted at step 5 is real: the desktop prefill differs from her work identity, and nothing on the identity step indicates that linking will replace it.
- Hub dependency: creating a My device invitation on a replica needs the original hub online; during an outage the board still says "synced".

Status: pass
