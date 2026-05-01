# AniCh Dandanplay Danmaku Userscript

[中文说明](./README_cn.md)

A single-file userscript that brings Dandanplay danmaku to AniCh episode pages.

It targets `https://anich.emmmm.eu.org/b/*`, keeps AniCh video playback untouched, and provides danmaku matching, loading, normalization, scheduling, rendering, and toolbar controls inside the browser.

## Why This Exists

This project provides a Dandanplay-based danmaku experience for AniCh. It packages matching, loading, filtering, rendering, and toolbar controls into a single userscript so the danmaku workflow stays self-contained and easy to install.

## Features

- Independent danmaku pipeline for AniCh episode pages.
- Dandanplay-based comment loading with built-in proxy fallback and custom API prefix support.
- Automatic title and episode matching, plus manual search and manual match when auto-match is wrong.
- Bilibili danmaku import for BV/video links, `b23` short links, and official bangumi `ep` links, with multi-link merge and season-chain restore.
- External toolbar placed outside the player so the video area stays unobstructed.
- Adjustable font size, display region, opacity, speed, and time offset.
- Filter controls for danmaku mode, keywords, and regular expressions.
- Dynamic similar-comment merge with adjustable similarity threshold, minimum count, adjacent gap, and maximum span, displayed as counted comments such as `commentx10`.
- High-density protection with local-density peak shaving for same-moment emits and an independent global max-load cap after similar merge, adjustable by slider or numeric input.
- Cached match preferences and toolbar position persisted in `localStorage`.
- Fullscreen, seek, pause/resume, route change, and player rebuild rebinding logic.

## Supported Environment

- Browser userscript manager: Tampermonkey or Violentmonkey.
- AniCh route: `https://anich.emmmm.eu.org/b/<bangumi>/<episode>`.
- No build step, package manager, or backend setup.

## Installation

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Import [`anich-danmaku-fix.user.js`](./anich-danmaku-fix.user.js) into the extension.
3. Open an AniCh episode page under `/b/*` and refresh once after enabling the script.

## Usage

1. Open an AniCh episode page.
2. Use the external danmaku toolbar beside the player.
3. Click the settings button to open the control panel.
4. Adjust basic options such as font size, display region, opacity, speed, and offset.
5. If auto-match fails, open `Match / Source`, run a manual search, choose an episode, and confirm the match.
6. Hover the toolbar settings button to import Bilibili danmaku from a BV/video link, `b23` link, or bangumi `ep` link.
7. Use keyword or regex filters when you want to hide specific comments, or adjust similar-comment merge from the `Filters` tab when dense repeated comments should be collapsed.

## Configuration Notes

- The script stores settings, API configuration, match cache, preference cache, and toolbar position in browser `localStorage`.
- A custom API prefix can be configured from the panel if you want to route requests through your own Dandanplay-compatible endpoint.
- Built-in proxy candidates are used automatically when direct access is unavailable.
- Bilibili import bindings are stored per AniCh route, while BV `?p=` and bangumi `ep` inputs can seed season-level restore chains.
- Bilibili imports are deduped against earlier sources by exact fingerprint, plus a cross-source fuzzy check for same text/type comments within `0.2s`; the runtime source summary reports raw, accepted, and deduped counts when drops happen.
- Similar-comment merge can be manually enabled from the panel with `80%` default similarity, minimum count `2`, adjacent gap `5s`, and maximum span `18s`; all four values are adjustable from the panel.
- Density limits default to `12` same-moment emits and `10000` scheduled comments after similar merge. Same-moment emits cap only dense one-second buckets while sparse periods keep all comments; max-load is independent and is not derived from episode duration or source count.
- The optional `Merge first` density mode keeps merged counted comments ahead of unmerged comments when max-load or same-moment limits have to drop items.

## Project Structure

- [`anich-danmaku-fix.user.js`](./anich-danmaku-fix.user.js): main userscript runtime.
- [`docs/analysis`](./docs/analysis): architecture overview, module inventory, and risk assessment.
- [`docs/plan`](./docs/plan): planned milestones and task breakdown.
- [`docs/progress`](./docs/progress): implementation progress and verification status.

## Development

- This repository is intentionally build-free. The source of truth is the single userscript file.
- Edit the userscript, reload it in your browser extension, and verify behavior on real AniCh episode pages.
- Runtime behaviors that depend on the extension sandbox or live AniCh DOM still require manual browser verification.

## Known Limitations

- Only `https://anich.emmmm.eu.org/b/*` is supported.
- This project focuses on Dandanplay-based playback-side danmaku for AniCh. It does not implement danmaku sending, account features, or cross-site abstraction.
- Matching quality depends on AniCh page metadata and Dandanplay search results.
- Availability depends on the reachable Dandanplay API or configured proxy.

## Status

Core Dandanplay-based danmaku features are implemented. The newest Bilibili import paths and Phase 7 density/similar-merge behavior still need live browser verification.
