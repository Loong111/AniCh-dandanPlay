# AniCh Dandanplay Userscript — Progress Tracker

> **Task**: Replace the obsolete AniCh-native takeover approach with a dandanplay-only AniCh userscript.
> **Started**: 2026-04-19
> **Last Updated**: 2026-04-19

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
| 4 | Control Corrections | 2 | 1 | 50% |

## Phase Checklist
- [x] Phase 1: foundation (3/3 tasks) — [details](./phase-1-foundation.md)
- [x] Phase 2: data-and-rendering (3/3 tasks) — [details](./phase-2-data-and-rendering.md)
- [x] Phase 3: controls-and-verification (2/2 tasks) — [details](./phase-3-controls-and-verification.md)
- [ ] Phase 4: control-corrections (1/2 tasks) — [details](./phase-4-native-control-enhancements.md)

## Current Status
**Active Phase**: Phase 4 — Control Corrections
**Active Task**: Manual browser verification of the external toolbar, top-first scroll lanes, opacity, and filter behavior
**Blockers**: Browser extension runtime validation must be performed manually by the user; local validation can only cover syntax and static structure.

## Next Steps
1. Refresh the local userscript in the browser extension runtime.
2. Verify the external toolbar stays outside the player card, does not cover the video, and still works after seek, cutover, pause/resume, and fullscreen changes.
3. Verify sparse scrolling danmaku fill from the top of the configured region and `opacity` only changes alpha, not vertical position.
4. Verify the external toolbar can be dragged, remembers its side/vertical position after reload, and still stays outside the player card.
5. Verify type filters, keyword filters, and regex filters still work with the toolbar-only control model.

## Session Log
| Date | Session | Summary |
|:-----|:--------|:--------|
| 2026-04-19 | 1 | Created spec-driven analysis, planning, progress, and project-skill artifacts before implementation |
| 2026-04-19 | 2 | Replaced the old AniCh-native interception script with a dandanplay-only runtime, updated progress tracking, and recorded live proxy smoke checks |
| 2026-04-19 | 3 | Added native control takeover, display-region separation, opacity fix, filtering controls, and a new enhancement tracking phase pending manual browser verification |
| 2026-04-19 | 4 | Reworked controls into a toolbar-only external entry, fixed top-first scroll lane selection, finalized opacity animation variables, and refreshed Phase 4 verification targets |
| 2026-04-19 | 5 | Added draggable toolbar persistence with remembered side and vertical offset, and exposed the saved position through the debug stats payload |
