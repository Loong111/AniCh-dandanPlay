// ==UserScript==
// @name         AniCh 弹弹 Play 弹幕
// @namespace    https://anich.emmmm.eu.org/
// @version      2.2.0
// @description  AniCh 专用弹弹 Play 弹幕 userscript，提供外置工具条、过滤、显示区域和独立渲染。
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
  const TOOLBAR_POSITION_KEY = `${STORAGE_PREFIX}toolbarPosition`;
  const STYLE_ID = "anich-ddm-style";
  const DEBUG_NAMESPACE = "__anichDanmaku__";
  const OFFICIAL_API = "https://api.dandanplay.net/api/v2";
  const MODE_KEYS = Object.freeze(["rtl", "ltr", "top", "bottom"]);
  const MODE_LABELS = Object.freeze({
    rtl: "右至左",
    ltr: "左至右",
    top: "顶部固定",
    bottom: "底部固定",
  });
  const DEFAULT_BLOCKED_MODES = Object.freeze({
    rtl: false,
    ltr: false,
    top: false,
    bottom: false,
  });
  const BUILTIN_PROXIES = [
    "https://danmu-api.misaka10876.top/cors/",
    "https://ddplay-api.7o7o.cc/cors/",
  ];
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    fontSize: 24,
    displayRegionRatio: 1,
    opacity: 0.9,
    speed: 1,
    offset: 0,
    blockedModes: DEFAULT_BLOCKED_MODES,
    blockedKeywords: [],
    blockedRegexes: [],
  });
  const SETTING_LIMITS = Object.freeze({
    fontSize: { min: 14, max: 42, step: 1 },
    displayRegionRatio: { min: 0.2, max: 1, step: 0.05 },
    opacity: { min: 0.2, max: 1, step: 0.05 },
    speed: { min: 0.5, max: 2, step: 0.1 },
    offset: { min: -10, max: 10, step: 0.1 },
  });
  const DEFAULT_API_CONFIG = Object.freeze({
    customApiPrefix: "",
    lastGoodApiBase: "",
    lastGoodProxyPrefix: "",
  });
  const DEFAULT_TOOLBAR_POSITION = Object.freeze({
    side: "right",
    top: 0,
  });
  const CONTEXT_WAIT_TIMEOUT_MS = 500;
  const CONTEXT_WAIT_INTERVAL_MS = 50;
  const CONTEXT_WAIT_WINDOWS = 2;
  const PANEL_LABELS = Object.freeze({
    enabled: "开关",
    fontSize: "字号",
    displayRegionRatio: "区域",
    opacity: "不透明度",
    speed: "速度",
    offset: "偏移",
  });
  const MODE_MAP = Object.freeze({
    1: "rtl",
    4: "bottom",
    5: "top",
    6: "ltr",
    rtl: "rtl",
    ltr: "ltr",
    top: "top",
    bottom: "bottom",
  });
  const TOOLBAR_TARGET_SELECTORS = Object.freeze([
    "section[player-block]",
    "section[episode] > section[wrap]",
    "section[episode]",
  ]);
  const TOP_BAR_TITLE = "AniCh 弹弹 Play";
  const USER_AGENT = "AniChDanmakuFix/2.2";
  const SKIP_CUE_KEYWORD = "空降";
  const MIN_SKIP_CUE_LEAD_SECONDS = 3;
  const SKIP_PROMPT_DURATION_MS = 5000;
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

  function normalizeStringList(values) {
    const list = Array.isArray(values) ? values : values == null ? [] : [values];
    return Array.from(new Set(list.map((value) => normalizeSpace(value)).filter(Boolean)));
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSettings(input) {
    const next = Object.assign(cloneValue(DEFAULT_SETTINGS), input || {});
    next.enabled = !!next.enabled;
    Object.entries(SETTING_LIMITS).forEach(([key, limit]) => {
      next[key] = clamp(safeNumber(next[key], DEFAULT_SETTINGS[key]), limit.min, limit.max);
    });
    next.blockedModes = Object.assign(cloneValue(DEFAULT_BLOCKED_MODES), next.blockedModes || {});
    MODE_KEYS.forEach((mode) => {
      next.blockedModes[mode] = !!next.blockedModes[mode];
    });
    next.blockedKeywords = normalizeStringList(next.blockedKeywords);
    next.blockedRegexes = normalizeStringList(next.blockedRegexes);
    return next;
  }

  function normalizeToolbarPosition(input) {
    const next = input && typeof input === "object" ? input : {};
    return {
      side: next.side === "left" ? "left" : "right",
      top: Math.max(0, Math.round(safeNumber(next.top, DEFAULT_TOOLBAR_POSITION.top))),
    };
  }

  function parseRegexSource(rawPattern) {
    const text = normalizeSpace(rawPattern);
    const match = text.match(/^\/(.+)\/([a-z]*)$/i);
    if (match) {
      return {
        source: match[1],
        flags: match[2] || "",
      };
    }
    return {
      source: text,
      flags: "i",
    };
  }

  function compileRegexEntries(patterns) {
    const valid = [];
    const invalid = [];
    normalizeStringList(patterns).forEach((pattern) => {
      try {
        const parsed = parseRegexSource(pattern);
        valid.push({
          raw: pattern,
          regex: new RegExp(parsed.source, parsed.flags),
        });
      } catch (error) {
        invalid.push({
          raw: pattern,
          message: error?.message || String(error),
        });
      }
    });
    return { valid, invalid };
  }

  function applyCommentFilters(comments, settings) {
    const keywords = normalizeStringList(settings?.blockedKeywords).map((keyword) => keyword.toLowerCase());
    const compiled = compileRegexEntries(settings?.blockedRegexes);
    const filtered = (Array.isArray(comments) ? comments : []).filter((comment) => {
      if (settings?.blockedModes?.[comment.mode]) {
        return false;
      }
      const text = normalizeSpace(comment.text);
      const lowerText = text.toLowerCase();
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        return false;
      }
      for (const entry of compiled.valid) {
        entry.regex.lastIndex = 0;
        if (entry.regex.test(text)) {
          return false;
        }
      }
      return true;
    });
    return {
      comments: filtered,
      invalidRegexes: compiled.invalid,
    };
  }

  function formatClockTime(totalSeconds) {
    const clampedSeconds = Math.max(0, Math.floor(safeNumber(totalSeconds, 0)));
    const hours = Math.floor(clampedSeconds / 3600);
    const minutes = Math.floor((clampedSeconds % 3600) / 60);
    const seconds = clampedSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${Math.floor(clampedSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
  }

  function parseSkipCueTimeToken(token) {
    const normalized = String(token || "").trim().replace(/：/g, ":");
    if (!normalized) {
      return null;
    }

    if (/^\d+\.\d{2}$/.test(normalized)) {
      const [minutesText, secondsText] = normalized.split(".");
      const minutes = safeNumber(minutesText, NaN);
      const seconds = safeNumber(secondsText, NaN);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
        return null;
      }
      return minutes * 60 + seconds;
    }

    if (!/^\d+(?::\d{2}){1,2}$/.test(normalized)) {
      return null;
    }

    const parts = normalized.split(":").map((value) => safeNumber(value, NaN));
    if (parts.some((value) => !Number.isFinite(value))) {
      return null;
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return seconds >= 60 ? null : minutes * 60 + seconds;
    }
    const [hours, minutes, seconds] = parts;
    if (minutes >= 60 || seconds >= 60) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  function extractSkipCue(text) {
    const normalizedText = normalizeSpace(text);
    const markerIndex = normalizedText.indexOf(SKIP_CUE_KEYWORD);
    if (markerIndex < 0) {
      return null;
    }
    const tail = normalizedText.slice(markerIndex + SKIP_CUE_KEYWORD.length);
    const tokenMatch = tail.match(/(\d+(?:[：:]\d{2}){1,2}|\d+\.\d{2})/);
    if (!tokenMatch) {
      return null;
    }
    const targetTime = parseSkipCueTimeToken(tokenMatch[1]);
    if (!Number.isFinite(targetTime)) {
      return null;
    }
    return {
      targetTime,
      targetLabel: formatClockTime(targetTime),
      matchedToken: tokenMatch[1],
    };
  }

  function findFirstSkipCue(comments, minLeadSeconds = MIN_SKIP_CUE_LEAD_SECONDS) {
    const list = Array.isArray(comments) ? comments : [];
    for (const comment of list) {
      if (!comment?.text || !comment.text.includes(SKIP_CUE_KEYWORD)) {
        continue;
      }
      const parsed = extractSkipCue(comment.text);
      if (!parsed) {
        continue;
      }
      const triggerTime = safeNumber(comment.time, 0);
      if (parsed.targetTime - triggerTime < minLeadSeconds) {
        continue;
      }
      return {
        sourceCommentId: String(comment.id || `${comment.source}:${comment.text}:${round1(triggerTime)}`),
        triggerTime,
        targetTime: parsed.targetTime,
        targetLabel: parsed.targetLabel,
        sourceText: comment.text,
      };
    }
    return null;
  }

  function createControlIcon(role) {
    if (role === "settings") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.18 7.18 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.68 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.8 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor"></path>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5.5 6A2.5 2.5 0 0 0 3 8.5v5A2.5 2.5 0 0 0 5.5 16H7v3.2a.8.8 0 0 0 1.35.58L12.13 16h6.37A2.5 2.5 0 0 0 21 13.5v-5A2.5 2.5 0 0 0 18.5 6h-13Z" fill="currentColor"></path>
        <path d="M7.75 9.25h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 3.5h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z" fill="rgba(16, 32, 48, 0.24)"></path>
      </svg>
    `;
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return cloneValue(fallback);
      }
      return Object.assign(cloneValue(fallback), JSON.parse(raw));
    } catch {
      return cloneValue(fallback);
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

  function cleanSiteTitleSuffix(title) {
    return normalizeSpace(
      String(title || "")
        .replace(/\s+-\s*动漫\s*-\s*在线观看\s*-\s*AniCh\s*-\s*动漫弹幕网\s*$/i, " ")
        .replace(/\s+-\s*AniCh\s*-\s*动漫弹幕网\s*$/i, " ")
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function getBangumiDataByRoute(route) {
    const data = window.$data || {};
    return data[`bangumi-${route?.bangumiId}`]?.data || null;
  }

  function getNormalizedText(selector, root = document) {
    return normalizeSpace(root?.querySelector?.(selector)?.textContent || "");
  }

  function readPageContextSignals(route) {
    const bangumiData = getBangumiDataByRoute(route);
    const bangumiTitle = normalizeSpace(bangumiData?.title || "");
    const playerInfoTitle = getNormalizedText("section[player-info] a[title]");
    const headerEpisodeTitle = getNormalizedText("section[header='true'] section[title]");
    const currentEpisodeTitle = normalizeSpace(
      document.querySelector("a[aria-current='page'][item][title]")?.getAttribute("title") || ""
    );
    const documentTitle = cleanSiteTitleSuffix(document.title || "");
    return {
      bangumiData,
      hasBangumiTitle: !!bangumiTitle,
      seriesTitle: bangumiTitle || playerInfoTitle || documentTitle,
      episodeTitle: headerEpisodeTitle || currentEpisodeTitle || documentTitle,
      contextSource: bangumiTitle ? "bangumiData" : playerInfoTitle ? "playerInfo" : "documentTitleFallback",
      altTitles: Array.isArray(bangumiData?.titles) ? bangumiData.titles.filter(Boolean) : [],
    };
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
      [danmaku-disabled] {
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

      .anich-ddm-skip-prompt {
        position: absolute;
        right: 16px;
        bottom: 72px;
        z-index: 2147483002;
        width: min(20rem, calc(100% - 32px));
        display: flex;
        justify-content: flex-end;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(0, 12px, 0);
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0s linear 0.18s;
        pointer-events: none;
      }

      .anich-ddm-skip-prompt.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translate3d(0, 0, 0);
        transition-delay: 0s;
      }

      .anich-ddm-skip-button {
        width: min(20rem, 100%);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 11px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(8, 12, 20, 0.74);
        color: rgba(241, 248, 255, 0.96);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(18px);
        text-align: left;
        cursor: pointer;
        pointer-events: none;
        transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
      }

      .anich-ddm-skip-prompt.is-visible .anich-ddm-skip-button {
        pointer-events: auto;
      }

      .anich-ddm-skip-button:hover {
        transform: translateY(-1px);
        border-color: rgba(146, 218, 255, 0.52);
        background: rgba(12, 18, 28, 0.82);
      }

      .anich-ddm-skip-eyebrow {
        font-size: 11px;
        letter-spacing: 0.06em;
        color: rgba(170, 222, 255, 0.9);
      }

      .anich-ddm-skip-title {
        font-size: 14px;
        font-weight: 700;
        color: rgba(247, 251, 255, 0.98);
      }

      .anich-ddm-skip-meta {
        font-size: 12px;
        color: rgba(214, 225, 235, 0.84);
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

      .anich-ddm-toolbar {
        position: absolute;
        top: 0;
        right: 0;
        transform: translate3d(calc(100% + 12px), 0, 0);
        z-index: 2147483001;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 14px;
        background: rgba(11, 16, 24, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.26);
        backdrop-filter: blur(14px);
        pointer-events: auto;
      }

      .anich-ddm-toolbar.is-dragging {
        opacity: 0.96;
      }

      .anich-ddm-toolbar-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 3.4rem;
        height: 3.4rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(244, 249, 255, 0.96);
        cursor: pointer;
        transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
      }

      .anich-ddm-toolbar-button:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(129, 207, 255, 0.48);
      }

      .anich-ddm-toolbar-button.is-active {
        background: linear-gradient(135deg, rgba(152, 228, 255, 0.95), rgba(209, 242, 255, 0.92));
        border-color: rgba(209, 242, 255, 0.85);
        color: #102030;
      }

      .anich-ddm-toolbar-button.is-disabled {
        opacity: 0.62;
      }

      .anich-ddm-toolbar-button svg {
        width: 1.9rem;
        height: 1.9rem;
        display: block;
      }

      .anich-ddm-toolbar-label {
        font-size: 11px;
        letter-spacing: 0.02em;
        color: rgba(226, 235, 244, 0.84);
        white-space: nowrap;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      .anich-ddm-toolbar.is-dragging .anich-ddm-toolbar-label {
        cursor: grabbing;
      }

      .anich-ddm-panel {
        position: fixed;
        top: 16px;
        left: 16px;
        transform: none;
        z-index: 2147483645;
        width: min(36rem, calc(100vw - 2rem));
        max-width: calc(100vw - 2rem);
        max-height: min(72vh, calc(100vh - 7rem));
        color: #eef2f7;
        background: rgba(10, 15, 24, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(18px);
        pointer-events: auto;
        overflow: hidden;
        display: none;
      }

      .anich-ddm-panel.is-open {
        display: flex;
        flex-direction: column;
      }

      .anich-ddm-panel-shell {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .anich-ddm-panel-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
      }

      .anich-ddm-panel-titlebox {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .anich-ddm-panel-title {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .anich-ddm-panel-subtitle {
        font-size: 11px;
        opacity: 0.7;
      }

      .anich-ddm-panel-state {
        font-size: 11px;
        opacity: 0.8;
        text-align: right;
        white-space: pre-line;
      }

      .anich-ddm-panel-body {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .anich-ddm-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 12px 16px 0;
      }

      .anich-ddm-tab {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        color: rgba(232, 240, 247, 0.78);
        background: rgba(255, 255, 255, 0.04);
        font: inherit;
        font-size: 12px;
        padding: 7px 10px;
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
      }

      .anich-ddm-tab.is-active {
        color: #0d1724;
        background: linear-gradient(135deg, #9ce3ff, #d0f0ff);
        border-color: rgba(208, 240, 255, 0.72);
      }

      .anich-ddm-sections {
        padding: 12px 16px 16px;
        overflow: auto;
      }

      .anich-ddm-section {
        display: none;
        flex-direction: column;
        gap: 12px;
      }

      .anich-ddm-section.is-active {
        display: flex;
      }

      .anich-ddm-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        padding: 12px;
      }

      .anich-ddm-card-title {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 10px;
        letter-spacing: 0.02em;
      }

      .anich-ddm-card-note {
        margin-top: 8px;
        font-size: 11px;
        line-height: 1.5;
        opacity: 0.74;
        white-space: pre-line;
      }

      .anich-ddm-row {
        display: grid;
        grid-template-columns: 58px 1fr 54px;
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

      .anich-ddm-switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .anich-ddm-row-value {
        text-align: right;
        opacity: 0.86;
        font-variant-numeric: tabular-nums;
      }

      .anich-ddm-mode-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .anich-ddm-mode-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
      }

      .anich-ddm-mode-item input {
        margin: 0;
      }

      .anich-ddm-mode-label {
        font-size: 12px;
      }

      .anich-ddm-chip-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 18px;
      }

      .anich-ddm-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        border-radius: 999px;
        padding: 6px 9px;
        background: rgba(130, 207, 255, 0.13);
        border: 1px solid rgba(130, 207, 255, 0.24);
        font-size: 11px;
      }

      .anich-ddm-chip.is-invalid {
        background: rgba(255, 116, 129, 0.12);
        border-color: rgba(255, 116, 129, 0.24);
      }

      .anich-ddm-chip-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .anich-ddm-chip-remove {
        border: none;
        background: transparent;
        color: inherit;
        padding: 0;
        cursor: pointer;
        font: inherit;
        opacity: 0.82;
      }

      .anich-ddm-empty {
        font-size: 11px;
        opacity: 0.6;
      }

      .anich-ddm-editor {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .anich-ddm-editor-title {
        font-size: 12px;
        font-weight: 700;
      }

      .anich-ddm-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
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
      }

      .anich-ddm-error {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.5;
        color: #ffb6bd;
        white-space: pre-line;
      }

      .anich-ddm-matcher {
        position: absolute;
        inset: 18px auto auto 18px;
        z-index: 2147483644;
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
        0% { transform: translate3d(var(--ddm-start-x), 0, 0); opacity: 0; }
        10% { opacity: var(--ddm-opacity, 1); }
        90% { opacity: var(--ddm-opacity, 1); }
        100% { transform: translate3d(var(--ddm-end-x), 0, 0); opacity: 0; }
      }

      @keyframes anich-ddm-still {
        0% { opacity: 0; }
        8% { opacity: var(--ddm-opacity, 1); }
        90% { opacity: var(--ddm-opacity, 1); }
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
        visibleCount: 0,
        filteredCount: 0,
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
        visibleCount: this.items.length,
        filteredCount: 0,
        source: sourceName || "",
        episodeId: match?.episodeId || null,
      };
    }

    setVisibilityStats(visibleCount) {
      const nextVisible = Math.max(0, Math.min(this.items.length, safeNumber(visibleCount, this.items.length)));
      this.stats.visibleCount = nextVisible;
      this.stats.filteredCount = Math.max(0, this.items.length - nextVisible);
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
      this.ltrLanes = [];
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
      const fullLaneCount = Math.max(1, Math.floor((this.height || 320) / rowHeight));
      const regionHeight = Math.max(rowHeight, Math.floor((this.height || 320) * this.session.settings.displayRegionRatio));
      const scrollLaneCount = Math.max(1, Math.floor(regionHeight / rowHeight));
      this.rtlLanes = Array.from({ length: scrollLaneCount }, () => ({ freeAt: 0, top: 0 }));
      this.ltrLanes = Array.from({ length: scrollLaneCount }, () => ({ freeAt: 0, top: 0 }));
      this.topLanes = Array.from({ length: Math.max(1, Math.floor(fullLaneCount / 2)) }, () => ({ freeAt: 0, top: 0 }));
      this.bottomLanes = Array.from({ length: Math.max(1, Math.floor(fullLaneCount / 2)) }, () => ({ freeAt: 0, top: 0 }));
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
      node.style.setProperty("--ddm-opacity", String(settings.opacity));
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
        const lane = this.pickScrollLane(comment.mode, now, rowHeight, commentWidth);
        const pixelsPerSecond = 140 * settings.speed;
        const duration = Math.round(((this.width + commentWidth) / pixelsPerSecond) * 1000);
        const top = lane.top;
        lane.freeAt = now + Math.min(duration * 0.75, (commentWidth / pixelsPerSecond) * 1000 + 450);
        node.style.top = `${top}px`;
        if (comment.mode === "ltr") {
          node.style.setProperty("--ddm-start-x", `${-commentWidth}px`);
          node.style.setProperty("--ddm-end-x", `${this.width}px`);
        } else {
          node.style.setProperty("--ddm-start-x", `${this.width}px`);
          node.style.setProperty("--ddm-end-x", `${-commentWidth}px`);
        }
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

    pickScrollLane(mode, now, rowHeight) {
      const lanes = mode === "ltr" ? this.ltrLanes : this.rtlLanes;
      let bestLane = lanes[0];
      let bestIndex = 0;
      for (let index = 0; index < lanes.length; index += 1) {
        const lane = lanes[index];
        if (lane.freeAt <= now) {
          bestLane = lane;
          bestIndex = index;
          break;
        }
        if (lane.freeAt < bestLane.freeAt) {
          bestLane = lane;
          bestIndex = index;
        }
      }
      bestLane.top = bestIndex * rowHeight;
      return bestLane;
    }

    pickStillLane(mode, now, rowHeight) {
      const lanes = mode === "top" ? this.topLanes : this.bottomLanes;
      let bestLane = lanes[0];
      let bestIndex = 0;
      for (let index = 0; index < lanes.length; index += 1) {
        const lane = lanes[index];
        if (lane.freeAt <= now) {
          bestLane = lane;
          bestIndex = index;
          break;
        }
        if (lane.freeAt < bestLane.freeAt) {
          bestLane = lane;
          bestIndex = index;
        }
      }
      bestLane.top =
        mode === "top"
          ? bestIndex * rowHeight
          : Math.max(0, this.height - (lanes.length - bestIndex) * rowHeight);
      return bestLane;
    }
  }

  class SkipPrompt {
    constructor(session) {
      this.session = session;
      this.container = null;
      this.root = null;
      this.button = null;
      this.eyebrow = null;
      this.title = null;
      this.meta = null;
      this.closeTimer = 0;
      this.countdownTimer = 0;
      this.deadlineAt = 0;
      this.activeCue = null;
      this.visible = false;
      this.state = {
        visible: false,
        shownAt: 0,
        lastAction: "idle",
        lastCueId: null,
        targetLabel: "",
        targetTime: null,
        remainingSeconds: 0,
      };
      this.handleClick = this.handleClick.bind(this);
    }

    attach(container) {
      if (!container) {
        return;
      }
      if (this.container === container && this.root?.isConnected) {
        return;
      }
      this.destroyNode();
      this.container = container;
      const computed = window.getComputedStyle(container);
      if (computed.position === "static") {
        container.style.position = "relative";
      }
      this.root = createElement("div", "anich-ddm-skip-prompt");
      this.root.setAttribute("aria-hidden", "true");
      this.button = createElement("button", "anich-ddm-skip-button");
      this.button.type = "button";
      this.button.disabled = true;
      this.button.addEventListener("click", this.handleClick);
      this.eyebrow = createElement("div", "anich-ddm-skip-eyebrow", "检测到空降");
      this.title = createElement("div", "anich-ddm-skip-title", "点击跳转");
      this.meta = createElement("div", "anich-ddm-skip-meta", "");
      this.button.append(this.eyebrow, this.title, this.meta);
      this.root.appendChild(this.button);
      container.appendChild(this.root);
    }

    destroyNode() {
      this.clearTimer();
      if (this.button) {
        this.button.removeEventListener("click", this.handleClick);
      }
      if (this.root?.isConnected) {
        this.root.remove();
      }
      this.root = null;
      this.button = null;
      this.eyebrow = null;
      this.title = null;
      this.meta = null;
      this.visible = false;
    }

    clearTimer() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = 0;
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = 0;
      }
      this.deadlineAt = 0;
    }

    updateCountdownText() {
      if (!this.meta || !this.activeCue) {
        return;
      }
      const remainingSeconds = Math.max(0, Math.ceil((this.deadlineAt - Date.now()) / 1000));
      this.meta.textContent = `跳转至 ${this.activeCue.targetLabel} · 剩余 ${remainingSeconds} 秒`;
      this.state.remainingSeconds = remainingSeconds;
    }

    show(skipCue) {
      if (!skipCue) {
        return;
      }
      if (!this.root?.isConnected && this.session.playerContainer) {
        this.attach(this.session.playerContainer);
      }
      if (!this.root || !this.button || !this.meta || !this.title) {
        return;
      }
      this.clearTimer();
      this.activeCue = Object.assign({}, skipCue);
      this.deadlineAt = Date.now() + SKIP_PROMPT_DURATION_MS;
      this.title.textContent = "点击跳过片头";
      this.button.title = `跳转至 ${skipCue.targetLabel}`;
      this.button.disabled = false;
      this.root.setAttribute("aria-hidden", "false");
      this.root.classList.add("is-visible");
      this.visible = true;
      this.state = {
        visible: true,
        shownAt: Date.now(),
        lastAction: "shown",
        lastCueId: skipCue.sourceCommentId || null,
        targetLabel: skipCue.targetLabel || "",
        targetTime: safeNumber(skipCue.targetTime, null),
        remainingSeconds: Math.ceil(SKIP_PROMPT_DURATION_MS / 1000),
      };
      this.updateCountdownText();
      this.countdownTimer = window.setInterval(() => {
        this.updateCountdownText();
      }, 250);
      this.closeTimer = window.setTimeout(() => {
        this.session.scheduler.handleSkipPromptTimeout();
        this.dismiss("timeout");
      }, SKIP_PROMPT_DURATION_MS);
    }

    dismiss(reason = "dismissed") {
      this.clearTimer();
      if (this.root) {
        this.root.classList.remove("is-visible");
        this.root.setAttribute("aria-hidden", "true");
      }
      if (this.button) {
        this.button.disabled = true;
      }
      this.visible = false;
      this.state.visible = false;
      this.state.lastAction = reason;
      this.state.remainingSeconds = 0;
      if (reason === "reset" || reason === "rearm" || reason === "destroy") {
        this.activeCue = null;
      }
    }

    handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      const cue = this.activeCue;
      const video = this.session.video;
      if (!cue || !video) {
        return;
      }
      this.session.scheduler.markSkipCueClicked();
      video.currentTime = cue.targetTime;
      this.dismiss("clicked");
    }

    isVisible() {
      return this.visible;
    }

    getState() {
      return {
        visible: this.state.visible,
        shownAt: this.state.shownAt,
        lastAction: this.state.lastAction,
        lastCueId: this.state.lastCueId,
        targetLabel: this.state.targetLabel,
        targetTime: this.state.targetTime,
        remainingSeconds: this.state.remainingSeconds,
      };
    }

    destroy() {
      this.dismiss("destroy");
      this.destroyNode();
      this.container = null;
      this.activeCue = null;
      this.state = {
        visible: false,
        shownAt: 0,
        lastAction: "destroy",
        lastCueId: null,
        targetLabel: "",
        targetTime: null,
        remainingSeconds: 0,
      };
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
      this.skipCue = null;
      this.skipCueState = this.createSkipCueState(null, 0);
      this.tick = this.tick.bind(this);
    }

    createSkipCueState(skipCue, targetTime) {
      if (!skipCue) {
        return {
          armed: false,
          shownAt: 0,
          dismissed: false,
          clicked: false,
          reason: "none",
        };
      }
      const beforeTrigger = targetTime < skipCue.triggerTime - 0.05;
      const pastTarget = targetTime >= skipCue.targetTime - 0.05;
      return {
        armed: beforeTrigger && !pastTarget,
        shownAt: 0,
        dismissed: pastTarget || !beforeTrigger,
        clicked: false,
        reason: pastTarget ? "past-target" : beforeTrigger ? "armed" : "missed",
      };
    }

    setComments(comments) {
      this.comments = Array.isArray(comments) ? comments : [];
      this.refreshFromCurrentTime(false);
      this.start();
    }

    setSkipCue(skipCue) {
      this.skipCue = skipCue ? Object.assign({}, skipCue) : null;
      const targetTime = (this.session.video?.currentTime || 0) + this.session.settings.offset;
      this.skipCueState = this.createSkipCueState(this.skipCue, targetTime);
      this.session.skipPrompt.dismiss("reset");
    }

    setVideo(video) {
      if (this.lastVideo && this.lastVideo !== video) {
        this.session.skipPrompt.dismiss("rebind");
      }
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
      this.skipCue = null;
      this.skipCueState = this.createSkipCueState(null, 0);
    }

    refreshFromCurrentTime(clearOverlay = true) {
      const video = this.session.video;
      const targetTime = (video?.currentTime || 0) + this.session.settings.offset;
      this.cursor = this.lowerBound(targetTime);
      this.lastTargetTime = targetTime;
      if (clearOverlay) {
        this.session.renderer.clear();
      }
      this.syncSkipCueForCurrentTime(targetTime);
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

    syncSkipCueForCurrentTime(targetTime) {
      if (!this.skipCue) {
        this.skipCueState = this.createSkipCueState(null, targetTime);
        this.session.skipPrompt.dismiss("empty");
        return;
      }

      if (targetTime < this.skipCue.triggerTime - 0.05) {
        if (!this.skipCueState.armed || this.skipCueState.dismissed || this.skipCueState.clicked || this.skipCueState.shownAt) {
          this.skipCueState = {
            armed: true,
            shownAt: 0,
            dismissed: false,
            clicked: false,
            reason: "armed",
          };
        }
        this.session.skipPrompt.dismiss("rearm");
        return;
      }

      if (targetTime >= this.skipCue.targetTime - 0.05) {
        this.skipCueState = Object.assign({}, this.skipCueState, {
          armed: false,
          dismissed: true,
          reason: this.skipCueState.clicked ? "clicked" : "past-target",
        });
        this.session.skipPrompt.dismiss("past-target");
        return;
      }

      if (this.skipCueState.armed) {
        this.skipCueState = Object.assign({}, this.skipCueState, {
          armed: false,
          dismissed: true,
          reason: "missed",
        });
        this.session.skipPrompt.dismiss("missed");
      }
    }

    maybeShowSkipCue(previousTargetTime, targetTime, isPaused) {
      if (!this.skipCue) {
        return;
      }
      if (targetTime >= this.skipCue.targetTime - 0.05) {
        this.skipCueState = Object.assign({}, this.skipCueState, {
          armed: false,
          dismissed: true,
          reason: this.skipCueState.clicked ? "clicked" : "past-target",
        });
        this.session.skipPrompt.dismiss("past-target");
        return;
      }
      if (
        isPaused ||
        previousTargetTime === null ||
        !this.skipCueState.armed ||
        this.skipCueState.dismissed ||
        this.skipCueState.clicked
      ) {
        return;
      }
      const threshold = this.skipCue.triggerTime - 0.05;
      if (previousTargetTime < threshold && targetTime >= threshold) {
        this.skipCueState = {
          armed: false,
          shownAt: Date.now(),
          dismissed: false,
          clicked: false,
          reason: "shown",
        };
        this.session.skipPrompt.show(this.skipCue);
      }
    }

    handleSkipPromptTimeout() {
      if (!this.skipCue) {
        return;
      }
      this.skipCueState = Object.assign({}, this.skipCueState, {
        armed: false,
        dismissed: true,
        reason: "timeout",
      });
    }

    markSkipCueClicked() {
      if (!this.skipCue) {
        return;
      }
      this.skipCueState = Object.assign({}, this.skipCueState, {
        armed: false,
        dismissed: true,
        clicked: true,
        reason: "clicked",
      });
    }

    getSkipCueDebugState() {
      return {
        cue: this.skipCue ? Object.assign({}, this.skipCue) : null,
        state: Object.assign({}, this.skipCueState),
      };
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
      if (this.comments.length || this.skipCue) {
        const targetTime = video.currentTime + this.session.settings.offset;
        if (
          this.lastTargetTime === null ||
          Math.abs(targetTime - this.lastTargetTime) > 1.5 ||
          targetTime < this.lastTargetTime - 0.35
        ) {
          this.refreshFromCurrentTime(true);
        }
        const previousTargetTime = this.lastTargetTime;
        this.lastTargetTime = targetTime;
        this.maybeShowSkipCue(previousTargetTime, targetTime, video.paused);

        if (this.session.settings.enabled && this.comments.length && !video.paused) {
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
      this.playerContainer = null;
      this.overlay = null;
      this.toolbarHost = null;
      this.toolbar = null;
      this.toolbarHandle = null;
      this.panel = null;
      this.panelSubtitle = null;
      this.panelState = null;
      this.summaryStats = null;
      this.matchStats = null;
      this.rowValues = {};
      this.rangeInputs = {};
      this.modeInputs = {};
      this.sections = {};
      this.tabs = {};
      this.activeTab = "basic";
      this.enabledInput = null;
      this.keywordInput = null;
      this.keywordList = null;
      this.regexInput = null;
      this.regexList = null;
      this.regexErrors = null;
      this.apiInput = null;
      this.matcher = null;
      this.searchInput = null;
      this.searchButton = null;
      this.resultList = null;
      this.resultStatus = null;
      this.episodeSelect = null;
      this.confirmButton = null;
      this.selectedResult = null;
      this.currentResults = [];
      this.settingsEntry = null;
      this.toggleEntry = null;
      this.hostInlineStyles = null;
      this.toolbarPosition = normalizeToolbarPosition(storageGet(TOOLBAR_POSITION_KEY, DEFAULT_TOOLBAR_POSITION));
      this.dragState = null;
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
      this.handleToolbarClick = this.handleToolbarClick.bind(this);
      this.handleToolbarPointerDown = this.handleToolbarPointerDown.bind(this);
      this.handleToolbarPointerMove = this.handleToolbarPointerMove.bind(this);
      this.handleToolbarPointerUp = this.handleToolbarPointerUp.bind(this);
      this.handleViewportChange = this.handleViewportChange.bind(this);
      window.addEventListener("resize", this.handleViewportChange, true);
    }

    attach(playerContainer, overlay) {
      if (!playerContainer || !overlay) {
        return;
      }

      const panelWasOpen = !!this.panel?.classList.contains("is-open");
      const matcherWasOpen = !!this.matcher?.classList.contains("is-open");
      this.playerContainer = playerContainer;
      this.overlay = overlay;
      const nextToolbarHost = this.resolveToolbarHost(playerContainer);
      if (nextToolbarHost && nextToolbarHost !== this.toolbarHost) {
        this.releaseToolbarHost();
        this.toolbarHost = nextToolbarHost;
        this.prepareToolbarHost(nextToolbarHost);
      }
      if (!this.toolbarHost) {
        return;
      }
      if (!this.toolbar?.isConnected || this.toolbar.parentElement !== this.toolbarHost) {
        if (this.toolbar?.isConnected) {
          this.toolbar.remove();
        }
        this.buildToolbar(this.toolbarHost);
      }
      if (!this.panel?.isConnected || this.panel.parentElement !== this.toolbarHost) {
        if (this.panel?.isConnected) {
          this.panel.remove();
        }
        this.buildPanel(this.toolbarHost);
        if (panelWasOpen) {
          this.panel.classList.add("is-open");
        }
      }
      if (!this.matcher?.isConnected || this.matcher.parentElement !== overlay) {
        if (this.matcher?.isConnected) {
          this.matcher.remove();
        }
        this.buildMatcher(overlay);
        if (matcherWasOpen) {
          this.matcher.classList.add("is-open");
        }
      }
      this.applyToolbarPosition(true);
      this.update();
    }

    destroy() {
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      window.removeEventListener("resize", this.handleViewportChange, true);
      this.stopToolbarDrag(false);
      if (this.toolbar?.isConnected) {
        this.toolbar.remove();
      }
      this.toolbar = null;
      this.toolbarHandle = null;
      this.settingsEntry = null;
      this.toggleEntry = null;
      if (this.panel?.isConnected) {
        this.panel.remove();
      }
      if (this.matcher?.isConnected) {
        this.matcher.remove();
      }
      this.releaseToolbarHost();
      this.playerContainer = null;
      this.overlay = null;
      this.panel = null;
      this.matcher = null;
    }

    resolveToolbarHost(playerContainer) {
      const fullscreenElement = document.fullscreenElement;
      if (
        fullscreenElement instanceof Element &&
        (fullscreenElement.contains(playerContainer) || playerContainer.contains(fullscreenElement))
      ) {
        return fullscreenElement;
      }
      const selectorList = TOOLBAR_TARGET_SELECTORS.join(", ");
      if (playerContainer instanceof Element) {
        const ancestorMatch = playerContainer.closest(selectorList);
        if (ancestorMatch) {
          return ancestorMatch;
        }
      }
      const scopedRoot = playerContainer?.closest("section[episode]") || document;
      for (const selector of TOOLBAR_TARGET_SELECTORS) {
        const scopedMatch = scopedRoot.querySelector(selector);
        if (scopedMatch) {
          return scopedMatch;
        }
      }
      return playerContainer.parentElement || playerContainer;
    }

    prepareToolbarHost(host) {
      if (!(host instanceof HTMLElement)) {
        return;
      }
      this.hostInlineStyles = {
        position: host.style.position,
        overflow: host.style.overflow,
        overflowX: host.style.overflowX,
        overflowY: host.style.overflowY,
      };
      const computed = window.getComputedStyle(host);
      if (computed.position === "static") {
        host.style.position = "relative";
      }
      if (
        computed.overflow === "hidden" ||
        computed.overflow === "clip" ||
        computed.overflowX === "hidden" ||
        computed.overflowX === "clip" ||
        computed.overflowY === "hidden" ||
        computed.overflowY === "clip"
      ) {
        host.style.overflow = "visible";
        host.style.overflowX = "visible";
        host.style.overflowY = "visible";
      }
    }

    releaseToolbarHost() {
      if (this.toolbarHost instanceof HTMLElement && this.hostInlineStyles) {
        this.toolbarHost.style.position = this.hostInlineStyles.position;
        this.toolbarHost.style.overflow = this.hostInlineStyles.overflow;
        this.toolbarHost.style.overflowX = this.hostInlineStyles.overflowX;
        this.toolbarHost.style.overflowY = this.hostInlineStyles.overflowY;
      }
      this.hostInlineStyles = null;
      this.toolbarHost = null;
    }

    saveToolbarPosition() {
      storageSet(TOOLBAR_POSITION_KEY, this.toolbarPosition);
    }

    getResolvedToolbarPosition() {
      const position = normalizeToolbarPosition(this.toolbarPosition);
      const hostHeight = this.toolbarHost?.clientHeight || this.toolbarHost?.getBoundingClientRect?.().height || 0;
      const toolbarHeight = this.toolbar?.offsetHeight || 54;
      const maxTop = Math.max(0, Math.round(hostHeight - toolbarHeight));
      return {
        side: position.side,
        top: clamp(position.top, 0, maxTop),
        toolbarHeight,
      };
    }

    applyToolbarPosition(persist = false) {
      if (!this.toolbar) {
        return;
      }
      const next = this.getResolvedToolbarPosition();
      const changed = next.side !== this.toolbarPosition.side || next.top !== this.toolbarPosition.top;
      this.toolbarPosition = {
        side: next.side,
        top: next.top,
      };
      this.toolbar.style.top = `${next.top}px`;
      if (next.side === "left") {
        this.toolbar.style.left = "0";
        this.toolbar.style.right = "auto";
        this.toolbar.style.transform = "translate3d(calc(-100% - 12px), 0, 0)";
      } else {
        this.toolbar.style.left = "auto";
        this.toolbar.style.right = "0";
        this.toolbar.style.transform = "translate3d(calc(100% + 12px), 0, 0)";
      }
      this.applyPanelPosition();
      if (persist && changed) {
        this.saveToolbarPosition();
      }
    }

    applyPanelPosition() {
      if (!this.panel || !this.toolbar) {
        return;
      }
      const toolbarRect = this.toolbar.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
      const margin = 16;
      const gap = 12;
      const panelWidth = Math.max(0, Math.min(576, viewportWidth - margin * 2));
      this.panel.style.width = `${panelWidth}px`;

      const panelRect = this.panel.getBoundingClientRect();
      const effectivePanelWidth = Math.min(panelWidth, panelRect.width || panelWidth);
      const effectivePanelHeight = Math.min(panelRect.height || 0, Math.max(0, viewportHeight - margin * 2));
      const preferredSide = this.toolbarPosition.side === "left" ? "left" : "right";
      const availableLeft = toolbarRect.left - gap - margin;
      const availableRight = viewportWidth - margin - (toolbarRect.right + gap);
      let placeSide = preferredSide;

      if (preferredSide === "right") {
        if (availableRight < effectivePanelWidth && availableLeft >= effectivePanelWidth) {
          placeSide = "left";
        }
      } else if (availableLeft < effectivePanelWidth && availableRight >= effectivePanelWidth) {
        placeSide = "right";
      }

      const desiredLeft =
        placeSide === "right" ? toolbarRect.right + gap : toolbarRect.left - gap - effectivePanelWidth;
      const maxLeft = Math.max(margin, viewportWidth - margin - effectivePanelWidth);
      const clampedLeft = clamp(Math.round(desiredLeft), margin, maxLeft);

      const desiredTop = toolbarRect.top + toolbarRect.height + gap;
      const maxTop = Math.max(margin, viewportHeight - margin - effectivePanelHeight);
      const clampedTop = clamp(Math.round(desiredTop), margin, maxTop);

      this.panel.style.left = `${clampedLeft}px`;
      this.panel.style.top = `${clampedTop}px`;
    }

    buildToolbar(parent) {
      this.toolbar = createElement("div", "anich-ddm-toolbar");
      this.toolbar.dataset.anichDdmToolbar = "true";
      const label = createElement("div", "anich-ddm-toolbar-label", "弹幕");
      label.title = "按住拖动工具条";
      label.addEventListener("pointerdown", this.handleToolbarPointerDown);
      const toggleButton = createElement("button", "anich-ddm-toolbar-button");
      toggleButton.type = "button";
      toggleButton.dataset.anichDdmRole = "toggle";
      toggleButton.innerHTML = createControlIcon("toggle");
      toggleButton.setAttribute("aria-label", "弹幕开关");
      toggleButton.addEventListener("click", this.handleToolbarClick);

      const settingsButton = createElement("button", "anich-ddm-toolbar-button");
      settingsButton.type = "button";
      settingsButton.dataset.anichDdmRole = "settings";
      settingsButton.innerHTML = createControlIcon("settings");
      settingsButton.setAttribute("aria-label", "弹幕设置");
      settingsButton.addEventListener("click", this.handleToolbarClick);

      this.toolbarHandle = label;
      this.settingsEntry = settingsButton;
      this.toggleEntry = toggleButton;
      this.toolbar.append(label, toggleButton, settingsButton);
      parent.appendChild(this.toolbar);
    }

    buildPanel(parent) {
      this.panel = createElement("div", "anich-ddm-panel");
      const shell = createElement("div", "anich-ddm-panel-shell");
      const head = createElement("div", "anich-ddm-panel-head");
      const titleBox = createElement("div", "anich-ddm-panel-titlebox");
      const title = createElement("div", "anich-ddm-panel-title", TOP_BAR_TITLE);
      this.panelSubtitle = createElement("div", "anich-ddm-panel-subtitle", "外置工具条入口");
      this.panelState = createElement("div", "anich-ddm-panel-state");
      titleBox.append(title, this.panelSubtitle);
      const closeButton = createElement("button", "anich-ddm-button", "关闭");
      closeButton.type = "button";
      closeButton.addEventListener("click", () => this.closePanel());
      head.append(titleBox, this.panelState, closeButton);

      const body = createElement("div", "anich-ddm-panel-body");
      const tabs = createElement("div", "anich-ddm-tabs");
      [
        { key: "basic", label: "基础" },
        { key: "filters", label: "过滤" },
        { key: "match", label: "匹配/来源" },
      ].forEach((tab) => {
        const button = createElement("button", "anich-ddm-tab", tab.label);
        button.type = "button";
        button.addEventListener("click", () => this.switchTab(tab.key));
        this.tabs[tab.key] = button;
        tabs.appendChild(button);
      });
      const sections = createElement("div", "anich-ddm-sections");
      this.buildBasicSection(sections);
      this.buildFilterSection(sections);
      this.buildMatchSection(sections);
      body.append(tabs, sections);

      shell.append(head, body);
      this.panel.appendChild(shell);
      parent.appendChild(this.panel);
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      this.switchTab(this.activeTab);
    }

    buildBasicSection(parent) {
      const section = createElement("div", "anich-ddm-section");
      const settingsCard = createElement("div", "anich-ddm-card");
      settingsCard.appendChild(createElement("div", "anich-ddm-card-title", "基础设置"));
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
          this.enabledInput = checkbox;
          const wrapper = createElement("span", "anich-ddm-switch");
          wrapper.appendChild(checkbox);
          row.append(labelNode, wrapper, valueNode);
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
          this.rangeInputs[key] = range;
          row.append(labelNode, range, valueNode);
        }
        settingsCard.appendChild(row);
      });
      const summaryCard = createElement("div", "anich-ddm-card");
      summaryCard.appendChild(createElement("div", "anich-ddm-card-title", "运行概览"));
      this.summaryStats = createElement("div", "anich-ddm-small");
      summaryCard.appendChild(this.summaryStats);
      section.append(settingsCard, summaryCard);
      this.sections.basic = section;
      parent.appendChild(section);
    }

    buildFilterSection(parent) {
      const section = createElement("div", "anich-ddm-section");

      const modeCard = createElement("div", "anich-ddm-card");
      modeCard.appendChild(createElement("div", "anich-ddm-card-title", "显示类型"));
      const modeGrid = createElement("div", "anich-ddm-mode-grid");
      MODE_KEYS.forEach((mode) => {
        const item = createElement("label", "anich-ddm-mode-item");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !this.session.settings.blockedModes[mode];
        input.addEventListener("change", () => {
          this.session.setBlockedMode(mode, !input.checked);
        });
        this.modeInputs[mode] = input;
        item.append(input, createElement("span", "anich-ddm-mode-label", MODE_LABELS[mode]));
        modeGrid.appendChild(item);
      });
      modeCard.appendChild(modeGrid);
      modeCard.appendChild(createElement("div", "anich-ddm-card-note", "勾选表示显示该类型弹幕，取消勾选表示屏蔽。"));

      const keywordCard = this.buildEditorCard("blockedKeywords", "关键词屏蔽", "输入关键词后添加");
      const regexCard = this.buildEditorCard("blockedRegexes", "正则屏蔽", "支持 /pattern/flags 或普通表达式");
      this.regexErrors = createElement("div", "anich-ddm-error");
      regexCard.appendChild(this.regexErrors);

      section.append(modeCard, keywordCard, regexCard);
      this.sections.filters = section;
      parent.appendChild(section);
    }

    buildEditorCard(key, title, placeholder) {
      const card = createElement("div", "anich-ddm-card");
      const editor = createElement("div", "anich-ddm-editor");
      editor.appendChild(createElement("div", "anich-ddm-editor-title", title));
      const inline = createElement("div", "anich-ddm-inline");
      const input = createElement("input", "anich-ddm-input");
      input.placeholder = placeholder;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.handleAddListEntry(key, input);
        }
      });
      const addButton = createElement("button", "anich-ddm-button", "添加");
      addButton.type = "button";
      addButton.addEventListener("click", () => this.handleAddListEntry(key, input));
      inline.append(input, addButton);
      const list = createElement("div", "anich-ddm-chip-list");
      editor.append(inline, list);
      card.appendChild(editor);
      if (key === "blockedKeywords") {
        this.keywordInput = input;
        this.keywordList = list;
      } else {
        this.regexInput = input;
        this.regexList = list;
      }
      return card;
    }

    buildMatchSection(parent) {
      const section = createElement("div", "anich-ddm-section");

      const actionCard = createElement("div", "anich-ddm-card");
      actionCard.appendChild(createElement("div", "anich-ddm-card-title", "匹配操作"));
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
      actionCard.appendChild(actions);

      const sourceCard = createElement("div", "anich-ddm-card");
      sourceCard.appendChild(createElement("div", "anich-ddm-card-title", "来源与 API"));
      const inline = createElement("div", "anich-ddm-inline");
      this.apiInput = createElement("input", "anich-ddm-input");
      this.apiInput.placeholder = "自定义 API 前缀，例如 https://xxx/api/v2";
      this.apiInput.value = this.session.transport.getConfig().customApiPrefix || "";
      const apiSaveButton = createElement("button", "anich-ddm-button", "保存");
      apiSaveButton.type = "button";
      apiSaveButton.addEventListener("click", () => {
        this.session.transport.saveConfig({ customApiPrefix: this.apiInput.value.trim() });
        this.session.setStatus("已保存自定义 API 前缀");
        this.update();
      });
      inline.append(this.apiInput, apiSaveButton);
      sourceCard.appendChild(inline);
      sourceCard.appendChild(createElement("div", "anich-ddm-card-note", "外置工具条是唯一入口，AniCh 原生控件保持站点默认行为。"));

      const statusCard = createElement("div", "anich-ddm-card");
      statusCard.appendChild(createElement("div", "anich-ddm-card-title", "状态"));
      this.matchStats = createElement("div", "anich-ddm-small");
      statusCard.appendChild(this.matchStats);

      section.append(actionCard, sourceCard, statusCard);
      this.sections.match = section;
      parent.appendChild(section);
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

    switchTab(tabKey) {
      this.activeTab = this.sections[tabKey] ? tabKey : "basic";
      Object.entries(this.tabs).forEach(([key, button]) => {
        button.classList.toggle("is-active", key === this.activeTab);
      });
      Object.entries(this.sections).forEach(([key, section]) => {
        section.classList.toggle("is-active", key === this.activeTab);
      });
    }

    openPanel() {
      if (!this.panel) {
        return;
      }
      this.panel.classList.add("is-open");
      this.applyPanelPosition();
      this.syncControlStates();
    }

    closePanel() {
      this.panel?.classList.remove("is-open");
      this.syncControlStates();
    }

    togglePanel() {
      if (!this.panel) {
        return;
      }
      if (this.panel.classList.contains("is-open")) {
        this.closePanel();
      } else {
        this.openPanel();
      }
    }

    handleDocumentPointerDown(event) {
      const target = event.target;
      if (this.panel?.contains(target) || this.matcher?.contains(target) || this.toolbar?.contains(target)) {
        return;
      }
      this.closePanel();
    }

    handleToolbarClick(event) {
      const role = event.currentTarget?.dataset?.anichDdmRole;
      event.preventDefault();
      event.stopPropagation();
      if (role === "settings") {
        this.togglePanel();
        return;
      }
      if (role === "toggle") {
        this.session.updateSetting("enabled", !this.session.settings.enabled);
      }
    }

    handleToolbarPointerDown(event) {
      if (event.button !== 0 || !this.toolbarHost || !this.toolbar) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const resolved = this.getResolvedToolbarPosition();
      this.dragState = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startTop: resolved.top,
      };
      this.toolbar.classList.add("is-dragging");
      if (this.toolbarHandle?.setPointerCapture) {
        this.toolbarHandle.setPointerCapture(event.pointerId);
      }
      window.addEventListener("pointermove", this.handleToolbarPointerMove, true);
      window.addEventListener("pointerup", this.handleToolbarPointerUp, true);
      window.addEventListener("pointercancel", this.handleToolbarPointerUp, true);
    }

    handleToolbarPointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId || !this.toolbarHost) {
        return;
      }
      const hostRect = this.toolbarHost.getBoundingClientRect();
      const toolbarHeight = this.toolbar?.offsetHeight || 54;
      const maxTop = Math.max(0, Math.round(hostRect.height - toolbarHeight));
      const nextTop = clamp(Math.round(this.dragState.startTop + (event.clientY - this.dragState.startY)), 0, maxTop);
      const nextSide = event.clientX < hostRect.left + hostRect.width / 2 ? "left" : "right";
      this.toolbarPosition = {
        side: nextSide,
        top: nextTop,
      };
      this.applyToolbarPosition(false);
    }

    handleToolbarPointerUp(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }
      this.stopToolbarDrag(true);
    }

    stopToolbarDrag(persist) {
      if (!this.dragState) {
        return;
      }
      const pointerId = this.dragState.pointerId;
      this.dragState = null;
      this.toolbar?.classList.remove("is-dragging");
      if (this.toolbarHandle?.releasePointerCapture) {
        try {
          this.toolbarHandle.releasePointerCapture(pointerId);
        } catch {}
      }
      window.removeEventListener("pointermove", this.handleToolbarPointerMove, true);
      window.removeEventListener("pointerup", this.handleToolbarPointerUp, true);
      window.removeEventListener("pointercancel", this.handleToolbarPointerUp, true);
      this.applyToolbarPosition(!!persist);
    }

    handleViewportChange() {
      this.applyToolbarPosition(true);
    }

    syncControlStates() {
      const isOpen = !!this.panel?.classList.contains("is-open");
      const enabled = !!this.session.settings.enabled;
      if (this.settingsEntry) {
        this.settingsEntry.classList.toggle("is-active", isOpen);
        this.settingsEntry.classList.remove("is-disabled");
        this.settingsEntry.setAttribute("aria-pressed", isOpen ? "true" : "false");
        this.settingsEntry.title = isOpen ? "关闭弹幕设置" : "打开弹幕设置";
      }
      if (this.toggleEntry) {
        this.toggleEntry.classList.toggle("is-active", enabled);
        this.toggleEntry.classList.toggle("is-disabled", !enabled);
        this.toggleEntry.setAttribute("aria-pressed", enabled ? "true" : "false");
        this.toggleEntry.title = enabled ? "关闭弹幕" : "开启弹幕";
      }
    }

    handleAddListEntry(key, input) {
      const value = normalizeSpace(input.value);
      if (!value) {
        return;
      }
      this.session.updateSetting(key, [...this.session.settings[key], value]);
      input.value = "";
    }

    renderTokenList(key, listNode, invalidEntries = []) {
      if (!listNode) {
        return;
      }
      listNode.textContent = "";
      const values = this.session.settings[key];
      if (!values.length) {
        listNode.appendChild(createElement("div", "anich-ddm-empty", "暂无规则"));
        return;
      }
      const invalidMap = new Map(invalidEntries.map((entry) => [entry.raw, entry.message]));
      values.forEach((value) => {
        const chip = createElement("div", "anich-ddm-chip");
        if (invalidMap.has(value)) {
          chip.classList.add("is-invalid");
        }
        chip.appendChild(createElement("span", "anich-ddm-chip-text", value));
        const removeButton = createElement("button", "anich-ddm-chip-remove", "移除");
        removeButton.type = "button";
        removeButton.addEventListener("click", () => {
          this.session.updateSetting(
            key,
            this.session.settings[key].filter((entry) => entry !== value)
          );
        });
        chip.appendChild(removeButton);
        listNode.appendChild(chip);
      });
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
      if (!this.panelState) {
        return;
      }
      const session = this.session;
      const match = session.currentMatch;
      const settings = session.settings;
      if (this.panelSubtitle) {
        this.panelSubtitle.textContent = "外置工具条入口";
      }
      this.panelState.textContent = [session.statusLabel, match ? "已匹配" : "待匹配"].join("\n");
      if (this.enabledInput) {
        this.enabledInput.checked = settings.enabled;
      }
      Object.entries(this.rangeInputs).forEach(([key, input]) => {
        input.value = String(settings[key]);
      });
      this.rowValues.enabled.textContent = settings.enabled ? "开" : "关";
      this.rowValues.fontSize.textContent = `${settings.fontSize}px`;
      this.rowValues.displayRegionRatio.textContent = `${Math.round(settings.displayRegionRatio * 100)}%`;
      this.rowValues.opacity.textContent = `${Math.round(settings.opacity * 100)}%`;
      this.rowValues.speed.textContent = `${settings.speed.toFixed(1)}x`;
      this.rowValues.offset.textContent =
        session.settings.offset === 0
          ? "0.0s"
          : `${session.settings.offset > 0 ? "+" : ""}${session.settings.offset.toFixed(1)}s`;
      MODE_KEYS.forEach((mode) => {
        if (this.modeInputs[mode]) {
          this.modeInputs[mode].checked = !settings.blockedModes[mode];
        }
      });
      if (this.apiInput) {
        this.apiInput.value = session.transport.getConfig().customApiPrefix || "";
      }
      this.renderTokenList("blockedKeywords", this.keywordList);
      this.renderTokenList("blockedRegexes", this.regexList, session.invalidRegexes || []);
      this.regexErrors.textContent = (session.invalidRegexes || []).length
        ? `失效正则已跳过:\n${session.invalidRegexes
            .map((entry) => `${entry.raw} -> ${entry.message}`)
            .join("\n")}`
        : "";

      const context = session.resolvePageContext();
      const transportConfig = session.transport.getConfig();
      const summaryLines = [
        `已加载: ${session.store.stats.count} | 可见: ${session.store.stats.visibleCount} | 已屏蔽: ${session.store.stats.filteredCount}`,
        `显示区域: ${Math.round(settings.displayRegionRatio * 100)}% (仅滚动弹幕)`,
        `已启用类型: ${MODE_KEYS.filter((mode) => !settings.blockedModes[mode]).map((mode) => MODE_LABELS[mode]).join(" / ") || "无"}`,
        `关键词规则: ${settings.blockedKeywords.length} 条`,
        `正则规则: ${settings.blockedRegexes.length} 条`,
        (session.invalidRegexes || []).length ? `失效正则: ${(session.invalidRegexes || []).length} 条` : "失效正则: 0 条",
      ];
      this.summaryStats.textContent = summaryLines.join("\n");

      const matchLines = [
        `当前路由: ${session.route.routeKey}`,
        `当前标题: ${context?.title || "未解析"}`,
        `当前集数: ${context?.episode == null ? "未解析" : context.episode}`,
        match ? `匹配结果: ${match.animeTitle} / ${match.episodeTitle}` : "匹配结果: 未匹配",
        match ? `来源: ${match.sourceName}` : `来源: ${session.lastEndpoint?.sourceName || "暂无"}`,
        `弹幕数: ${session.store.stats.count}`,
        `状态: ${session.statusMessage || "空闲"}`,
        `自定义 API: ${transportConfig.customApiPrefix || "未设置"}`,
      ];
      this.matchStats.textContent = matchLines.join("\n");
      this.syncControlStates();
    }
  }

  class Session {
    constructor(app, route) {
      this.app = app;
      this.route = route;
      this.token = app.nextToken();
      this.destroyed = false;
      this.settings = normalizeSettings(storageGet(SETTINGS_KEY, DEFAULT_SETTINGS));
      this.transport = app.transport;
      this.store = new DanmakuStore();
      this.renderer = new Renderer(this);
      this.skipPrompt = new SkipPrompt(this);
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
      this.invalidRegexes = [];
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
      this.skipPrompt.destroy();
      this.panel.destroy();
      this.video = null;
      this.playerContainer = null;
      this.cachedContext = null;
    }

    bindVideo(video) {
      if (!video) {
        return;
      }
      const isSameVideo = this.video === video;
      this.video = video;
      this.playerContainer = video.closest("section[player]") || video.parentElement || video;
      if (isSameVideo) {
        this.skipPrompt.attach(this.playerContainer);
        this.panel.attach(this.playerContainer, this.renderer.overlay);
        this.panel.update();
        return;
      }
      this.renderer.attach(this.playerContainer);
      this.skipPrompt.attach(this.playerContainer);
      this.panel.attach(this.playerContainer, this.renderer.overlay);
      this.scheduler.setVideo(video);
      this.panel.update();
    }

    saveSettings() {
      this.settings = normalizeSettings(this.settings);
      storageSet(SETTINGS_KEY, this.settings);
    }

    updateSetting(key, value) {
      if (key === "enabled") {
        this.settings.enabled = !!value;
      } else if (key === "blockedKeywords" || key === "blockedRegexes") {
        this.settings[key] = normalizeStringList(value);
      } else if (key === "blockedModes") {
        this.settings.blockedModes = Object.assign({}, this.settings.blockedModes, value || {});
      } else {
        const limit = SETTING_LIMITS[key];
        this.settings[key] = clamp(safeNumber(value, this.settings[key]), limit.min, limit.max);
      }
      this.saveSettings();
      this.refreshVisibleComments();
    }

    setBlockedMode(mode, blocked) {
      if (!MODE_KEYS.includes(mode)) {
        return;
      }
      this.updateSetting("blockedModes", {
        [mode]: !!blocked,
      });
    }

    refreshVisibleComments(options = {}) {
      const { clearOverlay = true } = options;
      const filterResult = applyCommentFilters(this.store.items, this.settings);
      this.invalidRegexes = filterResult.invalidRegexes;
      this.store.setVisibilityStats(filterResult.comments.length);
      if (clearOverlay) {
        this.renderer.clear();
      }
      this.scheduler.setComments(filterResult.comments);
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

    buildPageContext(signals) {
      const nextSignals = signals || readPageContextSignals(this.route);
      const rawTitle = normalizeSpace(nextSignals.seriesTitle || nextSignals.episodeTitle || "");
      const pageTitle = normalizeSpace(nextSignals.episodeTitle || rawTitle);
      const altTitles = Array.isArray(nextSignals.altTitles) ? nextSignals.altTitles.filter(Boolean) : [];
      const episode = extractEpisodeNumber(pageTitle) || this.route.episodeRouteId || null;
      const bangumiSeason = extractSeasonNumber(rawTitle) || 1;
      const title = cleanTitleTail(rawTitle || pageTitle);
      const parsedTitle = parseSearchKeyword(title);
      const baseTitle = parsedTitle.title || title || pageTitle || "";
      const aliases = Array.from(
        new Set(
          [baseTitle, rawTitle, ...altTitles, pageTitle]
            .map((value) => cleanTitleTail(String(value || "").replace(/^第\s*\d+\s*(?:集|话|話)\s*/i, "")))
            .filter(Boolean)
        )
      );
      const season = parsedTitle.season || bangumiSeason || 1;
      const searchTitle = season > 1 ? `${baseTitle} 第${season}季` : baseTitle;
      const normalizedTitleKey = normalizeTitle(baseTitle);
      return {
        routeKey: this.route.routeKey,
        pageTitle,
        title: baseTitle,
        normalizedTitle: normalizeTitle(searchTitle),
        normalizedTitleKey,
        season,
        episode,
        aliases,
        searchTitle,
        seriesPreferenceKey: normalizedTitleKey,
        contextSource: nextSignals.contextSource || "documentTitleFallback",
      };
    }

    async waitForBangumiTitle(token, timeoutMs = CONTEXT_WAIT_TIMEOUT_MS, intervalMs = CONTEXT_WAIT_INTERVAL_MS) {
      const deadline = Date.now() + timeoutMs;
      while (this.isFresh(token) && Date.now() < deadline) {
        if (normalizeSpace(getBangumiDataByRoute(this.route)?.title || "")) {
          return true;
        }
        await sleep(intervalMs);
      }
      return !!normalizeSpace(getBangumiDataByRoute(this.route)?.title || "");
    }

    async resolvePageContextReady(token) {
      this.cachedContext = null;
      let signals = readPageContextSignals(this.route);
      if (signals.hasBangumiTitle) {
        const context = this.buildPageContext(signals);
        this.cachedContext = context;
        return context;
      }

      for (let attempt = 0; attempt < CONTEXT_WAIT_WINDOWS; attempt += 1) {
        await this.waitForBangumiTitle(token);
        if (!this.isFresh(token)) {
          return null;
        }
        signals = readPageContextSignals(this.route);
        if (signals.hasBangumiTitle) {
          break;
        }
      }

      const context = this.buildPageContext(signals);
      this.cachedContext = context;
      return context;
    }

    resolvePageContext(force = false) {
      if (!force && this.cachedContext && this.cachedContext.routeKey === this.route.routeKey) {
        return this.cachedContext;
      }

      const context = this.buildPageContext(readPageContextSignals(this.route));
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
      this.scheduler.setSkipCue(null);
      this.invalidRegexes = [];
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
        const context = await this.resolvePageContextReady(token);
        if (!this.isFresh(token)) {
          return;
        }
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
            this.scheduler.setSkipCue(null);
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
      this.scheduler.setSkipCue(findFirstSkipCue(this.store.items));
      this.refreshVisibleComments();
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
      this.ensureScheduled = false;
      this.ensureForcePending = false;
      this.ensureFrameId = 0;
      this.boot();
    }

    nextToken() {
      this.tokenSeed += 1;
      return this.tokenSeed;
    }

    boot() {
      installStyles();
      this.patchHistory();
      this.installDebugApi();
      this.observeDom();
      this.intervalId = window.setInterval(() => this.scheduleEnsureSession(), 1200);
      window.addEventListener("popstate", () => this.scheduleEnsureSession(true), true);
      document.addEventListener("fullscreenchange", () => this.scheduleEnsureSession(true), true);
      window.addEventListener("anich-ddm-route-change", () => this.scheduleEnsureSession(true), true);
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.scheduleEnsureSession(true), { once: true });
      } else {
        this.scheduleEnsureSession(true);
      }
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
        this.scheduleEnsureSession();
      });
      this.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
      });
    }

    scheduleEnsureSession(force = false) {
      this.ensureForcePending = this.ensureForcePending || force;
      if (this.ensureScheduled) {
        return;
      }
      this.ensureScheduled = true;
      this.ensureFrameId = requestAnimationFrame(() => {
        this.ensureScheduled = false;
        this.ensureFrameId = 0;
        const nextForce = this.ensureForcePending;
        this.ensureForcePending = false;
        this.ensureSession(nextForce);
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
                invalidRegexes: this.activeSession.invalidRegexes,
                contextSource: this.activeSession.resolvePageContext()?.contextSource || null,
                skipCue: this.activeSession.scheduler.getSkipCueDebugState(),
                skipPrompt: this.activeSession.skipPrompt.getState(),
                controls: {
                  settingsBound: !!this.activeSession.panel.settingsEntry,
                  toggleBound: !!this.activeSession.panel.toggleEntry,
                  panelOpen: !!this.activeSession.panel.panel?.classList.contains("is-open"),
                  toolbarPosition: this.activeSession.panel.toolbarPosition,
                },
              }
            : null,
        openPanel: () => this.activeSession?.panel.openPanel(),
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
