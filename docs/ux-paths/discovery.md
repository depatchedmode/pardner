# App Discovery: Pardner

## Application Type
Pardner is a local-first coordination tool for tasks shared by humans and AI agents, built on Automerge CRDTs. A person reaches it only through the **local client**. `pardner` or `pardner open` starts a per-user background service on loopback (`~/.pardner/client`) and opens a browser to it. The browser signs in through a one-time `#grant=` link, which is exchanged for an HttpOnly cookie (lib/client-cli.js:57-82, 136-149; lib/client-service.js:261-266, 301-305).

The web page is a React SPA served at `/pardner/` (lib/client-service.js:399). It has these parts:
- identity step
- Start/Join
- project switcher
- invitations
- presence and profiles
- the board: Tasks, Goals, Activity and a **Control** view for the local person only
- task detail side panel

A JSON CLI covers the same ground for agents and operators. The standalone `pardner serve` is only an agent and integration service. Its `/pardner/config` returns no `mode: 'client'`, so the SPA renders only "This is an agent and integration service. Open Pardner with `pardner open`." (ui-prototype/src/Pardner.jsx:194-199; automerge-sync-server.js:504-508).

The SPA is desktop-first with responsive breakpoints at 1100, 839 and 760 px (ui-prototype/src/pardner.css:694, 746, 1261, 1265). There is **no phone or LAN companion**. The board is loopback-only, and docs say phone access "is planned through the hub over HTTPS" (README.md:50-52; docs/PARDNER-CLIENT.md:157-158).

## Tech Stack
- **Runtime:** Node 24.11.1, ESM. `bin/pardner.js:1-13` prints one JSON envelope `{success, ...}` or `{success:false, error:{code,message,details}}` on stdout, plus `CODE: message` on stderr.
- **Client service:** Express plus `ws` (lib/client-service.js). The registry is in SQLite (`node:sqlite`, WAL, `client.sqlite`) (lib/client-registry.js:13-33). Idempotent operations use `attempt(scope, operationId, …)` (lib/client-registry.js:44-61).
- **Project runtimes:** one forked child process per project (lib/client-runtime.js, lib/client-runtime-child.js). Each runs an `AutomergeSyncServer` with a `WorkspaceRuntime` (Automerge replica plus SQLite delivery ledger) on ephemeral loopback ports. The parent reaches it over IPC with a 30 s timeout (`RUNTIME_TIMEOUT`).
- **Frontend:** React and Vite (ui-prototype/), with Markdown rendering (ActorMarkdown and remark mention chips), plain CSS, and native `<dialog>` modals.
  - The browser keeps preferences in localStorage under `pardner:{workspaceId}:{actorId}:preferences`.
  - Pending operations and edit drafts go in sessionStorage (ui-prototype/src/connection.js:40-71).
  - Last project, pending create and pending join live under `pardner:client:*` (ClientApp.jsx:10-12).
- **Sync:** WebSocket per project at `/pardner/client/v1/projects/ID/ws`, opened with a one-use 30 s ticket (lib/client-auth.js:48-59; Pardner.jsx:312-388). There is also REST polling: presence every 5 s, project every 15 s (ClientApp.jsx:13-14).
- **Integrations code:** T3 MCP client (lib/t3-mcp-client.js, lib/t3-execution.js), Cursor Cloud (lib/cursor-cloud-*.js), Codex App Server bridge (lib/agent-bridge.js, lib/codex-bridge-adapter.js), and a Python control runtime driven by launchd (scripts/control-runtime.py).
- **Tests:** Playwright (Chromium and WebKit) via `npm run test:ui` (docs/PARDNER-CLI.md:43-47).

## User Roles
- **Local person (human browser session):**
  - Signs in through `pardner open`, confirms identity, starts and joins projects, switches projects and issues or revokes invitations.
  - Edits tasks, hands off work, comments, resolves conflicts and changes goal and vein status.
  - Sees presence and profiles.
  - Is the only role that sees **Control**: `controlAllowed` requires `humanAuthority !== false` and kind `human` or `operator` (lib/client-service.js:38-41; lib/client-proxy.js:24-39).
  - The session decides authorship. There is no Actor picker, and `actorId` in requests is forced to the session Actor or refused with `ACTOR_MISMATCH` (lib/client-proxy.js:40-42, 62-67).
- **Local operator (CLI holding the operator token in `client-connection.json`):**
  - `client open`, `stop`, `status`, `agent-grant`, `export`, `operation`, `join`, `invite`, `revoke`.
  - `/open`, `/shutdown`, `/agent-grant` and `/export` require `kind === 'operator'`, otherwise `FORBIDDEN` "Local operator authority required" (lib/client-service.js:301-312, 332-365).
- **Project creator (hub owner):**
  - Is the only one who can revoke other members (`client revoke --kind member`): "Only creator may revoke other memberships" (lib/client-service.js:209).
  - Sees all project invites, not only their own (lib/client-invites.js:47-50).
- **Invited human (on their own client, as a replica):**
  - Has the same board abilities.
  - Invites and revokes are forwarded to the hub (`/replica/:id/invites`, `/revoke`) and need `humanAllowed`.
  - Writes are checked against the hub's `/policy` with a 10 s admission cache (lib/client-service.js:99-142).
- **Agent Actor (credential from `client agent-grant`, used via `--token-file`):**
  - Bound to one project and Actor (`PROJECT_MISMATCH` otherwise; lib/client-service.js:49).
  - Runs coordination CLI commands and claims mentions.
  - Cannot use Control (`FORBIDDEN` "Control is available only to a person using Pardner on this computer").
  - Cannot issue invitations ("Human authority required").
  - Sees only its project in `/session`.
- **Agent-only device:**
  - A client that joined through an Agent invitation with no identity of its own gets `humanAuthority=false`, and its human sessions are revoked (lib/client-projects.js:65-68).
  - A browser grant exchange fails with `FORBIDDEN` "Agent-only device has no human browser authority" (lib/client-auth.js:22).
- **Standalone integration caller:** uses `pardner serve` and coordination commands with `--actor` or `PARDNER_ACTOR`. Writes without one fail with `ACTOR_REQUIRED` (lib/cli.js:178).
- **Bridge process:** `pardner bridge run`, attached to a client project with `--token-file`. It wakes only the credential's Actor (lib/agent-bridge.js:46-51).
- **Control-runtime operator:** `control start|status|stop|restart|open|cli|seal|entrypoints` (scripts/control-runtime.py:389). People use `control open`; agents use `control cli --agent HARNESS -- …` or the `pardner-<harness>` wrapper scripts.

## Feature Map

### 1. Launch, sign-in and service lifecycle — lib/client-cli.js:28-182, lib/client-auth.js:10-47, ui-prototype/index.html:11-27, src/main.jsx:6-25, src/ClientApp.jsx:49-110
- `pardner [open] [--data directory] [--output-file private-launch-file]`: "Open Pardner in your browser, starting your local client service if it is not running." (lib/cli.js:10-12).
  - It probes `client-connection.json` and classifies the result as `absent`, `unreachable`, `running` or `foreign` (client-cli.js:28-40).
  - If needed it spawns a detached `client serve` that logs to `client.log` and waits 15 s (client-cli.js:57-82).
  - It passes serve flags through: `--http-port --public-url --worktree --device-name --harness --name --model --managed-by` (client-cli.js:16).
- `pardner client serve [--data] [--http-port] [--harness ID] [--name NAME] [--model MODEL] [--managed-by APP] [--public-url HTTPS_ORIGIN]` returns `{serving:true, mode:'client', localUrl}` (client-cli.js:108-115).
- `pardner client open` POSTs `/open` and gets `{url: …/pardner/#grant=…}`. The grant is valid for 60 s and is origin-bound (client-auth.js:10-17).
  - It launches the browser with `open` or `xdg-open`.
  - With `--output-file` it writes the URL instead.
  - It returns `{localUrl, launchIssued:true}`.
- `pardner client status` / `client list` return `GET /session` (`identity`, `device`, `suggestedIdentity`, `setupAgent`, `projects[]`).
- `pardner client stop` POSTs `/shutdown` with the operator token and waits for the storage lease. It returns `{stopped:true|false, running:false}` (client-cli.js:85-101).
- Error codes:
  - `PORT_IN_USE`: "… is answering but is not this Pardner client; stop that process or start with --http-port" (client-cli.js:42), or "Port N is in use by another process; choose another --http-port" (client-service.js:428-429).
  - `CLIENT_START_FAILED`, `CLIENT_START_TIMEOUT`: "Client service did not answer within 15s; see …/client.log".
  - `CLIENT_STOP_TIMEOUT`.
  - `CLIENT_NOT_RUNNING`: "Start Pardner with pardner open or pardner client serve" (client-cli.js:117).
  - `LAUNCH_UNAVAILABLE`: "Use --output-file to store a private browser launch URL on this platform", "Browser launcher unavailable; retry open with --output-file", "Browser launch failed; retry client open".
  - `STORAGE_IN_USE`.
  - `INCOMPATIBLE_SCHEMA`: "Choose a fresh client directory; existing data is preserved" (client-registry.js:19).
- Browser startup:
  - The static shell shows "Pardner / Opening your workspace… / If this page does not open, check that Pardner is running on your computer (start it with `pardner open`)." with a **Reload Pardner** button.
  - After 12 s or on a script error it shows "Pardner could not finish loading. Reload the page; if this continues, rebuild the browser client and restart the service." (index.html:11-27).
- `captureBootstrapGrant()` removes `#grant=` from the URL before render (main.jsx:6-7; client-api.js:19-34).
- The StartupBoundary crash screen reads "Pardner could not open … Allow browser site storage, then reload…" with **Reload Pardner** (main.jsx:9-20).
- Config load failure shows the error, then "Check that Pardner is running on your computer. Start it with `pardner open`, then retry." and **Retry connection** (Pardner.jsx:188-193).
- ClientApp phases (ClientApp.jsx:84-89, 100-110):
  - Loading: "Opening your local client…".
  - Signed out: "This browser isn't signed in to your local Pardner client." If the grant was reused, it adds "The sign-in link was already used or has expired. Links from your agent work once." Then "Ask your agent to open Pardner for you. It runs `pardner client open`…" with **Check again**.
  - Error: `Failure` plus **Retry**.
- A `hashchange` carrying a new grant re-runs bootstrap (ClientApp.jsx:67-72).
- The cookie is `pardner_<clientId>`, HttpOnly, SameSite=Strict, valid for 1 year (client-service.js:264).
- Host and Origin are enforced: `ORIGIN_REJECTED` "Open the configured client address" / "Origin not allowed" / "Same-origin JSON required" (client-service.js:252-255, 297).

### 2. Identity and device linking — ClientApp.jsx:112-158, lib/client-service.js:313-324, lib/client-identity.js:13-46
- The **Welcome to Pardner** heading is followed by "Confirm how people in your projects will see you." Fields are **Name** and **Email**. Both are pre-filled from `git config user.name/user.email` (`gitDefaults`).
- Helper text is either "Filled in from your Git configuration." or "Git didn't provide a name and email here, so enter them once.", followed by "…They don't sign you in, and Pardner never changes your Git settings."
- The submit button reads **Continue as {name}**, or "Continue as this person" when the name is empty, and **Saving…** while busy.
- The page also shows "This device: {device name}" (the hostname by default, or `--device-name`).
- The link **Link this device instead** opens the **Link this device** page: "A My device invitation from your own client adds this computer under your existing identity." It has a textarea **My device invitation**, a **Link device** button (**Linking…** while busy) and **Back to confirming my identity**.
  - Pasting the wrong kind of invitation is refused on the client side with `DEVICE_INVITATION_REQUIRED`: "Agent invitations are for your agent, not this browser." / "This is a Human invitation. Confirm your identity first, then join with it." / "Paste one complete My device invitation." (ClientApp.jsx:132-141).
- CLI: `pardner client identity --name NAME --email EMAIL --operation-id ID`.
- Validation: "Supply a name" / "Supply an email" (client-identity.js:13-17). Changing an existing identity fails with `IDENTITY_EXISTS` "Identity already initialized; linking requires My device" (client-service.js:318). An operation ID reused with different input fails with `OPERATION_ID_REUSED`; the UI then mints a new one.

### 3. Start, join and switch projects — ClientApp.jsx:162-306, lib/client-projects.js:27-108
- The **Welcome, {name}** page (or **Start or join a project** when a project already exists) reads "A project is a shared board for you, the people you invite and your agents." A toggle group "Choose how to begin" offers **Start a project** and **Join a project**.
- **Start a project:**
  - Field **Project name**, max length 120.
  - Text: "You join as {name}. {Agent} ({Codex|Claude Code|Cursor}) is registered as your agent. It shows as offline until it connects, and as active only while it reports work."
  - Button **Start project** (**Starting…** while busy).
  - Resume notice: "An earlier attempt to start "{name}" didn't confirm. Starting it again resumes that attempt." The operation ID is kept in sessionStorage `pardner:client:pending-create`.
  - CLI: `pardner client create --name NAME --operation-id ID`.
  - Errors: `IDENTITY_REQUIRED` "Confirm your identity before creating a project", "Supply a project name".
- **Join a project:**
  - Textarea **Invitation**, placeholder "Paste the invitation or setup prompt you were sent".
  - Hint: "Invitations work once and expire. You keep your own identity; nobody else can create it for you."
  - Button **Join project** (**Joining…** while busy).
  - A SHA-256 of the invitation and the operation ID are stored in `pardner:client:pending-join` so a reload can resume the attempt.
  - CLI: `pardner client join --invitation-file FILE --operation-id ID [--harness ID --name NAME --model MODEL --managed-by APP]`.
- Join error hints (`JOIN_HINTS`, ClientApp.jsx:21-31):
  - `INVITE_EXPIRED`
  - `REVOKED`
  - `INVITE_USED`
  - `INVALID_INVITATION` ("Check that you pasted the whole invitation, exactly as it was sent.")
  - `IDENTITY_MISMATCH`
  - `DEVICE_INVITATION_REQUIRED`
  - `HUB_UNAVAILABLE` ("The project's hub is unreachable… Retry when it is back; nothing was lost.")
  - `HUB_REQUIRED`
  - `CLIENT_UNREACHABLE` ("Your local Pardner client may have stopped. Ask your agent to reopen it, then retry.")
- Server-side join errors:
  - "Remote invitations require HTTPS; use a secure private route" (client-invites.js:13).
  - `IDENTITY_REQUIRED` "Confirm your identity before joining".
  - `WORKSPACE_MISMATCH` "Enrollment returned another project".
  - `IDENTITY_MISMATCH` "This client belongs to another human".
  - `REGISTRATION_PENDING` "Actor registration is not saved locally yet; retry this join" (client-projects.js:99).
- **Back to {current project}** is shown when a project already exists (ClientApp.jsx:244).
- **Project switcher**:
  - The header `h1` button is labelled "Project: {name}. Switch project" and has a chevron.
  - It opens a `menu` with arrow-key, Home, End, Escape and Tab handling (ClientApp.jsx:248-306).
  - Each project is a `menuitemradio` showing its name and `syncLabel`, with " · unconfirmed change" if a pending op exists.
  - Sync labels: "Status not reported", "Project service unavailable", "Local save failed", "Saving locally…", "Saved locally · waiting for hub", "Saved locally · synced" (client-api.js:121-128).
  - The last item is **Start or join a project…**.
  - The last project is remembered in localStorage `pardner:client:last-project`.
- Project open states (ClientApp.jsx:533-542):
  - Loading: "Opening project…".
  - Failure: "This project didn't open." with **Retry** and **Open another project**.
- `pardner client show --project ID` returns `{project, actors, presence}` (client-service.js:327-331).

### 4. Invitations (Human / Agent / My device) — ClientApp.jsx:308-447, lib/client-invites.js:24-122, lib/client-service.js:366-380
- The header button **Invite ▾** opens a menu:
  - **Human**, "A person and their agent". Dialog title "Invite a person".
  - **Agent**, "Another agent of yours". Dialog title "Connect another of your agents": "…It joins as your agent; Pardner doesn't start or instruct it."
  - **My device**, "Another computer you use". Dialog title "Add one of your devices".
- The InviteDialog (modal) shows the title, the project name, a **Close** button and a purpose blurb.
  - **Create invitation** (**Creating…** while busy) creates the invite.
  - The state line shows **Waiting to be used** / **Used** / **Revoked** / **Expired**, plus "Expires in N min|h · {date}" or "Expired {date}".
  - Actions are **Copy invite**, **Show invite text** / **Hide invite text**, and **Revoke**.
  - Copy status: "Copied. Treat it like a password and send it privately; it works once." / "This browser blocked copying. Use Show invite text and copy it manually." / default "The invitation stays hidden so it can't be read from a shared screen."
  - Revealing shows the warning "Visible on screen. Stop sharing your screen before copying." and a read-only textarea **Invite text**.
  - Once unusable: "This invitation can no longer be used. Create a new one if you still need it."
  - The history section **Invitations for this project** shows "Loading…", "None yet.", or rows of purpose, state and expiry, with a **Revoke** button (aria "Revoke {Human|Agent|My device} invitation").
- Invitations expire after 24 h (client-invites.js:35). The envelope is `pardner-invite-v1.<base64url>`, carried inside a setup prompt (`invitationPrompt`).
- CLI:
  - `pardner client invite --project ID --purpose human|agent|device --output-file FILE --operation-id ID` writes the prompt to the file and prints `{invite, invitationFile}`.
  - `pardner client revoke --project ID --kind device|agent|member --id ID --operation-id ID`. There is no UI for member, device or agent revocation.
- Error codes:
  - "Choose Human, Agent or My device".
  - `REVOKED` "Invitation revoked".
  - `INVITE_USED` "Invitation belongs to a different recipient".
  - `INVITE_EXPIRED`.
  - `IDENTITY_MISMATCH` "Existing human identity requires My device proof" / "Device belongs to another identity".
  - `FORBIDDEN` "Invitation is owned by another human" / "Human authority required".
  - `NOT_FOUND` "Invitation not found".
  - `HUB_REQUIRED` "This service is not the authority".

### 5. People, presence, avatars, profiles and focus markers — ClientApp.jsx:449-555, src/Avatar.jsx, src/presence.js, lib/client-presence.js
- The header shows the "Pardner" brand, the switcher, an **AvatarStack** "People in this project" (up to 5, then a **+N** button: "N more Actors. Show everyone"), **Invite**, and the **You: {name}** button ("You: {name}, human, active. Open your profile").
  - If the hub is down it also shows "Remote presence unavailable" (ClientApp.jsx:508-518).
- Avatars show initials, a bot glyph for agents, a stable hue and a presence dot. Labels read "{name}, agent|human, active|idle|offline" (Avatar.jsx:31-52).
- Presence states are **Active**, **Idle** and **Offline** (presence.js:7).
  - The browser reporter sends heartbeats every 15 s and goes idle after 120 s, with reports at least 1 s apart.
  - Activity means pointerdown, keydown or input on a visible page (presence.js:5-88; ClientApp.jsx:475-492).
  - The session ends on pagehide.
  - Server limits: TTL 45 s, at most 32 focus IDs, `PRESENCE_LIMIT` at 1024 sessions, `STALE_PRESENCE_REPORT`, `SESSION_EXPIRED` "The presence session has ended; start a fresh session" (client-presence.js:32-113).
- **ProfileDialog** (Avatar.jsx:88-152):
  - Heading `{name} (you)`, followed by "Human" or "Agent · {human}'s agent" and the presence state.
  - **Identity** section: Works for, Harness, Git name, Git email, Devices. Missing values show "Not reported". Note: "Git details are profile information. They do not sign anyone in."
  - **Live sessions N** section. With none: "No live session reported to this view. Offline means none is connected here, not that work stopped." Each session lists Device, Model (agents), Managed by (e.g. T3), Focus (task links that open the task) and "Expires in N s/min without a report".
- The **PeopleDialog** "People in this project" lists every Actor with avatar, name link, kind and presence (Avatar.jsx:154-173).
- **Focus markers:**
  - Each task card shows a "Here now" avatar stack (max 3) of Actors focused on it (Pardner.jsx:675, 780-786).
  - The task panel shows "Here now" (max 6, clickable to profiles) (Pardner.jsx:1268-1272).
  - The open task is reported as focus (Pardner.jsx:276-277).

### 6. Task board (Tasks view) — Pardner.jsx:540-683, 905-1081
- The header has **SaveStatus**: "Connecting to local service" / "Saving locally…" / "Local service disconnected" / "Local save failed" / "Saved locally · waiting for hub" / "Saved locally · synced" (Pardner.jsx:133-150).
  - The primary button **New task** is disabled while busy or while a request is pending.
- Nav "Workspace views": **Tasks**, **Goals**, **Activity**, and **Control** only if `controlAvailable`. Buttons use `aria-pressed`.
- Board filters, remembered per project and Actor:
  - **Assigned to** (All Actors / "{name} · {kind}")
  - **Status filter** (All statuses + 7 statuses)
  - **Vein** (All veins + vein titles)
- Columns: Backlog, Up next, In progress, Review, Completed, Dead end, Abandoned. Each heading shows a count, and an empty column shows "No tasks here".
- Cards are sorted by priority, then order. Each card shows the priority (P0–P3), title, "{assignee} · {kind}" or "Unassigned", vein labels, a **Conflicting edits** label and focus markers.
- **New task** side panel:
  - Heading "New task" with **Close**.
  - "Creating as {name} · {kind}", or "Your Actor isn't on this board yet. Wait for the project to sync; your draft is kept."
  - Fields: **Title** (blank: "Enter a title that is not only spaces."), **Description**, **Status** (default Backlog), **Priority** (P0–P3, default P2), **Assignee** (Unassigned / Actors), **Tags, separated by commas**.
  - Buttons: **Create task** (**Creating…** while busy) and **Discard draft** when the draft is dirty.
  - The draft survives closing the panel, in memory only. Escape closes the panel unless typed text would be lost.
  - On success the new task's detail panel opens.
- CLI equivalents: `pardner tasks [--assignee] [--status] [--vein] --json`, `pardner task create --title … [--description] [--assignee] [--vein v1,v2]`.

### 7. Task detail, edit, drafts and conflicts — Pardner.jsx:1117-1655, 1083-1115
- While loading, the panel shows **Close**, "Opening task…" and any error.
- Header: the task title (focused on open) and **Close**. Below it: SaveStatus, "Here now", the line "{assignee} · {status} · {priority}" and "Veins: {title} ({status}), …".
- **GitHub issues** section:
  - Links to `owner/repo#N` with **Unlink**, or "No linked issues. Linking does not contact GitHub."
  - Field **Link GitHub issue** (placeholder `owner/repo#123`) with **Link issue**. Invalid input shows "Name the issue as owner/repo#number."
- **Edit task**:
  - Opens an inline editor with the same fields, **Save changes** and **Cancel edit**.
  - The draft is saved to sessionStorage per project, Actor and task, so it survives close, reload and project switches. Only changed fields are sent, each with its expected revision.
  - If someone saves over a field you are editing, a notice reads "{Name} saved a newer {fields} since you started editing. Your draft is unchanged." followed by "…saving is refused until you choose…" and the button **Base my draft on the latest version** (Pardner.jsx:1283-1309).
- **Status** quick select appears only when there is an Actor, no open editor or handoff, and no status conflict (task-status.js:3-4).
- Field conflicts:
  - Section **Resolve {field}**: "Both edits are preserved. Choose the value to keep." Each alternative has an author and a **Keep this {field}** button (`task.resolve`).
  - Integrity conflicts show **Unresolved operation ID conflict**: "Retry key {id} acknowledged different requests. Both are preserved…" with details.
- **Evidence** lists commits, or shows "No commit evidence linked yet."
- **History** lists event sentences from `describeEvent`, without comments.
- Errors are shown next to the form that failed: `task.update`, `task.handoff` or `comment.add` (Pardner.jsx:51, 1255-1260).
- `STALE_UPDATE` shows "Your draft is preserved. Review the latest context before making a new edit."
- CLI: `pardner show <task>`, `update <task> --status … --revisions JSON`, `resolve <task> --field … --value … --revisions …`, `diff <task>`, `issue link|unlink`, `link-commit`, `commit --task … -- <git args>`, `branch`, `branches`, `merge`, `trace list|show|task`.

### 8. Comments, mentions, read receipts and handoff — Pardner.jsx:1398-1627, src/mentions.js, src/comments.js, src/handoff.js
- **Comments N · K new** heading with a **Mark all read** button (`read.mark`, disabled when nothing is new).
  - Comments show author, time and a **New** tag. Markdown is rendered, images appear as alt text, and delivered mentions become chips titled "Notified {name · kind}".
  - Comment edit conflicts show **Keep this comment**.
- Composer:
  - Textarea **Comment**, placeholder "Share progress or mention an Actor with @handle", button **Add comment**.
  - Unknown handles trigger the hint "@x matches no Actor and won't notify anyone." (mentions.js:28-33).
  - Editing and deleting comments are CLI-only: `comment-edit`, `comment-delete`.
- **Hand off work** opens the form **Hand off work**:
  - Fields: **Recipient** (Choose an Actor), **Handoff status** (defaults to Review when the task is In progress, otherwise unchanged; handoff.js:3) and **Handoff message** (required).
  - Buttons: **Hand off** and **Cancel handoff**.
  - If the task changed while you were writing: "This task changed while you were writing: now {assignee} · {status}. Your draft is preserved." with **Use latest task details**. **Hand off** stays disabled until you choose.
  - On success: "Handed off to {name · kind} · {status}."
- CLI and agents:
  - `pardner comment <task> text`, `comments <task>`, `read <task> --receipts JSON`, `handoff <task> --to Actor --status review --message text --revisions JSON`.
  - `mentions pending`, `mentions claim-next --request-id id [--ttl-ms 30000]`, `mentions ack <mention> --claim-token`, `mentions release <mention> --claim-token`.

### 9. Goals and veins — Pardner.jsx:788-903, src/RecordConflicts.jsx, src/record-status.js
- The **Goals** view lists goals sorted by status (open, achieved, abandoned) and then by creation time. Each goal shows its title, a **Status of goal {title}** select (Open/Achieved/Abandoned) and its description.
  - With no veins: "No veins pursue this goal yet."
  - Each vein shows a title button that opens the Tasks board filtered to that vein, a **Status of vein {title}** select (Open/Proven/Dead end/Abandoned), "N task(s)" and a **Ready for a verdict** label.
- Disputed status shows a pill such as "Open or Achieved".
- The disclosure **Conflicting edits: title, status…** reads "{Field}: both edits are kept until you choose one." Buttons are **Keep {value}** for status or goal, otherwise **Keep {authors}'s {field}**.
- With no goals: "No goals yet. Start a vein with `pardner vein create --title … --goal …`." Goals and veins **cannot be created in the UI**.
- CLI: `goals`, `goal create|show|update|resolve`, `veins`, `vein create --title --goal <ID or new title>` (`GOAL_REQUIRED`), `vein show|update|resolve|add|remove`.

### 10. Activity feed — Pardner.jsx:20-24, 403-417, 615-627, 700-731; src/events.js
- Filters:
  - **Performed by** (Any Actor / Actors)
  - **Show** (All changes; Status changes and handoffs; Comments; Commits and branches; Goals and veins; Actors registered; Read receipts)
- The heading **Activity** shows "Showing X of Y". Events are grouped under day headings ("Today", "Yesterday", or a weekday date).
- Each row is a sentence with buttons for the task, vein and goal it mentions. Task subjects open the detail panel; vein subjects go to the filtered board; goal subjects scroll to the goal.
- Paging: **Show older activity** loads 100 more; the end shows "Start of activity".
- Empty states: "No activity yet." / "No activity matches these filters."
- CLI: `pardner activity [--task id] [--actor Actor] [--limit 20]`.

### 11. Control tab: T3 and Cursor Cloud (local person only) — src/ControlPane.jsx, src/CloudControl.jsx, lib/client-proxy.js:10-39, automerge-sync-server.js:430-474, lib/control-pane.js
- Loading: "Opening control records…". When the pane is disabled: "This service is not running a control pane."
- The heading **Control** has a **Read T3 now** button. The status line reads "T3 credential: {status} · expires … · T3 {version} · qualified 0.1.5, 0.1.6. These records stay on this computer and are not synchronized or published to GitHub."
- When the credential is expired, expiring or rejected: "Pair T3 again before the credential stops working…".
- The **Control settings** disclosure, open when no sessions exist, contains:
  - **T3 credential**: fields **T3 address** (default `http://127.0.0.1:3773`) and **T3 pairing code**; button **Pair T3** / **Pair again**.
  - **Projects**: fields **Project ID**, **Project name**, **GitHub repository** (placeholder owner/name); button **Save project**.
  - **Map a T3 thread**: "Each thread gets one agent Actor. Only top-level, approval-required threads are accepted." Fields **Project**, **T3 thread ID**, **Agent Actor**, checkbox groups **Authorized tasks** and **Authorized senders**; button **Map thread**.
- With no mappings: "No T3 threads are mapped yet."
- **SessionCard** per thread:
  - Freshness: "Not read from T3 yet" / "Read Ns ago" / "Stale: …".
  - Identity: Project, Agent, Provider, Session, Location, Environment.
  - Notices: unqualified notes, "Last T3 pass failed: …", "Dispatch held: …".
  - Hold release form: **Review evidence**, **Reviewed runs**, an optional checkbox "Accept this T3 version for this controller", button **Release held work**.
  - Follow-up form: **Task for this run**, **Follow-up for {agent}**, the note "Saved in Pardner first; it is sent to T3 only when the thread is idle and nothing is held.", button **Queue follow-up**.
  - **Runs N** list, or "No runs yet".
- **ExecutionCard** per run:
  - State labels: Queued in Pardner, Submitting, Running, Waiting for approval or input, Cancellation requested, Ended, Unknown outcome. Blocked runs say "T3 is waiting for a decision on this run." with a **Decide in T3** link.
  - Output appears under "Output captured from T3".
  - Verdicts list Execution, Independent check and Human acceptance.
  - Cancel buttons: **Withdraw follow-up**, **Cancel this run** or **Repeat cancellation**.
  - For unknown outcomes: **Look for this request in T3**, and a form with **Reconciliation evidence** plus **Retry with the same request** / **Abandon this outcome**.
  - After the run ends: **Verdict type** (Human acceptance / Independent check), **Verdict evidence**, **Accept** / **Reject**, and **Record artifact** (placeholder `commit abc1234`).
- **Cursor Cloud** section:
  - Status: "Dispatch enabled|Live dispatch disabled · Transport configured|Access not configured · Live qualification pending."
  - **Register Cloud context** disclosure with seven fields and a **Register Cloud context** button.
  - Per context: **Save Cloud intent**, **Cancel exact Cloud run**, **Reconcile Cloud acceptance**, **Accept Cloud result** / **Reject Cloud result**, **Freeze attempt evidence** (fields: Full commit hash, Diff evidence, Test command and results), **Release reviewed Cloud hold**.
- The view polls every 2 s. If the service is unreachable, the last view stays and is marked stale (ControlPane.jsx:216-240).
- Error codes:
  - `FORBIDDEN` for agents or unsupported routes.
  - `ACTOR_MISMATCH` when the caller field names someone else.
  - `LOCAL_ADMIN_REQUIRED`, `ROUTE_REJECTED`, `AMBIGUOUS_ROUTE`, `CONTROLLER_CONFLICT`, `INVALID_EXECUTION_STATE`, `UNREVIEWED_RUN`, `HOLD_CHANGED`, `CREDENTIAL_CHANGED`, `UNQUALIFIED_THREAD`, `VERSION_ACCEPTANCE_REQUIRED`, `CONTROL_UNAVAILABLE`.
  - `T3_REJECTED`/`T3_BUSY`/`T3_UNKNOWN` (502/503/504) (client-service.js:406-409).

### 12. Agent CLI, agent grants and the bridge — lib/cli.js:119-288, lib/client-cli.js:170-180, lib/agent-bridge.js:20-77, 361-419
- `pardner client agent-grant --project ID --output-file FILE [--harness ID]`:
  - Operator only. Writes `{token, actorId, projectId, harnessId, model?, managedBy?, apiBase}`.
  - Fails with `FORBIDDEN` "Harness is not enrolled on this device; join an Agent invitation first", "Unsupported execution harness", or `ACTOR_MISMATCH` (client-service.js:349-365).
- `pardner --token-file FILE <coordination command>`:
  - Takes the token and `apiBase` from the file and resolves the Actor through `/session` (cli.js:120-147).
  - Errors: "Supply --token or --token-file, not both", "--token-file is empty".
- `pardner client operation --project ID --request JSON [--harness ID]` runs a raw operation as the local agent.
- `pardner client export --project ID --output-file FILE` writes a `pardner-workspace-view-v1` content export. It fails with `STORAGE_FAILED` "Local storage is not confirmed saved".
- The proxy allows only these board operation types (client-proxy.js:5-7), otherwise `FORBIDDEN` "This operation is not available to board credentials":
  - task: `create`, `update`, `resolve`, `handoff`, `link-commit`, `branch`, `merge`, `link-vein`, `unlink-vein`, `link-issue`, `unlink-issue`
  - comment: `add`, `edit`, `delete`, `resolve`
  - `read.mark`
  - goal and vein: `create`, `update`, `resolve`
- `actors register` therefore cannot run through a client.
- Bridge commands:
  - `pardner bridge run|status|approve-cleanup|revoke-cleanup --config /abs/bridge.json [--token-file FILE]`
  - `bridge inspect --endpoint ws://… --session THREAD --worktree PATH`
  - `bridge reconcile --config … --delivery ID --decision accepted|retry --evidence TEXT`
- Bridge config errors:
  - `WORKSPACE_MISMATCH` "The bridge credential belongs to another project".
  - `ACTOR_MISMATCH` "A client agent credential wakes only its own Actor; map that Actor alone".
  - "Authorize explicit task IDs; wildcard dispatch is not supported".
  - "Use a dedicated bridge-owned session…".
  - "This bridge supports codex-app-server…".

### 13. Control runtime — scripts/control-runtime.py, docs/PARDNER-CONTROL-RUNTIME.md
- `control start|status|stop|restart|run|cli|open|seal|entrypoints [--home] [--agent]`, launched by launchd (`app.pardner.control`).
- `status` prints JSON with `healthy` and exits 1 when unhealthy.
- `open [-- --output-file FILE]` runs `pardner client open` against the installation. It never starts a service.
- `cli --agent openai-codex -- tasks --json` and the `pardner-<harness>` wrappers fetch an agent grant and run with `--token-file`. They reject `serve`, `bridge`, `client`, `open`, `--actor` and connection overrides.
- Failures print `CONTROL_RUNTIME_UNAVAILABLE` JSON. Messages include "Name an agent harness from config.agents; people use control open" and "A control job is already loaded; inspect status or explicitly restart its installation" (control-runtime.py:271-346, 426-431).
- First run creates the identity and project from `config.identity` / `config.projectName` using stable operation IDs.

### 14. Standalone service (agents and integrations only) — lib/local-service.js, automerge-sync-server.js:504-520
- `pardner serve [--role hub|replica] [--data] [--hub URL] [--hub-ws URL]` writes `connection.json` and returns `{serving, role, workspaceId, httpUrl, wsUrl}`.
- Its `/pardner/` page shows only "This is an agent and integration service. Open Pardner with `pardner open`."
- Raw mutations other than operations fail with `OPERATION_REQUIRED` "Use attributed Pardner operations for workspace changes".
- `pardner actors register <id> --handle --kind human|agent --actor author` is available here.

## Navigation Structure
- **Entry:** `pardner` / `pardner open` → browser `/pardner/#grant=…`, which is stripped from the URL. Then:
  - startup shell
  - `/pardner/config` → ClientApp (client mode), or the standalone notice
- **ClientApp state machine (no router or URL paths):** `loading` → (`signed-out` | `error`) → IdentityStep (or the **Link this device** sub-page) → Welcome (Start/Join) → ProjectView.
- **ProjectView header:** brand, then ProjectSwitcher (projects plus **Start or join a project…**, which goes back to Welcome with **Back to {project}**), then AvatarStack (Profile / People dialogs), **Invite** menu (InviteDialog), **You** (own Profile), SaveStatus and **New task**.
- **Views (nav buttons, persisted per project and Actor):** Tasks | Goals | Activity | Control (local person only).
- **Overlays:**
  - New task side panel
  - Task details side panel, opened from a card, an Activity subject or a Profile focus link
  - Modal dialogs for Profile, People and Invite
- Escape closes panels and dialogs unless typed text would be lost or a dialog sits on top. Focus returns to the control that opened the panel.
- **Cross-links:** a vein title or subject goes to the Tasks board filtered by vein. A goal subject goes to Goals and scrolls to the goal. A Profile focus link opens that task.
- **No deep links:** the URL never encodes the project, view or task. State comes from storage.

## Data Entities
- **Client identity (person):**
  - Create: IdentityStep, `client identity`, or adoption through a My device / Agent join.
  - Read: `/session`.
  - Update: not supported (`IDENTITY_EXISTS`).
  - Delete: none.
- **Device:** created automatically with the registry (hostname or `--device-name`). Read from the profile's Devices list and "This device:". Revoked with `client revoke --kind device`.
- **Browser session / cookie:** created by the bootstrap grant exchange. There is no logout UI. Revoked server-side, which surfaces as `AUTH_REQUIRED` → signed-out screen.
- **Project:**
  - Create: **Start project** / `client create`. Join: **Join project** / `client join`.
  - Read: switcher, `client list` / `show`.
  - Export: `client export`.
  - No rename or delete. Membership state `revoked` hides the project from the session.
- **Invitation:**
  - Create: **Create invitation** / `client invite`.
  - Read: **Invitations for this project** list.
  - Revoke: **Revoke**.
  - Redeemed by join. Expires after 24 h.
- **Admission / membership:** created on redeem. Revoked with `client revoke --kind member|device|agent`.
- **Actor (human / agent):**
  - Created with the project (person plus setup agent) or on join. Standalone services use `actors register`.
  - Read: avatars, profiles, selects, `actors list`.
  - Never deleted. Agents are revocable.
- **Agent grant (credential):** created by `client agent-grant`. It is reused until revoked.
- **Presence session:** started, reported and ended automatically by the browser, or by agents through `/sessions` routes. Read through snapshots in avatars and profiles. Expires after a 45 s TTL.
- **Task:**
  - Create: **New task** / `task create`.
  - Read: board, panel, `tasks`, `show`.
  - Update: **Edit task**, quick **Status**, **Hand off**, **Keep this {field}**, `update`, `handoff`, `resolve`.
  - No delete. Tasks end as completed, dead-end or abandoned. Branch and merge via CLI.
- **Comment:**
  - Create: **Add comment** / `comment`.
  - Read: panel, `comments`.
  - Update: `comment-edit`; resolve conflicts with **Keep this comment**.
  - Delete: `comment-delete` (CLI only).
  - Read receipts: **Mark all read** / `read`.
- **Mention / delivery:** created by an `@handle` in a comment. Read through `mentions pending`. Claim, ack and release through the CLI or bridge.
- **Goal:**
  - Create: CLI `goal create`, or implicitly through `vein create --goal "new title"`.
  - Read: Goals view.
  - Update: status select / Keep buttons / `goal update|resolve`.
- **Vein:**
  - Create: CLI `vein create`.
  - Read: Goals view, Vein filter.
  - Update: status select / Keep / `vein update|resolve`.
  - Tasks are attached with `vein add|remove`.
- **GitHub issue link:** create with **Link issue** / `issue link`; delete with **Unlink** / `issue unlink`.
- **Commit evidence:** created by `link-commit` / `pardner commit`. Read in the panel's **Evidence** section and with `trace`.
- **Operation (activity event):** created by every write. Read in Activity, History, `activity` and `diff`.
- **Pending request (browser):** saved before sending. Cleared on confirmation or definitive error. Replayed with **Retry saved request**.
- **Edit draft / new-task draft:** stored in sessionStorage or memory. Cleared with **Cancel edit**, **Discard draft** or a save.
- **Control records (host-local, never synchronized):**
  - T3 credential: **Pair T3**.
  - Control project: **Save project**.
  - Thread mapping: **Map thread**.
  - Execution: **Queue follow-up**, then cancel, reconcile or resolve.
  - Artifact: **Record artifact**.
  - Verdict: **Accept** / **Reject**.
  - Holds: **Release held work**.
  - Cloud context, execution and evidence: Register, Save intent, Freeze, verdicts.
- **Bridge inbox delivery:** created by bridge receipt. Read with `bridge status`. Resolved with `bridge reconcile`.

## Integrations
- **Git:** profile defaults come from `git config user.name/email` (client-identity.js:43-46). `pardner commit --task … -- <git args>` links commit evidence and traces. Pardner never edits Git settings.
- **GitHub:** stores an issue reference (`owner/repo#N`) only and never contacts or changes GitHub ("Linking does not contact GitHub."). Control projects can name a GitHub repository.
- **T3 Code (MCP):** pairing code → approval-required credential (`t3-credential.json`), qualified versions 0.1.5 and 0.1.6. Supports thread mapping, follow-up dispatch, polling, approvals ("Decide in T3") and output capture (lib/control-pane.js:12-20).
- **Cursor Cloud:** contexts and executions. The transport is optional; the UI shows "Live qualification pending".
- **Codex App Server:** the agent bridge wakes dedicated bridge-owned sessions. The only adapter is `codex-app-server`.
- **Agent harnesses:** `openai-codex`, `anthropic-claude-code`, `cursor` (shown as Codex, Claude Code, Cursor). `--managed-by T3` is reporting metadata.
- **Hub/replica sync:** the inviting client is the hub. Joined clients become replicas that sync through `/pardner/client/v1/replica/:id/native` WebSocket and `/policy`, `/people`, `/presence`, `/delivery`, `/invites`, `/revoke`. A remote route needs `--public-url` (HTTPS, or HTTP on loopback).
- **Browser APIs:** Clipboard for **Copy invite**, `crypto.subtle` for the join digest, local and session storage.
- **OS:** `open`/`xdg-open` for launch, and launchd for the control runtime.

## Error, Empty and Loading States
- **Loading:**
  - "Opening your workspace…" (shell and config)
  - "Opening your local client…"
  - "Opening project…"
  - "Opening the project board…"
  - "Opening task…"
  - "Opening control records…"
  - Invitation list "Loading…"
  - Busy button labels: Saving…, Starting…, Joining…, Linking…, Creating…
- **Startup failures:**
  - Shell timeout or script error message (index.html:22).
  - StartupBoundary "Pardner could not open".
  - Config fetch failure plus **Retry connection**.
  - "The local client configuration is incomplete. Restart Pardner and retry." (connection.js:31-33).
- **Auth:** signed-out screen ("…already used or has expired. Links from your agent work once.", **Check again**). `AUTH_REQUIRED` on any request, the socket or presence polling sends the user to the signed-out screen (ClientApp.jsx:457-473; Pardner.jsx:289-295).
- **Connectivity:**
  - `CLIENT_UNREACHABLE` "The local Pardner client did not respond. Check that it is still running, then retry." (client-api.js:57-59).
  - Board not reachable: "The project board isn't reachable yet." plus **Retry connection**.
  - "Live updates disconnected. Reconnecting automatically." The socket reconnects with exponential backoff up to 15 s, and resumes on online, focus or visibility.
  - "The service sent an unreadable update. Reconnecting…"
  - SaveStatus "Local service disconnected".
- **Saves and retries:**
  - Notice "A request is awaiting confirmation." with **Retry saved request**.
  - "Resolve the saved request before starting another change." (preflight).
  - ErrorNotice "Your last confirmed data remains available." / **Dismiss**.
  - "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes." (connection.js:51).
  - "Local save failed".
  - Definitive codes that clear the pending request: `STALE_UPDATE`, `CONFLICT_REQUIRES_RESOLUTION`, `INVALID_ARGUMENT`, `AMBIGUOUS_ACTOR`, `NOT_FOUND`, `OPERATION_ID_REUSED` (Pardner.jsx:465-476).
- **Hub and replica:**
  - "Saved locally · waiting for hub".
  - "Remote presence unavailable".
  - `HUB_UNAVAILABLE` "Project authority unavailable; retry this attempt" (client-projects.js:10).
  - `REVOKED` "Project access revoked; local data remains saved".
  - `ACTOR_REVOKED`.
  - `LOCAL_SERVICE_UNAVAILABLE` "Project runtime failed to start; retrying after Ns" (client-service.js:64).
  - `RUNTIME_TIMEOUT` "Runtime response unknown; retry the same request".
  - `SERVICE_STOPPING` 503 "Client is stopping".
  - `WORKSPACE_MISMATCH` "The service workspace changed. Reopening the current workspace."
- **Empty states:**
  - "No tasks here"
  - "No goals yet. Start a vein with `pardner vein create …`"
  - "No veins pursue this goal yet."
  - "No activity yet." / "No activity matches these filters." / "Start of activity"
  - "No linked issues…"
  - "No commit evidence linked yet."
  - "No description yet."
  - Invites "None yet."
  - Profile "No live session reported to this view…" / Focus "No task" / "Not reported"
  - "No T3 threads are mapped yet." / "No runs yet" / "Not read from T3 yet" / "Nothing captured."
- **Validation:**
  - "Enter a title that is not only spaces."
  - "Name the issue as owner/repo#number."
  - Mention hint "@x matches no Actor and won't notify anyone."
  - "Your Actor isn't on this board yet…"
- **Stale data:**
  - Draft notice with **Base my draft on the latest version**.
  - Handoff notice with **Use latest task details**.
  - Control freshness "Stale: last read …" / "Stale: the service is unreachable; last known read …".
- **CLI:** every error is a JSON envelope with a stable code. The HTTP status mapping is at lib/client-service.js:401-414.

## Recommended Story Topics
1. **First launch and sign-in:** covers `pardner` / `pardner open`, the one-time grant becoming a cookie, `--output-file`, reused or expired links (signed-out, **Check again**), startup shell failures, `client status` / `client stop`, and `PORT_IN_USE` / `CLIENT_START_TIMEOUT` / `LAUNCH_UNAVAILABLE`. It is the only way in for people and has many failure branches.
2. **Identity confirmation and device linking:** covers Git-prefilled **Welcome to Pardner**, **Continue as …**, **Link this device instead** with a My device invitation, wrong-purpose refusals, `IDENTITY_EXISTS`, and `client identity`. This step gates everything else and has subtle rules about which invitation goes where.
3. **Start, join and switch projects:** covers **Start project** and its resumed attempts, **Join project** with a pasted prompt and its JOIN_HINTS errors, `client create` / `client join`, the project switcher with sync labels and "unconfirmed change", and the "This project didn't open" recovery. This is the core onboarding and multi-project navigation.
4. **Invitations lifecycle:** covers the Human / Agent / My device menu, **Create invitation**, **Copy invite** / **Show invite text**, expiry and state labels, **Revoke**, the history list, `client invite`, `client revoke --kind member|device|agent`, and creator-only member revocation. Invitations are security-sensitive and have rich state.
5. **People, presence, profiles and focus:** covers the avatar stack and +N People dialog, **You** profile, Active / Idle / Offline transitions (120 s idle, hidden tab), "Here now" markers on cards and the panel, profile Live sessions with focus links that open tasks, and "Remote presence unavailable". This is the real-time collaboration surface.
6. **Task board and creation:** covers the seven columns, Assigned to / Status filter / Vein filters persisted per project, the **New task** panel (validation, Discard draft, Escape behavior, "Creating as …"), and the opened-after-create flow. This is the main day-to-day surface.
7. **Task detail, editing, drafts and conflicts:** covers **Edit task** drafts that survive reload and project switches, the newer-save notice and **Base my draft on the latest version**, the quick **Status** select, **Resolve {field}** / **Keep this {field}**, integrity conflicts, GitHub issue link and unlink, Evidence and History. This holds the most complex concurrency UX.
8. **Comments, mentions, read receipts and handoff:** covers **Add comment** with an @mention hint and Notified chips, **New** tags and **Mark all read**, **Keep this comment**, **Hand off work** (default status, stale "Use latest task details", success message), and the agent side: `mentions pending/claim-next/ack/release`. This is the human-agent communication loop.
9. **Goals, veins and Activity:** covers goal and vein status selects, disputed pills and **Keep …** conflict disclosures, **Ready for a verdict**, vein links to the filtered board, CLI-only creation (`vein create --goal`), and Activity filters, day grouping, subject navigation and **Show older activity**. This is the planning layer and the audit trail.
10. **Control tab (T3 and Cursor Cloud):** covers visibility only for the local person, **Pair T3**, **Save project**, **Map thread**, **Queue follow-up**, holds and **Release held work**, run cancel, reconcile and resolve, verdicts and artifacts, the Cursor Cloud context and execution flows, freshness and stale states, and `FORBIDDEN` / `ACTOR_MISMATCH` for agents. This is a large, authority-gated execution surface.
11. **Agent credentials, CLI and bridge attach:** covers `client agent-grant` (harness enrollment errors), `pardner --token-file … tasks/show/comment/handoff`, `client operation`, refusal of non-board operations, `bridge run/status --token-file` with single-Actor mapping rules, and `control cli --agent` / wrapper entrypoints. This is how agents take part in client projects.
12. **Resilience, recovery and boundaries:** covers offline and disconnected states with **Retry saved request**, the single-pending-request rule, hub outage on a replica ("waiting for hub", `HUB_UNAVAILABLE`), revocation leading to the signed-out or `REVOKED` screens, `client export`, the standalone `pardner serve` page ("This is an agent and integration service…"), control-runtime `start/status/open/stop`, and confirming that no phone or LAN companion exists. These are cross-cutting failure and recovery stories.
