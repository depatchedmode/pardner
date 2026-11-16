# STORY-015: Link a second laptop with a My device invitation from the browser

Walked 2026-11-09 in Chromium 1440×900. Two clients on one machine:
- "desktop" (`--device-name priya-studio --http-port 47815 --public-url http://127.0.0.1:47815`), seeded with identity Priya Natarajan and project "Checkout Revamp";
- "laptop" (fresh, `--device-name priya-air`).

Both were started from a scratch repo whose Git config is Priya's. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-015/`. Invitation text was saved only to a private scratch file and masked in every screenshot.

## Steps

1. **Invite menu (desktop).** It shows Human "A person and their agent", Agent "Another agent of yours", My device "Another computer you use" (`screenshots/step-1-invite-menu.png`). Geometry flags `button.task-card` as a wrapped control, but the task card is a deliberately multi-line card button, not a defect.
2. **My device dialog.** **Add one of your devices**, subtitle "Checkout Revamp", the body copy as specified, and the history "None yet." (`screenshots/step-2-device-dialog.png`). Geometry: clean (except the same task-card false positive).
3. **Create invitation.** The dialog shows "Waiting to be used · Expires in 24 h · Nov 10, 11:05 AM" with **Copy invite / Show invite text / Revoke** and the hidden-text note (`screenshots/step-3-created.png`). The same status, expiry and a second **Revoke** also appear in the history row directly below, so the dialog states it twice. The history row's "Waiting to be used" pill wraps onto two lines.
4. **Copy invite.** "Copied. Treat it like a password and send it privately; it works once." (`screenshots/step-4-copied.png`). The clipboard holds a 5-line setup prompt ("Add this machine to project "Checkout Revamp" under my existing identity…", agent instructions, then the `pardner-invite-v1.…` line).
5. **Laptop identity step.** It is prefilled from Git, and **Link this device instead** is visible under the primary button (`screenshots/step-5-laptop-identity.png`).
6. **Link this device page.** The heading, lead, the **My device invitation** textarea (placeholder "Paste the invitation or setup prompt you were sent"), **Link device**, and **Back to confirming my identity** all match (`screenshots/step-6-link-page.png`). Geometry: clean.
7. **Paste the whole setup prompt.** It was accepted; the masked view is `screenshots/step-7-pasted-masked.png`.
8. **Link device.** **Linking…** was observed; it completed in about 0.8 s.
9. **Laptop board.** It opened directly on **Checkout Revamp** with **You: Priya Natarajan** and the synced task (`screenshots/step-9-laptop-board.png`). `/session` identity id `d5609534-…` equals the desktop identity id, so the same Actor was adopted. Project role: replica, hubConnected true.
10. **Desktop history.** On reopening My device, the history row reads "My device · Used" with no Revoke (`screenshots/step-10-desktop-history-used.png`). It does not say when or by which device.
11. **Profile.** On both machines **Priya Natarajan (you)**, Devices "priya-studio" and "priya-air" (`screenshots/step-11-laptop-profile.png`, `screenshots/step-11-desktop-profile.png`). The Live sessions list doesn't mark which row is the current browser.

Variations walked:
- **Show invite text** (on a second desktop with no public URL): the warning "Visible on screen. Stop sharing your screen before copying." appears above the textarea, while the sentence "The invitation stays hidden so it can't be read from a shared screen." is still shown directly above it, which contradicts it (`screenshots/var-show-invite-text-masked.png`, textarea masked).
- **Raw `pardner-invite-v1.…` line only**: accepted, and the board opened (the trial against the second desktop).

Edge case (flag #9), simulated: a device invitation was issued by a desktop listening on port 47816 without `--public-url`. The desktop was then restarted on port 47817, so the address in the invitation is dead while the hub itself is up, the single-machine analogue of a loopback endpoint used from another computer. **Link device** → "Project authority unavailable; retry this attempt / The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." A second Link device gave the identical result (`screenshots/edge-loopback-unreachable-try1.png`, `-try2.png`). The page offers no hint that the invitation itself points at an unreachable address. Creating that invitation (UI on the no-public-URL desktop, and the CLI) showed no warning about the loopback endpoint.

Mobile 390×844 board (`mobile-check.png`): the header stacks onto three rows and "You: Priya Nataraj…" truncates; no page overflow (the board columns scroll inside their container). Geometry: only the task-card false positive.

Console errors: none on the happy path; 503s on the simulated-unreachable trial (expected).

## Flagged claim verdicts

- **#9 `HUB_UNAVAILABLE` for an invitation whose endpoint is the hub's loopback URL tells the person to retry, but retrying can never succeed — CONFIRMED (simulated on one machine).** An invitation whose embedded address is not where the hub is listening yields "Project authority unavailable; retry this attempt" and "Retry when it is back; nothing was lost", and retrying keeps failing with the same text.
- **#14 (touches this story's preconditions) No warning when creating an invitation on a client without `--public-url` — CONFIRMED** in the My device dialog and via `client invite`.

## Flow Log

- Ideal 4; actual 4 user actions (desktop: Invite → My device → Create → Copy, counted by the story as 2; laptop: Link this device instead → paste → Link device). Matches.
- Hesitation point: the big **Continue as Priya Natarajan** button sits above the small link-style "Link this device instead"; the safer path for this person is the visually quieter one.
- Duplicated information: the invitation status, expiry and Revoke appear twice in the same dialog (active-invite block and history row).
- No re-entry of known data.

The happy path passed. The story is marked fail because of the high-severity F-015-01 (an unreachable invitation endpoint gives retry-forever guidance).

Status: fail
