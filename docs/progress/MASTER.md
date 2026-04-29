# AniCh Dandanplay Userscript — Progress Tracker

> **Task**: Deliver and maintain an AniCh-specific Dandanplay danmaku userscript.
> **Started**: 2026-04-19
> **Last Updated**: 2026-04-30

## References
- [Project Overview](../analysis/project-overview.md)
- [Module Inventory](../analysis/module-inventory.md)
- [Risk Assessment](../analysis/risk-assessment.md)
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

## Phase Checklist
- [x] Phase 1: foundation (3/3 tasks) — [details](./phase-1-foundation.md)
- [x] Phase 2: data-and-rendering (3/3 tasks) — [details](./phase-2-data-and-rendering.md)
- [x] Phase 3: controls-and-verification (2/2 tasks) — [details](./phase-3-controls-and-verification.md)
- [x] Phase 4: control-corrections (2/2 tasks) — [details](./phase-4-native-control-enhancements.md)
- [x] Phase 5: skip-cue-prompt (2/2 tasks) — [details](./phase-5-skip-cue-prompt.md)
- [ ] Phase 6: bilibili-import-overlay (4/5 tasks) — [details](./phase-6-bilibili-import.md)

## Current Status
**Active Phase**: Phase 6 — Bilibili Import Overlay
**Active Task**: Task 6.5 — live playback verification for multi-link, BV `?p=`, and Bilibili bangumi `ep` import chains
**Blockers**: Live AniCh/userscript-manager verification remains user-owned; local syntax and Bilibili endpoint probes pass

## Next Steps
1. Re-run the live AniCh import flow with multiple Bilibili links, confirming the popover keeps independent draft/input state and per-link `移除` works.
2. Verify one normal BV `?p=` chain and one Bilibili bangumi `ep` chain can auto-restore on later AniCh episodes and merge with Dandanplay comments.
3. Re-run the broader playback checklist for clear-all, seek, pause/resume, fullscreen, filtering, SkipCue, and route teardown.

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
