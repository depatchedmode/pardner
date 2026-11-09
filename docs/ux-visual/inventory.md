# UX Visual Inventory — Pardner web UI

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`). People now open the board only through the local
> client (`pardner open`), and phones pair through the client's **Pair a phone**
> companion; see the [client guide](../PARDNER-CLIENT.md) and the
> [phone companion guide](../PARDNER-LAN.md). The findings and evidence below are
> kept unchanged.

Branch `ux-skill-pack-run`, after the ux-walker quick fixes (`e895dea9`). Single-page React app at `/pardner/`; there is no router, so "pages" are the screens and overlays listed below.

## Design system
- One stylesheet: `ui-prototype/src/pardner.css`, with 5 color tokens on `:root` (`--surface`, `--line`, `--muted`, `--accent`, `--warning`). Body text is `#e5e5e5` on `#0a0a0a`, in the system font stack. The app is dark only.
- No spacing scale, type scale, radius or elevation tokens. No component library: every component is defined inline in `ui-prototype/src/Pardner.jsx` and `PhoneAccess.jsx`. No design-system audit script.
- **Rule for this run:** any fix adds or uses tokens in `:root` first, then component CSS. No ad-hoc inline styles.

## Layouts
| Layout | Used by |
|---|---|
| L1 Centered card shell | Startup shell (`index.html`), Connection/Pairing screen, StartupBoundary error |
| L2 Workspace shell: header (title + SaveStatus, Actor select, New task), workspace-actions row, nav (Tasks/Goals/Activity + board filters), content area | Board, Goals, Activity |
| L3 Right side panel (fixed overlay) | New task form, Task details |
| L4 Modal dialog | Pair another device |

## Pages and states
| Page | States | How to reach |
|---|---|---|
| P1 Startup / Connection | loading shell; token form (loopback); token error; pairing-code error; stored token, service down (D1); storage blocked | Fresh browser context to `/pardner/` on a private hub; wrong token; stop the hub |
| P2 Board (Tasks) | empty workspace (no Actors); no Actor chosen; populated (seeded 7 tasks); long titles / many cards (≥8 per column); single-column status filter; vein filter | Seeded hub via `hub.sh`, plus CLI-created extra tasks |
| P3 Task details panel | rich markdown description (lists, task list, table, code); no description; comments (many); conflicts (needs a replica — optional); edit mode; handoff stale notice; error banner (STALE_UPDATE) | Open a card; CLI edits during edit |
| P4 New task panel | empty; filled; blank-title error; long values | Header **New task** |
| P5 Goals | empty; populated (goal with 2 veins); ready for a verdict; achieved/abandoned | **Goals** nav |
| P6 Activity | short; long (200+ ops) | **Activity** nav |
| P7 Pair another device dialog | LAN disabled (admin); enabled + restart pending; ready with QR + Connect manually; non-admin | Header button; LAN enable on a private hub |

## Component groups
Header (title, SaveStatus, Actor select, New task) · workspace actions (Pair another device, Forget this workspace) · view nav (toggle buttons) · filter selects · board columns (header + count) · task card (priority, title, assignee, vein labels, conflict badge) · panel header (title, Close) · form fields (label + input/select/textarea) · buttons (default, primary-like `Add comment`, disabled) · alerts / ErrorNotice (fixed bottom banner) · notices (stale handoff, pending request) · comments list (author, time, markdown) · evidence list · history list · goal card (title, pill, description, vein rows) · activity row · status pills · dialog (QR, code, address, network settings).

## Viewports
1440×900, 1920×1080, 768×1024, 375×812.
