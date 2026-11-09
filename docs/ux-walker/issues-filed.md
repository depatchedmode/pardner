# Issues filed by ux-walker

> **Retired story IDs.** STORY numbers in this record refer to the retired 2026-11-07 catalog. The current [catalog](../ux-paths/catalog.md) was regenerated for client mode on 2026-11-09 and uses different numbering.

| Issue | Story | Severity | Title | Findings | URL |
|---|---|---|---|---|---|
| #121 | STORY-019 | high | Unsaved drafts are silently discarded by Escape, Actor switch or opening another card | F-019-01, F-019-02, F-008-01, F-014-01, F-027-02, F-133-01, F-017-02 | https://github.com/depatchedmode/pardner/issues/121 |
| #122 | STORY-096 | high | Forget this workspace on the opening screen throws a ReferenceError (D1) | F-096-01 | https://github.com/depatchedmode/pardner/issues/122 |
| #123 | STORY-036 | high | Task side panel covers the header Actor select and New task button | F-036-01, F-019-03, F-023-01 | https://github.com/depatchedmode/pardner/issues/123 |
| #124 | STORY-013 | high | Markdown task lists and tables render broken in Task details | F-013-01, F-017-01 | https://github.com/depatchedmode/pardner/issues/124 |
| #125 | STORY-006 | high | A mistyped token is reported as 'The service credential changed', with misleading service hints | F-006-01, F-102-01, F-010-03, F-110-01 | https://github.com/depatchedmode/pardner/issues/125 |
| #126 | STORY-002 | high | First-Actor notice is not runnable and the bootstrap --actor rule is unexplained | F-002-01, F-002-02 | https://github.com/depatchedmode/pardner/issues/126 |
| #127 | STORY-005 | high | CLI run without the right data directory reports Unauthorized instead of pointing at the data dir | F-005-01 | https://github.com/depatchedmode/pardner/issues/127 |
| #128 | STORY-037 | high | Comments cannot be edited or deleted from the browser | F-037-01, F-038-01 | https://github.com/depatchedmode/pardner/issues/128 |
| #129 | STORY-038 | high | Deleting a comment leaves its text in Activity output with no warning (deletion is not redaction) | F-038-02, F-136-01, F-136-02 | https://github.com/depatchedmode/pardner/issues/129 |
| #130 | STORY-045 | high | vein create --goal with an existing goal title silently creates a duplicate goal | F-045-01, F-045-02 | https://github.com/depatchedmode/pardner/issues/130 |
| #131 | STORY-049 | high | Goals view shows 'Ready for a verdict' but offers no way to record verdicts or move veins/tasks | F-049-01, F-050-01, F-051-02, F-052-02 | https://github.com/depatchedmode/pardner/issues/131 |
| #132 | STORY-120 | high | PARDNER_ACTOR silently filters pardner activity/timeline to one Actor | F-120-01, F-120-02 | https://github.com/depatchedmode/pardner/issues/132 |
| #133 | STORY-134 | high | Activity is unusable at scale: no filters, paging or targets for vein/goal/actor entries | F-134-01, F-132-01, F-134-03, F-134-04 | https://github.com/depatchedmode/pardner/issues/133 |
| #134 | STORY-034 | medium | @mentions of unknown handles fail silently; no handle autocomplete | F-034-02, F-043-01, F-033-02 | https://github.com/depatchedmode/pardner/issues/134 |

## Findings mapped to existing issues (not re-filed)

| Findings | Existing issue |
|---|---|
| F-062-01, F-062-03, F-062-04 (STALE_UPDATE retry can never succeed) | #112 |
| F-016-01, F-001-06, F-013-06 (Forget has no confirmation; chrome placement) | #114 |
| F-001-01, F-001-03, F-010-01, F-001-02, F-107-01 (first-run on-ramp, root URL JSON) | #116 |
| F-034-01, F-008-03, F-027-03, F-063-03 (own comments count as unread) | #117 |
| F-027-04, F-018-02, F-048-01 (raw History/Activity) | #118 |
| F-004-01 tags never shown; F-048-03 no vein picker | #119 |
| F-031-01 (editing a handoff comment cancels the assignee's delivery) | #60 |
| F-015-01 no active-filter indicator / Clear filters | #113 |

## Second pass (multi-service and cli-only stories)

| Issue | Story | Severity | Title | URL |
|---|---|---|---|---|
| #140 | STORY-117 | high | CLI write whose response is lost reports failure with no operation ID | https://github.com/depatchedmode/pardner/issues/140 |
| #141 | STORY-126 | high | Bridge accepts a mapping to a human Actor and drains their mentions | https://github.com/depatchedmode/pardner/issues/141 |
| #142 | STORY-057 | high | CLI list filters accept invalid values and return an empty success | https://github.com/depatchedmode/pardner/issues/142 |
| #143 | STORY-053 | high | Goal and vein conflicts show only a badge | https://github.com/depatchedmode/pardner/issues/143 |
| #144 | STORY-111 | high | A disallowed origin or bind host blocks the app bundle | https://github.com/depatchedmode/pardner/issues/144 |
| #145 | STORY-077 | high | A lost write response blocks all edits though the change landed | https://github.com/depatchedmode/pardner/issues/145 |
| #146 | STORY-081 | high | "Saved locally · synced" shown when sync is unknown or pending | https://github.com/depatchedmode/pardner/issues/146 |
| #147 | STORY-085 | high | A pairing code goes invalid silently while the dialog keeps showing it | https://github.com/depatchedmode/pardner/issues/147 |

Evidence was added as comments on #127 (F-125-01, F-106-01) and #114 (F-097-001).
