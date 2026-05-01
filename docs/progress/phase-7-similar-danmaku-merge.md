# Phase 7: Similar Danmaku Merge

**Goal**: Collapse similar visible comments into counted display comments such as `弹幕x10` using dynamic burst intervals instead of fixed global time buckets.
**Status**: In Progress

## Tasks
- [x] **Task 7.1**: Implement pure similar-merge helpers and settings contract
  - Priority: P0
  - Effort: M
  - Acceptance: Visible comments are clustered after filtering and before scheduling; dynamic intervals start at the first similar comment and close at the last similar comment before inactivity/max-span limits; defaults are available as `80%` threshold, `>=2` min count, `5s` gap, and `18s` max span.
  - Notes: The user confirmed that min count, adjacent gap, and max span must also be adjustable in settings. After the 2026-04-30 playback regression report, the feature default was changed to off until live verification passes.
- [x] **Task 7.2**: Add settings UI, debug stats, density controls, and documentation for merge controls
  - Priority: P0
  - Effort: S
  - Acceptance: Settings panel exposes enable, similarity threshold, min count, adjacent gap, max span, max same-moment emits, independent max scheduled comments, numeric density inputs, one-second local-density peak shaving, and the optional merge-priority density mode; settings persist under `anichDanmaku:settings`; debug stats report merge and density-limit counts.
  - Notes: Keep `NormalizedDanmaku` renderer compatibility by producing display comments with the same core fields plus optional `merged*` debug metadata.
- [ ] **Task 7.3**: Run static checks and user manual verification for merged playback
  - Priority: P1
  - Effort: S
  - Acceptance: `node --check` passes; live playback confirms similar bursts render as counted comments, threshold/min-count/gap/span/max-emit/max-load controls take effect, filters apply before counts, seek/offset/fullscreen remain stable, and SkipCue still uses original comments.
  - Notes: Live AniCh/userscript-manager verification remains user-owned.

## Phase Notes
- Analysis is recorded in `docs/analysis/similar-danmaku-merge.md`.
- Recommended flow is `transport -> normalize -> store -> filters -> similar merge -> Scheduler -> Renderer`.
- Merge must not mutate source buckets, source stats, Bilibili import records, or SkipCue input comments.
- Implemented in `anich-danmaku-fix.user.js` v2.6.0 as pure helper logic plus settings-panel wiring.
- Static validation: `node --check anich-danmaku-fix.user.js` passes.
- Helper probe validation passed for dynamic cluster merge, strict-threshold behavior, gap splitting, and repeated short text similarity.
- README and project skill were updated to document the merge controls and runtime boundary.
- Regression response: v2.6.1 changes similar merge to opt-in by default, ignores any accidental v2.6.0 persisted enabled state unless the new opt-in key is present, and wraps the merge step in a fallback guard so merge failures cannot block normal filtered comments.
- Hotfix validation: `node --check`, `git diff --check`, boot probe with pre-hotfix enabled state, and opt-in helper probe all pass.
- Fullscreen regression follow-up: v2.6.2 hides/detaches custom toolbar, panel, import popover, matcher, and skip prompt during browser fullscreen, forces the danmaku overlay tree to `pointer-events: none`, and lowers fullscreen overlay stacking so dense danmaku cannot block native player clicks. User observed the issue may depend on extremely high danmaku density because lower-count episodes behave normally.
- Density-control follow-up: v2.6.3 adds settings for max same-moment emits and max scheduled comments after similar merge. Scheduler now drops due comments beyond the per-frame emit limit instead of building an unbounded DOM burst, while the post-merge schedule list can be evenly capped across the whole episode.
- Density-control refinement: v2.6.5 makes same-moment emits and max scheduled comments mutually constrained by video/comment duration, adds direct numeric inputs beside the sliders, and adds an opt-in `合并优先` mode that preserves merged counted comments before unmerged single comments during density limiting.
- Control and density refinement: v2.6.6 debounces slider commits so dragging does not rerun filtering/scheduling on every input event, avoids overwriting focused numeric inputs during panel refresh, and changes density coupling to one-second candidate-comment buckets so sparse seconds do not receive artificial capacity from the full episode duration.
- Density and import-source correction: v2.6.7 decouples max scheduled comments from same-moment emits, changes the default max scheduled comments to 10000, keeps same-moment emits as one-second local peak shaving, and briefly removed cross-source fuzzy dedupe while investigating source-bucket accounting.
- Cross-source dedupe correction: v2.6.8 restores the 0.2s same-text/type fuzzy duplicate window for later source buckets, keeps the raw one-second peak statistic visible in the runtime summary, and expands source-bucket summaries with raw, accepted, and deduped counts.

## Phase Completion Checklist
- [x] Task 7.1 complete with S.U.P.E.R boundaries preserved
- [x] Task 7.2 complete with settings/debug/docs updated
- [ ] Task 7.3 complete with static validation and live manual verification recorded
- [ ] User manual verification completed on live AniCh playback
- [x] MASTER.md phase count updated
- [x] MASTER.md current-status section updated
