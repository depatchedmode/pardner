# STORY-021: Lost laptop: revoking a linked device and re-linking a replacement

Walked 2026-11-09 in Chromium 1440×900 plus the CLI. Clients:
- "marcus-tower": hub, `--public-url http://127.0.0.1:47820`, project "Fitness App v3";
- "marcus-mbp": the lost laptop, linked with `client invite --purpose device` + `client join`;
- "zoe-mbp": collaborator Zoe, joined with a Human invitation;
- "marcus-mbp-2": the fresh replacement.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-021/`. Invitation text is masked.

## Steps

1. **Profile on the tower.** **Marcus Bell (you)**, Devices "marcus-tower", "marcus-mbp". The only button is **Close**: no remove or revoke control (`screenshots/step-1-profile.png`). Geometry: task-card false positive only.
2. **Invite → My device.** The history lists "My device · Used" and "Human · Used"; there is no device list and no Revoke on used rows (`screenshots/step-2-invite-history.png`).
3. **Find the ID.** `client show --project …` lists Marcus's human actor `devices: [{id:"21e07f24-…", name:"marcus-tower"}, {id:"3cb8c444-…", name:"marcus-mbp"}]`. The Setup agent lists the same two devices.
4. **Revoke.** `client revoke --kind device --id 3cb8c444-… --operation-id revoke-lost-mbp` → `{"success":true,"revoked":true,"kind":"device","id":"3cb8c444-…"}`.
5. **Lost laptop afterwards.**
   - A board write through its client returns HTTP 403 `{"code":"REVOKED","error":"Project admission revoked; local data is preserved"}`.
   - Its browser now opens on **Welcome, Marcus Bell** with the Start form, and the project has silently vanished from the UI (`screenshots/step-5-lost-laptop-board.png`).
   - `client status` on it still lists the project with `hubConnected:false, syncError:null`, so nothing there says "revoked".
6. **Profile after revoke.** Devices still lists "marcus-tower" and "marcus-mbp" with no sign of revocation (`screenshots/step-6-profile.png`).
7. **New invitation.** Invite → My device → Create invitation → Copy invite on the tower (`screenshots/step-7-new-device-invite.png`).
8. **Replacement laptop.** Link this device instead → paste → Link device → the board as **You: Marcus Bell** (`screenshots/step-8-new-laptop-board.png`).
9. **Profile.** Devices "marcus-tower", "marcus-mbp", "marcus-mbp-2", all styled identically, so the revoked one can't be told apart (`screenshots/step-9-profile-three-devices.png`). Geometry: task-card false positive only. Live sessions showed two "Active · Browser · marcus-tower" rows (one from the script's tab that had just closed), the same lingering-session effect noted in STORY-020.

Variations (CLI, all exactly as the story predicted):
- `--kind devices` → `INVALID_ARGUMENT` "Choose device, agent or member".
- `--id` omitted → `INVALID_ARGUMENT` "Supply --kind device|agent|member and --id".
- Unknown ID → `NOT_FOUND` "Admission not found".
- Zoe's device → `FORBIDDEN` "Device belongs to another human".
- Identical retry with the same operation ID → the same success result (idempotent).
- Same operation ID with a different `--id` → `OPERATION_ID_REUSED` "Operation ID belongs to different input".
- Revoking the already-revoked device with a new operation ID → `success:true, revoked:true` again, with no indication it was already revoked.

Mobile 390×844 (replacement-laptop board, `mobile-check.png`): no page overflow.

Console errors: none.

## Flagged claim verdicts

- **#22 Revoked devices stay in the profile Devices list with no sign of revocation — CONFIRMED.** "marcus-mbp" remains listed after revocation (step 6) and after the replacement was linked (step 9), styled identically to the active devices.

## Flow Log

- Ideal 6 (revoke in one step + Create/Copy + Link/paste/Link). Actual: 2 fruitless UI searches (profile, invite history), then an agent/CLI detour (`client show`, read JSON, copy the device ID, `client revoke`), then the 5-step re-link. Revocation has no UI at all.
- Devices are shown by name in the UI but managed by ID in the CLI. The IDs appear only in `client show`/`client status` JSON.
- No confirmation of revocation appears anywhere in the browser.
- On the lost laptop the project silently disappears from the UI rather than saying it was revoked. That is fine for a thief, but confusing if the laptop is recovered.

Status: fail
