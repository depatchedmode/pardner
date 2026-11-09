# STORY-081: Agent commits work and the human reviews Evidence and History

Walked 2026-11-09. Juniper (agent on Theo's computer, `client agent-grant` credential) ran `pardner commit … --token-file juniper.json` inside a scratch Git repo (`lantern-repo`). Maya Okafor reviewed in Chromium 1440×900 on her own client. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-081/` (video in `videos/`).

## Steps
1. **Juniper commits**: `pardner commit --task <id> --model gpt-5 --session s-91 --token-file … -- -am "Retry webhook delivery with exponential jitter"`. Git's `[main a88971d] …` went to stderr. stdout printed `{success:true, trace:{commit:{hash, message, author}, agent:{name:<actor ID>, model:"gpt-5", sessionKey:"s-91"}, task, diff:{stat:"", shortstat:""}}, receipt:{…}}`. Matches. In the trace, `agent.name` is the raw Actor ID and `diff.stat` is empty although one file changed. The command also left `.agent-trace/` and a new **untracked `.gitignore`** in the repository, so the working tree is dirty right after the commit.
2. **Evidence** (`screenshots/step-2-evidence.png`, `step-2b-evidence-live.png`): Evidence lists `a88971df4cc977639e1e4b72482ba99b73f253a4` in small monospace with the message underneath. There is no author, time or link. A second commit, made while the panel was open, appeared in Evidence without a reload. Matches. Geometry: only the known `button.task-card` wrap false positive.
3. **History** (`screenshots/step-3-history.png`, `step-3b-history-long.png`): "Juniper linked commit a88971d to this task — “Retry webhook delivery with exponential jitter”". A long first line is cut at 100 characters with "…". Matches.
4. **Activity → Show: Commits and branches** (`screenshots/step-4a-activity.png`, `step-4b-activity-commits.png`, `step-4c-subject-opened.png`): "Showing 1 of 1 · Today · Juniper linked commit a88971d to [Retry webhook delivery with jitter]", with the task as a link-styled button that opens the panel. Matches. With the panel open, the Activity filters are hidden under it, and the activity column ends at the panel edge. The "Performed by" filter lists "Setup agent · agent" three times (F-072-03).
5. **Quick Status → Review** (`screenshots/step-5-review.png`): the server status is `review`. Matches STORY-072.

Edge cases (CLI):
- Outside a repository: `GIT_REPOSITORY_REQUIRED: Run this command inside a Git repository`. Matches.
- No args after `--`: `INVALID_ARGUMENT: Put Git commit arguments after --`. Matches.
- Git failure ("nothing added to commit"): Git's own explanation goes to stderr, then `GIT_COMMIT_FAILED: Git commit failed` with `details:null`. Usable.

Mobile check (`screenshots/mobile-check.png`, 390×844): the Evidence hashes fit. Geometry: card false positives only.

Console/page errors: none.

## Flagged claim verdicts
No flagged claim names STORY-081.

## Flow Log
- Ideal 3 (agent commit, open the task, read Evidence); actual 3. Activity was an optional fourth view.
- Redundancy confirmed: the same commit appears in Evidence (full hash and message), History (short hash and quote), Activity, and the CLI trace. Evidence adds only the full hash.
- No hesitation. Evidence gives no author or time, so Maya relies on History to see that Juniper made it.

Status: pass
