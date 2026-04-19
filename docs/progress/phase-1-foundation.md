# Phase 1: Foundation

**Goal**: Establish AniCh session lifecycle, page context parsing, and dandanplay transport.
**Status**: Complete

## Tasks
- [x] **Task 1.1**: Create userscript bootstrap and constants
  - Priority: P0
  - Effort: S
  - Acceptance: Userscript runs at `document-start` and initializes exactly one page runtime.
  - Notes: Replaced the previous takeover bootstrap with a new `AniChDanmakuApp` entrypoint.
- [x] **Task 1.2**: Implement `SessionManager`
  - Priority: P0
  - Effort: M
  - Acceptance: Route/video/container changes rotate token and clean teardown state.
  - Notes: `Session` now owns route token, abort controllers, video rebinding, teardown, and bootstrap sequencing.
- [x] **Task 1.3**: Implement `PageContextResolver` and `DandanplayTransport`
  - Priority: P0
  - Effort: M
  - Acceptance: AniCh title/episode context resolves from page data and dandanplay requests fall through proxy/custom endpoints.
  - Notes: Built-in proxy order is `misaka10876` then `7o7o`; last-good endpoint is cached.

## Phase Notes
- This phase intentionally removed the old fetch interception design and replaced it with direct dandanplay transport.

## Phase Completion Checklist
- [x] All tasks above are checked off
- [x] MASTER.md phase count updated
- [x] MASTER.md "Current Status" updated to next phase
