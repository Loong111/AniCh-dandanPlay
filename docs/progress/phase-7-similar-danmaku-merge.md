# Phase 7: Similar Danmaku Merge

**Goal**: Collapse similar visible comments into counted display comments such as `弹幕x10` using dynamic burst intervals instead of fixed global time buckets.
**Status**: In Progress

## Tasks
- [x] **Task 7.1**: Implement pure similar-merge helpers and settings contract
  - Priority: P0
  - Effort: M
  - Acceptance: Visible comments are clustered after filtering and before scheduling; dynamic intervals start at the first similar comment and close at the last similar comment before inactivity/max-span limits; defaults are available as `80%` threshold, `>=2` min count, `5s` gap, and `18s` max span.
  - Notes: The user confirmed that min count, adjacent gap, and max span must also be adjustable in settings. After the 2026-04-30 playback regression report, the feature default was changed to off until live verification passes.
- [x] **Task 7.2**: Add settings UI, debug stats, density controls, and documentation for merge controls
  - Priority: P0
  - Effort: S
  - Acceptance: Settings panel exposes enable, similarity threshold, min count, adjacent gap, max span, max same-moment emits, independent max scheduled comments, numeric density inputs, one-second local-density peak shaving, and the optional merge-priority density mode; settings persist under `anichDanmaku:settings`; debug stats report merge and density-limit counts.
  - Notes: Keep `NormalizedDanmaku` renderer compatibility by producing display comments with the same core fields plus optional `merged*` debug metadata.
- [ ] **Task 7.3**: Run static checks and user manual verification for merged playback
  - Priority: P1
  - Effort: S
  - Acceptance: `node --check` passes; live playback confirms similar bursts render as counted comments, threshold/min-count/gap/span/max-emit/max-load controls take effect, filters apply before counts, seek/offset/fullscreen remain stable, and SkipCue still uses original comments.
  - Notes: Live AniCh/userscript-manager verification remains user-owned.

## Phase Notes
- Analysis is recorded in `docs/analysis/similar-danmaku-merge.md`.
- Recommended flow is `transport -> normalize -> store -> filters -> similar merge -> Scheduler -> Renderer`.
- Merge must not mutate source buckets, source stats, Bilibili import records, or SkipCue input comments.
- Implemented in `anich-danmaku-fix.user.js` v2.6.0 as pure helper logic plus settings-panel wiring.
- Static validation: `node --check anich-danmaku-fix.user.js` passes.
- Helper probe validation passed for dynamic cluster merge, strict-threshold behavior, gap splitting, and repeated short text similarity.
- README and project skill were updated to document the merge controls and runtime boundary.
- Regression response: v2.6.1 changes similar merge to opt-in by default, ignores any accidental v2.6.0 persisted enabled state unless the new opt-in key is present, and wraps the merge step in a fallback guard so merge failures cannot block normal filtered comments.
- Hotfix validation: `node --check`, `git diff --check`, boot probe with pre-hotfix enabled state, and opt-in helper probe all pass.
- Fullscreen regression follow-up: v2.6.2 hides/detaches custom toolbar, panel, import popover, matcher, and skip prompt during browser fullscreen, forces the danmaku overlay tree to `pointer-events: none`, and lowers fullscreen overlay stacking so dense danmaku cannot block native player clicks. User observed the issue may depend on extremely high danmaku density because lower-count episodes behave normally.
- Density-control follow-up: v2.6.3 adds settings for max same-moment emits and max scheduled comments after similar merge. Scheduler now drops due comments beyond the per-frame emit limit instead of building an unbounded DOM burst, while the post-merge schedule list can be evenly capped across the whole episode.
- Density-control refinement: v2.6.5 makes same-moment emits and max scheduled comments mutually constrained by video/comment duration, adds direct numeric inputs beside the sliders, and adds an opt-in `合并优先` mode that preserves merged counted comments before unmerged single comments during density limiting.
- Control and density refinement: v2.6.6 debounces slider commits so dragging does not rerun filtering/scheduling on every input event, avoids overwriting focused numeric inputs during panel refresh, and changes density coupling to one-second candidate-comment buckets so sparse seconds do not receive artificial capacity from the full episode duration.
- Density and import-source correction: v2.6.7 decouples max scheduled comments from same-moment emits, changes the default max scheduled comments to 10000, keeps same-moment emits as one-second local peak shaving, and briefly removed cross-source fuzzy dedupe while investigating source-bucket accounting.
- Cross-source dedupe correction: v2.6.8 restores the 0.2s same-text/type fuzzy duplicate window for later source buckets, keeps the raw one-second peak statistic visible in the runtime summary, and expands source-bucket summaries with raw, accepted, and deduped counts.
- SkipCue hotfix: v2.6.9 restores the skip prompt in browser fullscreen by removing it from the fullscreen-hidden UI group, makes prompt click seek to `targetTime - offset`, and immediately refreshes the scheduler after the seek. Static validation plus a local SkipCue/CSS probe passed; live fullscreen click verification remains user-owned.
- Control UI refresh: v2.7.0 adds an Apple-inspired visual layer for the external toolbar, settings panel, Bilibili import popover, matcher, switches, sliders, and skip prompt using a single #0066cc action color, frosted light surfaces, 44px circular toolbar buttons, pill/18px radius grammar, press-scale micro-interactions, and responsive control layouts. Static validation, diff whitespace validation, and a local CSS structure probe passed; live AniCh visual verification remains user-owned.
- Scheduler CPU optimization: v2.7.3 keeps danmaku counts, filters, merge, SkipCue, timing, settings, and UI behavior unchanged while caching scheduler density config outside the hot path and replacing continuous playback RAF polling with timer-based next-danmaku/SkipCue wakeups. Timers stop when playback is paused, danmaku is disabled with no SkipCue work, playback is ended, all scheduled comments have been emitted, or no video is bound; video play, seek, and ratechange events restart or resync scheduling. `node --check`, `git diff --check`, targeted static hot-path checks, and a local Scheduler timer lifecycle probe passed; live CPU comparison remains user-owned.
- No-loss performance plan: batch 1 covers (1) runtime-only MutationObserver filtering plus stable same-video rebind short-circuit, (2) renderer text-width measurement caching, and (3) layer-level animationend delegation. Batch 2 is deferred until user live verification passes and covers (4) batch DOM insertion, (5) ResizeObserver size-change guard, (6) closed-panel lightweight updates, and (7) cached video lookup.
- Batch 1 implementation: v2.7.4 implements items 1/2/3 without changing danmaku count, timing, style, SkipCue, filters, merge behavior, settings, or source data. `node --check`, `git diff --check`, targeted static checks, Scheduler timer lifecycle probe, and Renderer cache/delegation probe passed; user live verification is required before continuing with items 4/5/6/7.
- Cross-source dedupe follow-up: v2.7.5 addresses live `x2` overlap after the user confirmed the performance improvement. Fuzzy dedupe keys now use normalized similarity text, later source buckets estimate a stable source-level timing offset with one vote per normalized text for dedupe matching only, source summaries expose non-zero alignment offsets, and VM harness checks passed for shifted cross-source duplicates, same-source repeats, small-evidence no-offset behavior, repeated-common-text no-offset behavior, syntax, and diff whitespace. Live multi-source verification remains user-owned.
- Batch 2 partial implementation: after the user verified v2.7.5, v2.7.6 implements items 4/5 only. Renderer now builds due comments with the same lane/timing/style logic but appends each frame's nodes through a single `DocumentFragment`, and ResizeObserver now short-circuits when container width/height are unchanged so it does not clear the overlay or refresh the scheduler unnecessarily. Items 6/7 remain deferred. `node --check`, `git diff --check`, static hot-path checks, and a local Renderer/ResizeObserver harness passed; live CPU/behavior verification remains user-owned.
- Batch 2 continuation: v2.7.8 implements item 6 only. `ControlPanel.update()` is split into toolbar, import-popover, and full-panel refresh paths so closed settings panels skip range/mode/similar/density input sync, token-list rebuilds, regex-error text, run-summary text, and match-summary text while toolbar state and active/loading/error import UI still update. The control entry is also moved into a page-integrated dock inserted between AniCh `player-wrap` and `player-info`, with inline settings expansion and retained Bilibili import hover behavior. Item 7 cached video lookup remains deferred until user verification.
- Control-click hotfix: v2.7.9 constrains the page-integrated dock to AniCh's desktop player column with `width: calc(100% - 35rem)` under `section[player-block]`, restores full width below the site's 70rem responsive breakpoint, and hardens dock/action pointer handling so the desktop episode list cannot intercept settings or danmaku-toggle clicks. `node --check` and `git diff --check` passed; live click verification remains user-owned.
- Import-popover direction refinement: v2.7.10 changes the page-integrated Bilibili import popover from below-dock placement to above-dock placement using `bottom: calc(100% + 0.55rem)`, clears stale inline edge values when docked, and keeps the existing hover lifecycle, import state updates, and input/list behavior unchanged. Live hover-position verification remains user-owned.
- Import-popover stacking fix: v2.7.11 raises the page-integrated control dock stacking level above the custom danmaku overlay (`2147483003` vs overlay `2147483000`) so the upward-opening Bilibili import popover remains visible over active danmaku without changing renderer timing, count, or animation behavior. Live overlap verification remains user-owned.
- Performance live verification: user verified the full macOS Chrome flow after v2.7.11 at about 15 page CPU without the script, about 20 with the script loaded, and about 50 during window/fullscreen switching for roughly 5 seconds before returning to about 20. The no-loss performance optimization track is complete; the remaining cached video lookup item is not needed unless a future regression or explicit request reopens it.

## Phase Completion Checklist
- [x] Task 7.1 complete with S.U.P.E.R boundaries preserved
- [x] Task 7.2 complete with settings/debug/docs updated
- [ ] Task 7.3 complete with static validation and live manual verification recorded
- [x] User manual performance verification completed on live AniCh playback
- [x] MASTER.md phase count updated
- [x] MASTER.md current-status section updated
