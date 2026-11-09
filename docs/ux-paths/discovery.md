# App Discovery: Pardner

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`) and its LAN companion devices. People now open the
> board only through the local client (`pardner open`); see the
> [client guide](../PARDNER-CLIENT.md). Phone access is not currently offered; it
> is planned through the hub over HTTPS. The discovery below is kept unchanged.

## Application Type
Local-first coordination tool for humans and agents that track tasks together. It has three surfaces sharing one attributed operation API:
1. **Browser UI**: a single-page React app with no client router, served by the local Node service at `/pardner/` (default `http://127.0.0.1:8004/pardner/`). It also runs as a "companion device" UI on phones, tablets or other desktops over the LAN, using plain HTTP/WS without encryption. The browser keeps no Automerge database of its own.
2. **CLI**: `bin/pardner.js` → `lib/cli.js`. Prints one JSON result per command; used by humans, agents and scripts.
3. **Local service / hub / replica**: `automerge-sync-server.js` with `lib/local-service.js` and `lib/workspace-runtime.js`. One service per machine. Role `hub` (default; relays changes and keeps the SQLite delivery ledger) or `replica` (enrolls with a hub and reopens offline).

Also: an opt-in agent bridge (`pardner bridge`, Codex App Server), a T3 execution contract (`lib/t3-execution.js`), and a development control runtime (`scripts/control-runtime.py`).

## Tech Stack
- Node 24.11.1 pinned (`package.json` engines), ESM, Express 4, `ws` 8.
- Automerge 3.2.3 and automerge-repo / network-websocket 2.5.1. Storage via `lib/nodefs-storage-adapter.js` and `lib/durable-repo.js`. Schema version 4 (`lib/workspace-schema.js`).
- SQLite (`node:sqlite`) for the hub delivery ledger (`lib/delivery-ledger.js`), bridge inbox and T3 execution state.
- UI (`ui-prototype/`): React 18, Vite 4 (`base: '/pardner/'`, dev server on 5174 proxying `/pardner/config`, `/pardner-api`, `/pardner-ws`), react-markdown + remark-gfm, qrcode 1.5.4. All styles in `ui-prototype/src/pardner.css`; mobile breakpoint `max-width: 760px` (44px touch targets, board columns scroll sideways at 75vw).
- Tests: `node --test` + Playwright 1.62.1 (Chromium + WebKit). UI tests: `test/pardner-ui.test.js`, `test/pardner-phone.test.js`, `test/pardner-connection-ui.test.js`. Acceptance gate: `scripts/acceptance.js`.

## User Roles
- **Human Actor** (`kind: human`): picks themselves in the header **Actor** select; creates, edits, hands off tasks; resolves conflicts; records verdicts on veins/goals (CLI only); marks comments read.
- **Agent Actor** (`kind: agent`): normally works through the CLI with `--actor`/`PARDNER_ACTOR`: `tasks --assignee`, `show`, `comment`, `handoff`, `mentions claim-next/ack/release`, `commit`. Agents can also be picked in the UI (no distinction; `labelActor` shows "name · kind").
- **Workspace bootstrapper**: first `actors register X --actor X` allowed with no Actors (`lib/workspace-commands.js:346`). Until then the UI shows "Register your first human or agent Actor with `pardner actors register` to begin."
- **Local admin / host-machine operator**: loopback browser where `canManageAccess` is true (`lib/lan-access.js`). Only they can enable/disable LAN access and choose the interface (`/pardner/access` POST, else `LOCAL_ADMIN_REQUIRED`).
- **Companion device user**: LAN browser. Pairs with an 8-digit code or QR link (`#pair=CODE`). Can open **Pair another device** and generate codes, but cannot change network settings. No offline replica.
- **Hub operator**: runs `pardner serve` (hub default), sets `PARDNER_BIND_HOST` for remote replicas, rotates `PARDNER_API_TOKEN`.
- **Replica operator**: `pardner serve --role replica --hub URL --hub-ws URL --hub-token TOKEN`. Hub needed for enrollment; afterwards reopens offline.
- **Bridge operator**: `pardner bridge inspect/run/status/reconcile` (`docs/PARDNER-BRIDGE.md`).
- **Developer coordinator**: control runtime (`docs/PARDNER-CONTROL-RUNTIME.md`); out of scope for UI walks.

## Feature Map

### Startup & connection (UI) — `ui-prototype/index.html`, `src/main.jsx`, `src/Pardner.jsx:85-102`, `src/connection.js`
- Static startup shell "Opening your workspace…" with **Reload Pardner**; after 12s or script error: "Pardner could not finish loading… rebuild the browser client and restart the service." `<noscript>` message.
- `StartupBoundary`: "Pardner could not open", hint "Allow browser site storage…", **Reload Pardner**.
- Config load (`GET /pardner/config`, 10s timeout): "Opening your workspace…"; on failure error + "Check that the service is running…" + **Retry connection**.
- Config validation failure: "The service configuration is incomplete. Restart the service and retry."

### Authentication / pairing screen — `Pardner.jsx:351-379`
- Heading "Pardner", "One workspace for human and agent Actors."
- **Pairing code** field (numeric, 8 digits, `one-time-code`) + **Pair this device** ("Connecting…" when busy). Helper: "Open Pair another device on the desktop to get a code… Use a trusted network: HTTP traffic is unencrypted."
- `<details>` **Connect with a local service token** (open by default when `canManageAccess`): **Local service token** password field + **Connect**.
- Auto-pair from `#pair=CODE` (code stripped via `history.replaceState`, then redeemed; listens for `hashchange`).
- With stored token: "Opening your local workspace…" + **Forget this workspace**.
- Errors in alert with **Retry connection** (disabled with no token/code).
- Server errors: `PAIRING_INVALID` ("The pairing code is incorrect or expired. Generate a new code on the desktop."), `PAIRING_THROTTLED` (429 after 10/min), `ORIGIN_REQUIRED`, `WORKSPACE_MISMATCH` ("The service workspace changed. Reload before pairing.").
- `AUTH_REQUIRED` drops back here: "The service credential changed. Pair again or enter the current local service token."

### Workspace shell / header — `Pardner.jsx:393-476`
- `h1` "Pardner" + **SaveStatus** live region: "Connecting to local service", "Saving locally…", "Local service disconnected", "Local save failed", "Saved locally · waiting for hub", "Saved locally · synced".
- **Actor** select ("Choose an Actor"), remembered per workspace.
- **New task** (disabled without Actor, while busy, or with a pending request).
- Workspace actions: **Pair another device**, **Forget this workspace**.
- `nav[aria-label="Workspace views"]`: toggles **Tasks**, **Goals**, **Activity** (`aria-pressed`) + filters **Assigned to** ("All Actors"), **Status filter** ("All statuses" + 7), **Vein** ("All veins").
- View and filters persisted in localStorage `pardner:<workspaceId>:preferences`.

### Task board (Tasks view) — `Pardner.jsx:478-527`
- Columns: Backlog, Up next, In progress, Review, Completed, Dead end, Abandoned, each with a count. A status filter collapses to one column (`data-filtered`).
- Cards sorted by priority then order: priority (P0–P3), title, assignee, vein labels, **Conflicting edits** badge.
- Empty column: "No tasks here". Clicking a card opens Task details.

### Create task — `TaskForm`, `Pardner.jsx:625-734`
- Side panel "New task" with **Close**. Fields: **Title** (required), **Description** (markdown), **Status** (Backlog), **Priority** (p0–p3, p2), **Assignee** (optional "Unassigned"), **Tags, separated by commas**. Submit **Create task**.
- On success closes and opens the new task's details. Veins can't be set in the UI (CLI `task create --vein`).

### Task details panel — `TaskDetail`, `Pardner.jsx:735-1073`
- "Opening task…" / `ErrorNotice`. **Close** and Escape close it (the only keyboard shortcut, `Pardner.jsx:784-790`).
- Header: title, SaveStatus, "assignee · status · PRIORITY", "Veins: title (status)".
- Markdown description or "No description yet.".
- **Edit task** inline editor → **Save changes** / **Cancel edit**; sends only changed fields with `expectedRevisions`. `STALE_UPDATE` keeps draft: "Your draft is preserved. Review the latest context…".
- **Conflict resolution**: per field "Resolve {field}" ("Both edits are preserved. Choose the value to keep."), alternatives with author + value + **Keep this {field}** (`task.resolve`).
- **Hand off work**: **Recipient**, **Handoff status** (Review), **Handoff message** (required), **Hand off**. Atomically changes assignee + status + mentioning comment. If assignee/status change after focus: "Assignment or status changed while you were preparing this handoff. Your draft is preserved." + **Use latest task details**; **Hand off** disabled until accepted.
- **Comments (N)**: author, time, markdown. **Mark displayed comments read** (enabled when `unreadCount > 0`), "N unread for {handle}". Comment conflicts: **Keep this comment**. **Comment** textarea placeholder "Share progress or mention an Actor with @handle", **Add comment**; `@handle` creates a mention delivery.
- **Evidence**: commit hash + message, or "No commit evidence linked yet.".
- **History**: author · operation type · time, field changes `field: old → new`.

### Goals view (read-only) — `Goals`, `Pardner.jsx:586-623`
- Goals sorted open → achieved → abandoned: title, status pill, description, **Conflicting edits**.
- Each vein is a button that switches to the board filtered to that vein; shows status pill, "N task(s)", **Ready for a verdict**, **Conflicting edits**.
- Empty: "No goals yet. Start a vein with `pardner vein create --title … --goal …`."; "No veins pursue this goal yet."
- Goals/veins created, edited, verdicted and resolved only via CLI.

### Activity view — `Pardner.jsx:531-549`
- "Workspace activity": every operation newest first, Actor · operation type, task link button opens details, local timestamp. No filter/pagination (CLI `activity --task --actor --limit`).

### Pair another device dialog — `src/PhoneAccess.jsx`
- Modal `<dialog>` "Pair another device", **Close** ("Close device pairing"). Intro: "Scan with a device on the same Wi-Fi to connect."
- Loading "Finding available networks…"; errors with **Try again**.
- Non-admin with LAN disabled: "Open Pardner on the service computer through its local address to enable device access."
- After save, before restart: "Settings saved. Restart the Pardner service with the same data directory…".
- Diagnostics: interface unavailable, multiple IPv4 addresses, address changed, LAN listeners failed, requires token-protected loopback service (`lib/lan-access.js`, `automerge-sync-server.js:172-196`).
- Ready: 240px QR of `phoneUrl#pair=CODE`; **Connect manually**: **Device address** (read-only), **Copy address** → "Address copied" (clipboard fallback error), 8-digit code, "Use once before HH:MM", **Generate pairing code** / **Generate new code**. Codes expire after 10 min; new code replaces old.
- **Network settings** (admin): **Network interface** select ("Choose a network"; "name · address"), "No LAN IPv4 address is available…", **Enable device access** / **Save network**, **Disable device access**.
- Footer: "Trusted networks only. This connection is unencrypted."

### Pending / uncertain writes — `Pardner.jsx:271-323, 418-429`
- Each write saved to sessionStorage (`pardner:<ws>:pending`) before send. One at a time: "Resolve the saved request before starting another change.". No Actor: "Choose the Actor making this change.".
- Uncertain failure: "A request is awaiting confirmation." + **Retry saved request** (same operation ID).
- Definitive errors clear the pending write: STALE_UPDATE, CONFLICT_REQUIRES_RESOLUTION, INVALID_ARGUMENT, AMBIGUOUS_ACTOR, NOT_FOUND, OPERATION_ID_REUSED.

### Forget this workspace — `Pardner.jsx:324-337`, `connection.js forget()`
- Removes stored credential, preferences, pending write; returns to pairing. Does not revoke the shared secret.

### CLI capabilities — `lib/cli.js` HELP
- Service: `serve [--role hub|replica] [--data] [--hub] [--hub-ws] [--hub-token] [--http-port] [--ws-port]`, `status`.
- Actors: `actors list`, `actors register <id> --handle --kind human|agent [--display-name]` (`agents` alias).
- Tasks: `tasks [--assignee] [--status] [--vein]`, `show`, `task create`, `update <task> … --revisions`, `handoff`, `resolve --field --value`, `diff`.
- Comments: `comment`, `comments`, `comment-edit`, `comment-resolve`, `comment-delete` (CLI only), `read --receipts`.
- Mentions/delivery: `mentions pending|claim-next|ack|release`.
- Goals: `goals`, `goal create|show|update|resolve`. Veins: `veins`, `vein create|show|update|resolve|add|remove`.
- Patchwork: `branch <task> name`, `branches`, `merge <branch>` (CLI only).
- Evidence/trace: `link-commit --commit '{"hash","message"}'`, `commit --task [--model] [--session] -- <git args>`, `trace list|show|task` (`docs/AGENT-TRACE.md`).
- Activity/raw: `activity|timeline [--task] [--actor] [--limit]`, `operation --request JSON`.
- Bridge: `bridge run|status|inspect|reconcile`.
- Globals: `--json`, `--operation-id`, `--data/--server/--token`; env `PARDNER_DATA_DIR`, `PARDNER_LOCAL_URL`, `PARDNER_API_TOKEN`, `PARDNER_ACTOR`.

### HTTP / WS endpoints — `automerge-sync-server.js:403-760`
- Unauthenticated: `GET /pardner/config`, `POST /pardner/pair`, static `/pardner/*`.
- Bearer / `X-Pardner-Token` (+ optional `X-Pardner-Workspace`): `GET/POST /pardner/access`, `POST /pardner/access/pairing`, `GET /automerge/doc|url|status`, `POST /automerge/operations` (only mutation path; others return `OPERATION_REQUIRED`), `GET /automerge/deliveries`, `POST /automerge/deliveries/{claim,ack,release}`, `GET /automerge/task/:id/context?actor=`, `GET /automerge/{vein,goal}/:id/context`, `POST /automerge/sync-ack`, `POST /automerge/ws-ticket`, `GET /automerge/trace/:commitHash`, `GET /automerge/github-remote`.
- WS 8005: JSON UI subscription on `/` (ticket; `document-state` {doc,status}, `sync-status`). Native Automerge CBOR sync on `/automerge`.
- Operation types (`lib/workspace-commands.js:331-337`): actor.register; task.create/update/resolve/handoff; comment.add/edit/resolve/delete; read.mark; task.link-commit/branch/merge; goal.create/update/resolve; vein.create/update/resolve; task.link-vein/unlink-vein.

## Navigation Structure
- No URL routing; everything at `/pardner/`. Only deep link: `#pair=CODE`. Selecting a task does not change the URL (not bookmarkable).
- Screens: Startup shell → Connection/Pairing → Workspace.
- Workspace views via nav: **Tasks** / **Goals** / **Activity**.
- Overlays: right **New task** panel, right **Task details** panel (`aria-label="Task details"`), modal **Pair another device**.
- Filters: **Assigned to**, **Status filter**, **Vein**. Clicking a vein in Goals sets filters and switches to Tasks (`showBoard`).
- Keyboard: Escape closes Task details; native `<dialog>` closes with Escape. No command palette or other shortcuts.
- Mobile (≤760px): header stacks, nav wraps with full-width filters, board scrolls horizontally.

## Data Entities
| Entity | Create | Read | Update | Delete | Notes |
|---|---|---|---|---|---|
| Workspace | `serve` on empty dir | `/pardner/config`, `status` | — | — | v3 layout, schema 4; incompatible prior install rejected and left intact |
| Replica | `serve --role replica` | `status` | — | — | persisted storage + exclusive lock |
| Actor | CLI `actors register` | UI select, `actors list` | — | — | id, handle, kind, displayName |
| Task | UI New task, CLI | board, details, `tasks`, `show` | Edit task / Hand off, CLI | none (close as completed/dead-end/abandoned) | title, description, status, priority, assignee, tags, order, type; revisions, conflicts |
| Comment | UI, handoff, CLI | details, `comments` | CLI `comment-edit`; UI/CLI resolve | CLI `comment-delete` | markdown, may conflict |
| Mention/delivery | `@handle` or handoff | CLI `mentions pending` | claim/ack/release | — | hub ledger; not in UI |
| Read receipt | UI Mark read, CLI `read` | unreadCount | — | — | no implicit read |
| Goal | CLI `goal create` / `vein create --goal` | Goals view, CLI | CLI update/resolve | — | open/achieved/abandoned |
| Vein | CLI `vein create` | Goals, Vein filter, cards | CLI update/resolve | — | open/proven/dead-end/abandoned; readyForVerdict |
| Task–vein link | CLI `vein add`, `task create --vein` | cards, details | — | CLI `vein remove` | concurrent links survive |
| Conflict alternative | concurrent same-field edits | badges, Resolve | resolve | — | tasks, comments, goals, veins |
| Commit evidence | CLI `commit`, `link-commit` | Evidence, `trace` | — | — | |
| Branch | CLI `branch` | `branches` | CLI `merge` | — | |
| Operation/activity | every write | Activity, History, `activity` | — | — | append-only, idempotent opId |
| LAN access config | dialog (admin) | dialog | Save network / Disable | — | `access.json` 0600 |
| Pairing code | Generate | dialog | regenerate replaces | 10 min / restart | memory only |
| Browser credential/prefs/pending | pairing, token | — | — | Forget this workspace | local/sessionStorage |
| Attachments | — | — | — | — | not implemented |

## Integrations
- **Hub ↔ replica**: native Automerge WS (`/automerge`), ticket reconnect (`lib/ticket-network-adapter.js`, `lib/native-peer-client.js`), hub persistence ack via `/automerge/sync-ack`.
- **Git/GitHub**: `pardner commit` wraps git + trace attribution (`lib/agent-trace.js`, `lib/cli-trace.js`). `/automerge/github-remote`, `/automerge/trace/:hash` (UI unused).
- **Codex App Server bridge**: `lib/agent-bridge.js`, `lib/codex-bridge-adapter.js`, `lib/bridge-inbox.js`, `lib/bridge-retirement.js`.
- **T3 Code**: `lib/t3-execution.js`, `lib/t3-mcp-client.js`, `scripts/t3-qualification.js`.
- **Agent harnesses**: any CLI client + mention leases.
- **HTTPS proxy**: `PARDNER_BROWSER_WS_PATH`. **Control runtime**: `scripts/control-runtime.py`.

## Error, Empty & Loading States
- **Loading**: "Opening your workspace…", "Opening your local workspace…", "Opening task…", "Finding available networks…", "Connecting…", "Saving locally…".
- **Empty**: "No tasks here"; no-Actors notice; "No goals yet…"; "No veins pursue this goal yet."; "No description yet."; "No commit evidence linked yet."; "0 unread"; "No LAN IPv4 address is available…".
- **Connection**: "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." + **Retry connection** (backoff ≤15s, 10s open timeout, resumes on online/focus/visibilitychange). "The service sent an unreadable update. Reconnecting…"; "The service returned an unreadable response. Retry the connection."; 403 `ORIGIN_REJECTED` → "Open the current address shown in Pair another device".
- **Credential/workspace**: AUTH_REQUIRED → pairing. WORKSPACE_MISMATCH → reload config, remount Workspace.
- **Storage**: "Browser storage is unavailable. Allow site storage…"; "Local save failed"; STORAGE_FAILED 507.
- **Operation errors** (`ErrorNotice`, `role=alert`): STALE_UPDATE, CONFLICT_REQUIRES_RESOLUTION, INVALID_ARGUMENT, NOT_FOUND, AMBIGUOUS_ACTOR, UNKNOWN_ACTOR, OPERATION_ID_REUSED, HUB_UNAVAILABLE/HUB_REQUIRED, LOCAL_SERVICE_UNAVAILABLE, ALREADY_EXISTS, GOAL_REQUIRED, ACTOR_REQUIRED, BRANCH_CONFLICT, INCOMPATIBLE_SCHEMA, ROLE_MISMATCH; fallback "Your last confirmed data remains available."
- **Conflict UI**: **Conflicting edits** badges; "Resolve {field}" + **Keep this {field}**; **Keep this comment**; stale-handoff notice + **Use latest task details**.
- **Sync status**: "Saved locally · waiting for hub" (replica until hub ack); "Saved locally · synced".

### Conditional UI and feature flags
- `canManageAccess` (loopback only): token form open by default, Network settings shown.
- `isPairingReady` gates QR and code.
- Buttons require an Actor and no pending write.
- Env: `PARDNER_ALLOW_INSECURE_LOCAL=1`, `PARDNER_ALLOWED_ORIGINS`, `PARDNER_BIND_HOST`, `PARDNER_BROWSER_WS_PATH`, `PARDNER_WS_TICKET_TTL_MS`, `PARDNER_ALLOW_LEGACY_WS_QUERY_TOKEN`, `PARDNER_ROLE`, `PARDNER_HUB_URL`, `PARDNER_HUB_WS_URL`, `PARDNER_HUB_TOKEN`, `PARDNER_HTTP_PORT`, `PARDNER_WS_PORT`.
- Vite dev mode rewrites apiBase/wsPath to proxies.

## How to Run the UI for Walking
```sh
npm ci && npm ci --prefix ui-prototype && npm run ui:build
node bin/pardner.js serve --data .pardner-walk   # hub on 127.0.0.1:8004 (HTTP) / 8005 (WS); writes .pardner-walk/connection.json (0600) with token
```
Open `http://127.0.0.1:8004/pardner/`, paste the token (`node -e "console.log(require('./.pardner-walk/connection.json').token)"`) into **Connect with a local service token** → **Connect**, choose an Actor. Alternative: `npm run dev --prefix ui-prototype` → `http://localhost:5174/pardner/`.

Seed via CLI (no demo script):
```sh
P="node bin/pardner.js --data .pardner-walk"
$P actors register alice --handle alice --kind human --actor alice
$P actors register bob --handle bob --kind human --actor alice
$P actors register builder --handle builder --kind agent --actor alice
$P actors register reviewer --handle reviewer --kind agent --actor alice
$P vein create --title 'Edge caching' --goal 'p95 under 200ms' --actor alice
$P task create --title 'Add latency instrumentation' --assignee builder --priority p1 --status in-progress --vein VEIN_ID --actor alice
$P comment TASK '@reviewer please look at the **evidence**' --actor builder
$P link-commit TASK --commit '{"hash":"abc1234","message":"feat: instrument"}' --actor builder
```
Real conflict: hub on 8004/8005; replica `serve --data .pardner-replica --role replica --hub http://127.0.0.1:8004 --hub-ws ws://127.0.0.1:8005/automerge --hub-token TOKEN --http-port 8014 --ws-port 8015`; edit same field on each side while the other is down; reconnect → **Conflicting edits** / **Keep this status**. STALE_UPDATE / stale handoff: open form in tab A, change status via CLI or tab B.

LAN: **Pair another device** on loopback → interface → **Enable device access** → restart same `--data` → reopen for QR/code; companion URL `http://<LAN-IP>:8004/pardner/#pair=CODE`. Mobile viewport 390×844.

## Recommended Story Topics
1. **First run and onboarding** — empty service, token connect, no-Actors notice, CLI bootstrap registration, choose Actor, first task.
2. **Daily task work on the board** — create with every field, filters, details, Edit task, markdown, Escape/Close, filter persistence.
3. **Human ↔ agent handoff round trip** — human assigns, agent uses CLI (`tasks`, `show`, `mentions claim-next/ack`), comments, commit evidence, hands off to reviewer; human sees live, marks read.
4. **Comments, mentions and read receipts** — @mentions, per-Actor unread, Mark displayed comments read, CLI comment edit/delete, switching Actors.
5. **Goals and veins** — CLI create, link tasks, Goals view, vein→board filter, Ready for a verdict, CLI verdicts.
6. **Concurrent edits and conflict resolution** — replica conflicts, badges, Keep this {field}, comment conflicts, STALE_UPDATE, stale-handoff notice.
7. **Offline, sync status and reconnection** — replica enrollment, hub down, service restart, Retry connection, Retry saved request, convergence.
8. **Companion device pairing over LAN** — enable access, restart, QR/code, `#pair=`, mobile layout, live updates, bad/expired code, throttling, non-admin dialog.
9. **Credential lifecycle and cleanup (destructive)** — Forget this workspace, Disable device access, token rotation (AUTH_REQUIRED), workspace mismatch, cleared storage.
10. **Error and bootstrap failures** — service not running, missing UI build, blocked storage, disallowed origin, unreadable responses, validation errors.
11. **Agent power user on the CLI** — `--json`, `--operation-id`, OPERATION_ID_REUSED, resolve, diff, activity, branch/merge, commit/trace, `operation --request`.
12. **Activity and history audit** — Activity view, jump to task, History old → new, Evidence, attribution across Actors/replicas, long lists.
