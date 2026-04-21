# Task Breakdown

## Overview
- **Total Phases**: 5
- **Total Tasks**: 12
- **Estimated Total Effort**: L

## S.U.P.E.R Design Constraints

> All tasks in this plan must produce code that conforms to S.U.P.E.R architecture principles.

- **S (Single Purpose)**: Split session, interception, parsing, storage, scheduling, rendering, and settings concerns even inside a single-file userscript.
- **U (Unidirectional Flow)**: Keep runtime data flow fixed as `fetch -> normalize -> store -> schedule -> render`.
- **P (Ports over Implementation)**: All sources must produce the same `NormalizedDanmaku` structure before reaching store or renderer.
- **E (Environment-Agnostic)**: No bundler, backend, or external runtime dependency. Persist only through browser `localStorage`.
- **R (Replaceable Parts)**: Parser adapters, store policy, scheduler, and renderer must be swappable without touching the rest of the file's contracts.

## Phase 1: Foundation
**Goal**: Establish AniCh session lifecycle, page context parsing, and Dandanplay request flow for the userscript runtime.
**Prerequisite**: Existing script analyzed and request sources confirmed.
**S.U.P.E.R Focus**: `S`, `U`, `P`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 1 | Create injected page-context bootstrap and constants | P0 | S | — | A | S, E | Script runs at `document-start` and exposes a single page runtime entry |
| 2 | Implement `SessionManager` with route/video/container rebinding and token invalidation | P0 | M | 1 | A | S, U, R | Session token rotates on route change; teardown clears overlay, observers, RAF, and store |
| 3 | Implement `FetchInterceptor` with shadow fetch + native abort strategy | P0 | M | 1 | B | U, P, R | Target danmaku requests are shadow-fetched with token and native requests receive `AbortError` |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 1, 2 | M | Low | `anich-danmaku-fix.user.js` |
| B | 3 | M | Low | `anich-danmaku-fix.user.js` |

## Phase 2: Data And Rendering
**Goal**: Normalize all sources and render them in an independent overlay.
**Prerequisite**: Phase 1 complete.
**S.U.P.E.R Focus**: `P`, `R`, `U`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 4 | Implement `ParserAdapters` for local protobuf, bili protobuf, and QQ JSON | P0 | M | 3 | A | P, R | All sources return `NormalizedDanmaku[]` with valid mode/color/time mapping |
| 5 | Implement `DanmakuStore` dedupe, sorting, and stats | P0 | S | 4 | A | S, P | Primary and fallback dedupe rules prevent multi-source duplicates |
| 6 | Implement `Scheduler` and `Renderer` with `rtl/top/bottom` lanes | P0 | L | 2, 5 | B | U, R | Danmaku overlay tracks video time, survives pause/seek/fullscreen, and never reads source-specific fields |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 4, 5 | M | Low | `anich-danmaku-fix.user.js` |
| B | 6 | L | Medium | `anich-danmaku-fix.user.js` |

## Phase 3: Controls And Verification
**Goal**: Ship the minimal control surface and validate the userscript on live AniCh playback.
**Prerequisite**: Phase 2 complete.
**S.U.P.E.R Focus**: `S`, `E`, `R`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 7 | Add settings UI, persistence, debug namespace, and native danmaku hiding | P0 | M | 6 | A | S, E, R | Enable/size/opacity/speed/offset persist via `anichDanmaku:*`; `window.__anichDanmaku__` exposes debug hooks |
| 8 | Run syntax and live-data smoke verification | P0 | M | 7 | A | U, P | Script parses current sample payloads and passes syntax validation; remaining manual checks are documented |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 7, 8 | M | Low | `anich-danmaku-fix.user.js`, `docs/progress/phase-3-controls-and-verification.md`, `docs/progress/MASTER.md` |

## Phase 4: Control Corrections
**Goal**: Finalize the toolbar-only control model and close the remaining live-browser validation gaps.
**Prerequisite**: Phase 3 complete.
**S.U.P.E.R Focus**: `S`, `U`, `R`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 9 | Implement display-region, opacity, filtering, and external-toolbar corrections | P0 | M | 8 | A | S, U, R | The toolbar is the only control entry; `displayRegionRatio` affects only scrolling lanes; sparse scrolling comments fill from the top; opacity changes alpha only; type/keyword/regex filters all apply before scheduling |
| 10 | Run manual browser verification for the corrected toolbar-only model | P0 | M | 9 | A | U, R | Live AniCh playback confirms toolbar placement, drag persistence, `25%` display-region behavior, opacity-only alpha changes, filtering, seek/pause/fullscreen/route-change usability, and clean title resolution |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 9, 10 | M | Low | `anich-danmaku-fix.user.js`, `docs/progress/phase-4-native-control-enhancements.md`, `docs/progress/MASTER.md` |

## Phase 5: Skip Cue Prompt
**Goal**: Detect danmaku skip markers, surface a non-blocking jump prompt, and leave final playback verification to user-run manual checks.
**Prerequisite**: Phase 4 complete.
**S.U.P.E.R Focus**: `S`, `U`, `R`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 11 | Implement `SkipCue` parsing, prompt lifecycle, and debug exposure | P0 | M | 10 | A | S, U, R | The runtime extracts the first valid `空降` cue from normalized sorted comments, shows a right-bottom prompt when playback reaches the cue trigger, auto-closes after `5s` or target-time arrival, supports rewind re-arm, and exposes cue/prompt state through `window.__anichDanmaku__.getStats()` |
| 12 | Run user-owned manual verification for skip prompt behavior | P1 | S | 11 | A | U, R | User confirms normal jump, invalid-first fallback, duplicate-cue precedence, rewind re-trigger, and teardown behavior across seek/fullscreen/route changes |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 11, 12 | M | Low | `anich-danmaku-fix.user.js`, `docs/progress/phase-5-skip-cue-prompt.md`, `docs/progress/MASTER.md`, `.codex/skills/anich-danmaku-takeover-dev/SKILL.md` |
