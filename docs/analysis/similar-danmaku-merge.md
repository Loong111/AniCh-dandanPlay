# Similar Danmaku Merge Analysis

## Preliminary Direction
Add an optional similar-danmaku merge stage for the AniCh userscript so visually similar comments within a dynamic burst interval render as one counted comment such as `弹幕x10`, with default similarity threshold `80%` and settings-panel adjustment.

## Current Runtime Touchpoints
- `anich-danmaku-fix.user.js`
  - `DEFAULT_SETTINGS` / `SETTING_LIMITS`: add merge settings and persistence under `anichDanmaku:settings`.
  - `applyCommentFilters`: filtering already produces the visible comment set and should remain before merging.
  - `DanmakuStore`: keep raw normalized and deduped comments unchanged; merge should not mutate source buckets.
  - `Session.refreshVisibleComments`: best insertion point is after filters and before `Scheduler.setComments`.
  - `Scheduler`: should receive already-merged display comments without knowing the merge algorithm.
  - `Renderer.emit`: can remain unchanged if merged comments use the existing `text` field.
  - `ControlPanel`: add a small settings block for merge enable/threshold and, if needed, interval/min-count controls.

## Recommended Contract
Keep `NormalizedDanmaku` as the cross-layer contract. A merged display item is still serializable and renderer-compatible:

```js
{
  id: "merge:<stable-id>",
  source: "merge",
  text: "<representativeText>x<count>",
  time: <firstCommentTime>,
  mode: <firstCommentMode>,
  color: <firstCommentColor>,
  date: <firstCommentDate>,
  episodeId: <episodeId>,
  mergedCount: <count>,
  mergedOriginalText: "<representativeText>",
  mergedStartTime: <firstCommentTime>,
  mergedEndTime: <lastCommentTime>,
  mergedIds: ["..."]
}
```

The optional `merged*` fields are for debug/statistics only. Existing renderer and scheduler behavior can continue to depend on `text`, `time`, `mode`, and `color`.

## Recommended Algorithm
Use burst/session clustering rather than fixed global time buckets.

1. Sort visible comments by `time`, preserving stable order for same-time comments.
2. Maintain active clusters. Each cluster has `startTime`, `lastTime`, `representativeKey`, candidate display-text counts, original comment ids, and the first comment's mode/color.
3. For each comment, find the best active cluster where:
   - `comment.time - cluster.lastTime <= similarMergeGapSeconds`
   - `comment.time - cluster.startTime <= similarMergeMaxSpanSeconds`
   - `comment.mode === cluster.mode` by default
   - `danmakuTextSimilarity(comment.text, cluster.representativeText) >= similarMergeThreshold`
4. If a match exists, append the comment to that cluster and update `lastTime`.
5. If no match exists, start a new cluster at the current comment time.
6. Close clusters when the current time is beyond their inactivity gap or span cap.
7. When closing a cluster:
   - if `count >= similarMergeMinCount`, emit one merged comment at the first comment's time;
   - otherwise emit the original comments unchanged.
8. Sort emitted display comments by `time` before passing them to `Scheduler`.

This makes the interval dynamic: the left boundary is the first similar comment; the right boundary is the last similar comment before an inactivity gap or span cap. It avoids the coarse behavior of fixed `0-5s`, `5-10s` buckets.

## Text Similarity Design
Use a danmaku-specific helper instead of the existing title-matching similarity:

- normalize with `String.prototype.normalize("NFKC")`, lowercase, trim spaces, remove punctuation-like separators, and collapse repeated whitespace;
- exact normalized match returns `1`;
- containment gets a length-ratio penalty to avoid merging short common fragments too aggressively;
- for CJK or mixed text with length >= 3, use Sørensen-Dice bigram similarity;
- for very short text, require exact match or strong containment, because `哈` / `好` style comments are noisy.

Recommended defaults after the 2026-04-30 playback regression report:
- `similarMergeEnabled: false`
- `similarMergeThreshold: 0.8`
- `similarMergeGapSeconds: 5`
- `similarMergeMaxSpanSeconds: 18`
- `similarMergeMinCount: 2`

The user confirmed that threshold, minimum count, adjacent gap, and maximum span must all be adjustable from settings.

## Placement In Data Flow
Recommended flow:

```text
transport -> normalize -> DanmakuStore source buckets -> filters -> similar merge -> Scheduler -> Renderer
```

Reasons:
- filters should decide which comments are eligible to appear/count;
- skip-cue detection should continue to read original store items, not merged display text;
- source buckets and Bilibili import dedupe remain unchanged;
- renderer remains replaceable because it only renders normalized display items.

## UI And Debug Surface
Add a filter/settings card named `相似合并`:

- toggle: `启用相似弹幕合并`
- slider: `相似度`, shown as `80%`
- slider: `最小数量`, shown as `>=2条`
- slider: `相邻间隔`, shown as `5.0s`
- slider: `最大跨度`, shown as `18s`

Add a separate settings card named `密度限制`:

- slider: `同刻发送`, default `12条`
- slider: `最大加载`, default `10000条`
- number input for both density values; `同刻发送` controls one-second peak shaving and `最大加载` is an independent global cap
- switch: `合并优先`, default off; when enabled, density limiting preserves merged counted comments first and drops unmerged single comments before them

Expose debug stats under `window.__anichDanmaku__.getStats()`:

```js
similarMerge: {
  enabled: true,
  threshold: 0.8,
  groups: 12,
  collapsedCount: 48,
  inputCount: 820,
  outputCount: 772
}
```

Also expose density stats:

```js
densityLimit: {
  maxEmitPerFrame: 12,
  maxScheduledComments: 10000,
  preferMergedComments: false,
  bucketSeconds: 1,
  inputCount: 8200,
  outputCount: 7600,
  droppedCount: 600,
  droppedMergedCount: 1200,
  droppedSingleCount: 2000
}
```

## S.U.P.E.R Assessment
- **S**: implement merge as pure helpers plus one small UI section; do not embed logic in `Renderer`.
- **U**: data still flows input -> filter -> merge -> schedule -> render.
- **P**: merged display comments remain serializable normalized comment objects.
- **E**: settings persist through existing `anichDanmaku:*` localStorage config only.
- **R**: replacing the merge strategy should only touch helper functions and settings wiring.

## Risks And Mitigations
- Common short comments such as `哈` may over-merge. Mitigate with stricter short-text similarity and same-mode grouping.
- A merged comment at the first timestamp reveals the eventual count for a burst. This is acceptable because the userscript preloads the full list before playback; if undesired, use cluster midpoint time instead.
- Very dense comment sections can increase comparison cost. Active-cluster pruning by inactivity gap keeps comparisons bounded to the local burst window.
- Extremely dense timelines can still overload DOM animation if too many comments share one playback instant. Mitigate with `maxEmitPerFrame`, which caps both one-second schedule buckets and final per-frame emits.
- Very large merged lists can still be expensive to schedule. Mitigate with `maxScheduledComments`, which remains a global cap after local one-second density caps have been applied.
- Local-density peak shaving applies `maxEmitPerFrame` per one-second candidate-comment bucket: dense seconds are capped while sparse seconds pass through intact. `maxScheduledComments` is independent and only acts as a final global cap.
- The optional `合并优先` mode treats merged display comments as higher priority during density drops, preserving counted comments before unmerged single comments.
- Source-level overlap between built-in proxy and Bilibili import is handled before filtering/merge: exact duplicates are removed by fingerprint, and later source buckets use a normalized same-text/type `0.2s` fuzzy duplicate window. If enough overlapping comments reveal a stable source timing offset, the offset is applied only during dedupe matching and source summaries expose raw, accepted, deduped, and offset counts when drops occur.
- Merging after filters means filtered comments do not contribute to counts. This is the recommended behavior because the count should represent visible comments.

## Confirmed Defaults
The user confirmed these defaults, with minimum count, adjacent gap, and max span also exposed in settings:

1. Keep similar merge available but default it off until live AniCh playback verification passes.
2. Merge comments with count `>= 2`.
3. Show merged text as `<representativeText>x<count>` at the first comment's timestamp.
4. Count only post-filter visible comments.
5. Expose threshold `80%`, minimum count `2`, adjacent gap `5s`, and maximum span `18s` as visible settings.
