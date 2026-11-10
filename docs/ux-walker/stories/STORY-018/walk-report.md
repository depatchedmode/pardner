# STORY-018: Confirmed a duplicate identity by mistake, then tried to link

Walked 2026-11-09 in Chromium 1440×900. Grace's "laptop" hub (`--public-url http://127.0.0.1:47819`) owns "Platform Roadmap 2027" and issued a My device invitation (`client invite --purpose device`). The "iMac" is a fresh client Git-prefilled "Grace Liu" / "grace@orbitallabs.com". Evidence: `<evidence-archive>/walker-2026-11-09/STORY-018/`. Invitation text is masked.

## Steps

1. **Continue out of habit.** The iMac shows **Welcome to Pardner** (`screenshots/step-1-identity.png`); she clicks **Continue as Grace Liu**.
2. **Welcome, Grace Liu.** No "Link this device" affordance exists anywhere on this page (0 matches) (`screenshots/step-2-welcome-no-link.png`). Geometry: clean.
3. **Join a project with the My device invitation** → "Destination already belongs to another identity" plus the hint "This invitation is for a different person or identity. A My device invitation links a computer that has no identity yet; a Human invitation needs your own identity first." (`screenshots/step-3-identity-mismatch.png`). HTTP 409. (The textarea text is masked in the screenshot, so it only looks empty.) Geometry: clean. Nothing tells her how to get out of this state.
4. **Invitation still usable.** The hub's My device history still shows "My device · Waiting to be used · Expires in 24 h" (`screenshots/step-4-hub-history-still-waiting.png`).
5. **CLI identity, same values, new operation ID** (`grace-fix-1`) → `success:true`, returning the unchanged identity (a no-op). With a *different* email (`grace-fix-2`) → `IDENTITY_EXISTS` "Identity already initialized; linking requires My device", exit status 1.
6. **Fresh client directory.** The client was stopped and a new client started with another `--data` → a fresh **Welcome to Pardner** (`screenshots/step-6-fresh-client.png`).
7. **Link this device instead → paste → Link device** → the board for "Platform Roadmap 2027" as **You: Grace Liu** (`screenshots/step-7-board.png`). This also re-confirms the invitation survived step 3. Geometry: task-card false positive only.

Variation walked: the old duplicate-identity directory joined with a fresh **Human** invitation via `client join` and succeeded. On the hub board the header shows two "GL" avatars ("Grace Liu, human, idle" and "Grace Liu, human, offline"), two "SA" agents, and **Assigned to** lists "Grace Liu · human" twice and "Setup agent · agent" twice (`screenshots/var-duplicate-grace-on-hub.png`).

Mobile 390×844 board (`mobile-check.png`): no page overflow.

Console: one expected 409 resource error at step 3; no page errors.

## Flagged claim verdicts

- **#19 An identity typo/duplicate cannot be fixed; `IDENTITY_EXISTS` "linking requires My device" is misleading — CONFIRMED.** The identity cannot be replaced or removed (step 5). The only recovery was a new client directory, and the old directory remains with its duplicate identity. `IDENTITY_EXISTS` says "linking requires My device", but she already has a My device invitation and it is refused on this client with `IDENTITY_MISMATCH`.

## Flow Log

- Ideal 3 (Link this device instead, paste, Link device). Actual: Continue (mistake) → Join a project → paste → Join project (refused), then agent CLI attempts, client stop, restart with new `--data`, Link this device instead → paste → Link device: about 10 actions plus a terminal session.
- Dead end: after one click on the dominant button, there is no in-app path to the goal. The error text ("Destination already belongs to another identity") is internal jargon and does not suggest the reset that actually works.
- Re-entry: the invitation had to be pasted again on the fresh client.
- One way per task: there are two "use an invitation" forms (Link this device vs Join a project) with different rules, and the one still visible after identity confirmation is the one that refuses a My device invitation for a different identity.

Status: fail
