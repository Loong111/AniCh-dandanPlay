# Task Breakdown

## Overview
- **Total Phases**: 3
- **Total Tasks**: 7
- **Estimated Total Effort**: L

## S.U.P.E.R Design Constraints

> All tasks in this plan must produce code that conforms to S.U.P.E.R architecture principles.

- **S (Single Purpose)**: Split session, interception, parsing, storage, scheduling, rendering, and settings concerns even inside a single-file userscript.
- **U (Unidirectional Flow)**: Keep runtime data flow fixed as `fetch -> normalize -> store -> schedule -> render`.
- **P (Ports over Implementation)**: All sources must produce the same `NormalizedDanmaku` structure before reaching store or renderer.
- **E (Environment-Agnostic)**: No bundler, backend, or external runtime dependency. Persist only through browser `localStorage`.
- **R (Replaceable Parts)**: Parser adapters, store policy, scheduler, and renderer must be swappable without touching the rest of the file's contracts.

## Phase 1: Foundation
**Goal**: Replace the patch-only workaround with a takeover runtime that owns session state and request flow.
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
**Goal**: Ship the minimal control surface and validate the takeover against the target bug class.
**Prerequisite**: Phase 2 complete.
**S.U.P.E.R Focus**: `S`, `E`, `R`

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:-----|:---------|:-------|:-----------|:-----|:----------|:--------------------|
| 7 | Add settings UI, persistence, debug namespace, and native danmaku hiding | P0 | M | 6 | A | S, E, R | Enable/size/opacity/speed/offset persist via `anichDanmaku:*`; `window.__anichDanmaku__` exposes debug hooks |
| 8 | Run syntax and live-data smoke verification | P0 | M | 7 | A | U, P | Script parses current sample payloads and passes syntax validation; remaining manual checks are documented |

### Parallel Lanes
| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:-----|:------|:----------------|:-----------|:----------|
| A | 7, 8 | M | Low | `anich-danmaku-fix.user.js`, `verification.md` |
