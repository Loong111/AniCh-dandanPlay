# Phase 3: Controls And Verification

**Goal**: Add user controls, manual matching, and record validation outcomes.
**Status**: Complete

## Tasks
- [x] **Task 3.1**: Add settings UI, manual matcher, persistence, debug namespace, and native danmaku hiding
  - Priority: P0
  - Effort: M
  - Acceptance: Settings persist via `anichDanmaku:*`; native danmaku overlay and input are hidden; debug API is exposed.
  - Notes: Added panel controls, custom API input, manual search/match modal, exact cache, and preference memory.
- [x] **Task 3.2**: Run syntax and live-data smoke verification
  - Priority: P0
  - Effort: M
  - Acceptance: Userscript passes syntax validation and sample payload parsing; unresolved manual checks are recorded.
  - Notes: `node --check` passed. Live HTTP smoke checks confirmed `ddplay-api.7o7o.cc` returns AniCh-targeted search and comment payloads; `danmu-api.misaka10876.top` returned 403 for the sampled title query. Direct browser userscript execution still needs manual extension/runtime validation.

## Phase Notes
- Full end-to-end browser verification remains a manual follow-up because local automation could not load the userscript directly into a browser extension runtime.

## Phase Completion Checklist
- [x] All tasks above are checked off
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to next phase
