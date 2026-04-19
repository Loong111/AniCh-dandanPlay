# Phase 2: Data And Rendering

**Goal**: Normalize dandanplay comments and render them in an independent AniCh overlay.
**Status**: Complete

## Tasks
- [x] **Task 2.1**: Implement dandanplay comment normalization
  - Priority: P0
  - Effort: M
  - Acceptance: `/comment` payloads produce `NormalizedDanmaku[]` with `rtl/top/bottom` modes.
  - Notes: `p` field parsing now normalizes `cid / p / m` into a source-independent structure.
- [x] **Task 2.2**: Implement `DanmakuStore`
  - Priority: P0
  - Effort: S
  - Acceptance: Dedupe and sort rules match the approved plan.
  - Notes: Store dedupes by `id` first and falls back to `text + round(time,1) + color`.
- [x] **Task 2.3**: Implement `Scheduler` and `Renderer`
  - Priority: P0
  - Effort: L
  - Acceptance: Overlay follows video time, uses `rtl/top/bottom` lanes, and survives pause/seek/fullscreen.
  - Notes: Renderer attaches to `section[player]`, hides native danmaku UI, and rebinds on resize/video rebuild.

## Phase Notes
- v1 now renders only dandanplay data; the older multi-source parser assumption no longer applies.

## Phase Completion Checklist
- [x] All tasks above are checked off
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to next phase
