# Tasks, comments, and safe retry

## Sub-features

Create and edit attributed tasks; read full context/comments; preserve stale
drafts; retry uncertain operations without duplicate tasks, comments, or history.
Reopen locally saved state after a service restart.

## How to get to it (user POV)

Run `pardner client up --data <scratch dir> --output-file <file>` and open the
one-time grant URL from that file (the signed-in person is the author; there is no
Actor picker), start or join a project, then use **New task** or open a task. The
CLI exposes `task create`, `show`, `update`, and `comment`; mutations need
`--actor` (or `PARDNER_ACTOR`), `update` also needs the `--revisions` read from
`show`, and retries reuse `--operation-id` and payload. The same ID with a
different payload fails with `OPERATION_ID_REUSED`; without the flag every
invocation gets a fresh ID, so an unflagged retry is not deduplicated.

Use `todo add`, `todos`, and `todo complete` to assign, find and finish a review
in the original discussion. Check one item and one mention after a retry. The
named Actor completes it, and Activity identifies the operation and signer.

## Driving it with CLI and Playwright

`npm run verify:smoke` launches a disposable real service, checks readiness with
`status`, registers Alice, creates a task, repeats its operation, reads the task
list, restarts the same data directory, and checks the recovered task and history.
Expected: `savedLocally: true`, `replayed: true` for the retry, one task, one
creation history event attributed to Alice, and unchanged workspace identity.
The printed `output/verification/smoke-*/report.json` records commands, receipts,
candidate, and cleanup results and remains after scratch deletion.

Run `node --test test/pardner-cli-workflow.test.js` for the fuller CLI workflow.
`test/workspace-operations.test.js` (in `npm run test:runtime`) holds the
in-process replay, stale-revision, and storage-failure cases.
`test/ui-conflicts.test.js` exercises **My to-dos** and completion in Chromium
and WebKit. Open an ended task with a review assigned to you, check it off
below the description. Confirm the activity entry in Comments jumps to the
checklist item and shows who finished it and when. The checklist appends the
underlined Actor handle to the instruction, including after a Markdown list.
The browser exercise fails the completion request on a
narrow viewport, checks that Retry is visible in the checklist, and verifies that
retry sends the same saved request. The checklist announces the confirmed
completion. The assigner sees the same checked item after sync. The runtime
partition case checks independent to-do creation and completion alongside a task
outcome.

Run `node --test test/pardner-ui.test.js` after building UI for browser operations.
The browser opens through `withClientWorkspace` (`support/client-workspace.js`) and
uses **New task**, **Title**, **Create task**, **Comment**, **Add comment**, and **Retry saved request**. Its
lost-response case checks identical operation attempts and exactly one comment
through CLI readback. The edit retry exercise holds the saved request,
checks keyboard focus during and after retry, and verifies the same operation is
replayed. It also retries from the board after reloading, then saves text typed
after the original request from the rebased draft. Its stale-write case checks a preserved draft and an
unchanged newer task value. The focus case checks that the Task details heading
has focus as soon as the panel opens, before a user enters a comment or issue
reference. The full-width panel case holds the task read open, checks that the
covered board is inert, walks both Tab directions, and resizes without losing a
comment draft. It opens the **Task actions** disclosure to edit and
checks that Cancel returns focus to it. It also checks that wrapping reveals
the focused control and that Close or Escape keeps the comment for the same
task while the board is open.
Both panel types cover New task without moving it or letting it take focus.
Close restores the task card or New task button. At 320px People and New task
stay reachable, New task floats at the bottom and a long assignee fits within
the edit panel. The frame check scrolls the last card clear of the floating
button on desktop and phone. A short landscape
viewport switches to a full-width panel without losing the draft. The desktop focus case opens
a task, then uses reverse Tab to reach and activate a card beside the panel.
At 1024px it checks the 512px board, keeps the selected card visible on resize
and after a lane change, and confirms that a reply does not undo manual scrolling.
The task read recovery case drops the initial GET and its first retry, then
checks that Retry shows loading and eventually opens the same task in place.
The visual control case measures field border contrast, checks persistent
selection cues in forced colors, and checks the comment field on a touch tablet.
The Outcome case checks the current result in the header, then opens **Task
actions** and checks the select under **Set outcome** on desktop and at 375px.
The long-discussion case checks that the title and Close stay above the content
and the comment field and submit button stay below it as users scroll on
desktop, at 320px, and in short landscape. At 320px the title and Close share
a row, and Tab reaches the composer before wrapping. The case posts once,
checks that the unread stripe
mirrors in RTL, and confirms that marking read preserves the comment text edge
and width.
Typing while a comment is saving keeps the newer draft when the receipt arrives.
Inspect the resulting UI for presentation changes.
The board view test in Chromium and WebKit uses Arrow Right, End and Home to
move between Tasks, Goals and Activity. It verifies selection, focus and which
content and filters are available.
It also checks the single empty-board message, the filtered empty state and
keyboard recovery through Clear filters, and compact defaults on task cards.
At 320px the keyboard path opens Filters from the Tasks toolbar, reaches the
criteria, hides the controls while keeping an active count, then clears the
filter and returns focus to Tasks. A long linked issue stays within the
full-width detail panel.
The comment conflict exercise checks that the author can resolve the conflict
and other Actors see a visible reason for the disabled controls.
The Markdown fixture checks a 1.25rem task title and 1rem throughout the rest
of the sheet, with muted counts and timestamps, authored heading weights and nested list spacing,
checklist alignment and reading order. Task instructions precede issue
management in the Task details panel. Wide tables and code blocks are Tab stops
and scroll with the arrow keys. A short code block adds no Tab stop.
The read-receipt case checks that Mark all read disappears when there are no
unread comments and returns keyboard focus to the Comments heading.

## Gotchas

Fixtures must explicitly register Actors. `test:cli` does not include the separate
vein workflow. A locally saved result does not establish remote hub persistence.
The smoke covers graceful restart of one local hub; use the offline/conflict map
for partition and process-kill guarantees. It does not prove power-loss durability.

## Operation integrity

Schema 5 distinguishes caller retry keys (`requestId` in receipts) from stored
`operationId`/revision identities. `test/operation-integrity.test.js` drives
public operations on disconnected persisted services, both reconnect orders,
restart, canonical equivalence, full provenance, explicit integrity responses,
and Chromium/WebKit inspection. Run it explicitly under the shared heavy-test
lock as well as the full discovered suite. Task context `integrityConflicts`
contains every unresolved request variant; browser details expose those records.
A field resolution does not repair a reused retry key. No automatic repair runs.

Comment deletion is author-only (no moderator exception). The runtime API case
in `workspace-runtime.test.js` and CLI case in `pardner-cli-workflow.test.js`
assert non-author `FORBIDDEN`, preserved content, successful author deletion,
and replay of the same delete operation. `ui-conflicts.test.js` exercises real
concurrent comment edits in Chromium and WebKit: a non-author sees
disabled **Keep this comment** controls with an author-only reason, while the
author can resolve. Browser Edit/Delete controls are absent.
