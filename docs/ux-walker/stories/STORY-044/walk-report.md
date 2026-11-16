# STORY-044 walk report: A non-creator tries to remove a member

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-044/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. On Marcus's replica, `pardner client revoke --project <id> --kind member --id <J. Doe humanId> --operation-id rm-contractor` → `FORBIDDEN: Only creator may revoke other memberships` (JSON line plus plain line, exit 1). The same happens with Priya's humanId. Matches. This is clear and immediate.
2. (Ask Priya) — STORY-043 shows the creator path.

**Variations / edge cases.**
- Marcus's own stray device (his second laptop client, linked with a My device invite he issued from the replica): `--kind device --id <its device id>` → `revoked: true`. That client then shows "Project access revoked; local data remains saved…" (`screenshots/var-marcus-old-laptop-revoked.png`). Matches. Geometry: only the Retry/Open-another-project width difference (by design).
- Another person's device (Priya's replica ThinkPad) → `FORBIDDEN: Device belongs to another human`. Matches. Priya's hub device (the creator's own device) → `NOT_FOUND: Admission not found` (F-044-01).
- Priya's agent → `FORBIDDEN: Agent belongs to another human`. Matches.

No browser surface is involved apart from the revoked-device screen, so a mobile check doesn't apply (that screen is a single centred card).

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Ideal 1 matched: a single command and an immediate, clear refusal.

Status: pass
