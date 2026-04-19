// ==UserScript==
// @name         AniCh 弹弹 Play 弹幕
// @namespace    https://anich.emmmm.eu.org/
// @version      2.0.0
// @description  AniCh 专用弹弹 Play 弹幕 userscript，按标题匹配、独立渲染并避免切集串弹幕。
// @author       Codex
// @match        https://anich.emmmm.eu.org/b/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  if (window.__anichDanmakuBooted) {
    return;
  }
  window.__anichDanmakuBooted = true;

  const ROUTE_RE = /^\/b\/(\d+)\/(\d+)(?:\/|$)/;
  const STORAGE_PREFIX = "anichDanmaku:";
  const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
  const API_CONFIG_KEY = `${STORAGE_PREFIX}apiConfig`;
  const MATCH_CACHE_KEY = `${STORAGE_PREFIX}episodeMatchCache`;
  const PREFERENCE_CACHE_KEY = `${STORAGE_PREFIX}seriesPreferenceCache`;
  const STYLE_ID = "anich-ddm-style";
  const DEBUG_NAMESPACE = "__anichDanmaku__";
  const OFFICIAL_API = "https://api.dandanplay.net/api/v2";
  const BUILTIN_PROXIES = [
    "https://danmu-api.misaka10876.top/cors/",
    "https://ddplay-api.7o7o.cc/cors/",
  ];
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    fontSize: 24,
    opacity: 0.9,
    speed: 1,
    offset: 0,
    panelCollapsed: false,
  });
  const SETTING_LIMITS = Object.freeze({
    fontSize: { min: 14, max: 42, step: 1 },
    opacity: { min: 0.2, max: 1, step: 0.05 },
    speed: { min: 0.5, max: 2, step: 0.1 },
    offset: { min: -10, max: 10, step: 0.1 },
  });
  const DEFAULT_API_CONFIG = Object.freeze({
    customApiPrefix: "",
    lastGoodApiBase: "",
    lastGoodProxyPrefix: "",
  });
  const PANEL_LABELS = Object.freeze({
    enabled: "开关",
    fontSize: "字号",
    opacity: "透明",
    speed: "速度",
    offset: "偏移",
  });
  const MODE_MAP = Object.freeze({
    1: "rtl",
    4: "bottom",
    5: "top",
    6: "rtl",
    rtl: "rtl",
    top: "top",
    bottom: "bottom",
  });
  const TOP_BAR_TITLE = "AniCh 弹弹 Play";
  const USER_AGENT = "AniChDanmakuFix/2.0";
  const STOP_WORDS = new Set([
    "第",
    "季",
    "部",
    "篇",
    "章",
    "话",
    "集",
    "期",
    "season",
    "episode",
    "ep",
    "ova",
    "tv",
    "movie",
    "special",
    "the",
    "of",
    "and",
    "in",
    "to",
    "a",
    "an",
  ]);
  const CN_NUM = Object.freeze({
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  });
  const ROMAN_NUM = Object.freeze({
    Ⅰ: 1,
    Ⅱ: 2,
    Ⅲ: 3,
    Ⅳ: 4,
    Ⅴ: 5,
    Ⅵ: 6,
    Ⅶ: 7,
    Ⅷ: 8,
    Ⅸ: 9,
    Ⅹ: 10,
    Ⅺ: 11,
    Ⅻ: 12,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round1(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function safeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return structuredClone(fallback);
      }
      return Object.assign(structuredClone(fallback), JSON.parse(raw));
    } catch {
      return structuredClone(fallback);
    }
  }

  function storageSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeTitle(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/[：:]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[^\w\s\u4e00-\u9fff]/g, "")
      .trim();
  }

  function cleanTitleForComparison(title) {
    return normalizeSpace(
      String(title || "")
        .replace(/\s*[\(（].*?[\)）]/g, "")
        .replace(/\s*【.*?】/g, "")
        .replace(/\s*from\s+\w+/gi, "")
        .replace(/\s*（来源.*$/g, "")
        .replace(/[Ss](\d+)[Ee](\d+)/g, (_, season, episode) => `S${parseInt(season, 10)}E${parseInt(episode, 10)}`)
        .replace(/[Ss](\d+)(?![Ee\d])/g, (_, season) => `S${parseInt(season, 10)}`)
    );
  }

  function cleanTitleTail(title) {
    return normalizeSpace(
      String(title || "")
        .replace(/[\[\(（].*?[\]\)）]/g, " ")
        .replace(/\b(?:1080p|720p|2160p|x264|x265|hevc|aac|bdrip|webrip|web-dl|baha|bilibili|mkv|mp4)\b/gi, " ")
        .replace(/\s+-\s+(?:OVA|OAD|SP|END|完)$/i, " ")
    );
  }

  function cleanFileNameNoise(name) {
    return cleanTitleTail(
      String(name || "")
        .replace(/\.(?!\d)/g, " ")
        .replace(/_/g, " ")
        .replace(/\[[^\]]+\]/g, " ")
        .replace(/\b(?:CHT|CHS|GB|BIG5|简繁|繁简|字幕组|合集|全集)\b/gi, " ")
    );
  }

  function chineseNumberToInt(raw) {
    if (!raw) {
      return null;
    }
    if (/^\d+$/.test(raw)) {
      return parseInt(raw, 10);
    }
    if (raw.length === 1 && CN_NUM[raw] !== undefined) {
      return CN_NUM[raw];
    }
    if (raw === "十") {
      return 10;
    }
    if (raw.startsWith("十")) {
      return 10 + (CN_NUM[raw.slice(1)] || 0);
    }
    if (raw.includes("十")) {
      const [left, right] = raw.split("十");
      return (CN_NUM[left] || 1) * 10 + (CN_NUM[right] || 0);
    }
    return null;
  }

  function extractSeasonNumber(title) {
    if (!title) {
      return null;
    }
    const text = String(title).toLowerCase();
    const numericMatch = text.match(/(?:第\s*([一二三四五六七八九十零\d]+)\s*[季部期]|season\s*(\d+)|s(\d+)(?![e\d\w]))/i);
    if (numericMatch) {
      return chineseNumberToInt(numericMatch[1]) || parseInt(numericMatch[2] || numericMatch[3], 10) || null;
    }

    const ordinalMap = {
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
      ninth: 9,
      tenth: 10,
    };
    for (const [word, value] of Object.entries(ordinalMap)) {
      if (text.includes(`${word} season`) || text.includes(`${word} series`)) {
        return value;
      }
    }

    const romanMatch = text.match(/\b([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b(?:\s*[季期部])?/i);
    if (romanMatch) {
      return ROMAN_NUM[romanMatch[1].toUpperCase()] || null;
    }
    return null;
  }

  function extractEpisodeNumber(title) {
    if (!title) {
      return null;
    }
    const patterns = [
      /(?:^|[^\d])第\s*(\d+)\s*(?:集|话|話)/i,
      /[Ee](\d{1,4})\b/,
      /^(\d{1,4})\b/,
      /(?:^|[^\d])(\d{1,4})(?:\s*(?:END|完|OVA|OAD))?\b/i,
    ];
    for (const pattern of patterns) {
      const match = String(title).match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  function parseSearchKeyword(keyword) {
    let text = cleanFileNameNoise(normalizeSpace(keyword));
    let year = null;
    const yearMatch = text.match(/[\(\[]\s*(\d{4})\s*[\)\]]/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      text = text.replace(yearMatch[0], " ");
    }

    let episode = null;
    const seMatch = /^(.+?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,4})$/i.exec(text);
    if (seMatch) {
      return {
        title: cleanTitleTail(seMatch[1]),
        season: parseInt(seMatch[2], 10),
        episode: parseInt(seMatch[3], 10),
        year,
      };
    }

    episode = extractEpisodeNumber(text);
    if (episode !== null) {
      text = text
        .replace(/[Ee]\d{1,4}\b/g, " ")
        .replace(/第\s*\d+\s*(?:集|话|話)/g, " ")
        .replace(/\b\d{1,4}\b(?=\s*(?:END|完|OVA|OAD)?$)/i, " ");
    }

    let season = extractSeasonNumber(text);
    if (season !== null) {
      text = text
        .replace(/第\s*[一二三四五六七八九十零\d]+\s*[季部期]/gi, " ")
        .replace(/\b(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/gi, " ")
        .replace(/\bS\d{1,2}\b/gi, " ");
    }

    text = cleanTitleTail(text).replace(/\s+/g, " ").trim();
    return {
      title: text,
      season,
      episode,
      year,
    };
  }

  function parseCandidateTitle(title) {
    if (!title) {
      return { title: "", season: null };
    }

    let clean = String(title).replace(/\(\d{4}\)/, "").trim();
    const patterns = [
      {
        pattern: /(.*?)\s*第\s*([一二三四五六七八九十零\d]+)\s*[季部期](.*)/i,
        handler(match) {
          return { season: chineseNumberToInt(match[2]), title: `${match[1]} ${match[3]}` };
        },
      },
      {
        pattern: /(.*?)\s*(?:Season|S)\s*(\d{1,2})\b(.*)/i,
        handler(match) {
          return { season: parseInt(match[2], 10), title: `${match[1]} ${match[3]}` };
        },
      },
      {
        pattern: /(.*?)\s*(\d{1,2})(?:st|nd|rd|th)\s*Season(.*)/i,
        handler(match) {
          return { season: parseInt(match[2], 10), title: `${match[1]} ${match[3]}` };
        },
      },
      {
        pattern: /(.*?)\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)(?:\s*[季期部])?(.*)/i,
        handler(match) {
          return { season: ROMAN_NUM[match[2].toUpperCase()] || null, title: `${match[1]} ${match[3]}` };
        },
      },
    ];

    for (const item of patterns) {
      const match = clean.match(item.pattern);
      if (!match) {
        continue;
      }
      const result = item.handler(match);
      if (result.season) {
        return {
          title: cleanTitleForComparison(result.title).trim(),
          season: result.season,
        };
      }
    }

    return {
      title: cleanTitleForComparison(clean).trim(),
      season: null,
    };
  }

  function detectSeasonFromTitle(candidateTitle, searchTitle) {
    const parsed = parseCandidateTitle(candidateTitle);
    if (parsed.season) {
      return parsed.season;
    }
    if (!searchTitle || !candidateTitle) {
      return null;
    }
    const clean = candidateTitle.replace(/\(\d{4}\)/, "").trim().toLowerCase();
    const search = String(searchTitle).trim().toLowerCase();
    const index = clean.indexOf(search);
    if (index === -1) {
      return null;
    }
    const tail = clean.slice(index + search.length).trim();
    if (!tail) {
      return 1;
    }
    const number = tail.match(/(\d+)/);
    if (number) {
      return parseInt(number[1], 10);
    }
    const chinese = tail.match(/([一二三四五六七八九十])/);
    if (chinese) {
      return CN_NUM[chinese[1]] || null;
    }
    return extractSeasonNumber(tail);
  }

  function calculateStringSimilarity(a, b) {
    if (!a || !b) {
      return 0;
    }
    const left = cleanTitleForComparison(a).toLowerCase().replace(/[：:]/g, "");
    const right = cleanTitleForComparison(b).toLowerCase().replace(/[：:]/g, "");
    if (left === right) {
      return 1;
    }
    if (!left.length || !right.length) {
      return 0;
    }
    if (left.includes(right) || right.includes(left)) {
      return 0.9 * (Math.min(left.length, right.length) / Math.max(left.length, right.length));
    }
    if (Math.abs(left.length - right.length) > Math.max(left.length, right.length) * 0.6) {
      return 0.2;
    }
    if (left.length === 1 || right.length === 1) {
      return left[0] === right[0] ? 0.3 : 0;
    }
    const leftBigrams = new Set();
    const rightBigrams = new Set();
    for (let index = 0; index < left.length - 1; index += 1) {
      leftBigrams.add(left.slice(index, index + 2));
    }
    for (let index = 0; index < right.length - 1; index += 1) {
      rightBigrams.add(right.slice(index, index + 2));
    }
    let intersection = 0;
    leftBigrams.forEach((item) => {
      if (rightBigrams.has(item)) {
        intersection += 1;
      }
    });
    return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
  }

  function extractKeywords(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/[：:]/g, " ")
      .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
      .split(/[\s\u3000]+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  }

  function findBestEpisode(episodes, targetEpisode) {
    if (!Array.isArray(episodes) || !episodes.length || !targetEpisode) {
      return null;
    }
    const direct = episodes.find((episode) => parseInt(episode.episodeNumber, 10) === targetEpisode);
    if (direct) {
      return direct;
    }
    return (
      episodes.find((episode) => extractEpisodeNumber(episode.episodeTitle) === targetEpisode) ||
      episodes[targetEpisode - 1] ||
      episodes[0]
    );
  }

  function calculateMatchScore(normalizedSearch, candidate, parsedSearch) {
    const candidateYear = candidate.animeTitle?.match(/\((\d{4})\)/)?.[1] || null;
    const pureCandidateTitle = cleanTitleForComparison(String(candidate.animeTitle || "").replace(/\(\d{4}\)/, ""));
    const candidateTitle = cleanTitleForComparison(candidate.animeTitle || "");

    let nameScore = 0;
    const exactMatch = normalizedSearch === normalizeTitle(pureCandidateTitle) || normalizedSearch === normalizeTitle(candidateTitle);
    if (exactMatch) {
      nameScore = 0.4;
    } else if (
      normalizeTitle(pureCandidateTitle).includes(normalizedSearch) ||
      normalizedSearch.includes(normalizeTitle(pureCandidateTitle))
    ) {
      nameScore = 0.35;
    } else if (
      normalizeTitle(candidateTitle).includes(normalizedSearch) ||
      normalizedSearch.includes(normalizeTitle(candidateTitle))
    ) {
      nameScore = 0.3;
    } else {
      nameScore = calculateStringSimilarity(normalizedSearch, candidateTitle) * 0.4;
    }

    let yearScore = 0;
    if (parsedSearch.year && candidateYear) {
      const diff = Math.abs(parseInt(candidateYear, 10) - parsedSearch.year);
      yearScore = diff === 0 ? 0.2 : diff === 1 ? 0.1 : -0.2;
    }

    let seasonScore = 0;
    const parsedCandidate = parseCandidateTitle(candidate.animeTitle);
    const candidateSeason = parsedCandidate.season || detectSeasonFromTitle(candidate.animeTitle, normalizedSearch);
    if (parsedSearch.season && nameScore >= 0.2) {
      if (candidateSeason === parsedSearch.season) {
        seasonScore = 0.2;
      } else if (candidateSeason) {
        seasonScore = Math.abs(candidateSeason - parsedSearch.season) === 1 ? -0.05 : -0.2;
      } else {
        seasonScore = parsedSearch.season === 1 ? 0.1 : -0.05;
      }
    }

    let episodeScore = 0;
    const targetEpisode = parsedSearch.episode;
    if (targetEpisode && nameScore >= 0.2 && candidate.episodes?.length) {
      const matchedEpisode = findBestEpisode(candidate.episodes, targetEpisode);
      if (matchedEpisode && matchedEpisode.episodeId) {
        const candidateEpisodeNumber =
          parseInt(matchedEpisode.episodeNumber, 10) || extractEpisodeNumber(matchedEpisode.episodeTitle);
        if (candidateEpisodeNumber === targetEpisode) {
          episodeScore = 0.2;
        } else if (candidateEpisodeNumber !== null) {
          episodeScore = -0.05;
        }
      }
    }

    let keywordScore = 0;
    if (nameScore < 0.3) {
      const searchKeywords = extractKeywords(normalizedSearch);
      const candidateKeywords = extractKeywords(candidate.animeTitle);
      const hits = searchKeywords.filter((word) => candidateKeywords.some((candidateWord) => candidateWord.includes(word) || word.includes(candidateWord))).length;
      keywordScore = (hits / Math.max(searchKeywords.length, 1)) * 0.05;
    }

    const hasEpisodeHints = parsedSearch.season || parsedSearch.episode;
    const typeMap = hasEpisodeHints
      ? { tvseries: 0.05, tvspecial: 0.03, web: 0.02, movie: -0.05 }
      : { movie: 0.05, tvseries: 0.02 };
    const typeScore = typeMap[String(candidate.type || "").toLowerCase()] || 0;
    const total = nameScore + yearScore + seasonScore + episodeScore + keywordScore + typeScore;
    return {
      exactMatch,
      titleSimilarity: nameScore,
      yearScore,
      seasonScore,
      episodeScore,
      keywordScore,
      typeScore,
      total,
    };
  }

  function selectBestMatch(searchTitle, candidates, preferenceAnimeId, minSimilarity = 0.3) {
    if (!Array.isArray(candidates) || !candidates.length) {
      return null;
    }
    const parsedSearch = parseSearchKeyword(searchTitle);
    const normalizedSearch = normalizeTitle(parsedSearch.title);
    const scored = [];

    for (const candidate of candidates) {
      const similarity = calculateStringSimilarity(parsedSearch.title, candidate.animeTitle);
      if (similarity < minSimilarity) {
        continue;
      }
      const score = calculateMatchScore(normalizedSearch, candidate, parsedSearch);
      if (preferenceAnimeId && String(candidate.animeId) === String(preferenceAnimeId)) {
        score.total += 0.5;
      }
      const matchedEpisode = parsedSearch.episode ? findBestEpisode(candidate.episodes || [], parsedSearch.episode) : null;
      scored.push({
        ...candidate,
        score: score.total,
        scoreDetails: score,
        matchedEpisodeId: matchedEpisode?.episodeId || candidate.matchedEpisodeId || null,
        matchedEpisodeTitle: matchedEpisode?.episodeTitle || candidate.matchedEpisodeTitle || null,
      });
    }

    if (!scored.length) {
      return null;
    }
    scored.sort((left, right) => right.score - left.score);
    return scored[0].score > 0.1 ? scored[0] : null;
  }

  function makeRouteInfo(href) {
    try {
      const url = new URL(href || location.href, location.href);
      const match = url.pathname.match(ROUTE_RE);
      if (!match) {
        return null;
      }
      return {
        bangumiId: Number(match[1]),
        episodeRouteId: Number(match[2]),
        routeKey: url.pathname,
        href: url.href,
      };
    } catch {
      return null;
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      section[danmaku],
      section[danmaku-input],
      [danmaku-open],
      [danmaku-disabled],
      [tooltip="开启弹幕"],
      [tooltip="关闭弹幕"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .anich-ddm-overlay {
        position: absolute;
        inset: 0;
        z-index: 2147483000;
        overflow: hidden;
        pointer-events: none;
        contain: layout style size;
        font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .anich-ddm-overlay.is-paused .anich-ddm-item {
        animation-play-state: paused !important;
      }

      .anich-ddm-layer {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .anich-ddm-item {
        position: absolute;
        left: 0;
        white-space: nowrap;
        line-height: 1.2;
        font-weight: 700;
        text-shadow:
          0 0 1px rgba(0, 0, 0, 1),
          0 0 3px rgba(0, 0, 0, 0.95),
          0 0 6px rgba(0, 0, 0, 0.9);
        will-change: transform, opacity;
        user-select: none;
        pointer-events: none;
      }

      .anich-ddm-panel {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 268px;
        color: #eef2f7;
        background: rgba(13, 18, 28, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(12px);
        pointer-events: auto;
        overflow: hidden;
      }

      .anich-ddm-panel.is-collapsed .anich-ddm-panel-body {
        display: none;
      }

      .anich-ddm-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        cursor: pointer;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
      }

      .anich-ddm-panel-title {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .anich-ddm-panel-state {
        font-size: 11px;
        opacity: 0.8;
        text-align: right;
      }

      .anich-ddm-panel-body {
        padding: 12px;
      }

      .anich-ddm-row {
        display: grid;
        grid-template-columns: 42px 1fr 44px;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
      }

      .anich-ddm-row:last-of-type {
        margin-bottom: 0;
      }

      .anich-ddm-row input[type="range"] {
        width: 100%;
        margin: 0;
      }

      .anich-ddm-row input[type="checkbox"] {
        margin: 0;
        justify-self: start;
      }

      .anich-ddm-row-value {
        text-align: right;
        opacity: 0.86;
        font-variant-numeric: tabular-nums;
      }

      .anich-ddm-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .anich-ddm-button,
      .anich-ddm-input,
      .anich-ddm-select {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        color: inherit;
        background: rgba(255, 255, 255, 0.07);
        font: inherit;
      }

      .anich-ddm-button {
        padding: 8px 10px;
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease;
      }

      .anich-ddm-button:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.18);
      }

      .anich-ddm-button:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .anich-ddm-input,
      .anich-ddm-select {
        width: 100%;
        padding: 8px 10px;
      }

      .anich-ddm-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }

      .anich-ddm-small {
        margin-top: 12px;
        font-size: 11px;
        line-height: 1.5;
        white-space: pre-line;
        opacity: 0.92;
      }

      .anich-ddm-inline {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        margin-top: 10px;
      }

      .anich-ddm-matcher {
        position: absolute;
        inset: 18px auto auto 18px;
        width: min(460px, calc(100% - 36px));
        max-height: calc(100% - 36px);
        overflow: hidden;
        color: #eef2f7;
        background: rgba(10, 14, 23, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(16px);
        pointer-events: auto;
        display: none;
      }

      .anich-ddm-matcher.is-open {
        display: flex;
        flex-direction: column;
      }

      .anich-ddm-matcher-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .anich-ddm-matcher-title {
        font-size: 15px;
        font-weight: 800;
      }

      .anich-ddm-matcher-body {
        padding: 14px 16px 16px;
        overflow: auto;
      }

      .anich-ddm-search {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
      }

      .anich-ddm-list {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .anich-ddm-result {
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        cursor: pointer;
      }

      .anich-ddm-result.is-selected {
        border-color: rgba(93, 176, 255, 0.76);
        background: rgba(63, 122, 255, 0.18);
      }

      .anich-ddm-result-title {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
      }

      .anich-ddm-result-meta {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.4;
        opacity: 0.82;
      }

      .anich-ddm-status {
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-line;
      }

      .anich-ddm-divider {
        margin: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      .anich-ddm-footer {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      @keyframes anich-ddm-scroll {
        from { transform: translate3d(var(--ddm-start-x), 0, 0); opacity: 1; }
        to { transform: translate3d(var(--ddm-end-x), 0, 0); opacity: 1; }
      }

      @keyframes anich-ddm-still {
        0% { opacity: 0; }
        8% { opacity: 1; }
        90% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createElement(tagName, className, textContent) {
    const node = document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (textContent !== undefined) {
      node.textContent = textContent;
    }
    return node;
  }

  class DandanplayTransport {
    constructor(app) {
      this.app = app;
    }

    getConfig() {
      return storageGet(API_CONFIG_KEY, DEFAULT_API_CONFIG);
    }

    saveConfig(partial) {
      const nextConfig = Object.assign(this.getConfig(), partial);
      storageSet(API_CONFIG_KEY, nextConfig);
      return nextConfig;
    }

    buildCandidates() {
      const config = this.getConfig();
      const candidates = [];
      if (config.customApiPrefix) {
        candidates.push({
          mode: "custom",
          apiBase: config.customApiPrefix.replace(/\/+$/, ""),
          proxyPrefix: "",
          sourceName: "自定义 API",
        });
      }
      BUILTIN_PROXIES.forEach((proxyPrefix, index) => {
        candidates.push({
          mode: "proxy",
          apiBase: `${proxyPrefix}${OFFICIAL_API}`,
          proxyPrefix,
          sourceName: `内建代理 ${index + 1}`,
        });
      });

      if (config.lastGoodApiBase) {
        candidates.sort((left, right) => {
          const leftScore = left.apiBase === config.lastGoodApiBase ? 0 : 1;
          const rightScore = right.apiBase === config.lastGoodApiBase ? 0 : 1;
          return leftScore - rightScore;
        });
      }
      return candidates;
    }

    async fetchJson(url, signal) {
      const headersList = [
        { Accept: "application/json" },
        { Accept: "application/json", "X-User-Agent": USER_AGENT },
      ];

      let lastError = null;
      for (const headers of headersList) {
        try {
          const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
            signal,
            headers,
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();
          if (!text) {
            return {};
          }
          return JSON.parse(text);
        } catch (error) {
          lastError = error;
          if (error?.name === "AbortError") {
            throw error;
          }
        }
      }
      throw lastError || new Error("请求失败");
    }

    async request(path, params, session) {
      const candidates = this.buildCandidates();
      const errors = [];
      for (const candidate of candidates) {
        const controller = session.makeAbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const url = this.buildUrl(candidate.apiBase, path, params);
          const data = await this.fetchJson(url, controller.signal);
          clearTimeout(timeoutId);
          this.saveConfig({
            lastGoodApiBase: candidate.apiBase,
            lastGoodProxyPrefix: candidate.proxyPrefix || "",
          });
          return {
            endpoint: Object.assign({ lastOkAt: Date.now() }, candidate),
            data,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error?.name === "AbortError" && session.destroyed) {
            throw error;
          }
          errors.push(`${candidate.sourceName}: ${error.message || error}`);
        }
      }
      throw new Error(errors.join(" | ") || "所有接口都失败了");
    }

    buildUrl(apiBase, path, params) {
      const url = new URL(`${apiBase}${path}`);
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    }

    async searchEpisodes(query, episode, session) {
      return this.request("/search/episodes", { anime: query, episode }, session);
    }

    async getBangumi(bangumiId, session) {
      return this.request(`/bangumi/${bangumiId}`, null, session);
    }

    async getComments(episodeId, session, preferredApiBase) {
      const candidates = this.buildCandidates();
      const orderedCandidates = preferredApiBase
        ? candidates.sort((left, right) => (left.apiBase === preferredApiBase ? -1 : right.apiBase === preferredApiBase ? 1 : 0))
        : candidates;
      const errors = [];

      for (const candidate of orderedCandidates) {
        const controller = session.makeAbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const url = this.buildUrl(candidate.apiBase, `/comment/${episodeId}`, {
            withRelated: true,
          });
          const data = await this.fetchJson(url, controller.signal);
          clearTimeout(timeoutId);
          this.saveConfig({
            lastGoodApiBase: candidate.apiBase,
            lastGoodProxyPrefix: candidate.proxyPrefix || "",
          });
          return {
            endpoint: Object.assign({ lastOkAt: Date.now() }, candidate),
            data,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          if (error?.name === "AbortError" && session.destroyed) {
            throw error;
          }
          errors.push(`${candidate.sourceName}: ${error.message || error}`);
        }
      }

      throw new Error(errors.join(" | ") || "弹幕请求失败");
    }
  }

  class DanmakuStore {
    constructor() {
      this.clear();
    }

    clear() {
      this.items = [];
      this.ids = new Set();
      this.stats = {
        count: 0,
        source: "",
        episodeId: null,
      };
    }

    replace(comments, match, sourceName) {
      this.clear();
      for (const comment of comments) {
        const uniqueId = comment.id || `${comment.source}:${comment.text}:${round1(comment.time)}:${comment.color}`;
        if (this.ids.has(uniqueId)) {
          continue;
        }
        this.ids.add(uniqueId);
        this.items.push(comment);
      }
      this.items.sort((left, right) => left.time - right.time);
      this.stats = {
        count: this.items.length,
        source: sourceName || "",
        episodeId: match?.episodeId || null,
      };
    }
  }

  class Renderer {
    constructor(session) {
      this.session = session;
      this.container = null;
      this.overlay = null;
      this.layer = null;
      this.resizeObserver = null;
      this.measureNode = null;
      this.width = 0;
      this.height = 0;
      this.rtlLanes = [];
      this.topLanes = [];
      this.bottomLanes = [];
      this.paused = false;
    }

    attach(container) {
      if (!container) {
        return;
      }
      if (this.container === container && this.overlay?.isConnected) {
        this.updateBounds();
        return;
      }

      this.destroyObserver();
      this.container = container;
      const computed = window.getComputedStyle(container);
      if (computed.position === "static") {
        container.style.position = "relative";
      }

      if (this.overlay?.isConnected) {
        this.overlay.remove();
      }

      this.overlay = createElement("div", "anich-ddm-overlay");
      this.layer = createElement("div", "anich-ddm-layer");
      this.measureNode = createElement("div", "anich-ddm-item");
      this.measureNode.style.visibility = "hidden";
      this.measureNode.style.pointerEvents = "none";
      this.overlay.append(this.layer, this.measureNode);
      container.appendChild(this.overlay);

      this.resizeObserver = new ResizeObserver(() => {
        this.updateBounds();
        this.clear();
        this.session.scheduler.refreshFromCurrentTime(false);
      });
      this.resizeObserver.observe(container);
      this.updateBounds();
    }

    updateBounds() {
      if (!this.container) {
        return;
      }
      const rect = this.container.getBoundingClientRect();
      this.width = rect.width || this.container.clientWidth || 0;
      this.height = rect.height || this.container.clientHeight || 0;
      this.resetLanes();
    }

    destroyObserver() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    }

    destroy() {
      this.destroyObserver();
      if (this.overlay?.isConnected) {
        this.overlay.remove();
      }
      this.overlay = null;
      this.layer = null;
      this.container = null;
      this.measureNode = null;
      this.resetLanes();
    }

    resetLanes() {
      const rowHeight = Math.max(24, this.session.settings.fontSize + 8);
      const laneCount = Math.max(1, Math.floor((this.height || 320) / rowHeight));
      this.rtlLanes = Array.from({ length: laneCount }, () => ({ freeAt: 0, top: 0 }));
      this.topLanes = Array.from({ length: Math.max(1, Math.floor(laneCount / 2)) }, () => ({ freeAt: 0, top: 0 }));
      this.bottomLanes = Array.from({ length: Math.max(1, Math.floor(laneCount / 2)) }, () => ({ freeAt: 0, top: 0 }));
    }

    clear() {
      if (this.layer) {
        this.layer.textContent = "";
      }
      this.resetLanes();
    }

    syncPaused(isPaused) {
      if (!this.overlay) {
        return;
      }
      if (this.paused === isPaused) {
        return;
      }
      this.paused = isPaused;
      this.overlay.classList.toggle("is-paused", isPaused);
    }

    emit(comment) {
      if (!this.layer || !this.overlay || !this.width || !this.height) {
        return;
      }

      const settings = this.session.settings;
      const node = createElement("div", "anich-ddm-item");
      node.textContent = comment.text;
      node.style.fontSize = `${settings.fontSize}px`;
      node.style.opacity = String(settings.opacity);
      node.style.color = comment.color || "#ffffff";
      this.measureNode.style.fontSize = node.style.fontSize;
      this.measureNode.style.fontWeight = "700";
      this.measureNode.textContent = comment.text;
      const commentWidth = Math.max(24, this.measureNode.offsetWidth || settings.fontSize * Math.max(comment.text.length, 1));
      const rowHeight = Math.max(24, settings.fontSize + 8);
      const now = performance.now();

      if (comment.mode === "top" || comment.mode === "bottom") {
        const lane = this.pickStillLane(comment.mode, now, rowHeight);
        const duration = Math.round((4200 / settings.speed) + 600);
        const top = lane.top;
        lane.freeAt = now + duration;
        node.style.top = `${top}px`;
        node.style.left = `${Math.max(0, (this.width - commentWidth) / 2)}px`;
        node.style.animation = `anich-ddm-still ${duration}ms linear forwards`;
      } else {
        const lane = this.pickScrollLane(now, rowHeight, commentWidth);
        const pixelsPerSecond = 140 * settings.speed;
        const duration = Math.round(((this.width + commentWidth) / pixelsPerSecond) * 1000);
        const top = lane.top;
        lane.freeAt = now + Math.min(duration * 0.75, (commentWidth / pixelsPerSecond) * 1000 + 450);
        node.style.top = `${top}px`;
        node.style.setProperty("--ddm-start-x", `${this.width}px`);
        node.style.setProperty("--ddm-end-x", `${-commentWidth}px`);
        node.style.animation = `anich-ddm-scroll ${duration}ms linear forwards`;
      }

      node.addEventListener(
        "animationend",
        () => {
          node.remove();
        },
        { once: true }
      );
      this.layer.appendChild(node);
    }

    pickScrollLane(now, rowHeight) {
      let bestLane = this.rtlLanes[0];
      let bestIndex = 0;
      this.rtlLanes.forEach((lane, index) => {
        if (lane.freeAt <= now) {
          bestLane = lane;
          bestIndex = index;
          return;
        }
        if (lane.freeAt < bestLane.freeAt) {
          bestLane = lane;
          bestIndex = index;
        }
      });
      bestLane.top = bestIndex * rowHeight;
      return bestLane;
    }

    pickStillLane(mode, now, rowHeight) {
      const lanes = mode === "top" ? this.topLanes : this.bottomLanes;
      let bestLane = lanes[0];
      let bestIndex = 0;
      lanes.forEach((lane, index) => {
        if (lane.freeAt <= now) {
          bestLane = lane;
          bestIndex = index;
          return;
        }
        if (lane.freeAt < bestLane.freeAt) {
          bestLane = lane;
          bestIndex = index;
        }
      });
      bestLane.top =
        mode === "top"
          ? bestIndex * rowHeight
          : Math.max(0, this.height - (lanes.length - bestIndex) * rowHeight);
      return bestLane;
    }
  }

  class Scheduler {
    constructor(session) {
      this.session = session;
      this.comments = [];
      this.cursor = 0;
      this.frameId = 0;
      this.lastTargetTime = null;
      this.lastVideo = null;
      this.running = false;
      this.tick = this.tick.bind(this);
    }

    setComments(comments) {
      this.comments = Array.isArray(comments) ? comments : [];
      this.refreshFromCurrentTime(false);
      this.start();
    }

    setVideo(video) {
      this.lastVideo = video || null;
      this.refreshFromCurrentTime(false);
      if (video) {
        this.start();
      }
    }

    start() {
      if (this.running) {
        return;
      }
      this.running = true;
      this.frameId = requestAnimationFrame(this.tick);
    }

    stop() {
      this.running = false;
      if (this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
    }

    destroy() {
      this.stop();
      this.comments = [];
      this.cursor = 0;
      this.lastTargetTime = null;
    }

    refreshFromCurrentTime(clearOverlay = true) {
      const video = this.session.video;
      const targetTime = (video?.currentTime || 0) + this.session.settings.offset;
      this.cursor = this.lowerBound(targetTime);
      this.lastTargetTime = targetTime;
      if (clearOverlay) {
        this.session.renderer.clear();
      }
    }

    lowerBound(targetTime) {
      let left = 0;
      let right = this.comments.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (this.comments[middle].time < targetTime) {
          left = middle + 1;
        } else {
          right = middle;
        }
      }
      return left;
    }

    tick() {
      if (!this.running || this.session.destroyed) {
        return;
      }
      const video = this.session.video;
      if (!video) {
        this.frameId = requestAnimationFrame(this.tick);
        return;
      }

      this.session.renderer.syncPaused(video.paused);
      if (this.session.settings.enabled && this.comments.length) {
        const targetTime = video.currentTime + this.session.settings.offset;
        if (
          this.lastTargetTime === null ||
          Math.abs(targetTime - this.lastTargetTime) > 1.5 ||
          targetTime < this.lastTargetTime - 0.35
        ) {
          this.refreshFromCurrentTime(true);
        }
        this.lastTargetTime = targetTime;

        if (!video.paused) {
          while (this.cursor < this.comments.length && this.comments[this.cursor].time <= targetTime + 0.05) {
            this.session.renderer.emit(this.comments[this.cursor]);
            this.cursor += 1;
          }
        }
      }

      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  class ControlPanel {
    constructor(session) {
      this.session = session;
      this.panel = null;
      this.panelState = null;
      this.stats = null;
      this.rowValues = {};
      this.matcher = null;
      this.searchInput = null;
      this.searchButton = null;
      this.resultList = null;
      this.resultStatus = null;
      this.episodeSelect = null;
      this.confirmButton = null;
      this.selectedResult = null;
      this.currentResults = [];
    }

    attach(overlay) {
      if (!overlay) {
        return;
      }
      if (this.panel?.isConnected && this.panel.parentElement === overlay) {
        return;
      }
      if (this.panel?.isConnected) {
        this.panel.remove();
      }
      if (this.matcher?.isConnected) {
        this.matcher.remove();
      }

      this.panel = createElement("div", "anich-ddm-panel");
      this.panel.classList.toggle("is-collapsed", this.session.settings.panelCollapsed);
      const head = createElement("button", "anich-ddm-panel-head");
      head.type = "button";
      const title = createElement("div", "anich-ddm-panel-title", TOP_BAR_TITLE);
      this.panelState = createElement("div", "anich-ddm-panel-state");
      head.append(title, this.panelState);
      head.addEventListener("click", () => {
        this.session.settings.panelCollapsed = !this.session.settings.panelCollapsed;
        this.session.saveSettings();
        this.panel.classList.toggle("is-collapsed", this.session.settings.panelCollapsed);
      });

      const body = createElement("div", "anich-ddm-panel-body");
      Object.entries(PANEL_LABELS).forEach(([key, label]) => {
        const row = createElement("label", "anich-ddm-row");
        const labelNode = createElement("span", "", label);
        const valueNode = createElement("span", "anich-ddm-row-value");
        this.rowValues[key] = valueNode;
        if (key === "enabled") {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = !!this.session.settings.enabled;
          checkbox.addEventListener("change", () => {
            this.session.updateSetting(key, checkbox.checked);
          });
          row.append(labelNode, checkbox, valueNode);
        } else {
          const range = document.createElement("input");
          range.type = "range";
          range.min = String(SETTING_LIMITS[key].min);
          range.max = String(SETTING_LIMITS[key].max);
          range.step = String(SETTING_LIMITS[key].step);
          range.value = String(this.session.settings[key]);
          range.addEventListener("input", () => {
            this.session.updateSetting(key, safeNumber(range.value, this.session.settings[key]));
          });
          row.append(labelNode, range, valueNode);
        }
        body.appendChild(row);
      });

      const apiBox = createElement("div", "anich-ddm-small");
      const inline = createElement("div", "anich-ddm-inline");
      const apiInput = createElement("input", "anich-ddm-input");
      apiInput.placeholder = "自定义 API 前缀，例如 https://xxx/api/v2";
      apiInput.value = this.session.transport.getConfig().customApiPrefix || "";
      apiInput.addEventListener("change", () => {
        this.session.transport.saveConfig({ customApiPrefix: apiInput.value.trim() });
        this.session.setStatus("已保存自定义 API 前缀");
        this.update();
      });
      const apiSaveButton = createElement("button", "anich-ddm-button", "保存");
      apiSaveButton.type = "button";
      apiSaveButton.addEventListener("click", () => {
        this.session.transport.saveConfig({ customApiPrefix: apiInput.value.trim() });
        this.session.setStatus("已保存自定义 API 前缀");
        this.update();
      });
      inline.append(apiInput, apiSaveButton);
      body.appendChild(inline);
      body.appendChild(apiBox);

      const actions = createElement("div", "anich-ddm-actions");
      const matcherButton = createElement("button", "anich-ddm-button", "手动匹配");
      matcherButton.type = "button";
      matcherButton.addEventListener("click", () => this.openMatcher());
      const rematchButton = createElement("button", "anich-ddm-button", "重新自动匹配");
      rematchButton.type = "button";
      rematchButton.addEventListener("click", () => {
        this.session.clearCurrentMatch(false);
        this.session.bootstrap(true);
      });
      const clearButton = createElement("button", "anich-ddm-button", "清除匹配");
      clearButton.type = "button";
      clearButton.addEventListener("click", () => {
        this.session.clearCurrentMatch(true);
      });
      const clearDmButton = createElement("button", "anich-ddm-button", "清空屏幕");
      clearDmButton.type = "button";
      clearDmButton.addEventListener("click", () => {
        this.session.renderer.clear();
      });
      actions.append(matcherButton, rematchButton, clearButton, clearDmButton);
      body.appendChild(actions);

      this.stats = createElement("div", "anich-ddm-small");
      body.appendChild(this.stats);

      this.panel.append(head, body);
      overlay.appendChild(this.panel);
      this.buildMatcher(overlay);
      this.update();
    }

    buildMatcher(overlay) {
      this.matcher = createElement("div", "anich-ddm-matcher");
      const head = createElement("div", "anich-ddm-matcher-head");
      const title = createElement("div", "anich-ddm-matcher-title", "手动匹配弹幕");
      const closeButton = createElement("button", "anich-ddm-button", "关闭");
      closeButton.type = "button";
      closeButton.addEventListener("click", () => this.closeMatcher());
      head.append(title, closeButton);

      const body = createElement("div", "anich-ddm-matcher-body");
      const search = createElement("div", "anich-ddm-search");
      this.searchInput = createElement("input", "anich-ddm-input");
      this.searchInput.placeholder = "输入标题搜索弹弹 Play";
      this.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.runSearch();
        }
      });
      this.searchButton = createElement("button", "anich-ddm-button", "搜索");
      this.searchButton.type = "button";
      this.searchButton.addEventListener("click", () => this.runSearch());
      search.append(this.searchInput, this.searchButton);
      body.appendChild(search);

      this.resultStatus = createElement("div", "anich-ddm-status");
      body.appendChild(this.resultStatus);
      this.resultList = createElement("div", "anich-ddm-list");
      body.appendChild(this.resultList);

      body.appendChild(createElement("div", "anich-ddm-divider"));
      this.episodeSelect = createElement("select", "anich-ddm-select");
      body.appendChild(this.episodeSelect);

      const footer = createElement("div", "anich-ddm-footer");
      this.confirmButton = createElement("button", "anich-ddm-button", "确认匹配");
      this.confirmButton.type = "button";
      this.confirmButton.disabled = true;
      this.confirmButton.addEventListener("click", () => this.confirmSelected());
      const clearButton = createElement("button", "anich-ddm-button", "清除当前");
      clearButton.type = "button";
      clearButton.addEventListener("click", () => {
        this.session.clearCurrentMatch(true);
      });
      const autoButton = createElement("button", "anich-ddm-button", "自动重试");
      autoButton.type = "button";
      autoButton.addEventListener("click", () => {
        this.session.clearCurrentMatch(false);
        this.closeMatcher();
        this.session.bootstrap(true);
      });
      footer.append(this.confirmButton, clearButton, autoButton);
      body.appendChild(footer);

      this.matcher.append(head, body);
      overlay.appendChild(this.matcher);
    }

    openMatcher() {
      if (!this.matcher) {
        return;
      }
      const context = this.session.resolvePageContext();
      this.searchInput.value = context?.searchTitle || context?.title || "";
      this.matcher.classList.add("is-open");
      this.runSearch();
    }

    closeMatcher() {
      this.matcher?.classList.remove("is-open");
    }

    async runSearch() {
      const query = normalizeSpace(this.searchInput.value);
      if (!query) {
        this.resultStatus.textContent = "请输入标题后再搜索。";
        return;
      }

      this.resultStatus.textContent = "正在搜索...";
      this.searchButton.disabled = true;
      this.selectedResult = null;
      this.confirmButton.disabled = true;
      this.resultList.textContent = "";
      this.episodeSelect.textContent = "";

      try {
        const results = await this.session.manualSearch(query);
        this.currentResults = results;
        this.renderResults(results);
      } catch (error) {
        this.resultStatus.textContent = `搜索失败：${error.message || error}`;
      } finally {
        this.searchButton.disabled = false;
      }
    }

    renderResults(results) {
      this.resultList.textContent = "";
      this.currentResults = results;
      if (!results.length) {
        this.resultStatus.textContent = "没有找到可用结果。";
        return;
      }
      this.resultStatus.textContent = `找到 ${results.length} 个结果，请选择正确的番剧。`;
      results.forEach((result, index) => {
        const item = createElement("button", "anich-ddm-result");
        item.type = "button";
        const title = createElement("div", "anich-ddm-result-title", result.animeTitle || `结果 ${index + 1}`);
        const meta = createElement(
          "div",
          "anich-ddm-result-meta",
          [
            result.typeDescription || result.type || "未知类型",
            result.sourceName || "未知来源",
            result.episodes?.length ? `分集 ${result.episodes.length}` : "待加载分集",
            typeof result.score === "number" ? `分数 ${result.score.toFixed(3)}` : "",
          ]
            .filter(Boolean)
            .join(" | ")
        );
        item.append(title, meta);
        item.addEventListener("click", () => this.selectResult(result, item));
        this.resultList.appendChild(item);
      });

      this.selectResult(results[0], this.resultList.firstElementChild);
    }

    async selectResult(result, element) {
      Array.from(this.resultList.children).forEach((node) => {
        node.classList.toggle("is-selected", node === element);
      });
      this.selectedResult = result;
      this.confirmButton.disabled = true;
      this.episodeSelect.textContent = "";
      this.resultStatus.textContent = `正在加载 ${result.animeTitle} 的分集...`;

      try {
        const episodes = await this.session.resolveEpisodesForResult(result);
        this.episodeSelect.textContent = "";
        episodes.forEach((episode, index) => {
          const option = document.createElement("option");
          option.value = String(episode.episodeId);
          option.textContent = `${index + 1}. ${episode.episodeTitle || `第${index + 1}集`}`;
          this.episodeSelect.appendChild(option);
        });
        const preferredEpisode = this.session.pickEpisodeForContext(episodes);
        if (preferredEpisode?.episodeId) {
          this.episodeSelect.value = String(preferredEpisode.episodeId);
        }
        this.confirmButton.disabled = !episodes.length;
        this.resultStatus.textContent = episodes.length
          ? `已加载 ${episodes.length} 集，确认后将绑定到当前页面。`
          : "没有可用分集，无法确认匹配。";
      } catch (error) {
        this.resultStatus.textContent = `分集加载失败：${error.message || error}`;
      }
    }

    async confirmSelected() {
      if (!this.selectedResult) {
        return;
      }
      const episodeId = this.episodeSelect.value;
      const selectedEpisode = (this.selectedResult.resolvedEpisodes || []).find(
        (episode) => String(episode.episodeId) === String(episodeId)
      );
      if (!selectedEpisode) {
        this.resultStatus.textContent = "请选择分集后再确认。";
        return;
      }
      this.confirmButton.disabled = true;
      this.resultStatus.textContent = "正在应用匹配...";
      try {
        await this.session.applyManualMatch(this.selectedResult, selectedEpisode);
        this.closeMatcher();
      } catch (error) {
        this.resultStatus.textContent = `应用失败：${error.message || error}`;
      } finally {
        this.confirmButton.disabled = false;
      }
    }

    update() {
      if (!this.panelState || !this.stats) {
        return;
      }
      const session = this.session;
      const match = session.currentMatch;
      this.panelState.textContent = [session.statusLabel, match ? "已匹配" : "未匹配"].join("\n");
      this.rowValues.enabled.textContent = session.settings.enabled ? "开" : "关";
      this.rowValues.fontSize.textContent = `${session.settings.fontSize}px`;
      this.rowValues.opacity.textContent = `${Math.round(session.settings.opacity * 100)}%`;
      this.rowValues.speed.textContent = `${session.settings.speed.toFixed(1)}x`;
      this.rowValues.offset.textContent =
        session.settings.offset === 0
          ? "0.0s"
          : `${session.settings.offset > 0 ? "+" : ""}${session.settings.offset.toFixed(1)}s`;

      const context = session.resolvePageContext();
      const transportConfig = session.transport.getConfig();
      const lines = [
        `当前路由: ${session.route.routeKey}`,
        `当前标题: ${context?.title || "未解析"}`,
        `当前集数: ${context?.episode ?? "未解析"}`,
        match ? `匹配结果: ${match.animeTitle} / ${match.episodeTitle}` : "匹配结果: 未匹配",
        match ? `来源: ${match.sourceName}` : `来源: ${session.lastEndpoint?.sourceName || "暂无"}`,
        `弹幕数: ${session.store.stats.count}`,
        `状态: ${session.statusMessage || "空闲"}`,
        `自定义 API: ${transportConfig.customApiPrefix || "未设置"}`,
      ];
      this.stats.textContent = lines.join("\n");
    }
  }

  class Session {
    constructor(app, route) {
      this.app = app;
      this.route = route;
      this.token = app.nextToken();
      this.destroyed = false;
      this.settings = storageGet(SETTINGS_KEY, DEFAULT_SETTINGS);
      this.transport = app.transport;
      this.store = new DanmakuStore();
      this.renderer = new Renderer(this);
      this.scheduler = new Scheduler(this);
      this.panel = new ControlPanel(this);
      this.currentMatch = null;
      this.statusMessage = "等待初始化";
      this.statusLabel = "准备中";
      this.video = null;
      this.playerContainer = null;
      this.abortControllers = new Set();
      this.bootstrapPromise = null;
      this.lastEndpoint = null;
      this.cachedContext = null;
    }

    makeAbortController() {
      const controller = new AbortController();
      this.abortControllers.add(controller);
      controller.signal.addEventListener(
        "abort",
        () => {
          this.abortControllers.delete(controller);
        },
        { once: true }
      );
      return controller;
    }

    abortAll() {
      this.abortControllers.forEach((controller) => controller.abort());
      this.abortControllers.clear();
    }

    destroy() {
      this.destroyed = true;
      this.abortAll();
      this.scheduler.destroy();
      this.renderer.destroy();
      this.video = null;
      this.playerContainer = null;
      this.cachedContext = null;
    }

    bindVideo(video) {
      if (!video || this.video === video) {
        return;
      }
      this.video = video;
      this.playerContainer = video.closest("section[player]") || video.parentElement || video;
      this.renderer.attach(this.playerContainer);
      this.panel.attach(this.renderer.overlay);
      this.scheduler.setVideo(video);
      this.panel.update();
    }

    saveSettings() {
      storageSet(SETTINGS_KEY, this.settings);
    }

    updateSetting(key, value) {
      if (key === "enabled") {
        this.settings.enabled = !!value;
      } else {
        const limit = SETTING_LIMITS[key];
        this.settings[key] = clamp(safeNumber(value, this.settings[key]), limit.min, limit.max);
      }
      this.saveSettings();
      this.renderer.clear();
      this.scheduler.refreshFromCurrentTime(false);
      this.panel.update();
    }

    setStatus(message, label) {
      this.statusMessage = message;
      if (label) {
        this.statusLabel = label;
      }
      this.panel.update();
    }

    getExactCache() {
      return storageGet(MATCH_CACHE_KEY, {});
    }

    saveExactCache(cache) {
      storageSet(MATCH_CACHE_KEY, cache);
    }

    getPreferenceCache() {
      return storageGet(PREFERENCE_CACHE_KEY, {});
    }

    savePreferenceCache(cache) {
      storageSet(PREFERENCE_CACHE_KEY, cache);
    }

    getCurrentContextKey() {
      const context = this.resolvePageContext();
      if (!context) {
        return "";
      }
      return `${context.normalizedTitleKey}::S${context.season || 1}::E${context.episode || 0}`;
    }

    resolvePageContext(force = false) {
      if (!force && this.cachedContext && this.cachedContext.routeKey === this.route.routeKey) {
        return this.cachedContext;
      }

      const data = window.$data || {};
      const bangumiData = data[`bangumi-${this.route.bangumiId}`]?.data || {};
      const rawTitle = bangumiData.title || document.querySelector("section title")?.textContent || document.title || "";
      const altTitles = Array.isArray(bangumiData.titles) ? bangumiData.titles.filter(Boolean) : [];
      const playerTitle =
        document.querySelector("section[header='true'] section title")?.textContent ||
        document.querySelector("section title")?.textContent ||
        "";
      const episode = extractEpisodeNumber(playerTitle) || this.route.episodeRouteId || null;
      const bangumiSeason = extractSeasonNumber(rawTitle) || 1;
      const title = cleanTitleTail(rawTitle || playerTitle);
      const parsedTitle = parseSearchKeyword(title);
      const baseTitle = parsedTitle.title || title || playerTitle || "";
      const aliases = Array.from(
        new Set(
          [baseTitle, ...altTitles, playerTitle]
            .map((value) => cleanTitleTail(String(value || "").replace(/^第\s*\d+\s*(?:集|话|話)\s*/i, "")))
            .filter(Boolean)
        )
      );
      const season = parsedTitle.season || bangumiSeason || 1;
      const searchTitle = season > 1 ? `${baseTitle} 第${season}季` : baseTitle;
      const normalizedTitleKey = normalizeTitle(baseTitle);
      const context = {
        routeKey: this.route.routeKey,
        pageTitle: playerTitle,
        title: baseTitle,
        normalizedTitle: normalizeTitle(searchTitle),
        normalizedTitleKey,
        season,
        episode,
        aliases,
        searchTitle,
        seriesPreferenceKey: normalizedTitleKey,
      };
      this.cachedContext = context;
      return context;
    }

    getCachedMatch() {
      const key = this.getCurrentContextKey();
      return this.getExactCache()[key] || null;
    }

    saveCurrentMatch(record) {
      const key = this.getCurrentContextKey();
      const cache = this.getExactCache();
      cache[key] = record;
      this.saveExactCache(cache);
      this.currentMatch = record;
      this.panel.update();
    }

    clearCurrentMatch(removeCache) {
      const key = this.getCurrentContextKey();
      if (removeCache) {
        const cache = this.getExactCache();
        delete cache[key];
        this.saveExactCache(cache);
      }
      this.currentMatch = null;
      this.store.clear();
      this.renderer.clear();
      this.scheduler.setComments([]);
      this.setStatus(removeCache ? "已清除当前匹配" : "已移除当前匹配，准备重新匹配", removeCache ? "空闲" : "重试中");
      this.panel.update();
    }

    isFresh(token) {
      return !this.destroyed && this.token === token;
    }

    async bootstrap(forceAutoMatch = false) {
      if (this.bootstrapPromise) {
        return this.bootstrapPromise;
      }

      const token = this.token;
      this.bootstrapPromise = (async () => {
        this.setStatus("正在解析页面信息...", "初始化");
        const context = this.resolvePageContext(true);
        if (!context?.title) {
          this.setStatus("未能解析页面标题，请使用手动匹配。", "待匹配");
          return;
        }

        if (!forceAutoMatch) {
          const cached = this.getCachedMatch();
          if (cached) {
            this.currentMatch = cached;
            this.setStatus("命中缓存，正在加载弹幕...", "缓存");
            try {
              await this.loadDanmakuForMatch(cached, token);
              return;
            } catch (error) {
              if (this.isFresh(token)) {
                this.setStatus(`缓存弹幕加载失败，尝试重新匹配。\n${error.message || error}`, "重试");
              }
            }
          }
        }

        const autoMatch = await this.runAutoMatch(token);
        if (!autoMatch || !this.isFresh(token)) {
          if (this.isFresh(token)) {
            this.currentMatch = null;
            this.store.clear();
            this.scheduler.setComments([]);
            this.renderer.clear();
            this.setStatus("自动匹配失败，请手动搜索并确认。", "待匹配");
          }
          return;
        }

        this.currentMatch = autoMatch;
        this.saveCurrentMatch(autoMatch);
        this.setStatus("自动匹配成功，正在加载弹幕...", "已匹配");
        await this.loadDanmakuForMatch(autoMatch, token);
      })()
        .catch((error) => {
          if (this.isFresh(token)) {
            this.setStatus(`初始化失败：${error.message || error}`, "错误");
          }
        })
        .finally(() => {
          this.bootstrapPromise = null;
          this.panel.update();
        });

      return this.bootstrapPromise;
    }

    buildSearchQueries(query) {
      const parsed = parseSearchKeyword(query);
      const values = [query];
      if (parsed.title) {
        values.push(parsed.title);
        if (parsed.season && parsed.season > 1) {
          values.push(`${parsed.title} 第${parsed.season}季`);
        }
      }
      return Array.from(new Set(values.map(cleanTitleTail).filter(Boolean)));
    }

    async manualSearch(query) {
      const token = this.token;
      const context = this.resolvePageContext();
      const merged = [];
      const seen = new Set();
      const searchQueries = this.buildSearchQueries(query);

      for (const searchQuery of searchQueries) {
        const response = await this.transport.searchEpisodes(searchQuery, context.episode, this);
        if (!this.isFresh(token)) {
          return [];
        }
        const endpoint = response.endpoint;
        this.lastEndpoint = endpoint;
        const animes = Array.isArray(response.data?.animes) ? response.data.animes : [];
        const preferredAnimeId = this.getPreferenceCache()[context.seriesPreferenceKey]?.animeId || null;
        const decorated = animes
          .map((anime) => Object.assign({}, anime, endpoint, {
            apiBase: endpoint.apiBase,
            sourceName: endpoint.sourceName,
            searchQuery,
          }))
          .map((candidate) => {
            const best = selectBestMatch(searchQuery, [candidate], preferredAnimeId, 0.15);
            return best || Object.assign(candidate, { score: 0.01 });
          })
          .sort((left, right) => (right.score || 0) - (left.score || 0));

        decorated.forEach((item) => {
          const key = `${item.apiBase}:${item.animeId || item.bangumiId}:${item.animeTitle}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        });
      }

      merged.sort((left, right) => (right.score || 0) - (left.score || 0));
      return merged;
    }

    async runAutoMatch(token) {
      const context = this.resolvePageContext();
      const preferenceAnimeId = this.getPreferenceCache()[context.seriesPreferenceKey]?.animeId || null;
      const queries = [];
      context.aliases.forEach((alias) => {
        this.buildSearchQueries(alias).forEach((query) => queries.push(query));
      });
      const uniqueQueries = Array.from(new Set(queries.filter(Boolean)));
      const collected = [];
      const seen = new Set();

      for (const query of uniqueQueries) {
        if (!this.isFresh(token)) {
          return null;
        }
        this.setStatus(`自动匹配中：${query}`, "匹配");
        try {
          const response = await this.transport.searchEpisodes(query, context.episode, this);
          if (!this.isFresh(token)) {
            return null;
          }
          this.lastEndpoint = response.endpoint;
          const animes = Array.isArray(response.data?.animes) ? response.data.animes : [];
          animes.forEach((anime) => {
            const key = `${response.endpoint.apiBase}:${anime.animeId || anime.bangumiId}:${anime.animeTitle}`;
            if (!seen.has(key)) {
              seen.add(key);
              collected.push(
                Object.assign({}, anime, response.endpoint, {
                  apiBase: response.endpoint.apiBase,
                  sourceName: response.endpoint.sourceName,
                  searchQuery: query,
                })
              );
            }
          });
        } catch (error) {
          this.setStatus(`搜索 ${query} 失败：${error.message || error}`, "重试");
        }
      }

      if (!collected.length) {
        return null;
      }

      let best = null;
      uniqueQueries.forEach((query) => {
        const candidate = selectBestMatch(query, collected, preferenceAnimeId, 0.18);
        if (!best || (candidate && candidate.score > best.score)) {
          best = candidate;
        }
      });
      if (!best || best.score < 0.42) {
        return null;
      }

      const episodes = await this.resolveEpisodesForResult(best);
      if (!this.isFresh(token) || !episodes.length) {
        return null;
      }

      const selectedEpisode = this.pickEpisodeForContext(episodes);
      if (!selectedEpisode) {
        return null;
      }

      return {
        normalizedTitleKey: context.normalizedTitleKey,
        episode: context.episode,
        animeId: best.animeId,
        animeTitle: best.animeTitle,
        episodeId: selectedEpisode.episodeId,
        episodeTitle: selectedEpisode.episodeTitle,
        apiBase: best.apiBase,
        sourceName: best.sourceName,
        mode: "auto",
      };
    }

    async resolveEpisodesForResult(result) {
      if (result.resolvedEpisodes?.length) {
        return result.resolvedEpisodes;
      }
      if (result.episodes?.length) {
        result.resolvedEpisodes = result.episodes.slice();
        return result.resolvedEpisodes;
      }
      if (!result.bangumiId) {
        result.resolvedEpisodes = [];
        return result.resolvedEpisodes;
      }
      const response = await this.transport.getBangumi(result.bangumiId, this);
      this.lastEndpoint = response.endpoint;
      const episodes = Array.isArray(response.data?.bangumi?.episodes)
        ? response.data.bangumi.episodes
        : Array.isArray(response.data?.episodes)
        ? response.data.episodes
        : [];
      result.resolvedEpisodes = episodes;
      return episodes;
    }

    pickEpisodeForContext(episodes) {
      const context = this.resolvePageContext();
      if (!episodes?.length) {
        return null;
      }
      return findBestEpisode(episodes, context.episode) || episodes[0];
    }

    async applyManualMatch(result, episode) {
      const context = this.resolvePageContext();
      const record = {
        normalizedTitleKey: context.normalizedTitleKey,
        episode: context.episode,
        animeId: result.animeId,
        animeTitle: result.animeTitle,
        episodeId: episode.episodeId,
        episodeTitle: episode.episodeTitle,
        apiBase: result.apiBase,
        sourceName: result.sourceName,
        mode: "manual",
      };
      const preferences = this.getPreferenceCache();
      preferences[context.seriesPreferenceKey] = {
        animeId: result.animeId,
        animeTitle: result.animeTitle,
        updatedAt: Date.now(),
      };
      this.savePreferenceCache(preferences);
      this.currentMatch = record;
      this.saveCurrentMatch(record);
      this.setStatus("手动匹配已保存，正在加载弹幕...", "已匹配");
      await this.loadDanmakuForMatch(record, this.token);
    }

    normalizeComments(rawComments, match, sourceName) {
      const comments = Array.isArray(rawComments) ? rawComments : rawComments?.comments || rawComments?.data?.comments || rawComments?.result || [];
      return comments
        .map((comment) => {
          const values = String(comment.p || "").split(",");
          const mode = MODE_MAP[values[1]] || "rtl";
          const colorValue = safeNumber(values[2], 16777215);
          const id = comment.cid || values[7] || `${comment.m || ""}-${values[0] || ""}-${values[3] || ""}`;
          return {
            id: String(id),
            source: sourceName || "dandanplay",
            text: normalizeSpace(comment.m || ""),
            time: safeNumber(values[0], 0),
            mode,
            color: `#${Math.max(0, colorValue).toString(16).slice(-6).padStart(6, "0")}`,
            date: safeNumber(values[4], Date.now()),
            episodeId: match.episodeId,
          };
        })
        .filter((comment) => comment.text && Number.isFinite(comment.time));
    }

    async loadDanmakuForMatch(match, token) {
      this.setStatus(`正在加载 ${match.animeTitle} / ${match.episodeTitle} ...`, "加载中");
      const response = await this.transport.getComments(match.episodeId, this, match.apiBase);
      if (!this.isFresh(token)) {
        return;
      }
      this.lastEndpoint = response.endpoint;
      const comments = this.normalizeComments(response.data, match, response.endpoint.sourceName || match.sourceName);
      this.store.replace(comments, match, response.endpoint.sourceName || match.sourceName);
      this.scheduler.setComments(this.store.items);
      this.setStatus(`已加载 ${this.store.stats.count} 条弹幕`, "就绪");
      this.panel.update();
    }
  }

  class AniChDanmakuApp {
    constructor() {
      this.transport = new DandanplayTransport(this);
      this.activeSession = null;
      this.tokenSeed = 0;
      this.routeHref = "";
      this.observer = null;
      this.intervalId = 0;
      this.boot();
    }

    nextToken() {
      this.tokenSeed += 1;
      return this.tokenSeed;
    }

    boot() {
      installStyles();
      this.patchHistory();
      this.observeDom();
      this.intervalId = window.setInterval(() => this.ensureSession(), 900);
      window.addEventListener("popstate", () => this.ensureSession(true), true);
      window.addEventListener("anich-ddm-route-change", () => this.ensureSession(true), true);
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.ensureSession(true), { once: true });
      } else {
        this.ensureSession(true);
      }
      this.installDebugApi();
    }

    patchHistory() {
      const wrap = (methodName) => {
        const original = history[methodName];
        history[methodName] = function wrappedHistoryMethod(...args) {
          const result = original.apply(this, args);
          window.dispatchEvent(new CustomEvent("anich-ddm-route-change"));
          return result;
        };
      };
      wrap("pushState");
      wrap("replaceState");
    }

    observeDom() {
      this.observer = new MutationObserver(() => {
        this.ensureSession();
      });
      this.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
      });
    }

    findVideo() {
      const videos = Array.from(document.querySelectorAll("video"));
      return (
        videos.find((video) => video.closest("section[player]")) ||
        videos.find((video) => video.isConnected) ||
        null
      );
    }

    ensureSession(force = false) {
      const route = makeRouteInfo(location.href);
      if (!route) {
        if (this.activeSession) {
          this.activeSession.destroy();
          this.activeSession = null;
        }
        return;
      }

      const video = this.findVideo();
      const routeChanged = !this.activeSession || this.activeSession.route.routeKey !== route.routeKey;
      if (routeChanged) {
        if (this.activeSession) {
          this.activeSession.destroy();
        }
        this.activeSession = new Session(this, route);
        this.routeHref = route.href;
        if (video) {
          this.activeSession.bindVideo(video);
        }
        this.activeSession.bootstrap();
        return;
      }

      if (video) {
        this.activeSession.bindVideo(video);
      }
      if (force) {
        this.activeSession.bootstrap();
      }
    }

    installDebugApi() {
      window[DEBUG_NAMESPACE] = {
        getSession: () =>
          this.activeSession
            ? {
                route: this.activeSession.route,
                token: this.activeSession.token,
                statusLabel: this.activeSession.statusLabel,
                statusMessage: this.activeSession.statusMessage,
                context: this.activeSession.resolvePageContext(),
              }
            : null,
        getMatch: () => this.activeSession?.currentMatch || null,
        getStats: () =>
          this.activeSession
            ? {
                store: this.activeSession.store.stats,
                endpoint: this.activeSession.lastEndpoint,
                settings: this.activeSession.settings,
              }
            : null,
        openMatcher: () => this.activeSession?.panel.openMatcher(),
        clearMatch: () => this.activeSession?.clearCurrentMatch(true),
        toggle: () => {
          if (!this.activeSession) {
            return null;
          }
          this.activeSession.updateSetting("enabled", !this.activeSession.settings.enabled);
          return this.activeSession.settings.enabled;
        },
      };
    }
  }

  try {
    new AniChDanmakuApp();
  } catch (error) {
    console.error("[AniChDanmaku]", error);
  }
})();
