# STORY-017: Linking a second project on an already-linked laptop

Walked 2026-11-09 in Chromium 1440×900, continuing from STORY-015: the desktop "priya-studio" (hub) and the laptop "priya-air", already linked to "Checkout Revamp". A second project "Infra On-call" was created on the desktop. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-017/`. Invitation text is masked.

## Steps

1. **Desktop switcher.** It lists "Checkout Revamp · Saved locally · synced", "Infra On-call · Saved locally · synced", "Start or join a project…" (`screenshots/step-1-desktop-switcher.png`). She picks **Infra On-call**.
2. **Invite → My device → Create invitation → Copy invite.** The dialog subtitle reads "Infra On-call", as expected (`screenshots/step-2-desktop-invite-infra.png`).
3. **Laptop switcher → Start or join a project…** The switcher lists only "Checkout Revamp" and "Start or join a project…" (`screenshots/step-3a-laptop-switcher.png`). The page heading is **Start or join a project**, with Start selected and **Back to Checkout Revamp** at the bottom (`screenshots/step-3-start-or-join.png`). Geometry: clean.
4. **No "Link this device" here** (0 matches). She must infer that **Join a project** is the right place for a My device invitation.
5. **Join a project → paste → Join project.** The hint reads "Invitations work once and expire. You keep your own identity; nobody else can create it for you." (`screenshots/step-5-join-form.png`). The server accepted the My device invitation.
6. **Board "Infra On-call"** opens on the laptop (`screenshots/step-6-laptop-infra-board.png`). Geometry: clean. The switcher now lists both projects, but "Infra On-call" reads "Saved locally · waiting for hub" while the header beside it says "Saved locally · synced" (`screenshots/step-6b-switcher-both.png`).

Edge, invitation history while the dialog stays open: after the laptop used the invitation, the desktop's still-open dialog continued to show "Waiting to be used · Expires in 24 h", with **Copy invite / Show invite text / Revoke** for the used invitation and a Revoke on the history row (`screenshots/edge-desktop-dialog-still-open.png`). After closing and reopening it shows "My device · Used". This confirms the story's step-10 note from STORY-015.

Mobile 390×844 (laptop board, `mobile-check.png`): clean.

Console errors: none.

## Flagged claim verdicts

No numbered flagged claim targets STORY-017. Related observation: the stale switcher label (flag #32, owned by another topic) reproduced here as "waiting for hub" next to a "synced" header.

## Flow Log

- Ideal 5; actual 6 (desktop: switcher → Infra On-call, Invite → My device, Create, Copy; laptop: switcher → Start or join…, Join a project, paste, Join project). Hesitation at step 4: the familiar "Link this device" label is gone, and the Join form's hint talks about keeping "your own identity", which doesn't match what a My device invitation does.
- Redundancy: one action ("use a My device invitation") has two differently labelled surfaces: Link this device / My device invitation / Link device on the identity step, and Join a project / Invitation / Join project here.
- Stale state: the inviter's dialog shows a used invitation as still waiting (with Copy and Revoke) until reopened.

Status: pass
