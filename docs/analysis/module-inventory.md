# Module Inventory

| Module | Responsibility | Dependencies | Files | Lines | Complexity | S.U.P.E.R Score |
|:-------|:---------------|:-------------|------:|------:|:-----------|:----------------|
| Current userscript runtime | Provide AniCh-specific Dandanplay matching, transport, store, scheduler, renderer, and controls in one userscript | Browser DOM APIs, AniCh page structure, Dandanplay API | 1 | ~3500 | High | `S🟡 U🟢 P🟢 E🟢 R🟡` |

## Module Details

### Current userscript runtime
- **Path**: `anich-danmaku-fix.user.js`
- **Responsibility**: Provide the full AniCh-side Dandanplay danmaku runtime, including page-context resolution, matching, transport, normalization, filtering, rendering, and controls.
- **Public API**: Debug helpers exposed under `window.__anichDanmaku__`.
- **Internal Dependencies**: Logical in-file boundaries for `DandanplayTransport`, `DanmakuStore`, `Renderer`, `Scheduler`, `ControlPanel`, and `Session`.
- **External Dependencies**: Browser `fetch`, DOM injection timing, AniCh route format `/b/:bangumi/:episode`, AniCh page title/container selectors, Dandanplay API.
- **Complexity Rating**: High
- **Transformation Notes**:
  - The script is intentionally build-free and single-file, so logical boundaries matter more than file count.
  - The runtime already separates transport, store, scheduler, renderer, and controls, but they still live in one large file.
  - The normalized danmaku contract keeps Dandanplay response handling isolated from rendering and filtering.
- **S.U.P.E.R Assessment**:
  - **S (Single Purpose)**: Partial. Runtime responsibilities are decomposed into classes, but the file still hosts many concerns.
  - **U (Unidirectional Flow)**: Healthy. Runtime flow is page context -> Dandanplay transport -> normalization -> filter/store -> schedule -> render.
  - **P (Ports over Implementation)**: Healthy. The renderer consumes normalized comment objects instead of raw transport payloads.
  - **E (Environment-Agnostic)**: Healthy. No local file paths or environment-specific build steps.
  - **R (Replaceable Parts)**: Partial. Runtime parts are logically replaceable, but the single-file packaging still raises edit cost.

## Current Runtime Boundaries

### Session
- **Responsibility**: Route/session lifecycle, settings, match cache, video/container rebinding, and orchestration across runtime parts.
- **Boundary Contract**: `{ token, route, currentMatch, settings, video, playerContainer }`

### DandanplayTransport
- **Responsibility**: Search anime/episodes, fetch bangumi metadata, fetch comments, and manage proxy/custom API fallback.
- **Boundary Contract**: `{ apiBase, path, params } -> { endpoint, data }`

### Normalization
- **Responsibility**: Convert Dandanplay `/comment` payloads into `NormalizedDanmaku[]`.
- **Boundary Contract**:
  - `id`
  - `source`
  - `text`
  - `time`
  - `mode`
  - `color`
  - `date`
  - `episodeId`

### DanmakuStore
- **Responsibility**: Deduplicate, sort, replace current episode comments, and expose visibility/source stats.
- **Boundary Contract**: `replace(items, match, sourceName)`, `clear()`, `setVisibilityStats(count)`

### Scheduler
- **Responsibility**: Translate `video.currentTime` into pending emits.
- **Boundary Contract**: `setComments(items)`, `setVideo(video)`, `refreshFromCurrentTime(clearOverlay)`

### Renderer
- **Responsibility**: Overlay creation, lane allocation, DOM animation, and visual playback of normalized comments.
- **Boundary Contract**: `attach(container)`, `emit(comment)`, `syncPaused(isPaused)`, `clear()`, `destroy()`

### ControlPanel
- **Responsibility**: External toolbar, settings panel, manual matcher, filters, and status display.
- **Boundary Contract**: `attach(container, overlay)`, `update()`, `openPanel()`, `openMatcher()`, `destroy()`
