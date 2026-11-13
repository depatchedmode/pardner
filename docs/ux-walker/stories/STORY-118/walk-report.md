# STORY-118 walk report: Record an independent check and a rejected human verdict, with artifact mistakes

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-118/`.

**Setup.** The mapped fake-T3 thread authorizes only the task "Fix CSV export rounding in invoices", so the ended run used was T3 run 10, "Bump the CSV library to 4.2." (completed with output "Bumped."), and not a separate "Add retry to webhook sender" task. The verdict and artifact behaviour does not depend on the task.

## Steps
0. **Ended card** (`screenshots/step-0-ended.png`): "Ended: completed", the output and the verdict list are shown. Geometry: clean.
1. **Independent check**: Verdict type → "Independent check", evidence "CI run #881 green on 3 Node versions", **Accept** (`screenshots/step-1-check.png`) → "Independent check: accepted by Maya Okafor". Confirmed. **The Verdict type select stays on "Independent check" after submitting.** If Maya does not switch it back, her next Accept or Reject is recorded as another independent check.
2. **Switch back to Human acceptance**, evidence "Retry loop lacks jitter; send back", **Reject** (`screenshots/step-2-reject.png`, `screenshots/step-2-verdicts.png`) → "Execution completed | Independent check accepted by Maya Okafor | Human acceptance rejected by Maya Okafor". Both are kept separately. Confirmed. The same person recorded both the "independent" check and the human acceptance without any warning. The evidence text for either verdict is not shown.
3. **`pr 412`** (`screenshots/step-3-bad-kind.png`): 400 "Artifact kind must be one of: commit, branch, pull_request, test_result, note". Confirmed. The placeholder suggests only `commit abc1234`. The input's label and the button are both "Record artifact".
4. **`pull_request okafor-labs/ledgerline#412`** (`screenshots/step-4-pr.png`): recorded. The list shows "• `pull_request` okafor-labs/ledgerline#412 · Maya Okafor". Confirmed. The kind is shown as a raw snake_case token, and the PR is not a link.
5. **`commit main`** (`screenshots/step-5-commit-main.png`, `screenshots/step-5-final.png`): 400 "Supply a commit hash". Confirmed. The typed value is kept, but the error shows off-screen and briefly (F-111-01).
- **Variation: only the latest verdict of each kind is shown** (`screenshots/var-second-human.png`): a second Human acceptance, **Accept** with "Jitter added in follow-up; accepting now", replaces "rejected by Maya Okafor" with "accepted by Maya Okafor". The earlier rejection is no longer visible anywhere. Confirmed.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console: two 400s for the deliberate artifact mistakes. There are no page errors.

## Flagged claim verdicts
None of the flagged claims touch STORY-118.

## Flow Log
- Ideal path: 4 (check plus evidence, reject plus evidence, artifact text, record). Actual: 6 on the happy path (two extra select changes, because the type does not reset), plus 2 failed artifact attempts. The allowed kinds appear only in an error message.
- Hesitation: the free-text "kind value" format, and having to switch the type back by hand.
- Duplicated: the commit and PR are recorded here as well as through the board's task links (a host-local copy).

Status: pass
