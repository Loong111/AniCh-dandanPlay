# Phase 5: Skip Cue Prompt

**Goal**: Detect `空降` danmaku cues, surface a right-bottom jump prompt, and leave final playback validation to user-run manual checks.
**Status**: Complete

## Tasks
- [x] **Task 5.1**: Implement `SkipCue` parsing, prompt lifecycle, and debug exposure
  - Priority: P0
  - Effort: M
  - Acceptance: The runtime extracts the first valid `空降` cue from deduped normalized comments, ignores invalid-first cues by falling forward to the next valid one, shows a right-bottom prompt when playback reaches the cue trigger, auto-closes after `5s` or target-time arrival, supports rewind re-arm, and exposes cue/prompt state through `window.__anichDanmaku__.getStats()`.
  - Notes: `SkipCue` remains outside `NormalizedDanmaku`; parsing supports `m:ss`, `mm:ss`, `h:mm:ss`, `m.ss`, and full-width colon forms. The prompt click only updates `video.currentTime` and does not override pause/play state.
- [x] **Task 5.2**: Run user manual verification for skip prompt playback behavior
  - Priority: P1
  - Effort: S
  - Acceptance: User confirms normal jump, invalid-first fallback, duplicate-cue precedence, rewind re-trigger, and prompt teardown across seek/fullscreen/route changes on live AniCh playback.
  - Notes: User completed this verification on `2026-04-22`, including the follow-up fix for the bottom control bar hit area.

## Phase Notes
- Local static validation completed with `node --check anich-danmaku-fix.user.js`.
- Debug stats now expose both `skipCue` selection state and `skipPrompt` UI state for browser-console inspection.
- Skip prompt behavior is independent from visual danmaku filtering and uses raw normalized comments as its source of truth.
- User manual verification passed on `2026-04-22`, covering cue detection, prompt countdown, click-to-seek, timeout close, rewind re-arm, and the bottom control bar clickability fix.

## Phase Completion Checklist
- [x] Task 5.1 complete with S.U.P.E.R boundaries preserved
- [x] Task 5.2 manually verified by user
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to project completion state
