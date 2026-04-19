# Risk Assessment

## S.U.P.E.R Architecture Health Summary

| Principle | Status | Key Findings | Transformation Priority |
|:----------|:-------|:-------------|:------------------------|
| **S** Single Purpose | 🟡 | Current script is small but mixes bootstrap, routing, and interception | High |
| **U** Unidirectional Flow | 🔴 | Data still flows through AniCh's opaque internal danmaku pipeline | High |
| **P** Ports over Implementation | 🔴 | No normalized danmaku schema; render logic depends on upstream site objects | High |
| **E** Environment-Agnostic | 🟢 | No build or backend requirement; browser-only target is stable | Low |
| **R** Replaceable Parts | 🔴 | Any change to store/render behavior requires replacing the whole workaround | High |

**Overall Health**: _1/5 principles healthy_ — Technical Debt Alert

### S.U.P.E.R Violation Hotspots
1. `anich-danmaku-fix.user.js`
   - No dedicated store, scheduler, or renderer boundary.
   - Cannot prevent native pipeline contamination if AniCh caches or reuses old state internally.
2. AniCh native player danmaku runtime
   - External async loaders can still race across episode changes.
   - Rendering and request lifecycle are coupled to internal state arrays.
3. Data contracts across sources
   - Local protobuf, bili protobuf, and QQ JSON differ, but the current workaround never owns a unified schema.

## Risk Matrix

| Risk | Impact | Likelihood | Severity | Mitigation |
|:-----|:-------|:-----------|:---------|:-----------|
| Upstream bundle selectors or request paths change | High | Medium | High | Keep source matching narrow and isolate URL classification in `FetchInterceptor` |
| Shadow response from old episode arrives after navigation | High | High | Critical | Enforce `sessionToken` on every shadow request and drop stale responses |
| Protobuf parsing drifts from site format | High | Medium | High | Reuse the site's current field mapping and keep parsing isolated in `ParserAdapters` |
| Overlay attaches to the wrong container after fullscreen or DOM rebuild | Medium | Medium | Medium | Rebind on route changes, DOM mutation, video replacement, and resize |
| Duplicate comments from multi-source aggregation | Medium | High | High | Use primary and fallback dedupe keys in `DanmakuStore` |
| Native danmaku UI conflicts with the new pipeline | Medium | Medium | Medium | Hide native danmaku section and send controls; keep plugin UI self-contained |

## High-Severity Risks

### Session contamination
The core failure mode is stale response injection after route changes. The fix cannot rely on upstream state reset order. The new architecture must rotate a token on every session invalidation and reject all shadow responses that return with an old token.

### Parser correctness
Both local and bili sources use protobuf payloads. If field numbers are wrong, the renderer will quietly display broken timing or malformed colors. Parser logic must stay source-local and return only `NormalizedDanmaku[]`.

### DOM lifecycle churn
AniCh is an SPA. History changes, player re-renders, or fullscreen transitions can detach the original `video` node. The session layer must destroy observers, RAF loops, and overlay state before rebinding.

## Technical Debt
- Existing workaround delegates too much trust to AniCh's internal danmaku state.
- No current test harness exists for protobuf parsing or live-site smoke validation.
- No reusable local debug surface exists beyond browser console inspection.

## Compatibility Concerns
- The userscript intentionally aborts native danmaku requests. This depends on AniCh continuing to catch request errors without breaking video playback.
- The script targets only `https://anich.emmmm.eu.org/b/*`.
- v1 intentionally excludes danmaku sending, manual search, account features, and cross-site abstraction.
