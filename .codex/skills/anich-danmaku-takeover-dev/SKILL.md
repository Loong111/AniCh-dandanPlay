---
name: anich-danmaku-takeover-dev
description: >-
  Resume and implement the AniCh-specific danmaku takeover userscript in this project.
  Use when working on session isolation, danmaku fetch interception, protobuf parsing,
  overlay rendering, settings persistence, or verification for https://anich.emmmm.eu.org/b/*.
---

# AniCh Danmaku Takeover Dev

## 1. Cross-Conversation Continuity Protocol

Read `docs/progress/MASTER.md` first. Resume from the active phase and task before changing code. Update the phase file and `MASTER.md` in the same session after completing work.

## 2. S.U.P.E.R Architecture — Mandatory Coding Standard

> Write code like building with LEGO — each brick has a single job, a standard interface, a clear direction, runs anywhere, and can be swapped at will.

All code produced in this project MUST conform to these five principles. Violations are treated as bugs.

### S — Single Purpose
- Each module, file, and function solves exactly one problem
- Prefer decomposition; power comes from composition
- **Litmus test**: Can you describe this module's responsibility in a single sentence? If not, split it.

### U — Unidirectional Flow
- Data flows in one direction: input → processing → output
- Dependencies point inward: outer layers depend on inner, inner layers know nothing about outer
- No circular imports, no reverse dependencies
- **Litmus test**: Can the core logic run unit tests with zero external services?

### P — Ports over Implementation
- Define interface contracts (JSON Schema, types, data structures) BEFORE writing implementation
- All cross-module I/O must be serializable
- Swapping a data source, render layer, or notification channel requires zero changes to core logic
- **Practice**: Every module boundary communicates via explicit, schema-defined contracts

### E — Environment-Agnostic
- Configuration via environment variables or config files, never hardcoded
- All dependencies explicitly declared (requirements.txt / package.json / Cargo.toml)
- Processes are stateless; persistence delegated to external storage
- Logs to stdout. Same codebase runs locally, in Docker, on cloud
- **Config precedence**: Environment variables > .env > config file > in-code defaults

### R — Replaceable Parts
- Any layer can be replaced without affecting others
- Replacement cost is THE core metric of architecture quality
- If replacing one component triggers cascading changes, the architecture is broken
- **Validation**: For each module, ask "Can I swap this with a different implementation by only touching this module's directory?"

## 3. S.U.P.E.R Code Review — Run After Every Task

Before marking any task as complete, verify ALL of the following:

| # | Check | Principle | Pass? |
|:--|:------|:----------|:------|
| 1 | Every new module/file has exactly one responsibility | S | |
| 2 | No function does more than one conceptual thing | S | |
| 3 | Data flows input → processing → output, no reverse deps | U | |
| 4 | No circular imports introduced | U | |
| 5 | Cross-module interfaces are schema-defined (types/contracts) | P | |
| 6 | Module I/O is serializable | P | |
| 7 | No hardcoded paths, URLs, keys, or config values | E | |
| 8 | All new dependencies explicitly declared in dependency file | E | |
| 9 | New modules can be replaced without changes to other modules | R | |
| 10 | All tests pass after the change | — | |

**Scoring**: All pass = ✅ proceed. 1-2 fail = fix before marking complete. 3+ fail = stop and refactor.

## 4. Target Technology Coding Standards

- Keep the implementation as one userscript file, but maintain clean boundaries through named classes and pure helpers.
- Treat `NormalizedDanmaku` as the only cross-layer contract:
  - `id`
  - `source`
  - `text`
  - `time`
  - `mode`
  - `color`
  - `date`
  - `episodeKey`
- Do not let the renderer read protobuf- or source-specific fields.
- Route/session invalidation is mandatory. Every network response must be checked against the active session token before merge.
- Prefer browser-native APIs only. No CDN runtime, no build step, no third-party library.
- Persist settings under `anichDanmaku:*` keys only.
- Keep debug output minimal and expose inspection through `window.__anichDanmaku__`.

## 5. Project-Specific Architecture Context

### Violation Hotspots To Fix
- `anich-danmaku-fix.user.js` currently mixes bootstrap, routing, and interception with no owned renderer.
- AniCh native danmaku state is not trustworthy across fast episode changes.
- Multi-source payloads have no unified contract.

### Required Layering
- `FetchInterceptor` owns request classification and shadow fetch.
- `ParserAdapters` owns source parsing and emits only `NormalizedDanmaku[]`.
- `DanmakuStore` owns dedupe, sorting, and stats.
- `Scheduler` owns time-window selection.
- `Renderer` owns overlay and animation.
- `SessionManager` owns lifecycle, teardown, and rebinding.

### Mandatory Runtime Rules
- Match only `https://anich.emmmm.eu.org/b/*`.
- Abort native danmaku requests after shadow fetch is queued.
- Hide native `section[danmaku]` and native danmaku input/control entry points in v1.
- Do not implement danmaku sending in v1.

## 6. Progress Update Instructions

- Check off the task in the relevant phase file after code and validation are complete.
- Update the phase done count in `docs/progress/MASTER.md`.
- Update `Current Status` and `Next Steps` in `MASTER.md`.
- Append a short note to the session log for meaningful work sessions.
- Run the S.U.P.E.R checklist before changing any task from `[ ]` to `[x]`.

## 7. Parallel Execution Protocol

See `spec-driven-develop/references/parallel-protocol.md` in the global skill set if parallel execution is available. In this project:
- Use lane assignments from `docs/plan/task-breakdown.md`.
- Avoid overlapping edits inside `anich-danmaku-fix.user.js` when parallel workers are active.
- Re-run syntax and payload checks after merge.

## 8. Archive Trigger

When all phase checkboxes are complete, initiate the archive workflow and move `docs/analysis`, `docs/plan`, `docs/progress`, and this project skill into `docs/archives/<project>/`.
