# Phase 4: Control Corrections

**Goal**: Finalize display-region, opacity, filtering, and control-entry behavior with the external toolbar model.
**Status**: Complete

## Tasks
- [x] **Task 4.1**: Implement display-region, opacity, filtering, and external-toolbar corrections
  - Priority: P0
  - Effort: M
  - Acceptance: The custom runtime uses a single external toolbar outside the player card; `displayRegionRatio` affects only scrolling lanes and sparse comments fill from the top; `opacity` affects only alpha through animation variables; type, keyword, and regex filtering all apply before scheduling.
  - Notes: The earlier native-takeover experiment was superseded by the toolbar-only model. The panel keeps the existing tabs and status views, mode `6 -> ltr` stays enabled, and the runtime no longer depends on AniCh native control selectors.
- [x] **Task 4.2**: Run manual browser verification on live AniCh playback
  - Priority: P0
  - Effort: M
  - Acceptance: The external toolbar stays outside the player card and does not cover the video; its toggle/settings actions work; the toolbar can be dragged and remembers its side/vertical position; `25%` display region limits only scrolling comments; opacity no longer shifts comment position; type/keyword/regex filters work; seek, pause, fullscreen, and route changes keep the toolbar and panel usable.
  - Notes: Manual verification was completed by the user on `2026-04-20` because the local environment cannot run the userscript inside a browser extension runtime.

## Phase Notes
- Local static validation completed with `node --check` plus structural assertions for toolbar-only control flow, opacity animation variables, top-first scroll lane selection, and filter pipeline presence.
- The toolbar now persists `left/right + top offset` under local storage and keeps the panel anchored to the same side after drag/reload.
- Title resolution now waits for AniCh `window.$data` twice before falling back, uses `section[title]`-based selectors, and strips AniCh site suffixes from `document.title` fallback values.
- User manual verification passed on `2026-04-20`, covering toolbar placement, drag persistence, `25%` display-region behavior, opacity-only alpha changes, type/keyword/regex filtering, seek/pause/fullscreen/route-change usability, and clean title resolution on `/b/37922/2` and `/b/37928/3`.
- Browser validation is no longer a release gate for this phase.

## Phase Completion Checklist
- [x] All tasks above are checked off
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to project completion state
