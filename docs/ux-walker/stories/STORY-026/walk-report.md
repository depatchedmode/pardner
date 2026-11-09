# STORY-026: Join a teammate's project by pasting the invitation prompt

Setup: Diego's client (`--harness openai-codex --name Gamma`) with "Homelab"; Priya's client from STORY-024 issued a Human invitation for "Checkout rewrite" (loopback endpoint, same machine). Chromium 1440x900; invitation text masked. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-026/`.

## Steps
1. **Open switcher on Homelab.** `screenshots/step-1-switcher.png`: "Homelab — Saved locally · synced", separator, **Start or join a project…**. Geometry: menu overlay spill only.
2. **Start or join a project…** `screenshots/step-2-start-or-join.png`: heading "Start or join a project", Start pressed, "You join as Diego Alvarez. Gamma (Codex) is registered as your agent…", **Back to Homelab**. Clean.
3. **Join a project.** `screenshots/step-3-join-tab.png`: placeholder "Paste the invitation or setup prompt you were sent", hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you." Clean.
4. **Paste whole prompt.** `screenshots/step-4-pasted.png`. Clean.
5. **Join project.** `screenshots/step-5-joining.png`: "Joining…".
6-7. **Board.** `screenshots/step-7-board.png`: "Project: Checkout rewrite. Switch project", "Saved locally · synced"; people Diego, Gamma, Priya Natarajan, Wren. Clean. Matches.
8. **Switcher.** `screenshots/step-8-switcher.png`: both projects, Checkout rewrite checked, but labelled "waiting for hub" while the header says synced (F-026-02).
- **Variation: change of mind.** **Back to Homelab** returned without changes (tested after joining, so it returned to the current project). Toggling Start ↔ Join cleared the earlier "Paste one complete Pardner invitation" error, and also cleared the textarea (F-026-03).
- **Edge: already a member** (raw envelope line of a second Human invitation). `screenshots/edge-already-member.png`: "Existing human identity requires My device proof" + misleading hint (F-026-01). This also showed the raw line is parsed (the hub answered about identity, not format); a raw-line first-time join was not separately walked.
- Two-invitation paste: covered in STORY-027 (`F-027-04`).
- Mobile `screenshots/mobile-check.png`: clean.
- Console: the deliberate 400 ("hello") and 409 (already member). Video: `videos/join-from-switcher.webm`.

## Flow Log
- Ideal path 3 (Start or join, Join, paste+submit) from the switcher: actual 4 (switcher, Start or join, Join tab, Join project) plus the paste. No re-entry; no hesitation on the happy path.
- Duplicated information: sync state in the switcher and header, disagreeing.

Status: pass
