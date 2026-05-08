# AniCh Dandanplay Userscript — Progress Tracker

> **Task**: Deliver and maintain an AniCh-specific Dandanplay danmaku userscript.
> **Started**: 2026-04-19
> **Last Updated**: 2026-05-09

## References
- [Project Overview](../analysis/project-overview.md)
- [Module Inventory](../analysis/module-inventory.md)
- [Risk Assessment](../analysis/risk-assessment.md)
- [Similar Danmaku Merge Analysis](../analysis/similar-danmaku-merge.md)
- [Task Breakdown](../plan/task-breakdown.md)
- [Dependency Graph](../plan/dependency-graph.md)
- [Milestones](../plan/milestones.md)

## Phase Summary

| Phase | Name | Tasks | Done | Progress |
|:------|:-----|------:|-----:|:---------|
| 1 | Foundation | 3 | 3 | 100% |
| 2 | Data And Rendering | 3 | 3 | 100% |
| 3 | Controls And Verification | 2 | 2 | 100% |
| 4 | Control Corrections | 2 | 2 | 100% |
| 5 | Skip Cue Prompt | 2 | 2 | 100% |
| 6 | Bilibili Import Overlay | 5 | 4 | 80% |
| 7 | Similar Danmaku Merge | 3 | 2 | 67% |

## Phase Checklist
- [x] Phase 1: foundation (3/3 tasks) — [details](./phase-1-foundation.md)
- [x] Phase 2: data-and-rendering (3/3 tasks) — [details](./phase-2-data-and-rendering.md)
- [x] Phase 3: controls-and-verification (2/2 tasks) — [details](./phase-3-controls-and-verification.md)
- [x] Phase 4: control-corrections (2/2 tasks) — [details](./phase-4-native-control-enhancements.md)
- [x] Phase 5: skip-cue-prompt (2/2 tasks) — [details](./phase-5-skip-cue-prompt.md)
- [ ] Phase 6: bilibili-import-overlay (4/5 tasks) — [details](./phase-6-bilibili-import.md)
- [ ] Phase 7: similar-danmaku-merge (2/3 tasks) — [details](./phase-7-similar-danmaku-merge.md)

## Current Status
**Active Phase**: Phase 7 — Similar Danmaku Merge
**Active Task**: Task 7.3 — remaining live verification for similar danmaku merge controls and counted rendering
**Blockers**: Phase 6 live multi-import verification is still pending; no-loss performance optimization is complete as of v2.7.11

## Next Steps
1. Treat the no-loss performance optimization track as complete: user verified macOS Chrome page CPU at about 15 without the script, about 20 with the script loaded, and a window/fullscreen switch spike to about 50 for roughly 5 seconds before returning to about 20.
2. Do not continue the deferred cached video lookup optimization unless a new live performance regression appears or the user explicitly asks for it.
3. Re-run Phase 6 multi-import live checks when needed, including Bilibili bangumi `ss` links such as `https://www.bilibili.com/bangumi/play/ss4145`, because that manual verification remains pending.
4. If similar-merge counted playback is actively used, verify threshold/min-count/gap/span/max-emit/max-load controls, filters-before-counts behavior, seek/offset/fullscreen stability, and SkipCue original-comment input.

## Session Log
| Date | Session | Summary |
|:-----|:--------|:--------|
| 2026-04-19 | 1 | Created spec-driven analysis, planning, progress, and project-skill artifacts before implementation |
| 2026-04-19 | 2 | Replaced the old AniCh-native interception script with a dandanplay-only runtime, updated progress tracking, and recorded live proxy smoke checks |
| 2026-04-19 | 3 | Added native control takeover, display-region separation, opacity fix, filtering controls, and a new enhancement tracking phase pending manual browser verification |
| 2026-04-19 | 4 | Reworked controls into a toolbar-only external entry, fixed top-first scroll lane selection, finalized opacity animation variables, and refreshed Phase 4 verification targets |
| 2026-04-19 | 5 | Added draggable toolbar persistence with remembered side and vertical offset, and exposed the saved position through the debug stats payload |
| 2026-04-19 | 6 | Stabilized page-context title resolution by waiting for AniCh `$data`, correcting title selectors, and sanitizing `document.title` fallback paths |
| 2026-04-20 | 7 | User completed manual browser verification for Phase 4 and cleared the remaining release gate; progress and planning docs were marked complete |
| 2026-04-21 | 8 | Implemented skip-cue parsing, right-bottom jump prompt lifecycle, rewind re-arm, debug exposure, and appended a new Phase 5 pending user manual verification |
| 2026-04-22 | 9 | User completed manual verification for the skip prompt and bottom-control-bar fix; Phase 5 was marked complete |
| 2026-04-24 | 10 | Added a Phase 6 Bilibili import flow with userscript-authorized requests, source buckets, route-scoped restore, hover popover controls, and static/parser validation; user manual verification is still pending |
| 2026-04-24 | 11 | Migrated Bilibili import from legacy XML to segmented protobuf, stopped forcing anonymous userscript requests so Bilibili cookies can participate, and added cross-source duplicate suppression to avoid doubled弹幕 |
| 2026-04-24 | 12 | Added season-scoped BV/page-offset rules for explicit `?p=` imports, derived route caches for other AniCh episodes, and clear semantics that remove the active season rule without touching other explicit route imports |
| 2026-04-24 | 13 | Extended Phase 6 planning to support multiple concurrent Bilibili imports plus multiple coexisting season auto-mapping chains, updating task breakdown, milestones, and implementation constraints before coding |
| 2026-04-24 | 14 | Fixed the Bilibili import debug/popover state so a failed second import keeps its own BV/P context instead of reverting to the first cached link, hardened per-link remove click handling, and recorded a local state-harness regression check plus syntax validation |
| 2026-04-25 | 15 | Confirmed the core multi-binding save path still reaches 2 records under stubbed transport, traced the live regression to the popover auto-refilling the first saved URL over a non-empty second draft on panel refresh, patched that overwrite condition, and added a targeted ControlPanel state regression check plus syntax validation |
| 2026-04-30 | 16 | Added Bilibili bangumi `ep` import support with PGC metadata resolution, season/episode-number chain derivation, PGC source records, updated Phase 6 docs, and local syntax plus Bilibili endpoint probes |
| 2026-04-30 | 17 | Added Phase 7 planning for similar danmaku merge with user-confirmed adjustable min-count, adjacent-gap, and max-span settings |
| 2026-04-30 | 18 | Implemented similar danmaku merge in v2.6.0 with settings controls, debug stats, README updates, project skill guidance, passing `node --check`, and a VM helper probe for cluster behavior |
| 2026-04-30 | 19 | Responded to the v2.6.0 AniCh playback regression by changing similar merge to opt-in by default in v2.6.1, ignoring accidental pre-hotfix enabled state unless the new opt-in key is present, adding a guarded fallback around the merge stage, and validating syntax, diff whitespace, boot, and helper behavior |
| 2026-04-30 | 20 | Added v2.6.2 fullscreen click-through hardening after user reported a high-danmaku episode creates an apparent overlay that blocks pause/shrink clicks while lower-count episodes behave normally |
| 2026-04-30 | 21 | Added v2.6.3 density controls for max same-moment emits and max post-merge scheduled comments to handle extremely high-danmaku episodes without unbounded DOM bursts |
| 2026-04-30 | 22 | Added v2.6.4 duration-aware density coupling, numeric density inputs, and an initial density-priority toggle, with syntax and helper probes passing |
| 2026-04-30 | 23 | Corrected the density priority switch in v2.6.5 so `合并优先` preserves merged counted comments and drops single comments first |
| 2026-04-30 | 24 | Added v2.6.6 control smoothing with debounced slider commits, editable numeric inputs that are not overwritten during refresh, and local one-second density coupling |
| 2026-05-02 | 25 | Added v2.6.7 max-load decoupling, 10000 default max-load, local peak-only same-moment limiting, and removed cross-source fuzzy dedupe that suppressed imported Bilibili comments |
| 2026-05-02 | 26 | Added v2.6.8 cross-source 0.2s fuzzy dedupe restoration, preserved raw one-second peak summary stats, and made source bucket raw/accepted/deduped counts visible |
| 2026-05-02 | 27 | Added v2.6.9 SkipCue hotfix: restored fullscreen skip prompt visibility, made click-to-seek offset-aware, refreshed the scheduler after jumps, and validated syntax, diff whitespace, plus a local SkipCue/CSS probe |
| 2026-05-02 | 28 | Added v2.7.0 Apple-inspired control UI refresh with frosted external toolbar, 44px circular action buttons, light settings/import/matcher panels, refined switch/range controls, press-scale micro-interactions, responsive layout rules, and local static/CSS validation |
| 2026-05-03 | 29 | Added v2.7.1 Bilibili bangumi `ss` import support: `ss` season links parse to `season_id`, use the current AniCh episode number as the PGC episode number, reuse existing PGC season metadata and chain derivation, update docs, and keep live AniCh verification user-owned |
| 2026-05-04 | 30 | Added v2.7.3 no-loss scheduler CPU optimization after live Chrome data showed script-on baseline CPU stayed high even with zero/currently disabled danmaku: cached density config outside the hot path, replaced continuous playback RAF polling with timer-based next-danmaku/SkipCue wakeups, stopped timers while paused/disabled/no-work, restored scheduling through video play/seek/ratechange events, and validated syntax, diff whitespace, static hot-path checks, and a Scheduler timer lifecycle probe |
| 2026-05-04 | 31 | Planned no-loss performance work in two batches and implemented batch 1 as v2.7.4: ignore runtime-only DOM mutations, short-circuit stable same-video rebinding, cache repeated text width measurement, and delegate animationend cleanup at the renderer layer; batch 2 remains deferred until user live verification passes |
| 2026-05-04 | 32 | Added v2.7.5 cross-source dedupe correction after live multi-source playback showed widespread `x2` counted comments: fuzzy keys now use normalized text, later sources estimate a stable dedupe-only timing offset with one vote per normalized text, source summaries expose offset alignment, and local harness checks cover shifted cross-source duplicates, same-source repeats, small-evidence no-offset behavior, and repeated-common-text no-offset behavior |
| 2026-05-04 | 33 | User verified the v2.7.5 correction and approved continuing no-loss performance items 4/5; v2.7.6 adds renderer batch DOM insertion via `emitMany()` and skips ResizeObserver clear/refresh work when player size is unchanged, with syntax, diff whitespace, static hot-path checks, and a local Renderer/resize harness passing |
| 2026-05-04 | 34 | Added v2.7.7 skip-cue keyword aliases for `空降`, `跳伞`, `指路`, `传送`, and `跳转`; the cue parser now records the matched keyword, prompt eyebrow reflects it, and local parsing probes verify aliases, invalid-first fallback, lead-time filtering, and legacy `空降` behavior |
| 2026-05-04 | 35 | Added v2.7.8 no-loss performance item 6 and an AniCh-integrated control layout: closed-panel updates now skip heavy panel subtree refreshes, while the control bar is inserted between `player-wrap` and `player-info` with inline settings expansion and retained Bilibili import hover behavior |
| 2026-05-04 | 36 | Added v2.7.9 control-click hotfix after the integrated dock could overlap AniCh's desktop episode column: dock width now follows the player column on wide layouts, returns to full width below 70rem, and raises/preserves pointer handling for toolbar action buttons |
| 2026-05-04 | 37 | Added v2.7.10 import-popover direction refinement: the page-integrated Bilibili import popover now opens upward from the control dock with a bottom-right transform origin while preserving the existing hover lifecycle and import UI behavior |
| 2026-05-04 | 38 | Added v2.7.11 import-popover stacking fix: the page-integrated control dock now sits above the custom danmaku overlay stacking level so the upward Bilibili import popover is not visually covered by active danmaku |
| 2026-05-04 | 39 | User completed live macOS Chrome performance verification: page CPU is about 15 with no script, about 20 with the script loaded, and window/fullscreen switching spikes to about 50 for roughly 5 seconds before returning to about 20; the no-loss performance optimization track is considered complete and cached video lookup remains unnecessary unless requested later |
| 2026-05-09 | 40 | Added v2.7.12 Bilibili import fallback: manual imports and cached Bilibili restores can load without a matched Dandanplay base episode, and automatic Dandanplay match failure no longer clears Bilibili-only sources before stopping at the pending-match state |
