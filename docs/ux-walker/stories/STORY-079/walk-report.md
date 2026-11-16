# STORY-079: Link a GitHub issue to a task (with input mistakes)

Walked 2026-11-09 in Chromium 1440×900 on Maya Okafor's client, task "Fix tax rounding on multi-currency carts" (no links). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-079/` (video in `videos/`).

## Steps
1. **GitHub issues section** (`screenshots/step-1-empty.png`): sits directly under the header and reads "No linked issues. Linking does not contact GitHub." The field **Link GitHub issue** has the placeholder `owner/repo#123`, and **Link issue** is disabled. Geometry: only the known `button.task-card` wrap false positive. Matches.
2. **"#418" → Link issue** (`screenshots/step-2-hash-only.png`): an inline red box under the field reads "Name the issue as owner/repo#number." Nothing is sent, and focus stays on **Link issue**. Matches.
3. **"acme/lantern-checkout 418"** (`screenshots/step-3-space.png`): same inline error. Matches.
4. **"Acme/Lantern-Checkout#418"** (`screenshots/step-4-linked.png`): accepted and lowercased. The list shows the link `acme/lantern-checkout#418` (href `https://github.com/acme/lantern-checkout/issues/418`, `target=_blank`) with **Unlink**, and the field clears. Matches. After the field cleared, focus fell to `BODY`.
5. **History** (`screenshots/step-5-history.png`): "Maya Okafor recorded task.link-issue on this task". The raw type name appears, with no repository or number. Hovering gives `title="task.link-issue"`. Matches.

Variations and edge cases:
- **Second issue `acme/payments-sdk#77`** (`screenshots/var-second-issue.png`): the list orders lantern-checkout#418 before payments-sdk#77 (by repository). Matches.
- **Same issue twice** (`screenshots/var-same-twice.png`): no error, still one row. Matches.
- **`acme/lantern-checkout#0`** (`screenshots/edge-zero.png`): the UI lets it through. The server's "Issue number must be a positive integer / Your last confirmed data remains available. / Dismiss" then appears at the **top of the panel**, above GitHub issues and away from the field. That error is a different component (red block with Dismiss) from the inline one in step 2. Matches the catalog.
- **`acme/lantern+checkout#12`** (`screenshots/edge-bad-repo-plus.png`): the server's "Repository must be a GitHub owner/name" also appears at the panel top. `acme/lantern checkout#12` is caught inline.
- **Surrounding spaces** (`screenshots/edge-spaces-trimmed.png`): "  acme/lantern-checkout#419  " is trimmed and linked. Matches.
- **Full GitHub URL** (tested in STORY-080): rejected with the inline format error.

Mobile check (`screenshots/mobile-check.png`, 390×844): three links each with an **Unlink** button. The buttons follow the link text, so their left edges are ragged (x varies with the reference length). Geometry: card false positives only.

Console/page errors: two `400 (Bad Request)` from the server-rejected references.

## Flagged claim verdicts
- **#41** (issue link/unlink History rows read "recorded task.link-issue"; an `owner/repo#0` error shows at the panel top, not beside the issue form): **CONFIRMED** (`step-5-history.png`, `edge-zero.png`).

## Flow Log
- Ideal 2 (type, Link issue); actual 4 with the persona's two format mistakes. Each mistake cost one retry, with clear inline guidance.
- Hesitation: two different error styles for the same field. The client-side errors appear inline. The server-side errors appear at the panel top with "Your last confirmed data remains available.", which does not fit a validation error.
- Re-entry: a pasted GitHub URL or "owner/repo 418" has to be retyped by hand into the `#` form.

Status: pass
