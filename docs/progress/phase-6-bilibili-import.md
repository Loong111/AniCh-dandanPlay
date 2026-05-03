# Phase 6: Bilibili Import Overlay

**Goal**: Add a hover-triggered Bilibili import popover, merge one or more imported Bilibili danmaku sources into the active AniCh session, and persist multiple route bindings plus multiple season-scoped BV and Bilibili PGC auto-mapping chains.
**Status**: In Progress

## Tasks
- [x] **Task 6.1**: Implement Bilibili import transport, source buckets, route-scoped persistence, and hover popover controls
  - Priority: P0
  - Effort: M
  - Acceptance: The script accepts BV / full video URL / Bilibili bangumi `ep` or `ss` URL / `b23` short link input, resolves `cid`, loads segmented protobuf danmaku through userscript-authorized requests, replaces the relevant Bilibili source bucket, restores the same import on route reload, and exposes source/import stats through `window.__anichDanmaku__.getStats()`.
  - Notes: Userscript metadata now uses `GM_xmlhttpRequest` + `unsafeWindow` with explicit Bilibili `@connect` entries. `DanmakuStore` now maintains source buckets so `base:dandanplay` and `import:bilibili` can be rebuilt, filtered, re-scheduled together, and cross-source deduped with base-source priority.
- [x] **Task 6.2**: Implement cross-episode `?p=` auto mapping with series-level BV/page-offset caching
  - Priority: P0
  - Effort: M
  - Acceptance: Explicit `?p=` imports create one season-scoped BV rule keyed by AniCh title/season, current-route records distinguish `explicit` vs `derived`, restore order is explicit route > derived route > live season rule, and clearing the active import removes the season rule plus its derived route entries without touching other explicit routes.
  - Notes: Auto-mapping only seeds from explicit `?p=` input. Bare BV and long links without `?p=` remain current-route-only. If AniCh exposes a visible episode list, derived route records are pre-generated; otherwise they are created lazily when the target route opens.
- [x] **Task 6.3**: Upgrade route import collections, per-binding source buckets, and hover popover list UI for multiple Bilibili links
  - Priority: P0
  - Effort: M
  - Acceptance: One AniCh route can keep multiple explicit Bilibili imports at once, each import persists as its own route binding, each binding owns its own `import:bilibili:<bindingKey>` source bucket, re-importing the same binding updates it in place instead of duplicating it, and the hover popover renders a list of imported bindings with per-link summary/remove actions plus a route-level clear-all action.
  - Notes: The route cache and UI now use an import collection model while preserving one-input-at-a-time import. Each binding owns a stable source bucket and the popover list exposes per-link removal.
- [x] **Task 6.4**: Upgrade season auto mapping from one rule to multiple coexisting Bilibili chains
  - Priority: P0
  - Effort: M
  - Acceptance: A season can keep multiple `BV + pageOffset` chains and Bilibili PGC `season_id + episode number` chains in parallel, each chain restores independently using `explicit route binding > derived route binding > live chain derivation`, all chains that match the current AniCh episode merge together instead of competing by priority, and removing one chain only clears that chain's derived route records while preserving unrelated explicit imports and unrelated chains.
  - Notes: Chain identity is stable per season plus mapping behavior. Bilibili PGC links seed from `ep` input, resolve through `pgc/view/web/season`, and derive future AniCh episodes by Bilibili season episode number instead of raw `ep_id + n`, because later official episodes may not keep consecutive `ep_id` values.
- [ ] **Task 6.5**: Run static checks and user manual verification for multi-link and multi-chain playback behavior
  - Priority: P1
  - Effort: M
  - Acceptance: `node --check` passes, helper samples cover multi-binding cache merge, BV page derivation, PGC `ep`/`ss` season/episode derivation, duplicate binding suppression, and missing-page/episode skip-resume behavior, and the user confirms hover stability, multiple-link merged playback, multiple `?p=` and bangumi `ep`/`ss` chain restore, per-link remove, clear-all, fullscreen/seek behavior, and clear/import teardown on live AniCh playback.
  - Notes: This validation replaces the earlier single-chain manual checklist; it stays user-owned for live AniCh playback.

## Phase Notes
- Local static validation completed with `node --check anich-danmaku-fix.user.js`.
- Parser sample validation covered:
  - Bare `BV1TtoaBCEyz`
  - Full video URL with `?p=2`
  - `https://b23.tv/...`
  - Bilibili bangumi `ep` URL such as `https://www.bilibili.com/bangumi/play/ep1231523`
  - Bilibili bangumi `ss` URL such as `https://www.bilibili.com/bangumi/play/ss4145`
- Live endpoint probes confirmed current public `x/web-interface/view` JSON and segmented `x/v2/dm/web/seg.so` responses are reachable, while the implementation still relies on userscript-authorized requests because AniCh page-origin CORS remains unavailable.
- The hover import popover is separate from the full settings panel. The current shipped state still uses one imported Bilibili source bucket; Task 6.3 widens this into a per-binding bucket collection so multiple imported videos can coexist.
- The import path now uses Bilibili segmented protobuf danmaku instead of legacy XML, and the store drops near-identical later-source comments to suppress duplicate on-screen rendering.
- Import status now distinguishes the actually imported count, the segmented endpoint's current loadable count, and the video's total danmaku count from `stat.danmaku` so 6000-cap behavior is visible during manual verification.
- Explicit `?p=` imports now seed one season-scoped BV/page-offset rule. Task 6.4 widens this into multiple coexisting chains so different Bilibili links can auto-restore together across the same AniCh season.
- Bilibili PGC `ep` imports now seed one season-scoped PGC rule keyed by `season_id + episode number offset`; the implementation intentionally does not depend on raw `ep_id + n` because the Ave Mujica season list jumps from `ep1231526` to `ep1339696` after episode 4.
- Planning assumption for the upgrade: if several chains hit the same AniCh episode, all matching chains merge together; per-link remove clears only that binding/chain, while clear-all removes every active Bilibili binding on the current route.
- Missing derived pages or PGC episodes are treated as a skip for the current visit rather than a hard deletion of the underlying chain, so future AniCh episode visits can still auto-restore when the corresponding Bilibili target becomes available.
- 2026-04-24 regression follow-up: `getBilibiliImportDebugState()` now preserves the latest failed binding record instead of collapsing the popover back to the first cached import, and the per-link `移除` button now stops propagation before clearing so route-level removal is not interrupted by surrounding UI events.
- Local state-harness verification now covers the reported regression path: one cached binding + one failed second import keeps the failed binding visible in state/debug output, and clearing the listed binding removes both the cached record and its loaded source bucket.
- 2026-04-25 regression follow-up: the import popover no longer auto-refills the previously imported single link over a non-empty draft input. The prior condition only checked focus state, so a blur-triggered refresh could restore the first imported URL right before the user clicked `导入`, which matches the reported “second link never takes effect, total stays at 1” behavior.
- Local UI-state verification now covers the overwrite path: with one saved import already present, calling `ControlPanel.update()` while the user has a different non-empty draft URL in the input leaves that draft untouched instead of restoring the saved first link.
- 2026-04-30 PGC follow-up: added Bilibili bangumi `ep` parsing, `pgc/view/web/season` metadata resolution, PGC source records, and season/episode-number chain derivation. Endpoint probes confirmed `ep1231523` maps to `season_id=73081`, `BV1wz6uYzEFY`, `cid=27730904912`, and season episode 5 resolves by episode number to `ep1339696`, `BV1EGFAeaEBH`, `cid=28088928881`.
- 2026-05-03 PGC `ss` follow-up: added Bilibili bangumi season-link parsing for inputs like `https://www.bilibili.com/bangumi/play/ss4145`. During manual import, an `ss` link uses the current AniCh episode number as the Bilibili season episode number, then reuses the existing `season_id + episode number` PGC metadata and auto-mapping chain path.

## Phase Completion Checklist
- [x] Task 6.1 complete with S.U.P.E.R boundaries preserved
- [x] Task 6.2 complete with series-level BV/page-offset mapping
- [x] Task 6.3 complete with multi-link route bindings and per-binding source buckets
- [x] Task 6.4 complete with multiple coexisting BV and PGC auto-mapping chains
- [ ] Task 6.5 complete with upgraded validation recorded
- [x] Baseline static validation recorded for the single-chain implementation
- [ ] Multi-link / multi-chain user manual verification completed on live AniCh playback
- [x] MASTER.md phase count updated
- [x] MASTER.md current-status section updated
