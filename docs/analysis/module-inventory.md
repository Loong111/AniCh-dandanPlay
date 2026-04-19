# Module Inventory

| Module | Responsibility | Dependencies | Files | Lines | Complexity | S.U.P.E.R Score |
|:-------|:---------------|:-------------|------:|------:|:-----------|:----------------|
| Current userscript guard | Inject a document-start fetch wrapper that drops stale danmaku responses after navigation | Browser DOM APIs, AniCh fetch behavior | 1 | 106 | Medium | `S🟡 U🟡 P🔴 E🟢 R🔴` |

## Module Details

### Current userscript guard
- **Path**: `anich-danmaku-fix.user.js`
- **Responsibility**: Patch `window.fetch` so danmaku responses from a previous route throw `AbortError`.
- **Public API**: None.
- **Internal Dependencies**: None.
- **External Dependencies**: Browser `window.fetch`, DOM injection timing, AniCh route format `/b/:bangumi/:episode`.
- **Complexity Rating**: Medium
- **Transformation Notes**:
  - The file mixes bootstrap, route parsing, request classification, and interception in one place.
  - It assumes upstream rendering can remain trusted after stale responses are dropped, which is false for the reported bug class.
  - It exposes no normalization contract, no store boundary, and no independent renderer.
- **S.U.P.E.R Assessment**:
  - **S (Single Purpose)**: Partial. It fixes one bug class, but injection, route parsing, and request classification are tightly coupled.
  - **U (Unidirectional Flow)**: Partial. Fetch interception is one-way, but there is no separated data pipeline.
  - **P (Ports over Implementation)**: Violation. No explicit normalized danmaku contract exists.
  - **E (Environment-Agnostic)**: Healthy. No local file paths or environment-specific build steps.
  - **R (Replaceable Parts)**: Violation. Replacing interception or rendering behavior requires rewriting the only file.

## Planned Runtime Boundaries

### SessionManager
- **Responsibility**: Route/session lifecycle, token rotation, video/container rebinding, teardown.
- **Boundary Contract**: `{ token, episodeKey, video, container }`

### FetchInterceptor
- **Responsibility**: Classify danmaku requests, spawn shadow fetches with the current token, abort native danmaku requests.
- **Boundary Contract**: `{ sourceKind, url, token, episodeKey } -> Promise<ArrayBuffer|Object>`

### ParserAdapters
- **Responsibility**: Convert local protobuf, bili protobuf, and QQ JSON into `NormalizedDanmaku[]`.
- **Boundary Contract**:
  - `id`
  - `source`
  - `text`
  - `time`
  - `mode`
  - `color`
  - `date`
  - `episodeKey`

### DanmakuStore
- **Responsibility**: Deduplicate, sort, merge incrementally, expose stats.
- **Boundary Contract**: `merge(items)`, `clear()`, `lowerBound(time)`, `stats()`

### Scheduler
- **Responsibility**: Translate `video.currentTime` into pending emits.
- **Boundary Contract**: `sync(videoTime) -> NormalizedDanmaku[]`

### Renderer
- **Responsibility**: Overlay creation, lane allocation, DOM animation, basic UI.
- **Boundary Contract**: `render(items)`, `pause()`, `resume()`, `clear()`, `destroy()`
