# Risk Assessment

## S.U.P.E.R Architecture Health Summary

| Principle | Status | Key Findings | Transformation Priority |
|:----------|:-------|:-------------|:------------------------|
| **S** Single Purpose | 🟡 | Runtime boundaries are clear, but the userscript remains a large single file | Medium |
| **U** Unidirectional Flow | 🟢 | Data flows from page context and Dandanplay transport into normalization, filtering, scheduling, and rendering | Low |
| **P** Ports over Implementation | 🟢 | Renderer and filters consume normalized danmaku objects instead of raw API payloads | Low |
| **E** Environment-Agnostic | 🟢 | No build or backend requirement; browser-only target is stable | Low |
| **R** Replaceable Parts | 🟡 | Runtime parts are logically separated, but single-file packaging still raises replacement cost | Medium |

**Overall Health**: _3/5 principles healthy, 2 partial_ — Acceptable for a build-free userscript with single-file tradeoffs

### S.U.P.E.R Violation Hotspots
1. `anich-danmaku-fix.user.js`
   - The script now has dedicated runtime boundaries, but they still share one large file.
   - Large UI, transport, and session changes are harder to review than they would be in a multi-file layout.
2. AniCh page runtime coupling
   - Title selectors, route parsing, player container selection, and fullscreen host rebinding depend on AniCh DOM conventions.
   - AniCh SPA updates can break matching or toolbar placement without warning.
3. Dandanplay API dependency
   - Search, bangumi lookup, and comment loading all depend on reachable Dandanplay-compatible endpoints.
   - Proxy availability and endpoint behavior directly affect userscript reliability.

## Risk Matrix

| Risk | Impact | Likelihood | Severity | Mitigation |
|:-----|:-------|:-----------|:---------|:-----------|
| AniCh selectors, route signals, or player DOM change | High | Medium | High | Keep selector logic isolated in session/context helpers and re-run manual Phase 4 checks after AniCh updates |
| Dandanplay API or proxies become unavailable | High | Medium | High | Keep custom API override, last-good endpoint memory, and multiple proxy candidates |
| Matching chooses the wrong anime or episode | Medium | Medium | Medium | Keep manual search/match flow, preference cache, and episode confirmation path available |
| Overlay attaches to the wrong container after fullscreen or DOM rebuild | Medium | Medium | Medium | Rebind on route changes, DOM mutation, video replacement, and resize |
| Invalid or expensive regex filters degrade usability | Low | Medium | Low | Validate regex rules, surface invalid entries, and keep filtering before scheduling |

## High-Severity Risks

### API availability
The userscript depends on Dandanplay-compatible endpoints for search, bangumi lookup, and comment fetches. If both built-in proxies fail and no custom API prefix is configured, the script has no data source to render.

### Matching correctness
AniCh page titles are not always a perfect search key. Auto-match can drift when title aliases, season numbering, or episode metadata are incomplete, so manual confirmation must remain available.

### DOM lifecycle churn
AniCh is an SPA. History changes, player re-renders, or fullscreen transitions can detach the original `video` node. The session layer must destroy observers, RAF loops, and overlay state before rebinding.

## Technical Debt
- The userscript is still a large single file even though runtime concerns are logically separated.
- No current automated browser harness exists for full AniCh + userscript regression validation.
- The debug surface exists under `window.__anichDanmaku__`, but it is still browser-console-oriented rather than a dedicated diagnostics UI.

## Compatibility Concerns
- The script targets only `https://anich.emmmm.eu.org/b/*`.
- The script depends on a userscript manager such as Tampermonkey or Violentmonkey.
- v1 intentionally excludes danmaku sending, account features, and cross-site abstraction.
