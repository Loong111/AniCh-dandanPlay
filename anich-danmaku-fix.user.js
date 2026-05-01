// ==UserScript==
// @name         AniCh 弹弹 Play 弹幕
// @namespace    https://anich.emmmm.eu.org/
// @version      2.6.8
// @description  AniCh 专用弹弹 Play 弹幕 userscript，提供外置工具条、过滤、显示区域和独立渲染。
// @author       Codex
// @match        https://anich.emmmm.eu.org/b/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.bilibili.com
// @connect      comment.bilibili.com
// @connect      b23.tv
// @connect      www.bilibili.com
// ==/UserScript==

(function () {
  "use strict";

  const pageWindow = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;

  if (pageWindow.__anichDanmakuBooted) {
    return;
  }
  pageWindow.__anichDanmakuBooted = true;
  window.__anichDanmakuBooted = true;

  const ROUTE_RE = /^\/b\/(\d+)\/(\d+)(?:\/|$)/;
  const PRIMARY_ROUTE_RE = /^\/b\/(\d+)\/(\d+)\/?$/;
  const STORAGE_PREFIX = "anichDanmaku:";
  const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
  const SETTINGS_MIGRATION_KEY = `${STORAGE_PREFIX}settingsMigrationVersion`;
  const API_CONFIG_KEY = `${STORAGE_PREFIX}apiConfig`;
  const MATCH_CACHE_KEY = `${STORAGE_PREFIX}episodeMatchCache`;
  const PREFERENCE_CACHE_KEY = `${STORAGE_PREFIX}seriesPreferenceCache`;
  const BILIBILI_IMPORT_CACHE_KEY = `${STORAGE_PREFIX}bilibiliImportCache`;
  const BILIBILI_IMPORT_SERIES_CACHE_KEY = `${STORAGE_PREFIX}bilibiliImportSeriesCache`;
  const SIMILAR_MERGE_OPT_IN_KEY = `${STORAGE_PREFIX}similarMergeOptIn`;
  const TOOLBAR_POSITION_KEY = `${STORAGE_PREFIX}toolbarPosition`;
  const STYLE_ID = "anich-ddm-style";
  const DEBUG_NAMESPACE = "__anichDanmaku__";
  const OFFICIAL_API = "https://api.dandanplay.net/api/v2";
  const BILIBILI_API = "https://api.bilibili.com";
  const BILIBILI_DM_SEGMENT_CONCURRENCY = 4;
  const BILIBILI_DM_SEGMENT_RETRY_COUNT = 1;
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
    similarMergeEnabled: false,
    similarMergeThreshold: 0.8,
    similarMergeMinCount: 2,
    similarMergeGapSeconds: 5,
    similarMergeMaxSpanSeconds: 18,
    maxEmitPerFrame: 12,
    maxScheduledComments: 10000,
    densityPreferMergedComments: false,
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
    similarMergeThreshold: { min: 0.5, max: 1, step: 0.01 },
    similarMergeMinCount: { min: 2, max: 20, step: 1 },
    similarMergeGapSeconds: { min: 1, max: 30, step: 0.5 },
    similarMergeMaxSpanSeconds: { min: 2, max: 60, step: 1 },
    maxEmitPerFrame: { min: 1, max: 80, step: 1 },
    maxScheduledComments: { min: 1, max: 20000, step: 1 },
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
  const IMPORT_POPOVER_CLOSE_DELAY_MS = 180;
  const CONTROL_SETTING_DEBOUNCE_MS = 180;
  const DENSITY_BUCKET_SECONDS = 1;
  const CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS = 0.2;
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
  const DANDANPLAY_SOURCE_KEY = "base:dandanplay";
  const BILIBILI_IMPORT_SOURCE_PREFIX = "import:bilibili";
  const TOP_BAR_TITLE = "AniCh 弹弹 Play";
  const USER_AGENT = "AniChDanmakuFix/2.6.8";
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
    next.similarMergeEnabled = next.similarMergeEnabled !== false;
    next.densityPreferMergedComments = !!(next.densityPreferMergedComments || next.densityPreferSingleComments);
    Object.entries(SETTING_LIMITS).forEach(([key, limit]) => {
      next[key] = clamp(safeNumber(next[key], DEFAULT_SETTINGS[key]), limit.min, limit.max);
    });
    next.similarMergeMinCount = Math.round(next.similarMergeMinCount);
    next.maxEmitPerFrame = Math.round(next.maxEmitPerFrame);
    next.maxScheduledComments = Math.round(next.maxScheduledComments);
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

  function normalizeDanmakuSimilarityText(value) {
    let text = normalizeSpace(value).toLowerCase();
    try {
      text = text.normalize("NFKC");
    } catch {}
    return text
      .replace(/[~`!@#$%^&*()_\-+=[\]{}\\|;:'",.<>/?，。！？、；：“”‘’（）【】《》「」『』·…—～￥]/g, "")
      .replace(/\s+/g, "");
  }

  function collapseRepeatedText(value) {
    return String(value || "").replace(/(.)\1+/g, "$1");
  }

  function makeBigramSet(value) {
    const text = String(value || "");
    const result = new Set();
    for (let index = 0; index < text.length - 1; index += 1) {
      result.add(text.slice(index, index + 2));
    }
    return result;
  }

  function calculateDanmakuTextSimilarity(a, b) {
    const left = normalizeDanmakuSimilarityText(a);
    const right = normalizeDanmakuSimilarityText(b);
    if (!left || !right) {
      return 0;
    }
    if (left === right) {
      return 1;
    }
    const minLength = Math.min(left.length, right.length);
    const maxLength = Math.max(left.length, right.length);
    if (minLength <= 1) {
      return 0;
    }
    if (left.includes(right) || right.includes(left)) {
      const ratio = minLength / maxLength;
      const repeatedCompatible = collapseRepeatedText(left) === collapseRepeatedText(right);
      return repeatedCompatible ? Math.max(0.8, ratio) : ratio * 0.9;
    }
    if (minLength < 3) {
      return 0;
    }
    if (Math.abs(left.length - right.length) > maxLength * 0.65) {
      return 0.2;
    }
    const leftBigrams = makeBigramSet(left);
    const rightBigrams = makeBigramSet(right);
    if (!leftBigrams.size || !rightBigrams.size) {
      return 0;
    }
    let intersection = 0;
    leftBigrams.forEach((item) => {
      if (rightBigrams.has(item)) {
        intersection += 1;
      }
    });
    return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
  }

  function getSimilarMergeConfig(settings) {
    const normalized = normalizeSettings(settings || {});
    return {
      enabled: !!normalized.similarMergeEnabled,
      threshold: clamp(
        safeNumber(normalized.similarMergeThreshold, DEFAULT_SETTINGS.similarMergeThreshold),
        SETTING_LIMITS.similarMergeThreshold.min,
        SETTING_LIMITS.similarMergeThreshold.max
      ),
      minCount: Math.round(
        clamp(
          safeNumber(normalized.similarMergeMinCount, DEFAULT_SETTINGS.similarMergeMinCount),
          SETTING_LIMITS.similarMergeMinCount.min,
          SETTING_LIMITS.similarMergeMinCount.max
        )
      ),
      gapSeconds: clamp(
        safeNumber(normalized.similarMergeGapSeconds, DEFAULT_SETTINGS.similarMergeGapSeconds),
        SETTING_LIMITS.similarMergeGapSeconds.min,
        SETTING_LIMITS.similarMergeGapSeconds.max
      ),
      maxSpanSeconds: clamp(
        safeNumber(normalized.similarMergeMaxSpanSeconds, DEFAULT_SETTINGS.similarMergeMaxSpanSeconds),
        SETTING_LIMITS.similarMergeMaxSpanSeconds.min,
        SETTING_LIMITS.similarMergeMaxSpanSeconds.max
      ),
    };
  }

  function makeSimilarMergeStats(config, inputCount, outputCount, groups, collapsedCount) {
    return {
      enabled: !!config.enabled,
      threshold: config.threshold,
      minCount: config.minCount,
      gapSeconds: config.gapSeconds,
      maxSpanSeconds: config.maxSpanSeconds,
      groups,
      collapsedCount,
      inputCount,
      outputCount,
    };
  }

  function createSimilarMergeCluster(entry) {
    const displayText = normalizeSpace(entry.comment?.text || "");
    const textKey = normalizeDanmakuSimilarityText(displayText) || displayText;
    return {
      startTime: safeNumber(entry.comment?.time, 0),
      lastTime: safeNumber(entry.comment?.time, 0),
      mode: MODE_MAP[entry.comment?.mode] || entry.comment?.mode || "rtl",
      representativeText: displayText,
      representativeCount: 1,
      entries: [entry],
      textCounts: new Map([[textKey, { text: displayText, count: 1, firstIndex: entry.index }]]),
    };
  }

  function appendSimilarMergeCluster(cluster, entry) {
    const time = safeNumber(entry.comment?.time, cluster.lastTime);
    const displayText = normalizeSpace(entry.comment?.text || "");
    const textKey = normalizeDanmakuSimilarityText(displayText) || displayText;
    cluster.lastTime = Math.max(cluster.lastTime, time);
    cluster.entries.push(entry);
    const current = cluster.textCounts.get(textKey) || {
      text: displayText,
      count: 0,
      firstIndex: entry.index,
    };
    current.count += 1;
    cluster.textCounts.set(textKey, current);
    if (
      current.count > cluster.representativeCount ||
      (current.count === cluster.representativeCount && current.firstIndex < cluster.entries[0].index)
    ) {
      cluster.representativeText = current.text;
      cluster.representativeCount = current.count;
    }
  }

  function createMergedDanmakuComment(cluster) {
    const first = cluster.entries[0]?.comment || {};
    const last = cluster.entries[cluster.entries.length - 1]?.comment || first;
    const count = cluster.entries.length;
    const startTime = safeNumber(first.time, cluster.startTime);
    const endTime = safeNumber(last.time, cluster.lastTime);
    const representativeText = cluster.representativeText || normalizeSpace(first.text || "");
    return Object.assign({}, first, {
      id: `merge:${first.id || cluster.entries[0]?.index || 0}:${count}:${Math.round(startTime * 1000)}:${Math.round(endTime * 1000)}`,
      source: "merge",
      text: `${representativeText}x${count}`,
      time: startTime,
      mode: MODE_MAP[first.mode] || first.mode || "rtl",
      color: first.color || "#ffffff",
      date: first.date,
      episodeId: first.episodeId,
      mergedCount: count,
      mergedOriginalText: representativeText,
      mergedStartTime: startTime,
      mergedEndTime: endTime,
      mergedIds: cluster.entries.map((entry) => String(entry.comment?.id || entry.index)),
    });
  }

  function mergeSimilarDanmaku(comments, settings) {
    const config = getSimilarMergeConfig(settings);
    const list = (Array.isArray(comments) ? comments : [])
      .map((comment, index) => ({ comment, index }))
      .filter((entry) => entry.comment?.text && Number.isFinite(safeNumber(entry.comment?.time, NaN)))
      .sort((left, right) => {
        const diff = safeNumber(left.comment.time, 0) - safeNumber(right.comment.time, 0);
        return diff || left.index - right.index;
      });
    if (!config.enabled || list.length < config.minCount) {
      return {
        comments: list.map((entry) => entry.comment),
        stats: makeSimilarMergeStats(config, list.length, list.length, 0, 0),
      };
    }

    const activeClusters = [];
    const outputEntries = [];
    let groups = 0;
    let collapsedCount = 0;

    const flushCluster = (cluster) => {
      if (cluster.entries.length >= config.minCount) {
        const mergedComment = createMergedDanmakuComment(cluster);
        outputEntries.push({
          comment: mergedComment,
          index: cluster.entries[0]?.index ?? outputEntries.length,
        });
        groups += 1;
        collapsedCount += cluster.entries.length - 1;
        return;
      }
      cluster.entries.forEach((entry) => outputEntries.push(entry));
    };

    const flushExpiredClusters = (currentTime) => {
      for (let index = activeClusters.length - 1; index >= 0; index -= 1) {
        const cluster = activeClusters[index];
        if (
          currentTime - cluster.lastTime > config.gapSeconds ||
          currentTime - cluster.startTime > config.maxSpanSeconds
        ) {
          activeClusters.splice(index, 1);
          flushCluster(cluster);
        }
      }
    };

    for (const entry of list) {
      const comment = entry.comment;
      const time = safeNumber(comment.time, 0);
      const mode = MODE_MAP[comment.mode] || comment.mode || "rtl";
      flushExpiredClusters(time);

      let bestCluster = null;
      let bestSimilarity = 0;
      for (const cluster of activeClusters) {
        if (cluster.mode !== mode) {
          continue;
        }
        if (time - cluster.lastTime > config.gapSeconds || time - cluster.startTime > config.maxSpanSeconds) {
          continue;
        }
        const similarity = calculateDanmakuTextSimilarity(comment.text, cluster.representativeText);
        if (similarity >= config.threshold && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        appendSimilarMergeCluster(bestCluster, entry);
      } else {
        activeClusters.push(createSimilarMergeCluster(entry));
      }
    }

    while (activeClusters.length) {
      flushCluster(activeClusters.shift());
    }

    outputEntries.sort((left, right) => {
      const diff = safeNumber(left.comment.time, 0) - safeNumber(right.comment.time, 0);
      return diff || left.index - right.index;
    });
    const mergedComments = outputEntries.map((entry) => entry.comment);
    return {
      comments: mergedComments,
      stats: makeSimilarMergeStats(config, list.length, mergedComments.length, groups, collapsedCount),
    };
  }

  function normalizeDensityDurationSeconds(value) {
    const parsed = safeNumber(value, 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.ceil(parsed)) : 0;
  }

  function getCommentTimelineDurationSeconds(comments) {
    const list = Array.isArray(comments) ? comments : [];
    let maxTime = 0;
    list.forEach((comment) => {
      maxTime = Math.max(maxTime, safeNumber(comment?.time, 0));
    });
    return normalizeDensityDurationSeconds(maxTime);
  }

  function getDensityBucketCounts(comments, bucketSeconds = DENSITY_BUCKET_SECONDS) {
    const list = Array.isArray(comments) ? comments : [];
    const buckets = new Map();
    list.forEach((comment) => {
      const time = Math.max(0, safeNumber(comment?.time, 0));
      const bucketKey = Math.floor(time / bucketSeconds);
      buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + 1);
    });
    const counts = Array.from(buckets.values());
    return {
      counts,
      peakCount: counts.reduce((peak, count) => Math.max(peak, count), 0),
      totalCount: list.length,
    };
  }

  function resolveDensityLimitSettings(settings, durationSeconds, changedKey = null, comments = []) {
    const next = normalizeSettings(settings || {});
    const duration = normalizeDensityDurationSeconds(durationSeconds);
    next.maxEmitPerFrame = Math.round(
      clamp(next.maxEmitPerFrame, SETTING_LIMITS.maxEmitPerFrame.min, SETTING_LIMITS.maxEmitPerFrame.max)
    );
    next.maxScheduledComments = Math.round(
      clamp(
        next.maxScheduledComments,
        SETTING_LIMITS.maxScheduledComments.min,
        SETTING_LIMITS.maxScheduledComments.max
      )
    );

    return {
      settings: next,
      durationSeconds: duration,
      densityBuckets: getDensityBucketCounts(comments),
      bounds: {
        maxEmitPerFrame: {
          min: SETTING_LIMITS.maxEmitPerFrame.min,
          max: SETTING_LIMITS.maxEmitPerFrame.max,
        },
        maxScheduledComments: {
          min: SETTING_LIMITS.maxScheduledComments.min,
          max: SETTING_LIMITS.maxScheduledComments.max,
        },
      },
    };
  }

  function getDensityLimitConfig(settings, durationSeconds, comments = []) {
    const resolved = resolveDensityLimitSettings(settings || {}, durationSeconds, null, comments);
    return {
      maxEmitPerFrame: resolved.settings.maxEmitPerFrame,
      maxScheduledComments: resolved.settings.maxScheduledComments,
      preferMergedComments: !!resolved.settings.densityPreferMergedComments,
      durationSeconds: resolved.durationSeconds,
      densityBuckets: resolved.densityBuckets,
      bounds: resolved.bounds,
      bucketSeconds: DENSITY_BUCKET_SECONDS,
    };
  }

  function isMergedDanmakuComment(comment) {
    return safeNumber(comment?.mergedCount, 0) > 1 || comment?.source === "merge";
  }

  function makeDensityEntry(comment, index) {
    return {
      comment,
      index,
      merged: isMergedDanmakuComment(comment),
    };
  }

  function selectEvenlySpacedEntries(entries, maxCount) {
    const list = Array.isArray(entries) ? entries : [];
    const targetCount = Math.max(0, Math.round(maxCount));
    if (list.length <= targetCount) {
      return list.slice();
    }
    if (targetCount <= 0) {
      return [];
    }
    if (targetCount === 1) {
      return [list[0]];
    }
    const selected = [];
    const lastIndex = list.length - 1;
    let previousIndex = -1;
    for (let index = 0; index < targetCount; index += 1) {
      const remaining = targetCount - index;
      const highestAllowed = list.length - remaining;
      const idealIndex = Math.round((index * lastIndex) / (targetCount - 1));
      const nextIndex = clamp(Math.max(idealIndex, previousIndex + 1), 0, highestAllowed);
      selected.push(list[nextIndex]);
      previousIndex = nextIndex;
    }
    return selected;
  }

  function selectDensityEntries(entries, maxCount, preferMergedComments) {
    const list = Array.isArray(entries) ? entries : [];
    const targetCount = Math.max(0, Math.round(maxCount));
    if (list.length <= targetCount) {
      return list.slice();
    }
    if (!preferMergedComments) {
      return selectEvenlySpacedEntries(list, targetCount);
    }
    const mergedEntries = list.filter((entry) => entry.merged);
    const singleEntries = list.filter((entry) => !entry.merged);
    const selected =
      mergedEntries.length >= targetCount
        ? selectEvenlySpacedEntries(mergedEntries, targetCount)
        : mergedEntries.concat(selectEvenlySpacedEntries(singleEntries, targetCount - mergedEntries.length));
    return selected.sort((left, right) => left.index - right.index);
  }

  function limitDanmakuByDensity(comments, maxCount, preferMergedComments) {
    const entries = (Array.isArray(comments) ? comments : []).map(makeDensityEntry);
    const selectedEntries = selectDensityEntries(entries, maxCount, preferMergedComments);
    const selectedIndexes = new Set(selectedEntries.map((entry) => entry.index));
    let droppedMergedCount = 0;
    let droppedSingleCount = 0;
    entries.forEach((entry) => {
      if (selectedIndexes.has(entry.index)) {
        return;
      }
      if (entry.merged) {
        droppedMergedCount += 1;
      } else {
        droppedSingleCount += 1;
      }
    });
    return {
      comments: selectedEntries.map((entry) => entry.comment),
      droppedMergedCount,
      droppedSingleCount,
    };
  }

  function limitDanmakuByLocalDensity(comments, maxEmitPerFrame, preferMergedComments) {
    const entries = (Array.isArray(comments) ? comments : []).map(makeDensityEntry);
    const groups = new Map();
    entries.forEach((entry) => {
      const time = Math.max(0, safeNumber(entry.comment?.time, 0));
      const bucketKey = Math.floor(time / DENSITY_BUCKET_SECONDS);
      if (!groups.has(bucketKey)) {
        groups.set(bucketKey, []);
      }
      groups.get(bucketKey).push(entry);
    });
    const selectedEntries = [];
    Array.from(groups.keys())
      .sort((left, right) => left - right)
      .forEach((bucketKey) => {
        selectedEntries.push(
          ...selectDensityEntries(groups.get(bucketKey), maxEmitPerFrame, preferMergedComments)
        );
      });
    selectedEntries.sort((left, right) => left.index - right.index);
    const selectedIndexes = new Set(selectedEntries.map((entry) => entry.index));
    let droppedMergedCount = 0;
    let droppedSingleCount = 0;
    entries.forEach((entry) => {
      if (selectedIndexes.has(entry.index)) {
        return;
      }
      if (entry.merged) {
        droppedMergedCount += 1;
      } else {
        droppedSingleCount += 1;
      }
    });
    return {
      comments: selectedEntries.map((entry) => entry.comment),
      droppedMergedCount,
      droppedSingleCount,
    };
  }

  function makeDensityLimitStats(config, inputCount, outputCount, detail = {}) {
    return {
      maxEmitPerFrame: config.maxEmitPerFrame,
      maxScheduledComments: config.maxScheduledComments,
      preferMergedComments: !!config.preferMergedComments,
      durationSeconds: config.durationSeconds,
      bucketSeconds: config.bucketSeconds,
      bucketPeakCount: safeNumber(config.densityBuckets?.peakCount, 0),
      bucketActiveCount: Array.isArray(config.densityBuckets?.counts) ? config.densityBuckets.counts.length : 0,
      bounds: config.bounds,
      inputCount,
      outputCount,
      droppedCount: Math.max(0, inputCount - outputCount),
      droppedMergedCount: safeNumber(detail.droppedMergedCount, 0),
      droppedSingleCount: safeNumber(detail.droppedSingleCount, 0),
    };
  }

  function limitScheduledDanmaku(comments, settings, durationSeconds) {
    const config = getDensityLimitConfig(settings, durationSeconds, comments);
    const list = Array.isArray(comments) ? comments : [];
    const localLimited = limitDanmakuByLocalDensity(
      list,
      config.maxEmitPerFrame,
      config.preferMergedComments
    );
    let outputComments = localLimited.comments;
    let droppedMergedCount = localLimited.droppedMergedCount;
    let droppedSingleCount = localLimited.droppedSingleCount;
    if (outputComments.length > config.maxScheduledComments) {
      const globallyLimited = limitDanmakuByDensity(
        outputComments,
        config.maxScheduledComments,
        config.preferMergedComments
      );
      outputComments = globallyLimited.comments;
      droppedMergedCount += globallyLimited.droppedMergedCount;
      droppedSingleCount += globallyLimited.droppedSingleCount;
    }
    return {
      comments: outputComments,
      stats: makeDensityLimitStats(config, list.length, outputComments.length, {
        droppedMergedCount,
        droppedSingleCount,
      }),
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

  function storageGetBoolean(key, fallback = false) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) {
        return !!fallback;
      }
      return JSON.parse(raw) === true;
    } catch {
      return !!fallback;
    }
  }

  function storageGetNumber(key, fallback = 0) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) {
        return fallback;
      }
      return safeNumber(JSON.parse(raw), fallback);
    } catch {
      return fallback;
    }
  }

  function getPageWindow() {
    return pageWindow;
  }

  function readPositiveInt(value) {
    const parsed = parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function extractBilibiliBvid(value) {
    const match = String(value || "").match(/BV[0-9A-Za-z]{10}/i);
    return match ? `BV${match[0].slice(2)}` : "";
  }

  function extractBilibiliPgcEpId(value) {
    const text = String(value || "");
    const match = text.match(/(?:bangumi\/play\/)?ep(\d+)/i) || text.match(/[?&]ep_id=(\d+)/i);
    return match ? readPositiveInt(match[1]) : null;
  }

  function getBilibiliImportSourceType(value) {
    return value === "pgc" ? "pgc" : "video";
  }

  function parseBilibiliSyntheticPgcInput(input) {
    const match = normalizeSpace(input).match(/^pgc:season:(\d+):episode:(\d+)$/i);
    if (!match) {
      return null;
    }
    return {
      pgcSeasonId: readPositiveInt(match[1]),
      pgcEpisodeNumber: readPositiveInt(match[2]),
    };
  }

  function parseBilibiliImportInput(rawInput) {
    const input = normalizeSpace(rawInput);
    if (!input) {
      throw new Error("请输入 B 站链接、BV 号或番剧 ep 号");
    }

    if (!/^[a-z]+:\/\//i.test(input)) {
      const bvid = extractBilibiliBvid(input);
      if (bvid) {
        return {
          rawInput: input,
          resolvedUrl: `https://www.bilibili.com/video/${bvid}/`,
          sourceType: "video",
          bvid,
          page: 1,
          pageExplicit: false,
        };
      }
      const pgcEpId = extractBilibiliPgcEpId(input);
      if (pgcEpId) {
        return {
          rawInput: input,
          resolvedUrl: buildBilibiliPgcEpisodeUrl(pgcEpId),
          sourceType: "pgc",
          bvid: "",
          pgcEpId,
          page: 1,
          pageExplicit: false,
          pgcEpisodeExplicit: true,
        };
      }
      const syntheticPgc = parseBilibiliSyntheticPgcInput(input);
      if (syntheticPgc?.pgcSeasonId && syntheticPgc?.pgcEpisodeNumber) {
        return {
          rawInput: input,
          resolvedUrl: input,
          sourceType: "pgc",
          bvid: "",
          pgcSeasonId: syntheticPgc.pgcSeasonId,
          pgcEpisodeNumber: syntheticPgc.pgcEpisodeNumber,
          page: 1,
          pageExplicit: false,
          pgcEpisodeExplicit: true,
        };
      }
      throw new Error("仅支持 BV 号、B 站视频链接、番剧 ep 链接或 b23 短链");
    }

    let url = null;
    try {
      url = new URL(input);
    } catch {
      const bvid = extractBilibiliBvid(input);
      if (bvid) {
        return {
          rawInput: input,
          resolvedUrl: `https://www.bilibili.com/video/${bvid}/`,
          sourceType: "video",
          bvid,
          page: 1,
          pageExplicit: false,
        };
      }
      const pgcEpId = extractBilibiliPgcEpId(input);
      if (pgcEpId) {
        return {
          rawInput: input,
          resolvedUrl: buildBilibiliPgcEpisodeUrl(pgcEpId),
          sourceType: "pgc",
          bvid: "",
          pgcEpId,
          page: 1,
          pageExplicit: false,
          pgcEpisodeExplicit: true,
        };
      }
      const syntheticPgc = parseBilibiliSyntheticPgcInput(input);
      if (syntheticPgc?.pgcSeasonId && syntheticPgc?.pgcEpisodeNumber) {
        return {
          rawInput: input,
          resolvedUrl: input,
          sourceType: "pgc",
          bvid: "",
          pgcSeasonId: syntheticPgc.pgcSeasonId,
          pgcEpisodeNumber: syntheticPgc.pgcEpisodeNumber,
          page: 1,
          pageExplicit: false,
          pgcEpisodeExplicit: true,
        };
      }
      throw new Error("链接格式无效，请重新输入");
    }

    const host = url.hostname.toLowerCase();
    const pageParam = url.searchParams.get("p");
    const page = readPositiveInt(pageParam) || 1;
    const pageExplicit = pageParam != null && pageParam !== "";
    const pgcEpId = extractBilibiliPgcEpId(url.toString());
    if (host === "b23.tv" || host === "www.b23.tv") {
      return {
        rawInput: input,
        resolvedUrl: url.toString(),
        sourceType: "video",
        bvid: "",
        page,
        pageExplicit,
        shortLink: true,
      };
    }

    if (pgcEpId) {
      return {
        rawInput: input,
        resolvedUrl: buildBilibiliPgcEpisodeUrl(pgcEpId),
        sourceType: "pgc",
        bvid: "",
        pgcEpId,
        page: 1,
        pageExplicit: false,
        pgcEpisodeExplicit: true,
      };
    }

    const bvid = extractBilibiliBvid(url.toString());
    if (!bvid) {
      throw new Error("仅支持 BV 视频链接、番剧 ep 链接，不支持 av 号或其他页面");
    }
    return {
      rawInput: input,
      resolvedUrl: url.toString(),
      sourceType: "video",
      bvid,
      page,
      pageExplicit,
    };
  }

  function buildBilibiliVideoUrl(bvid, page = 1) {
    const targetBvid = extractBilibiliBvid(bvid);
    if (!targetBvid) {
      return "";
    }
    const url = new URL(`https://www.bilibili.com/video/${targetBvid}/`);
    if ((readPositiveInt(page) || 1) > 1) {
      url.searchParams.set("p", String(readPositiveInt(page) || 1));
    }
    return url.toString();
  }

  function buildBilibiliPgcEpisodeUrl(pgcEpId) {
    const normalizedEpId = readPositiveInt(pgcEpId);
    return normalizedEpId ? `https://www.bilibili.com/bangumi/play/ep${normalizedEpId}` : "";
  }

  function readBilibiliPgcEpisodeNumber(episode) {
    return (
      readPositiveInt(episode?.title) ||
      extractEpisodeNumber(episode?.show_title || episode?.long_title || episode?.share_copy || "")
    );
  }

  function buildBilibiliAttemptRecord(rawInput) {
    const normalizedInput = normalizeSpace(rawInput);
    if (!normalizedInput) {
      return null;
    }
    try {
      const parsed = parseBilibiliImportInput(normalizedInput);
      return normalizeBilibiliImportRecord({
        rawInput: parsed.rawInput,
        resolvedUrl: parsed.resolvedUrl,
        sourceType: parsed.sourceType,
        bvid: parsed.bvid,
        pgcEpId: parsed.pgcEpId,
        pgcSeasonId: parsed.pgcSeasonId,
        pgcEpisodeNumber: parsed.pgcEpisodeNumber,
        page: parsed.page,
      });
    } catch {
      return normalizeBilibiliImportRecord({
        rawInput: normalizedInput,
      });
    }
  }

  function getBilibiliImportBindingLabel(bindingMode) {
    return bindingMode === "derived" ? "自动推导" : "显式导入";
  }

  function getBilibiliImportDerivedStatusLabel(derivedStatus) {
    if (derivedStatus === "series-rule") {
      return "待按同季规则恢复";
    }
    if (derivedStatus === "derived-cache") {
      return "已缓存自动推导";
    }
    if (derivedStatus === "restored") {
      return "已按同季规则恢复";
    }
    if (derivedStatus === "explicit") {
      return "当前为显式导入";
    }
    return "无";
  }

  function getBilibiliSeriesKey(context) {
    if (!context?.normalizedTitleKey) {
      return "";
    }
    return `${context.normalizedTitleKey}::S${safeNumber(context?.season, 1) || 1}`;
  }

  function buildBilibiliStandaloneBindingKey(bvid, page = 1) {
    const normalizedBvid = extractBilibiliBvid(bvid || "");
    const normalizedPage = readPositiveInt(page) || 1;
    if (!normalizedBvid) {
      return "";
    }
    return `video:${normalizedBvid}:p${normalizedPage}`;
  }

  function buildBilibiliPgcStandaloneBindingKey(pgcEpId, pgcSeasonId = 0, pgcEpisodeNumber = 0) {
    const normalizedEpId = readPositiveInt(pgcEpId);
    if (normalizedEpId) {
      return `pgc:ep:${normalizedEpId}`;
    }
    const normalizedSeasonId = readPositiveInt(pgcSeasonId);
    const normalizedEpisodeNumber = readPositiveInt(pgcEpisodeNumber);
    return normalizedSeasonId && normalizedEpisodeNumber
      ? `pgc:season:${normalizedSeasonId}:episode:${normalizedEpisodeNumber}`
      : "";
  }

  function buildBilibiliSeriesChainKey(bvid, pageOffset = 0) {
    const normalizedBvid = extractBilibiliBvid(bvid || "");
    const normalizedOffset = Number.isFinite(Number(pageOffset)) ? Number(pageOffset) : 0;
    if (!normalizedBvid) {
      return "";
    }
    return `chain:${normalizedBvid}:offset:${normalizedOffset >= 0 ? `+${normalizedOffset}` : String(normalizedOffset)}`;
  }

  function buildBilibiliPgcSeriesChainKey(pgcSeasonId, episodeOffset = 0, anchorPgcEpId = 0) {
    const normalizedSeasonId = readPositiveInt(pgcSeasonId);
    const normalizedAnchorEpId = readPositiveInt(anchorPgcEpId);
    const normalizedOffset = Number.isFinite(Number(episodeOffset)) ? Number(episodeOffset) : 0;
    const scope = normalizedSeasonId
      ? `season:${normalizedSeasonId}`
      : normalizedAnchorEpId
      ? `anchor:${normalizedAnchorEpId}`
      : "";
    if (!scope) {
      return "";
    }
    return `chain:pgc:${scope}:episode-offset:${normalizedOffset >= 0 ? `+${normalizedOffset}` : String(normalizedOffset)}`;
  }

  function buildBilibiliBindingKey(record) {
    const chainKey = normalizeSpace(record?.chainKey || "");
    if (chainKey) {
      return chainKey;
    }
    if (getBilibiliImportSourceType(record?.sourceType) === "pgc" || record?.pgcEpId || record?.pgcSeasonId) {
      return buildBilibiliPgcStandaloneBindingKey(record?.pgcEpId, record?.pgcSeasonId, record?.pgcEpisodeNumber);
    }
    return buildBilibiliStandaloneBindingKey(record?.bvid, record?.page);
  }

  function getBilibiliImportSourceKey(bindingKey) {
    const normalizedBindingKey = normalizeSpace(bindingKey || "");
    return normalizedBindingKey
      ? `${BILIBILI_IMPORT_SOURCE_PREFIX}:${normalizedBindingKey}`
      : BILIBILI_IMPORT_SOURCE_PREFIX;
  }

  function isBilibiliImportRecordLike(value) {
    return (
      !!value &&
      typeof value === "object" &&
      ("bvid" in value || "pgcEpId" in value || "pgcSeasonId" in value || "rawInput" in value || "resolvedUrl" in value)
    );
  }

  function isBilibiliSeriesRuleLike(value) {
    return (
      !!value &&
      typeof value === "object" &&
      ("bvid" in value || "anchorPgcEpId" in value || "pgcSeasonId" in value || "anchorEpisode" in value || "anchorPage" in value)
    );
  }

  function normalizeBilibiliImportRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }
    const normalizedBvid = extractBilibiliBvid(record.bvid || record.resolvedUrl || record.rawInput || "");
    const normalizedPgcEpId =
      readPositiveInt(record.pgcEpId || record.epId) || extractBilibiliPgcEpId(record.resolvedUrl || record.rawInput || "");
    const normalizedPgcSeasonId = readPositiveInt(record.pgcSeasonId || record.seasonId) || null;
    const normalizedPgcEpisodeNumber = readPositiveInt(record.pgcEpisodeNumber || record.episodeNumber) || null;
    const normalizedSourceType =
      record.sourceType === "pgc" || normalizedPgcEpId || (normalizedPgcSeasonId && normalizedPgcEpisodeNumber)
        ? "pgc"
        : "video";
    const normalizedPage = readPositiveInt(record.page) || 1;
    const normalizedSeriesKey = normalizeSpace(record.seriesKey || "");
    const normalizedPageOffset = Number.isFinite(Number(record.pageOffset)) ? Number(record.pageOffset) : null;
    const normalizedEpisodeOffset = Number.isFinite(Number(record.episodeOffset)) ? Number(record.episodeOffset) : null;
    const normalizedChainKey = normalizeSpace(
      record.chainKey ||
        (normalizedSeriesKey
          ? normalizedSourceType === "pgc" &&
            (normalizedPgcEpId || normalizedPgcSeasonId) &&
            normalizedEpisodeOffset != null
            ? buildBilibiliPgcSeriesChainKey(normalizedPgcSeasonId, normalizedEpisodeOffset, normalizedPgcEpId)
            : normalizedBvid && normalizedPageOffset != null
            ? buildBilibiliSeriesChainKey(normalizedBvid, normalizedPageOffset)
            : ""
          : "")
    );
    const normalizedBindingKey = normalizeSpace(
      record.bindingKey ||
        normalizedChainKey ||
        (normalizedSourceType === "pgc"
          ? buildBilibiliPgcStandaloneBindingKey(normalizedPgcEpId, normalizedPgcSeasonId, normalizedPgcEpisodeNumber)
          : buildBilibiliStandaloneBindingKey(normalizedBvid, normalizedPage))
    );
    const hasPgcIdentity = normalizedPgcEpId || (normalizedPgcSeasonId && normalizedPgcEpisodeNumber);
    if ((!normalizedBvid && !hasPgcIdentity) || !normalizedBindingKey) {
      return null;
    }
    return Object.assign({}, record, {
      sourceType: normalizedSourceType,
      bvid: normalizedBvid,
      pgcEpId: normalizedPgcEpId,
      pgcSeasonId: normalizedPgcSeasonId,
      pgcEpisodeNumber: normalizedPgcEpisodeNumber,
      page: normalizedPage,
      bindingKey: normalizedBindingKey,
      chainKey: normalizedChainKey,
      bindingMode: record.bindingMode === "derived" ? "derived" : "explicit",
      seriesKey: normalizedSeriesKey,
      anchorEpisode: readPositiveInt(record.anchorEpisode) || null,
      pageOffset: normalizedPageOffset,
      episodeOffset: normalizedEpisodeOffset,
      derivedFromRouteKey: normalizeSpace(record.derivedFromRouteKey || ""),
      updatedAt: safeNumber(record.updatedAt, Date.now()),
    });
  }

  function normalizeBilibiliSeriesRule(rule) {
    if (!rule || typeof rule !== "object") {
      return null;
    }
    const normalizedBvid = extractBilibiliBvid(rule.bvid || "");
    const sourceType = rule.sourceType === "pgc" || rule.anchorPgcEpId || rule.pgcEpId || rule.pgcSeasonId ? "pgc" : "video";
    const anchorEpisode = readPositiveInt(rule.anchorEpisode);
    if (sourceType === "pgc") {
      const anchorPgcEpId =
        readPositiveInt(rule.anchorPgcEpId || rule.pgcEpId) ||
        extractBilibiliPgcEpId(rule.resolvedUrl || rule.rawInput || "");
      const pgcSeasonId = readPositiveInt(rule.pgcSeasonId || rule.seasonId) || null;
      const anchorPgcEpisodeNumber =
        readPositiveInt(rule.anchorPgcEpisodeNumber || rule.pgcEpisodeNumber || rule.episodeNumber) || null;
      const episodeOffset = Number.isFinite(Number(rule.episodeOffset))
        ? Number(rule.episodeOffset)
        : anchorPgcEpisodeNumber
        ? anchorPgcEpisodeNumber - anchorEpisode
        : anchorPgcEpId - anchorEpisode;
      if (!anchorEpisode || (!anchorPgcEpId && !pgcSeasonId) || !Number.isFinite(episodeOffset)) {
        return null;
      }
      return Object.assign({}, rule, {
        sourceType,
        bvid: normalizedBvid,
        pgcEpId: anchorPgcEpId,
        anchorPgcEpId,
        pgcEpisodeNumber: anchorPgcEpisodeNumber,
        anchorPgcEpisodeNumber,
        pgcSeasonId,
        chainKey: normalizeSpace(
          rule.chainKey || buildBilibiliPgcSeriesChainKey(pgcSeasonId, episodeOffset, anchorPgcEpId)
        ),
        anchorEpisode,
        anchorPage: readPositiveInt(rule.anchorPage) || 1,
        pageOffset: null,
        episodeOffset,
        anchorRouteKey: normalizeSpace(rule.anchorRouteKey || ""),
        seriesKey: normalizeSpace(rule.seriesKey || ""),
        title: normalizeSpace(rule.title || ""),
        normalizedTitleKey: normalizeSpace(rule.normalizedTitleKey || ""),
        season: safeNumber(rule.season, 1) || 1,
        updatedAt: safeNumber(rule.updatedAt, Date.now()),
      });
    }
    const anchorPage = readPositiveInt(rule.anchorPage);
    const normalizedPageOffset = Number.isFinite(Number(rule.pageOffset))
      ? Number(rule.pageOffset)
      : anchorPage - anchorEpisode;
    if (!normalizedBvid || !anchorEpisode || !anchorPage) {
      return null;
    }
    return Object.assign({}, rule, {
      sourceType,
      bvid: normalizedBvid,
      chainKey: normalizeSpace(rule.chainKey || buildBilibiliSeriesChainKey(normalizedBvid, normalizedPageOffset)),
      anchorEpisode,
      anchorPage,
      pageOffset: normalizedPageOffset,
      episodeOffset: null,
      anchorRouteKey: normalizeSpace(rule.anchorRouteKey || ""),
      seriesKey: normalizeSpace(rule.seriesKey || ""),
      title: normalizeSpace(rule.title || ""),
      normalizedTitleKey: normalizeSpace(rule.normalizedTitleKey || ""),
      season: safeNumber(rule.season, 1) || 1,
      updatedAt: safeNumber(rule.updatedAt, Date.now()),
    });
  }

  function normalizeBilibiliImportRecordCollection(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    let entries = [];
    if (Array.isArray(value)) {
      entries = value.map((record, index) => [String(index), record]);
    } else if (value.bindings && typeof value.bindings === "object") {
      entries = Object.entries(value.bindings);
    } else if (isBilibiliImportRecordLike(value)) {
      entries = [["", value]];
    } else {
      entries = Object.entries(value);
    }
    const result = {};
    entries.forEach(([bindingKey, record]) => {
      const normalized = normalizeBilibiliImportRecord(
        Object.assign({}, record, {
          bindingKey: normalizeSpace(record?.bindingKey || bindingKey || ""),
        })
      );
      if (normalized?.bindingKey) {
        result[normalized.bindingKey] = normalized;
      }
    });
    return result;
  }

  function normalizeBilibiliSeriesRuleCollection(value, seriesKey = "") {
    if (!value || typeof value !== "object") {
      return {};
    }
    let entries = [];
    if (Array.isArray(value)) {
      entries = value.map((rule, index) => [String(index), rule]);
    } else if (value.chains && typeof value.chains === "object") {
      entries = Object.entries(value.chains);
    } else if (isBilibiliSeriesRuleLike(value)) {
      entries = [["", value]];
    } else {
      entries = Object.entries(value);
    }
    const result = {};
    entries.forEach(([chainKey, rule]) => {
      const normalized = normalizeBilibiliSeriesRule(
        Object.assign({}, rule, {
          chainKey: normalizeSpace(rule?.chainKey || chainKey || ""),
          seriesKey: seriesKey || rule?.seriesKey || "",
        })
      );
      if (normalized?.chainKey) {
        result[normalized.chainKey] = normalized;
      }
    });
    return result;
  }

  function sortBilibiliImportRecords(records) {
    return (Array.isArray(records) ? records.slice() : []).sort((left, right) => {
      const leftMode = left?.bindingMode === "derived" ? 1 : 0;
      const rightMode = right?.bindingMode === "derived" ? 1 : 0;
      if (leftMode !== rightMode) {
        return leftMode - rightMode;
      }
      const updatedDiff = safeNumber(right?.updatedAt, 0) - safeNumber(left?.updatedAt, 0);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      const titleCompare = normalizeSpace(left?.title || "").localeCompare(normalizeSpace(right?.title || ""));
      if (titleCompare !== 0) {
        return titleCompare;
      }
      const bvidCompare = normalizeSpace(left?.bvid || "").localeCompare(normalizeSpace(right?.bvid || ""));
      if (bvidCompare !== 0) {
        return bvidCompare;
      }
      const pageDiff = (readPositiveInt(left?.page) || 1) - (readPositiveInt(right?.page) || 1);
      if (pageDiff !== 0) {
        return pageDiff;
      }
      return normalizeSpace(left?.bindingKey || "").localeCompare(normalizeSpace(right?.bindingKey || ""));
    });
  }

  function sortBilibiliSeriesRules(rules) {
    return (Array.isArray(rules) ? rules.slice() : []).sort((left, right) => {
      const updatedDiff = safeNumber(right?.updatedAt, 0) - safeNumber(left?.updatedAt, 0);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      const titleCompare = normalizeSpace(left?.title || "").localeCompare(normalizeSpace(right?.title || ""));
      if (titleCompare !== 0) {
        return titleCompare;
      }
      return normalizeSpace(left?.chainKey || "").localeCompare(normalizeSpace(right?.chainKey || ""));
    });
  }

  function pickPrimaryBilibiliImportRecord(records, activeBindingKey = "") {
    const sorted = sortBilibiliImportRecords(records);
    const normalizedActiveBindingKey = normalizeSpace(activeBindingKey || "");
    if (normalizedActiveBindingKey) {
      const matched = sorted.find((record) => record?.bindingKey === normalizedActiveBindingKey);
      if (matched) {
        return matched;
      }
    }
    return sorted[0] || null;
  }

  function buildDerivedBilibiliImportRecord(rule, routeEntry) {
    const normalizedRule = normalizeBilibiliSeriesRule(rule);
    const episodeNumber = readPositiveInt(routeEntry?.episode);
    if (!normalizedRule || !episodeNumber) {
      return null;
    }
    if (normalizedRule.sourceType === "pgc") {
      const derivedEpisodeNumber = episodeNumber + normalizedRule.episodeOffset;
      if (!Number.isFinite(derivedEpisodeNumber) || derivedEpisodeNumber <= 0) {
        return null;
      }
      const derivedEpId =
        normalizedRule.pgcSeasonId && normalizedRule.anchorPgcEpisodeNumber
          ? null
          : readPositiveInt(derivedEpisodeNumber);
      const resolvedUrl = derivedEpId
        ? buildBilibiliPgcEpisodeUrl(derivedEpId)
        : `pgc:season:${normalizedRule.pgcSeasonId}:episode:${readPositiveInt(derivedEpisodeNumber) || 1}`;
      return normalizeBilibiliImportRecord({
        sourceType: "pgc",
        rawInput: resolvedUrl,
        resolvedUrl,
        pgcEpId: derivedEpId,
        pgcSeasonId: normalizedRule.pgcSeasonId,
        pgcEpisodeNumber: readPositiveInt(derivedEpisodeNumber) || null,
        page: 1,
        chainKey: normalizedRule.chainKey,
        bindingMode: "derived",
        seriesKey: normalizedRule.seriesKey,
        anchorEpisode: normalizedRule.anchorEpisode,
        episodeOffset: normalizedRule.episodeOffset,
        derivedFromRouteKey: normalizedRule.anchorRouteKey,
        title: normalizedRule.title,
      });
    }
    const derivedPage = episodeNumber + normalizedRule.pageOffset;
    if (!Number.isFinite(derivedPage) || derivedPage <= 0) {
      return null;
    }
    const resolvedUrl = buildBilibiliVideoUrl(normalizedRule.bvid, derivedPage);
    if (!resolvedUrl) {
      return null;
    }
    return normalizeBilibiliImportRecord({
      rawInput: resolvedUrl,
      resolvedUrl,
      bvid: normalizedRule.bvid,
      page: derivedPage,
      chainKey: normalizedRule.chainKey,
      bindingMode: "derived",
      seriesKey: normalizedRule.seriesKey,
      anchorEpisode: normalizedRule.anchorEpisode,
      pageOffset: normalizedRule.pageOffset,
      derivedFromRouteKey: normalizedRule.anchorRouteKey,
      title: normalizedRule.title,
    });
  }

  function getHeaderValue(rawHeaders, key) {
    const target = String(key || "").trim().toLowerCase();
    const lines = String(rawHeaders || "").split(/\r?\n/);
    for (const line of lines) {
      const index = line.indexOf(":");
      if (index <= 0) {
        continue;
      }
      const name = line.slice(0, index).trim().toLowerCase();
      if (name === target) {
        return line.slice(index + 1).trim();
      }
    }
    return "";
  }

  function getUserscriptResponseText(response) {
    if (typeof response?.responseText === "string") {
      return response.responseText;
    }
    if (typeof response?.response === "string") {
      return response.response;
    }
    return String(response?.response || "");
  }

  function requestWithUserscript(options, session) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("当前 userscript 管理器不支持 GM_xmlhttpRequest"));
        return;
      }

      let settled = false;
      let requestHandle = null;
      const unregister =
        typeof session?.registerAbortHandle === "function"
          ? session.registerAbortHandle(() => {
              if (requestHandle && typeof requestHandle.abort === "function") {
                requestHandle.abort();
              }
            })
          : () => {};

      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        unregister();
        callback(value);
      };

      requestHandle = GM_xmlhttpRequest({
        method: options.method || "GET",
        url: options.url,
        headers: options.headers || {},
        timeout: safeNumber(options.timeout, 15000),
        responseType: options.responseType || "text",
        anonymous: !!options.anonymous,
        withCredentials: options.anonymous ? false : options.withCredentials !== false,
        onload: (response) => {
          if (response?.status >= 200 && response.status < 400) {
            finish(resolve, response);
            return;
          }
          finish(reject, new Error(`HTTP ${response?.status || 0}`));
        },
        ontimeout: () => finish(reject, new Error("请求超时")),
        onabort: () => {
          const error = new Error("请求已取消");
          error.name = "AbortError";
          finish(reject, error);
        },
        onerror: (response) => finish(reject, new Error(response?.error || response?.statusText || "请求失败")),
      });
    });
  }

  function formatBilibiliImportLabel(record) {
    if (record?.sourceType === "pgc" || record?.pgcEpId || record?.pgcSeasonId) {
      const epLabel = record?.pgcEpId
        ? `ep${record.pgcEpId}`
        : record?.pgcSeasonId && record?.pgcEpisodeNumber
        ? `ss${record.pgcSeasonId} / 第${record.pgcEpisodeNumber}集`
        : "番剧 ep";
      return record?.bvid ? `${epLabel} / ${record.bvid}` : epLabel;
    }
    if (!record?.bvid) {
      return "未导入";
    }
    return `${record.bvid} / P${record.page || 1}`;
  }

  function summarizeBilibiliImportRecords(records, options = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!list.length) {
      return "无";
    }
    const limit = Math.max(1, readPositiveInt(options.limit) || 4);
    const labels = list.slice(0, limit).map((record) => formatBilibiliImportLabel(record));
    if (list.length > limit) {
      labels.push(`... 另 ${list.length - limit} 条`);
    }
    return labels.join(" + ");
  }

  function buildBilibiliImportStatusText(importInfo) {
    const records = Array.isArray(importInfo?.records) ? importInfo.records : [];
    const counts = importInfo?.counts || {};
    if (!records.length) {
      return importInfo?.message || "未导入";
    }
    const loadedCount = safeNumber(counts.loaded, 0);
    const totalCount = safeNumber(counts.total, records.length);
    const summary =
      totalCount > 1
        ? `B站导入 ${totalCount} 条（已加载 ${loadedCount}）`
        : `B站导入 1 条（已加载 ${loadedCount || 1}）`;
    if (importInfo?.phase === "error" && importInfo?.message) {
      return `${summary}\n${importInfo.message}`;
    }
    if (totalCount > 1) {
      return `${summary}\n${summarizeBilibiliImportRecords(records, { limit: 3 })}`;
    }
    return importInfo?.message || summary;
  }

  function summarizeSourceBreakdown(sourceBreakdown) {
    const entries = Object.entries(sourceBreakdown || {});
    if (!entries.length) {
      return "无";
    }
    return entries
      .map(([sourceKey, entry]) => {
        const count = safeNumber(entry?.count, 0);
        const acceptedCount = safeNumber(entry?.acceptedCount, count);
        const dedupedCount = safeNumber(entry?.dedupedCount, Math.max(0, count - acceptedCount));
        const label = entry?.label || sourceKey;
        if (dedupedCount > 0 || acceptedCount !== count) {
          return `${label}: 原始 ${count} 条（并入 ${acceptedCount} / 去重 ${dedupedCount}）`;
        }
        return `${label}: ${count} 条`;
      })
      .join(" + ");
  }

  function getDanmakuMergeKey(comment) {
    const time = Math.round(safeNumber(comment?.time, 0) * 1000) / 1000;
    return [
      normalizeSpace(comment?.text || ""),
      MODE_MAP[comment?.mode] || comment?.mode || "rtl",
      String(comment?.color || "").toLowerCase(),
      Number.isFinite(time) ? time.toFixed(3) : "0.000",
    ].join("|");
  }

  function getDanmakuFuzzyKey(comment) {
    const text = normalizeSpace(comment?.text || "");
    if (!text) {
      return "";
    }
    return [
      text,
      MODE_MAP[comment?.mode] || comment?.mode || "rtl",
    ].join("|");
  }

  function getDanmakuTimeBucket(time, windowSeconds = CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS) {
    const windowSize = Math.max(0.001, safeNumber(windowSeconds, CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS));
    return Math.round(Math.max(0, safeNumber(time, 0)) / windowSize);
  }

  function hasCrossSourceFuzzyDuplicate(comment, priorFuzzyIndex, windowSeconds = CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS) {
    if (!priorFuzzyIndex || !priorFuzzyIndex.size) {
      return false;
    }
    const key = getDanmakuFuzzyKey(comment);
    if (!key) {
      return false;
    }
    const bucketMap = priorFuzzyIndex.get(key);
    if (!bucketMap) {
      return false;
    }
    const time = safeNumber(comment?.time, 0);
    const bucket = getDanmakuTimeBucket(time, windowSeconds);
    for (let offset = -1; offset <= 1; offset += 1) {
      const candidates = bucketMap.get(bucket + offset);
      if (!candidates) {
        continue;
      }
      if (candidates.some((candidateTime) => Math.abs(candidateTime - time) <= windowSeconds)) {
        return true;
      }
    }
    return false;
  }

  function indexCrossSourceFuzzyComment(comment, priorFuzzyIndex, windowSeconds = CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS) {
    const key = getDanmakuFuzzyKey(comment);
    if (!key) {
      return;
    }
    const time = safeNumber(comment?.time, 0);
    const bucket = getDanmakuTimeBucket(time, windowSeconds);
    if (!priorFuzzyIndex.has(key)) {
      priorFuzzyIndex.set(key, new Map());
    }
    const bucketMap = priorFuzzyIndex.get(key);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, []);
    }
    bucketMap.get(bucket).push(time);
  }

  function readProtoVarint(bytes, offset) {
    let result = 0n;
    let shift = 0n;
    let cursor = offset;
    while (cursor < bytes.length) {
      const byte = BigInt(bytes[cursor]);
      cursor += 1;
      result |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) {
        return {
          value: result,
          offset: cursor,
        };
      }
      shift += 7n;
    }
    throw new Error("protobuf varint 解析失败");
  }

  function protoBigIntToNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function skipProtoField(bytes, offset, wireType) {
    if (wireType === 0) {
      return readProtoVarint(bytes, offset).offset;
    }
    if (wireType === 1) {
      return offset + 8;
    }
    if (wireType === 2) {
      const lengthInfo = readProtoVarint(bytes, offset);
      return lengthInfo.offset + protoBigIntToNumber(lengthInfo.value, 0);
    }
    if (wireType === 3) {
      let cursor = offset;
      while (cursor < bytes.length) {
        const tagInfo = readProtoVarint(bytes, cursor);
        cursor = tagInfo.offset;
        const innerWireType = Number(tagInfo.value & 0x07n);
        if (innerWireType === 4) {
          return cursor;
        }
        cursor = skipProtoField(bytes, cursor, innerWireType);
      }
      return cursor;
    }
    if (wireType === 4) {
      return offset;
    }
    if (wireType === 5) {
      return offset + 4;
    }
    throw new Error(`不支持的 protobuf wire type: ${wireType}`);
  }

  function parseBilibiliDmView(responseBuffer) {
    const bytes = responseBuffer instanceof Uint8Array ? responseBuffer : new Uint8Array(responseBuffer || 0);
    let segmentDurationMs = 360000;
    let totalSegments = 0;
    let totalCount = 0;
    let offset = 0;

    while (offset < bytes.length) {
      const tagInfo = readProtoVarint(bytes, offset);
      offset = tagInfo.offset;
      const fieldNumber = Number(tagInfo.value >> 3n);
      const wireType = Number(tagInfo.value & 0x07n);

      if (fieldNumber === 4 && wireType === 2) {
        const lengthInfo = readProtoVarint(bytes, offset);
        const endOffset = lengthInfo.offset + protoBigIntToNumber(lengthInfo.value, 0);
        let innerOffset = lengthInfo.offset;
        while (innerOffset < endOffset) {
          const innerTag = readProtoVarint(bytes, innerOffset);
          innerOffset = innerTag.offset;
          const innerField = Number(innerTag.value >> 3n);
          const innerWire = Number(innerTag.value & 0x07n);
          if (innerWire === 0) {
            const innerValue = readProtoVarint(bytes, innerOffset);
            innerOffset = innerValue.offset;
            if (innerField === 1) {
              segmentDurationMs = protoBigIntToNumber(innerValue.value, segmentDurationMs);
            } else if (innerField === 2) {
              totalSegments = protoBigIntToNumber(innerValue.value, totalSegments);
            }
          } else {
            innerOffset = skipProtoField(bytes, innerOffset, innerWire);
          }
        }
        offset = endOffset;
        continue;
      }

      if (fieldNumber === 8 && wireType === 0) {
        const countInfo = readProtoVarint(bytes, offset);
        totalCount = protoBigIntToNumber(countInfo.value, totalCount);
        offset = countInfo.offset;
        continue;
      }

      offset = skipProtoField(bytes, offset, wireType);
    }

    return {
      segmentDurationMs,
      totalSegments,
      totalCount,
    };
  }

  function parseBilibiliDmElemMessage(bytes, meta) {
    const decoder = new TextDecoder("utf-8");
    let idValue = "";
    let text = "";
    let progressMs = 0;
    let mode = "rtl";
    let colorValue = 16777215;
    let ctime = Date.now();
    let offset = 0;

    while (offset < bytes.length) {
      const tagInfo = readProtoVarint(bytes, offset);
      offset = tagInfo.offset;
      const fieldNumber = Number(tagInfo.value >> 3n);
      const wireType = Number(tagInfo.value & 0x07n);

      if (wireType === 0) {
        const valueInfo = readProtoVarint(bytes, offset);
        offset = valueInfo.offset;
        const numericValue = protoBigIntToNumber(valueInfo.value, 0);
        if (fieldNumber === 1) {
          idValue = valueInfo.value.toString();
        } else if (fieldNumber === 2) {
          progressMs = numericValue;
        } else if (fieldNumber === 3) {
          mode = MODE_MAP[numericValue] || "rtl";
        } else if (fieldNumber === 5) {
          colorValue = numericValue;
        } else if (fieldNumber === 8) {
          ctime = numericValue;
        }
        continue;
      }

      if (wireType === 2) {
        const lengthInfo = readProtoVarint(bytes, offset);
        const endOffset = lengthInfo.offset + protoBigIntToNumber(lengthInfo.value, 0);
        const fieldBytes = bytes.slice(lengthInfo.offset, endOffset);
        offset = endOffset;
        if (fieldNumber === 7) {
          text = decoder.decode(fieldBytes);
        } else if (fieldNumber === 12 && !idValue) {
          idValue = decoder.decode(fieldBytes);
        }
        continue;
      }

      offset = skipProtoField(bytes, offset, wireType);
    }

    const normalizedText = normalizeSpace(text);
    if (!normalizedText) {
      return null;
    }
    return {
      id: String(idValue || `${meta?.bvid || "bilibili"}-${Math.round(progressMs)}-${normalizedText}`),
      source: "bilibili",
      text: normalizedText,
      time: progressMs / 1000,
      mode,
      color: `#${Math.max(0, colorValue).toString(16).slice(-6).padStart(6, "0")}`,
      date: ctime,
      episodeId: meta?.sessionEpisodeId ?? meta?.cid ?? null,
    };
  }

  function parseBilibiliDmSegment(responseBuffer, meta) {
    const bytes = responseBuffer instanceof Uint8Array ? responseBuffer : new Uint8Array(responseBuffer || 0);
    const comments = [];
    let offset = 0;

    while (offset < bytes.length) {
      const tagInfo = readProtoVarint(bytes, offset);
      offset = tagInfo.offset;
      const fieldNumber = Number(tagInfo.value >> 3n);
      const wireType = Number(tagInfo.value & 0x07n);

      if (fieldNumber === 1 && wireType === 2) {
        const lengthInfo = readProtoVarint(bytes, offset);
        const endOffset = lengthInfo.offset + protoBigIntToNumber(lengthInfo.value, 0);
        const comment = parseBilibiliDmElemMessage(bytes.slice(lengthInfo.offset, endOffset), meta);
        if (comment) {
          comments.push(comment);
        }
        offset = endOffset;
        continue;
      }

      offset = skipProtoField(bytes, offset, wireType);
    }

    return comments;
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

  async function mapWithConcurrency(items, concurrency, iteratee) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (!list.length) {
      return [];
    }
    const workerCount = Math.max(1, Math.min(list.length, readPositiveInt(concurrency) || 1));
    const results = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await iteratee(list[index], index);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  function getBangumiDataByRoute(route) {
    const data = getPageWindow().$data || {};
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

  function readAniChEpisodeRouteEntries(route) {
    if (!route?.bangumiId) {
      return [];
    }

    const entries = [];
    const seen = new Set();
    const addEntry = (entry) => {
      if (!entry?.routeKey || seen.has(entry.routeKey)) {
        return;
      }
      const episode = readPositiveInt(entry.episode);
      if (!episode) {
        return;
      }
      seen.add(entry.routeKey);
      entries.push({
        routeKey: entry.routeKey,
        href: entry.href || "",
        episode,
      });
    };

    const routeLinks = Array.from(document.querySelectorAll(`section[episodes] a[href^="/b/${route.bangumiId}/"]`));
    routeLinks.forEach((link, index) => {
      const info = makePrimaryRouteInfo(link.getAttribute("href") || "");
      if (!info || info.bangumiId !== route.bangumiId) {
        return;
      }
      addEntry({
        routeKey: info.routeKey,
        href: info.href,
        episode:
          extractEpisodeNumber(link.getAttribute("title") || "") ||
          extractEpisodeNumber(link.textContent || "") ||
          (routeLinks.length > 1 ? index + 1 : null),
      });
    });

    const bangumiStore = getPageWindow().$data?.[`bangumi-${route.bangumiId}`];
    const storeEpisodes = Array.isArray(bangumiStore?.episodes)
      ? bangumiStore.episodes
      : Array.isArray(bangumiStore?.data?.episodes)
      ? bangumiStore.data.episodes
      : [];
    storeEpisodes.forEach((episode, index) => {
      const hrefCandidate =
        episode?.href ||
        episode?.path ||
        episode?.route ||
        episode?.url ||
        episode?.link ||
        episode?.episodeHref ||
        episode?.episodePath ||
        "";
      const info = makePrimaryRouteInfo(hrefCandidate);
      if (!info || info.bangumiId !== route.bangumiId) {
        return;
      }
      addEntry({
        routeKey: info.routeKey,
        href: info.href,
        episode:
          readPositiveInt(episode?.episodeNumber) ||
          extractEpisodeNumber(episode?.episodeTitle || "") ||
          extractEpisodeNumber(episode?.title || "") ||
          extractEpisodeNumber(episode?.name || "") ||
          (storeEpisodes.length > 1 ? index + 1 : null),
      });
    });

    addEntry({
      routeKey: route.routeKey,
      href: route.href || location.href,
      episode:
        extractEpisodeNumber(
          getNormalizedText("section[player-info] section[item='本集标题']") ||
            document.querySelector("a[aria-current='page'][item][title]")?.getAttribute("title") ||
            ""
        ) || null,
    });

    entries.sort((left, right) => left.episode - right.episode);
    return entries;
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

  function makePrimaryRouteInfo(href) {
    try {
      const url = new URL(href || location.href, location.href);
      const match = url.pathname.match(PRIMARY_ROUTE_RE);
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
        pointer-events: none !important;
        contain: layout style size;
        font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .anich-ddm-overlay * {
        pointer-events: none !important;
      }

      :fullscreen .anich-ddm-overlay {
        z-index: 1 !important;
        pointer-events: none !important;
      }

      :fullscreen .anich-ddm-toolbar,
      :fullscreen .anich-ddm-panel,
      :fullscreen .anich-ddm-import-popover,
      :fullscreen .anich-ddm-matcher,
      :fullscreen .anich-ddm-skip-prompt {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
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

      .anich-ddm-import-popover {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 2147483646;
        width: min(21rem, calc(100vw - 2rem));
        color: #eef2f7;
        background: rgba(8, 13, 21, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(18px);
        padding: 12px;
        display: grid;
        gap: 10px;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(0, 8px, 0);
        transition: opacity 0.16s ease, transform 0.16s ease, visibility 0s linear 0.16s;
        pointer-events: none;
      }

      .anich-ddm-import-popover.is-open {
        opacity: 1;
        visibility: visible;
        transform: translate3d(0, 0, 0);
        transition-delay: 0s;
        pointer-events: auto;
      }

      .anich-ddm-import-head {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .anich-ddm-import-title {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .anich-ddm-import-note {
        font-size: 11px;
        opacity: 0.72;
      }

      .anich-ddm-import-actions {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items: center;
      }

      .anich-ddm-import-status {
        font-size: 11px;
        line-height: 1.5;
        color: rgba(170, 224, 255, 0.94);
        white-space: pre-line;
      }

      .anich-ddm-import-status.is-error {
        color: #ffb9c0;
      }

      .anich-ddm-import-summary {
        padding: 10px 11px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: grid;
        gap: 8px;
        font-size: 11px;
        line-height: 1.5;
      }

      .anich-ddm-import-summary-head {
        color: rgba(220, 232, 244, 0.84);
      }

      .anich-ddm-import-list {
        display: grid;
        gap: 8px;
        max-height: 18rem;
        overflow: auto;
        padding-right: 2px;
      }

      .anich-ddm-import-item {
        display: grid;
        gap: 6px;
        padding: 9px 10px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .anich-ddm-import-item-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .anich-ddm-import-item-title {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.4;
      }

      .anich-ddm-import-item-remove {
        flex: none;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(244, 249, 255, 0.92);
        font-size: 11px;
        cursor: pointer;
      }

      .anich-ddm-import-item-remove:hover {
        border-color: rgba(129, 207, 255, 0.48);
        background: rgba(255, 255, 255, 0.08);
      }

      .anich-ddm-import-item-meta {
        font-size: 11px;
        line-height: 1.45;
        color: rgba(224, 233, 242, 0.84);
        white-space: pre-line;
      }

      .anich-ddm-import-empty {
        color: rgba(220, 232, 244, 0.68);
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

      .anich-ddm-row-density {
        grid-template-columns: 58px minmax(0, 1fr) 76px 54px;
      }

      .anich-ddm-number-input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(244, 249, 255, 0.94);
        font: inherit;
        font-size: 12px;
        padding: 5px 6px;
        outline: none;
      }

      .anich-ddm-number-input:focus {
        border-color: rgba(129, 207, 255, 0.58);
        background: rgba(255, 255, 255, 0.09);
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
        pointer-events: auto !important;
        display: none;
      }

      .anich-ddm-matcher,
      .anich-ddm-matcher * {
        pointer-events: auto !important;
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

  class BilibiliTransport {
    constructor(app) {
      this.app = app;
    }

    buildHeaders(target, accept = "*/*") {
      const bvid = extractBilibiliBvid(target || "");
      const pgcEpId = extractBilibiliPgcEpId(target || "") || readPositiveInt(target);
      const referer = bvid
        ? `https://www.bilibili.com/video/${bvid}/`
        : pgcEpId
        ? buildBilibiliPgcEpisodeUrl(pgcEpId)
        : "https://www.bilibili.com/";
      return {
        Accept: accept,
        Origin: "https://www.bilibili.com",
        Referer: referer,
      };
    }

    async resolveShortLink(url, session) {
      const response = await requestWithUserscript(
        {
          url,
          headers: this.buildHeaders("", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
        },
        session
      );
      const finalUrl =
        normalizeSpace(response?.finalUrl || "") ||
        normalizeSpace(getHeaderValue(response?.responseHeaders, "location")) ||
        normalizeSpace(url);
      return finalUrl;
    }

    async resolveVideoMeta(bvid, session) {
      const url = `${BILIBILI_API}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
      const response = await requestWithUserscript(
        {
          url,
          headers: this.buildHeaders(bvid, "application/json"),
        },
        session
      );
      const payload = JSON.parse(getUserscriptResponseText(response) || "{}");
      if (safeNumber(payload?.code, -1) !== 0 || !payload?.data) {
        throw new Error(payload?.message || "B 站视频信息请求失败");
      }
      const pages = Array.isArray(payload.data.pages) ? payload.data.pages : [];
      const resolvedBvid = extractBilibiliBvid(String(payload.data.bvid || bvid || ""));
      return {
        sourceType: "video",
        bvid: resolvedBvid,
        aid: safeNumber(payload.data.aid, 0),
        title: normalizeSpace(payload.data.title || ""),
        cid: safeNumber(payload.data.cid, 0),
        duration: safeNumber(payload.data.duration, 0),
        totalDanmakuCount: safeNumber(payload?.data?.stat?.danmaku, 0),
        pages,
        resolvedUrl: `https://www.bilibili.com/video/${resolvedBvid}/`,
      };
    }

    async resolvePgcEpisodeMeta(target, session) {
      const normalizedEpId = readPositiveInt(
        typeof target === "object" ? target?.pgcEpId || target?.epId : target
      );
      const targetSeasonId = readPositiveInt(
        typeof target === "object" ? target?.pgcSeasonId || target?.seasonId : null
      );
      const targetEpisodeNumber = readPositiveInt(
        typeof target === "object" ? target?.pgcEpisodeNumber || target?.episodeNumber : null
      );
      if (!normalizedEpId && (!targetSeasonId || !targetEpisodeNumber)) {
        throw new Error("缺少有效的 B 站番剧 ep 号或 season/集号");
      }
      const url = normalizedEpId
        ? `${BILIBILI_API}/pgc/view/web/season?ep_id=${encodeURIComponent(normalizedEpId)}`
        : `${BILIBILI_API}/pgc/view/web/season?season_id=${encodeURIComponent(targetSeasonId)}`;
      const response = await requestWithUserscript(
        {
          url,
          headers: this.buildHeaders(normalizedEpId ? `ep${normalizedEpId}` : "", "application/json"),
        },
        session
      );
      const payload = JSON.parse(getUserscriptResponseText(response) || "{}");
      if (safeNumber(payload?.code, -1) !== 0 || !payload?.result) {
        throw new Error(
          payload?.message ||
            (normalizedEpId
              ? `B 站番剧 ep${normalizedEpId} 信息请求失败`
              : `B 站番剧 season ${targetSeasonId} 信息请求失败`)
        );
      }
      const result = payload.result || {};
      const episodes = Array.isArray(result.episodes) ? result.episodes : [];
      const episode = episodes.find(
        (item) =>
          (normalizedEpId &&
            (readPositiveInt(item?.id || item?.ep_id) === normalizedEpId ||
              extractBilibiliPgcEpId(item?.link || item?.share_url || "") === normalizedEpId)) ||
          (!normalizedEpId && readBilibiliPgcEpisodeNumber(item) === targetEpisodeNumber)
      );
      if (!episode) {
        throw new Error(
          normalizedEpId
            ? `未找到 ep${normalizedEpId} 对应的 B 站番剧分集`
            : `未找到 season ${targetSeasonId} 第${targetEpisodeNumber}集对应的 B 站番剧分集`
        );
      }
      const resolvedEpId = readPositiveInt(episode.id || episode.ep_id) || normalizedEpId;
      const episodeNumber = readBilibiliPgcEpisodeNumber(episode);
      const resolvedBvid = extractBilibiliBvid(String(episode.bvid || ""));
      const cid = safeNumber(episode.cid, 0);
      const aid = safeNumber(episode.aid, 0);
      if (!resolvedBvid || !cid || !aid) {
        throw new Error(`ep${normalizedEpId} 缺少可用的 B 站弹幕参数`);
      }
      const durationRaw = safeNumber(episode.duration, 0);
      const durationSeconds = durationRaw > 10000 ? durationRaw / 1000 : durationRaw;
      const partTitle = normalizeSpace(
        [episode.title ? `第${episode.title}集` : "", episode.long_title || episode.show_title || ""]
          .filter(Boolean)
          .join(" ")
      );
      const seasonTitle = normalizeSpace(result.title || result.season_title || "");
      return {
        sourceType: "pgc",
        pgcEpId: resolvedEpId,
        pgcSeasonId: readPositiveInt(result.season_id) || null,
        pgcEpisodeNumber: episodeNumber,
        bvid: resolvedBvid,
        aid,
        title: normalizeSpace([seasonTitle, partTitle].filter(Boolean).join(" / ")) || partTitle || seasonTitle,
        cid,
        duration: durationSeconds,
        totalDanmakuCount: safeNumber(episode?.stat?.danmakus || episode?.stat_for_unity?.danmaku?.value, 0),
        pages: [
          {
            page: 1,
            cid,
            duration: durationSeconds,
            part: partTitle || `ep${normalizedEpId}`,
          },
        ],
        resolvedUrl: buildBilibiliPgcEpisodeUrl(resolvedEpId),
      };
    }

    pickCid(pages, page) {
      const candidates = Array.isArray(pages) ? pages : [];
      if (!candidates.length) {
        throw new Error("B 站视频没有可用分 P");
      }
      const requestedPage = readPositiveInt(page) || 1;
      const matched = candidates.find((item) => safeNumber(item?.page, 0) === requestedPage);
      if (!matched) {
        throw new Error(`未找到 P${requestedPage}，请检查链接中的分 P 参数`);
      }
      return {
        page: safeNumber(matched.page, requestedPage),
        cid: safeNumber(matched.cid, 0),
        duration: safeNumber(matched.duration, 0),
        part: normalizeSpace(matched.part || ""),
      };
    }

    async fetchDmView(oid, pid, bvid, session) {
      if (!safeNumber(oid, 0)) {
        throw new Error("缺少有效的 cid，无法读取弹幕分段信息");
      }
      const response = await requestWithUserscript(
        {
          url: `${BILIBILI_API}/x/v2/dm/web/view?type=1&oid=${encodeURIComponent(oid)}${pid ? `&pid=${encodeURIComponent(pid)}` : ""}`,
          headers: this.buildHeaders(bvid, "*/*"),
          responseType: "arraybuffer",
        },
        session
      );
      return parseBilibiliDmView(response?.response);
    }

    async fetchDmSegment(cid, segmentIndex, bvid, session) {
      if (!safeNumber(cid, 0)) {
        throw new Error("缺少有效的 cid，无法加载 B 站弹幕分段");
      }
      const response = await requestWithUserscript(
        {
          url: `${BILIBILI_API}/x/v2/dm/web/seg.so?type=1&oid=${encodeURIComponent(cid)}&segment_index=${encodeURIComponent(segmentIndex)}`,
          headers: this.buildHeaders(bvid, "*/*"),
          responseType: "arraybuffer",
        },
        session
      );
      return parseBilibiliDmSegment(response?.response, {
        bvid,
        cid,
      });
    }

    async fetchDmSegmentWithRetry(cid, segmentIndex, bvid, session) {
      let lastError = null;
      for (let attempt = 0; attempt <= BILIBILI_DM_SEGMENT_RETRY_COUNT; attempt += 1) {
        try {
          return await this.fetchDmSegment(cid, segmentIndex, bvid, session);
        } catch (error) {
          lastError = error;
          if (attempt >= BILIBILI_DM_SEGMENT_RETRY_COUNT || session?.destroyed) {
            break;
          }
          await sleep(160 * (attempt + 1));
        }
      }
      throw new Error(`第 ${segmentIndex} 段弹幕加载失败：${lastError?.message || lastError || "未知错误"}`);
    }

    async fetchSegmentedDanmaku(meta, session) {
      const viewData = await this.fetchDmView(meta.cid, meta.aid, meta.bvid, session);
      const segmentDurationMs = Math.max(1000, safeNumber(viewData.segmentDurationMs, 360000));
      const fallbackDurationMs = Math.max(
        safeNumber(meta.partDuration, 0) * 1000,
        safeNumber(meta.duration, 0) * 1000
      );
      const fallbackSegments = Math.max(1, Math.ceil(fallbackDurationMs / segmentDurationMs));
      const totalSegments = Math.max(1, safeNumber(viewData.totalSegments, 0) || fallbackSegments);
      const segmentIndexes = Array.from({ length: totalSegments }, (_, index) => index + 1);
      const segments = await mapWithConcurrency(
        segmentIndexes,
        BILIBILI_DM_SEGMENT_CONCURRENCY,
        (segmentIndex) => this.fetchDmSegmentWithRetry(meta.cid, segmentIndex, meta.bvid, session)
      );
      return {
        comments: segments.flat().map((comment) =>
          Object.assign({}, comment, {
            episodeId: meta?.sessionEpisodeId ?? meta?.cid ?? null,
          })
        ),
        viewData,
      };
    }
  }

  class DanmakuStore {
    constructor() {
      this.clearAll();
    }

    clearAll() {
      this.sources = new Map();
      this.items = [];
      this.stats = {
        count: 0,
        visibleCount: 0,
        filteredCount: 0,
        source: "",
        episodeId: null,
        sourceBreakdown: {},
      };
    }

    clear() {
      this.clearAll();
    }

    hasSource(sourceKey) {
      return this.sources.has(sourceKey);
    }

    replaceSource(sourceKey, comments, meta) {
      this.sources.set(sourceKey, {
        comments: Array.isArray(comments) ? comments.slice() : [],
        meta: Object.assign({}, meta),
      });
      this.rebuild();
    }

    removeSource(sourceKey) {
      if (this.sources.delete(sourceKey)) {
        this.rebuild();
      }
    }

    rebuild() {
      const ids = new Set();
      const priorFuzzyIndex = new Map();
      const merged = [];
      const sourceBreakdown = {};
      let sourceLabels = [];
      let episodeId = null;
      let sourceIndex = 0;

      for (const [sourceKey, bucket] of this.sources.entries()) {
        const bucketComments = Array.isArray(bucket?.comments)
          ? bucket.comments
              .slice()
              .sort((left, right) => safeNumber(left?.time, 0) - safeNumber(right?.time, 0))
          : [];
        const meta = bucket?.meta || {};
        sourceBreakdown[sourceKey] = {
          count: bucketComments.length,
          label: meta.label || sourceKey,
          source: meta.source || sourceKey,
          sourceType: meta.sourceType || "",
          bvid: meta.bvid || "",
          pgcEpId: safeNumber(meta.pgcEpId, 0) || 0,
          pgcSeasonId: safeNumber(meta.pgcSeasonId, 0) || 0,
          page: safeNumber(meta.page, 0) || 0,
          availableCount: safeNumber(meta.availableCount, 0) || 0,
          totalCount: safeNumber(meta.totalCount, 0) || 0,
          segmentCount: safeNumber(meta.segmentCount, 0) || 0,
        };
        sourceLabels.push(meta.label || sourceKey);
        if (episodeId == null && meta.episodeId != null) {
          episodeId = meta.episodeId;
        }
        const acceptedComments = [];
        for (const comment of bucketComments) {
          const uniqueId = getDanmakuMergeKey(comment);
          if (ids.has(uniqueId)) {
            continue;
          }
          if (
            sourceIndex > 0 &&
            hasCrossSourceFuzzyDuplicate(comment, priorFuzzyIndex, CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS)
          ) {
            continue;
          }
          ids.add(uniqueId);
          merged.push(comment);
          acceptedComments.push(comment);
        }
        acceptedComments.forEach((comment) => {
          indexCrossSourceFuzzyComment(comment, priorFuzzyIndex, CROSS_SOURCE_DUPLICATE_WINDOW_SECONDS);
        });
        sourceBreakdown[sourceKey].acceptedCount = acceptedComments.length;
        sourceBreakdown[sourceKey].dedupedCount = Math.max(0, bucketComments.length - acceptedComments.length);
        sourceIndex += 1;
      }
      merged.sort((left, right) => left.time - right.time);
      this.items = merged;
      this.stats = {
        count: merged.length,
        visibleCount: merged.length,
        filteredCount: 0,
        source: sourceLabels.filter(Boolean).join(" + "),
        episodeId,
        sourceBreakdown,
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
      this.remainingMs = 0;
      this.activeCue = null;
      this.visible = false;
      this.paused = false;
      this.state = {
        visible: false,
        shownAt: 0,
        lastAction: "idle",
        lastCueId: null,
        targetLabel: "",
        targetTime: null,
        remainingSeconds: 0,
        paused: false,
      };
      this.handleClick = this.handleClick.bind(this);
      this.handleMouseEnter = this.handleMouseEnter.bind(this);
      this.handleMouseLeave = this.handleMouseLeave.bind(this);
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
      this.button.addEventListener("mouseenter", this.handleMouseEnter);
      this.button.addEventListener("mouseleave", this.handleMouseLeave);
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
        this.button.removeEventListener("mouseenter", this.handleMouseEnter);
        this.button.removeEventListener("mouseleave", this.handleMouseLeave);
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

    clearTimer(resetDeadline = true) {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = 0;
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = 0;
      }
      if (resetDeadline) {
        this.deadlineAt = 0;
      }
    }

    updateCountdownText() {
      if (!this.meta || !this.activeCue) {
        return;
      }
      const remainingMs = this.paused ? this.remainingMs : Math.max(0, this.deadlineAt - Date.now());
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      this.meta.textContent = `跳转至 ${this.activeCue.targetLabel} · 剩余 ${remainingSeconds} 秒`;
      this.state.remainingSeconds = remainingSeconds;
    }

    startCountdown() {
      if (!this.activeCue) {
        return;
      }
      const durationMs = Math.max(0, Math.round(this.remainingMs));
      this.deadlineAt = Date.now() + durationMs;
      this.updateCountdownText();
      if (durationMs <= 0) {
        this.session.scheduler.handleSkipPromptTimeout();
        this.dismiss("timeout");
        return;
      }
      this.countdownTimer = window.setInterval(() => {
        this.updateCountdownText();
      }, 250);
      this.closeTimer = window.setTimeout(() => {
        this.session.scheduler.handleSkipPromptTimeout();
        this.dismiss("timeout");
      }, durationMs);
    }

    handleMouseEnter() {
      if (!this.visible || this.paused || !this.activeCue) {
        return;
      }
      this.remainingMs = Math.max(0, this.deadlineAt - Date.now());
      this.paused = true;
      this.state.paused = true;
      this.clearTimer(false);
      this.updateCountdownText();
    }

    handleMouseLeave() {
      if (!this.visible || !this.paused || !this.activeCue) {
        return;
      }
      this.paused = false;
      this.state.paused = false;
      this.startCountdown();
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
      this.remainingMs = SKIP_PROMPT_DURATION_MS;
      this.paused = false;
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
        paused: false,
      };
      this.startCountdown();
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
      this.paused = false;
      this.remainingMs = 0;
      this.state.visible = false;
      this.state.lastAction = reason;
      this.state.remainingSeconds = 0;
      this.state.paused = false;
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
        paused: this.state.paused,
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
        paused: false,
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
      this.emitStats = {
        lastFrameEmitted: 0,
        lastFrameDropped: 0,
        lastFrameDroppedMerged: 0,
        lastFrameDroppedSingle: 0,
        totalDropped: 0,
        totalDroppedMerged: 0,
        totalDroppedSingle: 0,
      };
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
      this.emitStats = {
        lastFrameEmitted: 0,
        lastFrameDropped: 0,
        lastFrameDroppedMerged: 0,
        lastFrameDroppedSingle: 0,
        totalDropped: 0,
        totalDroppedMerged: 0,
        totalDroppedSingle: 0,
      };
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

    getEmitLimit() {
      return getDensityLimitConfig(
        this.session.settings,
        this.session.getDensityDurationSeconds(),
        this.comments
      ).maxEmitPerFrame;
    }

    emitDueComments(targetTime) {
      const cutoffTime = targetTime + 0.05;
      const config = getDensityLimitConfig(
        this.session.settings,
        this.session.getDensityDurationSeconds(),
        this.comments
      );
      const dueComments = [];
      while (this.cursor < this.comments.length && this.comments[this.cursor].time <= cutoffTime) {
        dueComments.push(this.comments[this.cursor]);
        this.cursor += 1;
      }
      const limited = limitDanmakuByDensity(dueComments, config.maxEmitPerFrame, config.preferMergedComments);
      limited.comments.forEach((comment) => this.session.renderer.emit(comment));
      const emitted = limited.comments.length;
      const dropped = dueComments.length - emitted;
      this.emitStats.lastFrameEmitted = emitted;
      this.emitStats.lastFrameDropped = dropped;
      this.emitStats.totalDropped += dropped;
      this.emitStats.lastFrameDroppedMerged = limited.droppedMergedCount;
      this.emitStats.lastFrameDroppedSingle = limited.droppedSingleCount;
      this.emitStats.totalDroppedMerged += limited.droppedMergedCount;
      this.emitStats.totalDroppedSingle += limited.droppedSingleCount;
    }

    getDensityDebugState() {
      return Object.assign({}, this.emitStats, {
        maxEmitPerFrame: this.getEmitLimit(),
        queuedComments: this.comments.length,
        cursor: this.cursor,
      });
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
          this.emitDueComments(targetTime);
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
      this.similarMergeEnabledInput = null;
      this.similarMergeInputs = {};
      this.similarMergeValues = {};
      this.densityLimitInputs = {};
      this.densityLimitNumberInputs = {};
      this.densityLimitValues = {};
      this.densityPreferMergedInput = null;
      this.pendingSettingTimers = new Map();
      this.pendingSettingValues = new Map();
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
      this.importPopover = null;
      this.importInput = null;
      this.importStatus = null;
      this.importSummary = null;
      this.importApplyButton = null;
      this.importClearButton = null;
      this.importCloseTimer = 0;
      this.hostInlineStyles = null;
      this.toolbarPosition = normalizeToolbarPosition(storageGet(TOOLBAR_POSITION_KEY, DEFAULT_TOOLBAR_POSITION));
      this.dragState = null;
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
      this.handleToolbarClick = this.handleToolbarClick.bind(this);
      this.handleToolbarPointerDown = this.handleToolbarPointerDown.bind(this);
      this.handleToolbarPointerMove = this.handleToolbarPointerMove.bind(this);
      this.handleToolbarPointerUp = this.handleToolbarPointerUp.bind(this);
      this.handleViewportChange = this.handleViewportChange.bind(this);
      this.handleSettingsPointerEnter = this.handleSettingsPointerEnter.bind(this);
      this.handleImportPopoverPointerEnter = this.handleImportPopoverPointerEnter.bind(this);
      this.handleImportPopoverPointerLeave = this.handleImportPopoverPointerLeave.bind(this);
      window.addEventListener("resize", this.handleViewportChange, true);
    }

    attach(playerContainer, overlay) {
      if (!playerContainer || !overlay) {
        return;
      }
      if (this.isFullscreenActive()) {
        this.playerContainer = playerContainer;
        this.overlay = overlay;
        this.detachControlNodes();
        return;
      }

      const panelWasOpen = !!this.panel?.classList.contains("is-open");
      const matcherWasOpen = !!this.matcher?.classList.contains("is-open");
      const importWasOpen = !!this.importPopover?.classList.contains("is-open");
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
      if (!this.importPopover?.isConnected || this.importPopover.parentElement !== this.toolbarHost) {
        if (this.importPopover?.isConnected) {
          this.importPopover.remove();
        }
        this.buildImportPopover(this.toolbarHost);
        if (importWasOpen) {
          this.importPopover.classList.add("is-open");
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

    isFullscreenActive() {
      return document.fullscreenElement instanceof Element;
    }

    detachControlNodes() {
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      this.stopToolbarDrag(false);
      this.clearImportPopoverCloseTimer();
      this.clearPendingSettingUpdates();
      if (this.toolbar?.isConnected) {
        this.toolbar.remove();
      }
      if (this.importPopover?.isConnected) {
        this.importPopover.remove();
      }
      if (this.panel?.isConnected) {
        this.panel.remove();
      }
      if (this.matcher?.isConnected) {
        this.matcher.remove();
      }
      this.toolbar = null;
      this.toolbarHandle = null;
      this.settingsEntry = null;
      this.toggleEntry = null;
      this.importPopover = null;
      this.importInput = null;
      this.importStatus = null;
      this.importSummary = null;
      this.importApplyButton = null;
      this.importClearButton = null;
      this.panel = null;
      this.densityPreferMergedInput = null;
      this.matcher = null;
      this.releaseToolbarHost();
    }

    destroy() {
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      window.removeEventListener("resize", this.handleViewportChange, true);
      this.stopToolbarDrag(false);
      this.clearImportPopoverCloseTimer();
      this.clearPendingSettingUpdates();
      if (this.toolbar?.isConnected) {
        this.toolbar.remove();
      }
      this.toolbar = null;
      this.toolbarHandle = null;
      this.settingsEntry = null;
      this.toggleEntry = null;
      if (this.importPopover?.isConnected) {
        this.importPopover.remove();
      }
      this.importPopover = null;
      this.importInput = null;
      this.importStatus = null;
      this.importSummary = null;
      this.importApplyButton = null;
      this.importClearButton = null;
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
      this.densityPreferMergedInput = null;
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
      this.applyImportPopoverPosition();
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

    applyImportPopoverPosition() {
      if (!this.importPopover || !this.settingsEntry) {
        return;
      }
      const anchorRect = this.settingsEntry.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
      const margin = 16;
      const gap = 10;
      const popoverRect = this.importPopover.getBoundingClientRect();
      const popoverWidth = Math.min(popoverRect.width || 336, Math.max(0, viewportWidth - margin * 2));
      const popoverHeight = Math.min(popoverRect.height || 196, Math.max(0, viewportHeight - margin * 2));
      const preferredSide = this.toolbarPosition.side === "right" ? "left" : "right";
      const availableLeft = anchorRect.left - gap - margin;
      const availableRight = viewportWidth - margin - (anchorRect.right + gap);
      let placeSide = preferredSide;

      if (preferredSide === "left") {
        if (availableLeft < popoverWidth && availableRight >= popoverWidth) {
          placeSide = "right";
        }
      } else if (availableRight < popoverWidth && availableLeft >= popoverWidth) {
        placeSide = "left";
      }

      const desiredLeft =
        placeSide === "right" ? anchorRect.right + gap : anchorRect.left - gap - popoverWidth;
      const maxLeft = Math.max(margin, viewportWidth - margin - popoverWidth);
      const desiredTop = anchorRect.top + anchorRect.height / 2 - popoverHeight / 2;
      const maxTop = Math.max(margin, viewportHeight - margin - popoverHeight);

      this.importPopover.style.left = `${clamp(Math.round(desiredLeft), margin, maxLeft)}px`;
      this.importPopover.style.top = `${clamp(Math.round(desiredTop), margin, maxTop)}px`;
    }

    clearImportPopoverCloseTimer() {
      if (this.importCloseTimer) {
        window.clearTimeout(this.importCloseTimer);
        this.importCloseTimer = 0;
      }
    }

    openImportPopover() {
      if (!this.importPopover) {
        return;
      }
      this.clearImportPopoverCloseTimer();
      this.importPopover.classList.add("is-open");
      this.applyImportPopoverPosition();
    }

    closeImportPopover(immediate = false) {
      if (!this.importPopover) {
        return;
      }
      this.clearImportPopoverCloseTimer();
      if (immediate) {
        this.importPopover.classList.remove("is-open");
        return;
      }
      this.importCloseTimer = window.setTimeout(() => {
        this.importPopover?.classList.remove("is-open");
        this.importCloseTimer = 0;
      }, IMPORT_POPOVER_CLOSE_DELAY_MS);
    }

    handleSettingsPointerEnter() {
      this.openImportPopover();
    }

    handleImportPopoverPointerEnter() {
      this.clearImportPopoverCloseTimer();
    }

    handleImportPopoverPointerLeave() {
      this.closeImportPopover(false);
    }

    isControlActive(input) {
      return input && document.activeElement === input;
    }

    syncInputValue(input, value) {
      if (!input || this.isControlActive(input)) {
        return;
      }
      input.value = String(value);
    }

    getActiveControlValue(key) {
      const candidates = [
        this.rangeInputs[key],
        this.similarMergeInputs[key],
        this.densityLimitInputs[key],
        this.densityLimitNumberInputs[key],
      ];
      const activeInput = candidates.find((input) => this.isControlActive(input));
      if (!activeInput) {
        return null;
      }
      const parsed = safeNumber(activeInput.value, NaN);
      return Number.isFinite(parsed) ? parsed : null;
    }

    getDisplaySettingValue(key, settings = this.session.settings) {
      const activeValue = this.getActiveControlValue(key);
      if (activeValue !== null) {
        return activeValue;
      }
      if (this.pendingSettingValues.has(key)) {
        return this.pendingSettingValues.get(key);
      }
      return settings[key];
    }

    updateSettingValueText(key, value) {
      if (key === "fontSize" && this.rowValues.fontSize) {
        this.rowValues.fontSize.textContent = `${Math.round(value)}px`;
      } else if (key === "displayRegionRatio" && this.rowValues.displayRegionRatio) {
        this.rowValues.displayRegionRatio.textContent = `${Math.round(value * 100)}%`;
      } else if (key === "opacity" && this.rowValues.opacity) {
        this.rowValues.opacity.textContent = `${Math.round(value * 100)}%`;
      } else if (key === "speed" && this.rowValues.speed) {
        this.rowValues.speed.textContent = `${safeNumber(value, 1).toFixed(1)}x`;
      } else if (key === "offset" && this.rowValues.offset) {
        const offsetValue = safeNumber(value, 0);
        this.rowValues.offset.textContent =
          offsetValue === 0 ? "0.0s" : `${offsetValue > 0 ? "+" : ""}${offsetValue.toFixed(1)}s`;
      } else if (key === "similarMergeThreshold" && this.similarMergeValues.similarMergeThreshold) {
        this.similarMergeValues.similarMergeThreshold.textContent = `${Math.round(value * 100)}%`;
      } else if (key === "similarMergeMinCount" && this.similarMergeValues.similarMergeMinCount) {
        this.similarMergeValues.similarMergeMinCount.textContent = `>=${Math.round(value)}条`;
      } else if (key === "similarMergeGapSeconds" && this.similarMergeValues.similarMergeGapSeconds) {
        this.similarMergeValues.similarMergeGapSeconds.textContent = `${safeNumber(value, 0).toFixed(1)}s`;
      } else if (key === "similarMergeMaxSpanSeconds" && this.similarMergeValues.similarMergeMaxSpanSeconds) {
        this.similarMergeValues.similarMergeMaxSpanSeconds.textContent = `${safeNumber(value, 0).toFixed(0)}s`;
      } else if (key === "maxEmitPerFrame" && this.densityLimitValues.maxEmitPerFrame) {
        this.densityLimitValues.maxEmitPerFrame.textContent = `${Math.round(value)}条`;
      } else if (key === "maxScheduledComments" && this.densityLimitValues.maxScheduledComments) {
        this.densityLimitValues.maxScheduledComments.textContent = `${Math.round(value)}条`;
      }
    }

    queueSettingUpdate(key, value) {
      this.pendingSettingValues.set(key, value);
      this.updateSettingValueText(key, value);
      const existingTimer = this.pendingSettingTimers.get(key);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => {
        this.pendingSettingTimers.delete(key);
        if (!this.pendingSettingValues.has(key)) {
          return;
        }
        const nextValue = this.pendingSettingValues.get(key);
        this.pendingSettingValues.delete(key);
        this.session.updateSetting(key, nextValue);
      }, CONTROL_SETTING_DEBOUNCE_MS);
      this.pendingSettingTimers.set(key, timer);
    }

    commitSettingUpdate(key, value) {
      const timer = this.pendingSettingTimers.get(key);
      if (timer) {
        window.clearTimeout(timer);
        this.pendingSettingTimers.delete(key);
      }
      this.pendingSettingValues.delete(key);
      this.session.updateSetting(key, value);
    }

    clearPendingSettingUpdates() {
      this.pendingSettingTimers.forEach((timer) => window.clearTimeout(timer));
      this.pendingSettingTimers.clear();
      this.pendingSettingValues.clear();
    }

    cancelPendingSettingUpdate(key) {
      const timer = this.pendingSettingTimers.get(key);
      if (timer) {
        window.clearTimeout(timer);
        this.pendingSettingTimers.delete(key);
      }
      this.pendingSettingValues.delete(key);
    }

    handleRangeSettingInput(key, input) {
      const value = safeNumber(input.value, this.session.settings[key]);
      this.queueSettingUpdate(key, value);
    }

    handleRangeSettingChange(key, input) {
      this.commitSettingUpdate(key, safeNumber(input.value, this.session.settings[key]));
    }

    handleNumberSettingInput(key, input) {
      const text = String(input.value || "").trim();
      if (!text || text === "-" || text === "+") {
        this.cancelPendingSettingUpdate(key);
        return;
      }
      const value = safeNumber(text, NaN);
      if (Number.isFinite(value)) {
        this.queueSettingUpdate(key, value);
      }
    }

    handleNumberSettingChange(key, input) {
      const value = safeNumber(input.value, NaN);
      if (Number.isFinite(value)) {
        this.commitSettingUpdate(key, value);
        return;
      }
      input.value = String(this.session.settings[key]);
      this.updateSettingValueText(key, this.session.settings[key]);
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
      settingsButton.addEventListener("pointerenter", this.handleSettingsPointerEnter);
      settingsButton.addEventListener("pointerleave", this.handleImportPopoverPointerLeave);

      this.toolbarHandle = label;
      this.settingsEntry = settingsButton;
      this.toggleEntry = toggleButton;
      this.toolbar.append(label, toggleButton, settingsButton);
      parent.appendChild(this.toolbar);
    }

    buildImportPopover(parent) {
      this.importPopover = createElement("div", "anich-ddm-import-popover");
      this.importPopover.addEventListener("pointerenter", this.handleImportPopoverPointerEnter);
      this.importPopover.addEventListener("pointerleave", this.handleImportPopoverPointerLeave);

      const head = createElement("div", "anich-ddm-import-head");
      head.append(
        createElement("div", "anich-ddm-import-title", "导入 B 站弹幕"),
        createElement("div", "anich-ddm-import-note", "支持 BV、普通视频链接、番剧 ep 链接和 b23 短链")
      );

      const actions = createElement("div", "anich-ddm-import-actions");
      this.importInput = createElement("input", "anich-ddm-input");
      this.importInput.placeholder = "输入 BV、视频链接或 https://www.bilibili.com/bangumi/play/ep...";
      this.importInput.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        if (this.importApplyButton?.disabled) {
          return;
        }
        this.importApplyButton.disabled = true;
        try {
          await this.session.importBilibiliFromInput(this.importInput.value);
        } finally {
          this.importApplyButton.disabled = false;
          this.update();
        }
      });

      this.importApplyButton = createElement("button", "anich-ddm-button", "导入");
      this.importApplyButton.type = "button";
      this.importApplyButton.addEventListener("click", async () => {
        this.importApplyButton.disabled = true;
        try {
          await this.session.importBilibiliFromInput(this.importInput.value);
        } finally {
          this.importApplyButton.disabled = false;
          this.update();
        }
      });

      this.importClearButton = createElement("button", "anich-ddm-button", "清除");
      this.importClearButton.type = "button";
      this.importClearButton.addEventListener("click", () => {
        this.session.clearBilibiliImport(true);
        if (this.importInput) {
          this.importInput.value = "";
        }
        this.update();
      });

      actions.append(this.importInput, this.importApplyButton, this.importClearButton);

      this.importStatus = createElement("div", "anich-ddm-import-status", "未导入");
      this.importSummary = createElement("div", "anich-ddm-import-summary");
      this.importPopover.append(head, actions, this.importStatus, this.importSummary);
      parent.appendChild(this.importPopover);
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
            this.handleRangeSettingInput(key, range);
          });
          range.addEventListener("change", () => {
            this.handleRangeSettingChange(key, range);
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
      const similarMergeCard = this.buildSimilarMergeCard();
      const densityLimitCard = this.buildDensityLimitCard();

      section.append(modeCard, similarMergeCard, densityLimitCard, keywordCard, regexCard);
      this.sections.filters = section;
      parent.appendChild(section);
    }

    buildSimilarMergeCard() {
      const card = createElement("div", "anich-ddm-card");
      card.appendChild(createElement("div", "anich-ddm-card-title", "相似合并"));

      const enabledRow = createElement("label", "anich-ddm-row");
      const enabledLabel = createElement("span", "", "启用");
      const enabledValue = createElement("span", "anich-ddm-row-value");
      const enabledInput = document.createElement("input");
      enabledInput.type = "checkbox";
      enabledInput.checked = !!this.session.settings.similarMergeEnabled;
      enabledInput.addEventListener("change", () => {
        this.session.updateSetting("similarMergeEnabled", enabledInput.checked);
      });
      this.similarMergeEnabledInput = enabledInput;
      this.similarMergeValues.similarMergeEnabled = enabledValue;
      const enabledSwitch = createElement("span", "anich-ddm-switch");
      enabledSwitch.appendChild(enabledInput);
      enabledRow.append(enabledLabel, enabledSwitch, enabledValue);
      card.appendChild(enabledRow);

      [
        { key: "similarMergeThreshold", label: "相似度", format: (value) => `${Math.round(value * 100)}%` },
        { key: "similarMergeMinCount", label: "最小数量", format: (value) => `>=${Math.round(value)}条` },
        { key: "similarMergeGapSeconds", label: "相邻间隔", format: (value) => `${safeNumber(value, 0).toFixed(1)}s` },
        { key: "similarMergeMaxSpanSeconds", label: "最大跨度", format: (value) => `${safeNumber(value, 0).toFixed(0)}s` },
      ].forEach((item) => {
        const limit = SETTING_LIMITS[item.key];
        const row = createElement("label", "anich-ddm-row");
        const labelNode = createElement("span", "", item.label);
        const valueNode = createElement("span", "anich-ddm-row-value");
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(limit.min);
        range.max = String(limit.max);
        range.step = String(limit.step);
        range.value = String(this.session.settings[item.key]);
        range.addEventListener("input", () => {
          this.handleRangeSettingInput(item.key, range);
        });
        range.addEventListener("change", () => {
          this.handleRangeSettingChange(item.key, range);
        });
        this.similarMergeInputs[item.key] = range;
        this.similarMergeValues[item.key] = valueNode;
        row.append(labelNode, range, valueNode);
        card.appendChild(row);
      });
      card.appendChild(createElement("div", "anich-ddm-card-note", "按动态区间合并相似弹幕：从第一条相似弹幕开始，到超过相邻间隔或最大跨度时结算。"));
      return card;
    }

    buildDensityLimitCard() {
      const card = createElement("div", "anich-ddm-card");
      card.appendChild(createElement("div", "anich-ddm-card-title", "密度限制"));
      const densityState = this.session.getDensityControlState();
      [
        { key: "maxEmitPerFrame", label: "同刻发送", format: (value) => `${Math.round(value)}条` },
        { key: "maxScheduledComments", label: "最大加载", format: (value) => `${Math.round(value)}条` },
      ].forEach((item) => {
        const limit = densityState.bounds[item.key] || SETTING_LIMITS[item.key];
        const row = createElement("label", "anich-ddm-row anich-ddm-row-density");
        const labelNode = createElement("span", "", item.label);
        const valueNode = createElement("span", "anich-ddm-row-value");
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(limit.min);
        range.max = String(limit.max);
        range.step = String(SETTING_LIMITS[item.key].step);
        range.value = String(this.session.settings[item.key]);
        range.addEventListener("input", () => {
          this.handleRangeSettingInput(item.key, range);
        });
        range.addEventListener("change", () => {
          this.handleRangeSettingChange(item.key, range);
        });
        const numberInput = document.createElement("input");
        numberInput.className = "anich-ddm-number-input";
        numberInput.type = "number";
        numberInput.min = String(SETTING_LIMITS[item.key].min);
        numberInput.max = String(SETTING_LIMITS[item.key].max);
        numberInput.step = String(SETTING_LIMITS[item.key].step);
        numberInput.value = String(this.session.settings[item.key]);
        numberInput.addEventListener("input", () => {
          this.handleNumberSettingInput(item.key, numberInput);
        });
        numberInput.addEventListener("change", () => {
          this.handleNumberSettingChange(item.key, numberInput);
        });
        numberInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            numberInput.blur();
          }
        });
        this.densityLimitInputs[item.key] = range;
        this.densityLimitNumberInputs[item.key] = numberInput;
        this.densityLimitValues[item.key] = valueNode;
        row.append(labelNode, range, numberInput, valueNode);
        card.appendChild(row);
      });

      const priorityRow = createElement("label", "anich-ddm-row");
      const priorityLabel = createElement("span", "", "合并优先");
      const priorityValue = createElement("span", "anich-ddm-row-value");
      const priorityInput = document.createElement("input");
      priorityInput.type = "checkbox";
      priorityInput.checked = !!this.session.settings.densityPreferMergedComments;
      priorityInput.addEventListener("change", () => {
        this.session.updateSetting("densityPreferMergedComments", priorityInput.checked);
      });
      this.densityPreferMergedInput = priorityInput;
      this.densityLimitValues.densityPreferMergedComments = priorityValue;
      const prioritySwitch = createElement("span", "anich-ddm-switch");
      prioritySwitch.appendChild(priorityInput);
      priorityRow.append(priorityLabel, prioritySwitch, priorityValue);
      card.appendChild(priorityRow);

      card.appendChild(createElement("div", "anich-ddm-card-note", "同刻发送只负责按 1 秒局部密度削峰，稀疏时间段保留全部弹幕；最大加载是独立的全局兜底上限。数字框可直接输入；开启合并优先后，密度裁剪会先保留合并计数弹幕，单条弹幕在超额时更早被丢弃。"));
      return card;
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
      if (
        this.panel?.contains(target) ||
        this.matcher?.contains(target) ||
        this.toolbar?.contains(target) ||
        this.importPopover?.contains(target)
      ) {
        return;
      }
      this.closePanel();
      this.closeImportPopover(true);
    }

    handleToolbarClick(event) {
      const role = event.currentTarget?.dataset?.anichDdmRole;
      event.preventDefault();
      event.stopPropagation();
      if (role === "settings") {
        this.closeImportPopover(true);
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

    renderImportSummary(importInfo) {
      if (!this.importSummary) {
        return;
      }
      this.importSummary.textContent = "";
      const records = Array.isArray(importInfo.records) ? importInfo.records : [];
      const failedRecord =
        importInfo.phase === "error" &&
        importInfo.record &&
        !records.some((record) => record.bindingKey === importInfo.record.bindingKey)
          ? importInfo.record
          : null;
      if (!records.length) {
        if (failedRecord) {
          this.importSummary.appendChild(
            createElement(
              "div",
              "anich-ddm-import-item-meta",
              `最近失败: ${formatBilibiliImportLabel(failedRecord)}\n错误: ${importInfo.error || importInfo.message || "未知错误"}`
            )
          );
        } else {
          this.importSummary.appendChild(createElement("div", "anich-ddm-import-empty", "当前没有 B 站导入记录。"));
        }
        return;
      }

      const counts = importInfo.counts || {};
      const summaryHead = createElement(
        "div",
        "anich-ddm-import-summary-head",
        `当前 ${safeNumber(counts.total, records.length)} 条导入 / 显式 ${safeNumber(counts.explicit, 0)} / 自动 ${safeNumber(counts.derived, 0)} / 映射链 ${safeNumber(counts.rules, 0)}`
      );
      const list = createElement("div", "anich-ddm-import-list");

      records.forEach((record) => {
        const item = createElement("div", "anich-ddm-import-item");
        const head = createElement("div", "anich-ddm-import-item-head");
        const title = createElement(
          "div",
          "anich-ddm-import-item-title",
          record.title || record.partTitle || formatBilibiliImportLabel(record)
        );
        const removeButton = createElement("button", "anich-ddm-import-item-remove", "移除");
        removeButton.type = "button";
        removeButton.disabled = importInfo.phase === "loading" || importInfo.phase === "restoring";
        removeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.session.clearBilibiliImport(true, record.bindingKey);
        });
        head.append(title, removeButton);

        const itemState =
          record.sourceLoaded
            ? "已叠加"
            : record.derivedStatus === "series-rule"
            ? "待按同季规则恢复"
            : record.derivedStatus === "derived-cache"
            ? "已缓存自动推导"
            : "待恢复";
        const offsetLabel =
          record.sourceType === "pgc" || record.pgcEpId || record.pgcSeasonId
            ? Number.isFinite(record.episodeOffset)
              ? `集号 ${record.episodeOffset >= 0 ? "+" : ""}${record.episodeOffset}`
              : "无"
            : Number.isFinite(record.pageOffset)
            ? `${record.pageOffset >= 0 ? "+" : ""}${record.pageOffset}`
            : "无";
        const ruleLabel = record.seriesRule
          ? record.seriesRule.sourceType === "pgc"
            ? `规则: 锚点第${safeNumber(record.seriesRule.anchorEpisode, 0)}集 -> ${
                record.seriesRule.anchorPgcEpisodeNumber
                  ? `B站第${safeNumber(record.seriesRule.anchorPgcEpisodeNumber, 0)}集`
                  : `ep${safeNumber(record.seriesRule.anchorPgcEpId, 0)}`
              }`
            : `规则: 锚点第${safeNumber(record.seriesRule.anchorEpisode, 0)}集 -> P${safeNumber(record.seriesRule.anchorPage, 0)}`
          : "规则: 无";
        const metaLines = [
          `标识: ${formatBilibiliImportLabel(record)}`,
          `${record.sourceType === "pgc" || record.pgcEpId || record.pgcSeasonId ? "分集标题" : "分P标题"}: ${record.partTitle || "第 1 P"}`,
          `绑定: ${getBilibiliImportBindingLabel(record.bindingMode)}`,
          `恢复: ${getBilibiliImportDerivedStatusLabel(record.derivedStatus)}`,
          `偏移: ${offsetLabel}`,
          `弹幕数: ${safeNumber(record.commentCount, 0)} 条${safeNumber(record.availableCount, 0) ? ` / 可加载 ${safeNumber(record.availableCount, 0)} 条` : ""}${safeNumber(record.totalCount, 0) ? ` / 视频总数 ${safeNumber(record.totalCount, 0)} 条` : ""}`,
          `状态: ${itemState}`,
          ruleLabel,
        ];
        item.append(head, createElement("div", "anich-ddm-import-item-meta", metaLines.join("\n")));
        list.appendChild(item);
      });

      if (failedRecord) {
        list.appendChild(
          createElement(
            "div",
            "anich-ddm-import-item-meta",
            `最近失败: ${formatBilibiliImportLabel(failedRecord)}\n错误: ${importInfo.error || importInfo.message || "未知错误"}`
          )
        );
      }

      this.importSummary.append(summaryHead, list);
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
        this.syncInputValue(input, this.getDisplaySettingValue(key, settings));
      });
      this.rowValues.enabled.textContent = settings.enabled ? "开" : "关";
      ["fontSize", "displayRegionRatio", "opacity", "speed", "offset"].forEach((key) => {
        this.updateSettingValueText(key, this.getDisplaySettingValue(key, settings));
      });
      MODE_KEYS.forEach((mode) => {
        if (this.modeInputs[mode]) {
          this.modeInputs[mode].checked = !settings.blockedModes[mode];
        }
      });
      if (this.similarMergeEnabledInput) {
        this.similarMergeEnabledInput.checked = !!settings.similarMergeEnabled;
      }
      Object.entries(this.similarMergeInputs).forEach(([key, input]) => {
        this.syncInputValue(input, this.getDisplaySettingValue(key, settings));
      });
      if (this.similarMergeValues.similarMergeEnabled) {
        this.similarMergeValues.similarMergeEnabled.textContent = settings.similarMergeEnabled ? "开" : "关";
      }
      [
        "similarMergeThreshold",
        "similarMergeMinCount",
        "similarMergeGapSeconds",
        "similarMergeMaxSpanSeconds",
      ].forEach((key) => {
        this.updateSettingValueText(key, this.getDisplaySettingValue(key, settings));
      });
      const densityState = session.getDensityControlState();
      Object.entries(this.densityLimitInputs).forEach(([key, input]) => {
        const limit = densityState.bounds[key] || SETTING_LIMITS[key];
        input.min = String(limit.min);
        input.max = String(limit.max);
        input.step = String(SETTING_LIMITS[key].step);
        this.syncInputValue(input, this.getDisplaySettingValue(key, settings));
      });
      Object.entries(this.densityLimitNumberInputs).forEach(([key, input]) => {
        input.min = String(SETTING_LIMITS[key].min);
        input.max = String(SETTING_LIMITS[key].max);
        input.step = String(SETTING_LIMITS[key].step);
        this.syncInputValue(input, this.getDisplaySettingValue(key, settings));
      });
      if (this.densityPreferMergedInput) {
        this.densityPreferMergedInput.checked = !!settings.densityPreferMergedComments;
      }
      ["maxEmitPerFrame", "maxScheduledComments"].forEach((key) => {
        this.updateSettingValueText(key, this.getDisplaySettingValue(key, settings));
      });
      if (this.densityLimitValues.densityPreferMergedComments) {
        this.densityLimitValues.densityPreferMergedComments.textContent = settings.densityPreferMergedComments ? "开" : "关";
      }
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

      const importInfo = session.getBilibiliImportDebugState();
      if (this.importStatus) {
        this.importStatus.textContent = importInfo.message || "未导入";
        this.importStatus.classList.toggle("is-error", importInfo.phase === "error");
      }
      this.renderImportSummary(importInfo);
      if (
        this.importInput &&
        !normalizeSpace(this.importInput.value) &&
        importInfo.records?.length === 1 &&
        importInfo.record?.rawInput
      ) {
        this.importInput.value = importInfo.record.rawInput;
      }
      if (this.importApplyButton) {
        this.importApplyButton.disabled = importInfo.phase === "loading" || importInfo.phase === "restoring";
      }
      if (this.importClearButton) {
        this.importClearButton.disabled =
          importInfo.phase === "loading" ||
          importInfo.phase === "restoring" ||
          !(safeNumber(importInfo.counts?.total, 0) || safeNumber(importInfo.sourceLoadedCount, 0));
      }

      const context = session.resolvePageContext();
      const transportConfig = session.transport.getConfig();
      const densityPeakText = session.densityLimitStats?.bucketPeakCount
        ? ` | 1秒峰值 ${Math.round(session.densityLimitStats.bucketPeakCount)}`
        : "";
      const summaryLines = [
        `已加载: ${session.store.stats.count} | 可见: ${session.store.stats.visibleCount} | 已屏蔽: ${session.store.stats.filteredCount}`,
        `来源桶: ${summarizeSourceBreakdown(session.store.stats.sourceBreakdown)}`,
        `相似合并: ${settings.similarMergeEnabled ? "开" : "关"} | 输出 ${safeNumber(session.similarMergeStats?.outputCount, 0)} / 输入 ${safeNumber(session.similarMergeStats?.inputCount, 0)} | 合并组 ${safeNumber(session.similarMergeStats?.groups, 0)} | 折叠 ${safeNumber(session.similarMergeStats?.collapsedCount, 0)} 条`,
        `密度限制: 调度 ${safeNumber(session.densityLimitStats?.outputCount, 0)} / ${safeNumber(session.densityLimitStats?.inputCount, 0)} | 裁剪 ${safeNumber(session.densityLimitStats?.droppedCount, 0)} | 同刻 ${Math.round(settings.maxEmitPerFrame)} 条 | 最大 ${Math.round(settings.maxScheduledComments)} 条${densityPeakText} | 合并优先 ${settings.densityPreferMergedComments ? "开" : "关"}`,
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
        `B站导入: ${importInfo.message || "未导入"}`,
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
      const storedSettings = storageGet(SETTINGS_KEY, DEFAULT_SETTINGS);
      this.settings = normalizeSettings(storedSettings);
      this.applySettingsMigrations(storedSettings);
      if (!storageGetBoolean(SIMILAR_MERGE_OPT_IN_KEY, false)) {
        this.settings.similarMergeEnabled = false;
      }
      this.transport = app.transport;
      this.bilibiliTransport = app.bilibiliTransport;
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
      this.abortHandles = new Set();
      this.bootstrapPromise = null;
      this.lastEndpoint = null;
      this.cachedContext = null;
      this.invalidRegexes = [];
      this.similarMergeStats = makeSimilarMergeStats(getSimilarMergeConfig(this.settings), 0, 0, 0, 0);
      this.densityLimitStats = makeDensityLimitStats(getDensityLimitConfig(this.settings), 0, 0);
      this.densityCandidateComments = [];
      this.bilibiliImport = this.getPendingBilibiliImportState();
      this.handleVideoDurationChange = this.handleVideoDurationChange.bind(this);
    }

    applySettingsMigrations(storedSettings) {
      const migrationVersion = storageGetNumber(SETTINGS_MIGRATION_KEY, 0);
      if (migrationVersion < 267 && safeNumber(storedSettings?.maxScheduledComments, 0) === 5000) {
        this.settings.maxScheduledComments = DEFAULT_SETTINGS.maxScheduledComments;
      }
      if (migrationVersion < 267) {
        storageSet(SETTINGS_MIGRATION_KEY, 267);
        storageSet(SETTINGS_KEY, this.settings);
      }
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

    registerAbortHandle(handle) {
      if (typeof handle !== "function") {
        return () => {};
      }
      this.abortHandles.add(handle);
      return () => {
        this.abortHandles.delete(handle);
      };
    }

    abortAll() {
      this.abortControllers.forEach((controller) => controller.abort());
      this.abortControllers.clear();
      this.abortHandles.forEach((handle) => {
        try {
          handle();
        } catch {}
      });
      this.abortHandles.clear();
    }

    destroy() {
      this.destroyed = true;
      this.abortAll();
      this.scheduler.destroy();
      this.renderer.destroy();
      this.skipPrompt.destroy();
      this.panel.destroy();
      this.detachVideoDensityListeners(this.video);
      this.video = null;
      this.playerContainer = null;
      this.cachedContext = null;
    }

    getDensityDurationSeconds() {
      const videoDuration = normalizeDensityDurationSeconds(this.video?.duration);
      return videoDuration || getCommentTimelineDurationSeconds(this.store.items);
    }

    getDensityControlState(comments = this.densityCandidateComments) {
      return resolveDensityLimitSettings(this.settings, this.getDensityDurationSeconds(), null, comments);
    }

    applyDensityDurationConstraints(changedKey = null, comments = this.densityCandidateComments) {
      const previousEmit = this.settings.maxEmitPerFrame;
      const previousScheduled = this.settings.maxScheduledComments;
      const resolved = resolveDensityLimitSettings(
        this.settings,
        this.getDensityDurationSeconds(),
        changedKey,
        comments
      );
      this.settings = resolved.settings;
      return (
        previousEmit !== this.settings.maxEmitPerFrame ||
        previousScheduled !== this.settings.maxScheduledComments
      );
    }

    attachVideoDensityListeners(video) {
      if (!video) {
        return;
      }
      video.addEventListener("loadedmetadata", this.handleVideoDurationChange);
      video.addEventListener("durationchange", this.handleVideoDurationChange);
    }

    detachVideoDensityListeners(video) {
      if (!video) {
        return;
      }
      video.removeEventListener("loadedmetadata", this.handleVideoDurationChange);
      video.removeEventListener("durationchange", this.handleVideoDurationChange);
    }

    handleVideoDurationChange() {
      if (this.destroyed) {
        return;
      }
      const changed = this.applyDensityDurationConstraints(null);
      if (changed && this.store.stats.count) {
        this.refreshVisibleComments({ clearOverlay: false });
        return;
      }
      this.panel.update();
    }

    bindVideo(video) {
      if (!video) {
        return;
      }
      const previousVideo = this.video;
      const isSameVideo = previousVideo === video;
      if (previousVideo && !isSameVideo) {
        this.detachVideoDensityListeners(previousVideo);
      }
      this.video = video;
      if (!isSameVideo) {
        this.attachVideoDensityListeners(video);
      }
      const densityChanged = this.applyDensityDurationConstraints(null);
      this.playerContainer = video.closest("section[player]") || video.parentElement || video;
      if (isSameVideo) {
        this.skipPrompt.attach(this.playerContainer);
        this.panel.attach(this.playerContainer, this.renderer.overlay);
        if (densityChanged && this.store.stats.count) {
          this.refreshVisibleComments({ clearOverlay: false });
        } else {
          this.panel.update();
        }
        return;
      }
      this.renderer.attach(this.playerContainer);
      this.skipPrompt.attach(this.playerContainer);
      this.panel.attach(this.playerContainer, this.renderer.overlay);
      this.scheduler.setVideo(video);
      if (densityChanged && this.store.stats.count) {
        this.refreshVisibleComments({ clearOverlay: false });
      } else {
        this.panel.update();
      }
    }

    saveSettings() {
      this.settings = normalizeSettings(this.settings);
      storageSet(SETTINGS_KEY, this.settings);
    }

    updateSetting(key, value) {
      let densityChangedKey = null;
      if (key === "enabled") {
        this.settings.enabled = !!value;
      } else if (key === "similarMergeEnabled") {
        this.settings.similarMergeEnabled = !!value;
        storageSet(SIMILAR_MERGE_OPT_IN_KEY, !!value);
      } else if (key === "densityPreferMergedComments") {
        this.settings.densityPreferMergedComments = !!value;
      } else if (key === "blockedKeywords" || key === "blockedRegexes") {
        this.settings[key] = normalizeStringList(value);
      } else if (key === "blockedModes") {
        this.settings.blockedModes = Object.assign({}, this.settings.blockedModes, value || {});
      } else {
        const limit = SETTING_LIMITS[key];
        if (!limit) {
          return;
        }
        this.settings[key] = clamp(safeNumber(value, this.settings[key]), limit.min, limit.max);
        if (key === "similarMergeMinCount" || key === "maxEmitPerFrame" || key === "maxScheduledComments") {
          this.settings[key] = Math.round(this.settings[key]);
        }
        if (key === "maxEmitPerFrame" || key === "maxScheduledComments") {
          densityChangedKey = key;
        }
      }
      if (densityChangedKey) {
        this.applyDensityDurationConstraints(densityChangedKey);
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
      this.applyDensityDurationConstraints(null);
      const filterResult = applyCommentFilters(this.store.items, this.settings);
      let scheduledComments = filterResult.comments;
      let mergeStats = makeSimilarMergeStats(
        getSimilarMergeConfig(this.settings),
        filterResult.comments.length,
        filterResult.comments.length,
        0,
        0
      );
      try {
        const mergeResult = mergeSimilarDanmaku(filterResult.comments, this.settings);
        scheduledComments = mergeResult.comments;
        mergeStats = mergeResult.stats;
      } catch (error) {
        console.warn("[AniChDanmaku] Similar merge skipped:", error);
      }
      this.densityCandidateComments = scheduledComments;
      this.applyDensityDurationConstraints(null, scheduledComments);
      const limitResult = limitScheduledDanmaku(scheduledComments, this.settings, this.getDensityDurationSeconds());
      scheduledComments = limitResult.comments;
      this.invalidRegexes = filterResult.invalidRegexes;
      this.store.setVisibilityStats(filterResult.comments.length);
      if (clearOverlay) {
        this.renderer.clear();
      }
      this.scheduler.setSkipCue(findFirstSkipCue(this.store.items));
      this.similarMergeStats = mergeStats;
      this.densityLimitStats = limitResult.stats;
      this.scheduler.setComments(scheduledComments);
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

    getBilibiliImportCache() {
      return storageGet(BILIBILI_IMPORT_CACHE_KEY, {});
    }

    saveBilibiliImportCache(cache) {
      storageSet(BILIBILI_IMPORT_CACHE_KEY, cache);
    }

    getBilibiliImportSeriesCache() {
      return storageGet(BILIBILI_IMPORT_SERIES_CACHE_KEY, {});
    }

    saveBilibiliImportSeriesCache(cache) {
      storageSet(BILIBILI_IMPORT_SERIES_CACHE_KEY, cache);
    }

    getBilibiliImportRecordMap(routeKey = this.route.routeKey) {
      return normalizeBilibiliImportRecordCollection(this.getBilibiliImportCache()[routeKey] || null);
    }

    getBilibiliImportRecords(routeKey = this.route.routeKey) {
      return sortBilibiliImportRecords(Object.values(this.getBilibiliImportRecordMap(routeKey)));
    }

    getBilibiliImportRecord(routeKey = this.route.routeKey, bindingKey = "") {
      const recordMap = this.getBilibiliImportRecordMap(routeKey);
      if (bindingKey) {
        return recordMap[normalizeSpace(bindingKey || "")] || null;
      }
      return pickPrimaryBilibiliImportRecord(Object.values(recordMap));
    }

    saveBilibiliImportRecord(routeKey, record, options = {}) {
      if (!routeKey || !record) {
        return null;
      }
      const normalized = normalizeBilibiliImportRecord(
        Object.assign({}, record, {
          updatedAt: Date.now(),
        })
      );
      if (!normalized?.bindingKey) {
        return null;
      }
      const cache = this.getBilibiliImportCache();
      const routeRecordMap = this.getBilibiliImportRecordMap(routeKey);
      routeRecordMap[normalized.bindingKey] = normalized;
      cache[routeKey] = routeRecordMap;
      this.saveBilibiliImportCache(cache);
      if (options.updateState !== false && routeKey === this.route.routeKey) {
        this.setBilibiliImportState(
          "ready",
          normalized.bindingMode === "derived"
            ? `已按同季映射规则恢复 ${formatBilibiliImportLabel(normalized)}`
            : `已导入 ${formatBilibiliImportLabel(normalized)}`,
          normalized,
          "",
          {
            activeBindingKey: normalized.bindingKey,
          }
        );
      }
      return normalized;
    }

    removeBilibiliImportRecord(routeKey, bindingKey, options = {}) {
      if (!routeKey || !bindingKey) {
        return null;
      }
      const normalizedBindingKey = normalizeSpace(bindingKey || "");
      const cache = this.getBilibiliImportCache();
      const routeRecordMap = this.getBilibiliImportRecordMap(routeKey);
      const removed = routeRecordMap[normalizedBindingKey] || null;
      if (!removed) {
        return null;
      }
      delete routeRecordMap[normalizedBindingKey];
      if (Object.keys(routeRecordMap).length) {
        cache[routeKey] = routeRecordMap;
      } else {
        delete cache[routeKey];
      }
      this.saveBilibiliImportCache(cache);
      if (options.updateState !== false && routeKey === this.route.routeKey) {
        this.bilibiliImport = this.getPendingBilibiliImportState();
        this.panel.update();
      }
      return removed;
    }

    getCurrentBilibiliImportRecordMap() {
      return this.getBilibiliImportRecordMap(this.route.routeKey);
    }

    getCurrentBilibiliImportRecords() {
      return this.getBilibiliImportRecords(this.route.routeKey);
    }

    getCurrentBilibiliImportRecord(bindingKey = "") {
      return this.getBilibiliImportRecord(this.route.routeKey, bindingKey);
    }

    saveCurrentBilibiliImportRecord(record, options = {}) {
      return this.saveBilibiliImportRecord(this.route.routeKey, record, options);
    }

    clearCurrentBilibiliImportRecord(options = {}) {
      const currentRecords = this.getCurrentBilibiliImportRecords();
      currentRecords.forEach((record) => {
        this.removeBilibiliImportRecord(this.route.routeKey, record.bindingKey, {
          updateState: false,
        });
      });
      if (options.updateState !== false) {
        this.bilibiliImport = this.getPendingBilibiliImportState();
        this.panel.update();
      }
    }

    getCurrentBilibiliSeriesKey(context = this.resolvePageContext()) {
      return getBilibiliSeriesKey(context);
    }

    getBilibiliImportSeriesRuleMap(seriesKey = this.getCurrentBilibiliSeriesKey()) {
      return normalizeBilibiliSeriesRuleCollection(this.getBilibiliImportSeriesCache()[seriesKey] || null, seriesKey);
    }

    getBilibiliImportSeriesRules(seriesKey = this.getCurrentBilibiliSeriesKey()) {
      return sortBilibiliSeriesRules(Object.values(this.getBilibiliImportSeriesRuleMap(seriesKey)));
    }

    getBilibiliImportSeriesRule(seriesKey = this.getCurrentBilibiliSeriesKey(), chainKey = "") {
      const ruleMap = this.getBilibiliImportSeriesRuleMap(seriesKey);
      if (chainKey) {
        return ruleMap[normalizeSpace(chainKey || "")] || null;
      }
      return sortBilibiliSeriesRules(Object.values(ruleMap))[0] || null;
    }

    saveBilibiliImportSeriesRule(seriesKey, rule) {
      const normalized = normalizeBilibiliSeriesRule(
        Object.assign({}, rule, {
          seriesKey: seriesKey || rule?.seriesKey || "",
          updatedAt: Date.now(),
        })
      );
      if (!normalized?.seriesKey || !normalized?.chainKey) {
        return null;
      }
      const cache = this.getBilibiliImportSeriesCache();
      const ruleMap = this.getBilibiliImportSeriesRuleMap(normalized.seriesKey);
      ruleMap[normalized.chainKey] = normalized;
      cache[normalized.seriesKey] = ruleMap;
      this.saveBilibiliImportSeriesCache(cache);
      return normalized;
    }

    clearBilibiliImportSeriesRule(seriesKey, chainKey = "") {
      if (!seriesKey) {
        return 0;
      }
      const cache = this.getBilibiliImportSeriesCache();
      if (!chainKey) {
        if (cache[seriesKey]) {
          delete cache[seriesKey];
          this.saveBilibiliImportSeriesCache(cache);
          return 1;
        }
        return 0;
      }
      const ruleMap = this.getBilibiliImportSeriesRuleMap(seriesKey);
      const normalizedChainKey = normalizeSpace(chainKey || "");
      if (!ruleMap[normalizedChainKey]) {
        return 0;
      }
      delete ruleMap[normalizedChainKey];
      if (Object.keys(ruleMap).length) {
        cache[seriesKey] = ruleMap;
      } else {
        delete cache[seriesKey];
      }
      this.saveBilibiliImportSeriesCache(cache);
      return 1;
    }

    clearDerivedBilibiliImportRecords(seriesKey, chainKey = "") {
      if (!seriesKey) {
        return 0;
      }
      const normalizedChainKey = normalizeSpace(chainKey || "");
      const cache = this.getBilibiliImportCache();
      let removed = 0;
      Object.entries(cache).forEach(([routeKey, routeValue]) => {
        const routeRecordMap = normalizeBilibiliImportRecordCollection(routeValue);
        Object.values(routeRecordMap).forEach((record) => {
          if (record.bindingMode !== "derived" || record.seriesKey !== seriesKey) {
            return;
          }
          if (normalizedChainKey && record.chainKey !== normalizedChainKey) {
            return;
          }
          delete routeRecordMap[record.bindingKey];
          removed += 1;
        });
        if (Object.keys(routeRecordMap).length) {
          cache[routeKey] = routeRecordMap;
        } else {
          delete cache[routeKey];
        }
      });
      if (removed) {
        this.saveBilibiliImportCache(cache);
      }
      return removed;
    }

    buildBilibiliSeriesRuleFromTarget(target, context, mergedRecord) {
      const currentEpisode = readPositiveInt(context?.parsedEpisode || context?.episode);
      const seriesKey = this.getCurrentBilibiliSeriesKey(context);
      if (!currentEpisode || !seriesKey) {
        return null;
      }
      if (target?.sourceType === "pgc" || mergedRecord?.sourceType === "pgc") {
        const anchorPgcEpId = readPositiveInt(mergedRecord?.pgcEpId || target?.pgcEpId);
        const anchorPgcEpisodeNumber = readPositiveInt(mergedRecord?.pgcEpisodeNumber || target?.pgcEpisodeNumber);
        const pgcSeasonId = readPositiveInt(mergedRecord?.pgcSeasonId || target?.pgcSeasonId) || null;
        if (!anchorPgcEpId && (!pgcSeasonId || !anchorPgcEpisodeNumber)) {
          return null;
        }
        const episodeOffset = anchorPgcEpisodeNumber ? anchorPgcEpisodeNumber - currentEpisode : anchorPgcEpId - currentEpisode;
        return normalizeBilibiliSeriesRule({
          sourceType: "pgc",
          seriesKey,
          chainKey: buildBilibiliPgcSeriesChainKey(pgcSeasonId, episodeOffset, anchorPgcEpId),
          normalizedTitleKey: context.normalizedTitleKey,
          season: context.season || 1,
          bvid: mergedRecord.bvid,
          pgcEpId: anchorPgcEpId,
          anchorPgcEpId,
          pgcEpisodeNumber: anchorPgcEpisodeNumber,
          anchorPgcEpisodeNumber,
          pgcSeasonId,
          title: mergedRecord.title,
          anchorEpisode: currentEpisode,
          anchorPage: 1,
          episodeOffset,
          anchorRouteKey: this.route.routeKey,
        });
      }
      if (!target?.pageExplicit) {
        return null;
      }
      const pageOffset = mergedRecord.page - currentEpisode;
      return normalizeBilibiliSeriesRule({
        sourceType: "video",
        seriesKey,
        chainKey: buildBilibiliSeriesChainKey(mergedRecord.bvid, pageOffset),
        normalizedTitleKey: context.normalizedTitleKey,
        season: context.season || 1,
        bvid: mergedRecord.bvid,
        title: mergedRecord.title,
        anchorEpisode: currentEpisode,
        anchorPage: mergedRecord.page,
        pageOffset,
        anchorRouteKey: this.route.routeKey,
      });
    }

    seedDerivedBilibiliImportRecords(seriesRule) {
      const normalizedRule = normalizeBilibiliSeriesRule(seriesRule);
      if (!normalizedRule?.seriesKey || !normalizedRule?.chainKey) {
        return 0;
      }
      this.clearDerivedBilibiliImportRecords(normalizedRule.seriesKey, normalizedRule.chainKey);
      const routeEntries = readAniChEpisodeRouteEntries(this.route);
      let seededCount = 0;
      routeEntries.forEach((entry) => {
        if (!entry?.routeKey || entry.routeKey === this.route.routeKey) {
          return;
        }
        const derivedRecord = buildDerivedBilibiliImportRecord(normalizedRule, entry);
        if (!derivedRecord?.bindingKey) {
          return;
        }
        const existingRecords = this.getBilibiliImportRecords(entry.routeKey);
        const hasExplicitConflict = existingRecords.some(
          (record) =>
            record.bindingMode === "explicit" &&
            (record.chainKey === derivedRecord.chainKey || record.bindingKey === derivedRecord.bindingKey)
        );
        if (hasExplicitConflict) {
          return;
        }
        this.saveBilibiliImportRecord(entry.routeKey, derivedRecord, {
          updateState: false,
        });
        seededCount += 1;
      });
      return seededCount;
    }

    buildCurrentSeriesDerivedBilibiliRecords(currentRecordMap = this.getCurrentBilibiliImportRecordMap()) {
      const context = this.resolvePageContext();
      const currentEpisode = readPositiveInt(context?.parsedEpisode || context?.episode);
      if (!currentEpisode) {
        return [];
      }
      const currentRecords = Object.values(currentRecordMap || {});
      const currentChainKeys = new Set(
        currentRecords
          .map((record) => normalizeSpace(record?.chainKey || ""))
          .filter(Boolean)
      );
      const seriesRules = this.getBilibiliImportSeriesRules(this.getCurrentBilibiliSeriesKey(context));
      const derivedRecords = [];
      seriesRules.forEach((rule) => {
        if (!rule?.chainKey || currentChainKeys.has(rule.chainKey)) {
          return;
        }
        const derivedRecord = buildDerivedBilibiliImportRecord(rule, {
          routeKey: this.route.routeKey,
          href: this.route.href,
          episode: currentEpisode,
        });
        if (!derivedRecord?.bindingKey) {
          return;
        }
        const hasExplicitConflict = currentRecords.some(
          (record) =>
            record.bindingMode === "explicit" &&
            (record.chainKey === derivedRecord.chainKey || record.bindingKey === derivedRecord.bindingKey)
        );
        if (hasExplicitConflict) {
          return;
        }
        derivedRecords.push(derivedRecord);
      });
      return sortBilibiliImportRecords(derivedRecords);
    }

    getEffectiveCurrentBilibiliImportRecords() {
      const currentRecordMap = this.getCurrentBilibiliImportRecordMap();
      const effectiveRecordMap = Object.assign({}, currentRecordMap);
      this.buildCurrentSeriesDerivedBilibiliRecords(currentRecordMap).forEach((record) => {
        if (!effectiveRecordMap[record.bindingKey]) {
          effectiveRecordMap[record.bindingKey] = record;
        }
      });
      return sortBilibiliImportRecords(Object.values(effectiveRecordMap));
    }

    getPendingBilibiliImportState() {
      const effectiveRecords = this.getEffectiveCurrentBilibiliImportRecords();
      if (effectiveRecords.length) {
        const explicitCount = effectiveRecords.filter((record) => record.bindingMode === "explicit").length;
        const currentRecordMap = this.getCurrentBilibiliImportRecordMap();
        const liveDerivedCount = effectiveRecords.filter(
          (record) => record.bindingMode === "derived" && !currentRecordMap[record.bindingKey]
        ).length;
        const primaryRecord = pickPrimaryBilibiliImportRecord(effectiveRecords);
        let message = `已缓存 ${effectiveRecords.length} 条 B 站导入，等待恢复`;
        if (!explicitCount) {
          message =
            liveDerivedCount === effectiveRecords.length
              ? `已缓存 ${effectiveRecords.length} 条同季映射规则，等待自动恢复`
              : `已缓存 ${effectiveRecords.length} 条同季映射自动推导，等待恢复`;
        }
        return {
          phase: "cached",
          message,
          record: primaryRecord,
          activeBindingKey: primaryRecord?.bindingKey || "",
          error: "",
        };
      }
      return {
        phase: "idle",
        message: "未导入",
        record: null,
        activeBindingKey: "",
        error: "",
      };
    }

    clearCurrentBilibiliImportBinding(bindingKey = "", options = {}) {
      const currentRecordMap = this.getCurrentBilibiliImportRecordMap();
      const effectiveRecords = this.getEffectiveCurrentBilibiliImportRecords();
      const targets = bindingKey
        ? effectiveRecords.filter((record) => record.bindingKey === normalizeSpace(bindingKey || ""))
        : effectiveRecords;
      const clearedChains = new Set();
      let removedBindings = 0;
      targets.forEach((record) => {
        if (!record?.bindingKey) {
          return;
        }
        if (currentRecordMap[record.bindingKey]) {
          this.removeBilibiliImportRecord(this.route.routeKey, record.bindingKey, {
            updateState: false,
          });
          removedBindings += 1;
        }
        if (record.seriesKey && record.chainKey) {
          const chainIdentity = `${record.seriesKey}::${record.chainKey}`;
          if (!clearedChains.has(chainIdentity)) {
            this.clearDerivedBilibiliImportRecords(record.seriesKey, record.chainKey);
            this.clearBilibiliImportSeriesRule(record.seriesKey, record.chainKey);
            clearedChains.add(chainIdentity);
          }
        }
      });
      if (options.updateState !== false) {
        this.bilibiliImport = this.getPendingBilibiliImportState();
        this.panel.update();
      }
      return {
        removedBindings,
        clearedChainCount: clearedChains.size,
      };
    }

    setBilibiliImportState(phase, message, record = null, error = "", extra = {}) {
      const normalizedRecord = normalizeBilibiliImportRecord(record);
      this.bilibiliImport = {
        phase,
        message,
        record: normalizedRecord,
        activeBindingKey: normalizeSpace(extra.activeBindingKey || normalizedRecord?.bindingKey || ""),
        error,
      };
      this.panel.update();
    }

    getBilibiliImportDebugState() {
      const currentRecordMap = this.getCurrentBilibiliImportRecordMap();
      const effectiveRecords = this.getEffectiveCurrentBilibiliImportRecords().map((record) => {
        const sourceLoaded = this.store.hasSource(getBilibiliImportSourceKey(record.bindingKey));
        const currentRecord = currentRecordMap[record.bindingKey] || null;
        const seriesRule =
          record.seriesKey && record.chainKey ? this.getBilibiliImportSeriesRule(record.seriesKey, record.chainKey) : null;
        const derivedStatus =
          record.bindingMode === "derived"
            ? sourceLoaded
              ? "restored"
              : currentRecord
              ? "derived-cache"
              : "series-rule"
            : "explicit";
        return Object.assign({}, record, {
          sourceKey: getBilibiliImportSourceKey(record.bindingKey),
          sourceLoaded,
          seriesRule,
          derivedStatus,
        });
      });
      const stateRecord = normalizeBilibiliImportRecord(this.bilibiliImport?.record);
      const requestedBindingKey = normalizeSpace(
        this.bilibiliImport?.activeBindingKey || stateRecord?.bindingKey || ""
      );
      const primaryRecord = pickPrimaryBilibiliImportRecord(effectiveRecords, requestedBindingKey);
      const activeRecord = primaryRecord || null;
      const sourceLoadedCount = effectiveRecords.filter((record) => record.sourceLoaded).length;
      const seriesRules = this.getBilibiliImportSeriesRules(this.getCurrentBilibiliSeriesKey());
      return Object.assign({}, this.bilibiliImport, {
        record: stateRecord || activeRecord,
        activeRecord,
        records: effectiveRecords,
        activeBindingKey: requestedBindingKey || activeRecord?.bindingKey || "",
        sourceLoaded: activeRecord ? !!activeRecord.sourceLoaded : false,
        sourceLoadedCount,
        bindingMode: activeRecord?.bindingMode || stateRecord?.bindingMode || null,
        derivedStatus: activeRecord?.derivedStatus || "none",
        seriesRule: activeRecord?.seriesRule || null,
        seriesRules,
        counts: {
          total: effectiveRecords.length,
          explicit: effectiveRecords.filter((record) => record.bindingMode === "explicit").length,
          derived: effectiveRecords.filter((record) => record.bindingMode === "derived").length,
          loaded: sourceLoadedCount,
          rules: seriesRules.length,
        },
      });
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
      const parsedEpisode = extractEpisodeNumber(pageTitle);
      const episode = parsedEpisode || this.route.episodeRouteId || null;
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
        parsedEpisode: parsedEpisode || null,
        hasParsedEpisode: !!parsedEpisode,
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
        this.clearCurrentBilibiliImportBinding("", {
          updateState: false,
        });
      }
      this.currentMatch = null;
      this.store.clearAll();
      this.renderer.clear();
      this.scheduler.setSkipCue(null);
      this.invalidRegexes = [];
      this.scheduler.setComments([]);
      if (removeCache) {
        const pendingImport = this.getPendingBilibiliImportState();
        this.setBilibiliImportState(pendingImport.phase, pendingImport.message, pendingImport.record, "");
      } else {
        const pendingImport = this.getPendingBilibiliImportState();
        this.setBilibiliImportState(pendingImport.phase, pendingImport.message, pendingImport.record, "");
      }
      this.setStatus(removeCache ? "已清除当前匹配" : "已移除当前匹配，准备重新匹配", removeCache ? "空闲" : "重试中");
      this.panel.update();
    }

    async resolveBilibiliImportInput(rawInput) {
      const parsed = parseBilibiliImportInput(rawInput);
      if (!parsed.shortLink) {
        return parsed;
      }
      const resolvedUrl = await this.bilibiliTransport.resolveShortLink(parsed.resolvedUrl, this);
      const resolved = parseBilibiliImportInput(resolvedUrl);
      return {
        rawInput: parsed.rawInput,
        resolvedUrl: resolved.resolvedUrl,
        sourceType: resolved.sourceType,
        bvid: resolved.bvid,
        pgcEpId: resolved.pgcEpId,
        pgcSeasonId: resolved.pgcSeasonId,
        pgcEpisodeNumber: resolved.pgcEpisodeNumber,
        page: resolved.page,
        pageExplicit: !!resolved.pageExplicit,
        pgcEpisodeExplicit: !!resolved.pgcEpisodeExplicit,
      };
    }

    ensureBaseDanmakuLoaded() {
      if (!this.currentMatch || !this.store.hasSource(DANDANPLAY_SOURCE_KEY)) {
        throw new Error("请先等待当前页面弹幕加载完成");
      }
    }

    removeLoadedBilibiliImportSources(bindingKeys = []) {
      const targetBindingKeys = Array.isArray(bindingKeys)
        ? bindingKeys
            .map((bindingKey) => normalizeSpace(bindingKey || ""))
            .filter(Boolean)
        : [];
      const sourceKeys = targetBindingKeys.length
        ? targetBindingKeys.map((bindingKey) => getBilibiliImportSourceKey(bindingKey))
        : Object.keys(this.store.stats?.sourceBreakdown || {}).filter(
            (sourceKey) =>
              sourceKey === BILIBILI_IMPORT_SOURCE_PREFIX ||
              sourceKey.startsWith(`${BILIBILI_IMPORT_SOURCE_PREFIX}:`)
          );
      sourceKeys.forEach((sourceKey) => {
        this.store.removeSource(sourceKey);
      });
    }

    collectBilibiliRestoreRecords() {
      const currentRecordMap = this.getCurrentBilibiliImportRecordMap();
      const restoreEntries = this.getCurrentBilibiliImportRecords().map((record) => ({
        record,
        mode: record.bindingMode === "derived" ? "restore-derived" : "restore-explicit",
      }));
      this.buildCurrentSeriesDerivedBilibiliRecords(currentRecordMap).forEach((record) => {
        restoreEntries.push({
          record,
          mode: "restore-series",
        });
      });
      return restoreEntries;
    }

    async applyBilibiliImportRecord(record, token, options = {}) {
      this.ensureBaseDanmakuLoaded();
      const mode = options.mode || "manual";
      const isDerivedRestore = mode === "restore-derived" || mode === "restore-series";
      const isRestore = mode !== "manual";
      const shouldUpdateState = options.updateState !== false;
      const shouldRefresh = options.refreshAfter !== false;
      const modeLabel = isDerivedRestore ? "自动恢复中" : isRestore ? "恢复中" : "导入中";
      const modeMessage = isDerivedRestore
        ? "正在按同季映射规则恢复 B 站弹幕..."
        : isRestore
        ? "正在恢复 B 站导入..."
        : "正在导入 B 站弹幕...";
      if (shouldUpdateState) {
        this.setBilibiliImportState(isRestore ? "restoring" : "loading", modeMessage, record || null, "", {
          activeBindingKey: record?.bindingKey || "",
        });
        this.setStatus(modeMessage, modeLabel);
      }

      const target = await this.resolveBilibiliImportInput(record?.rawInput || "");
      if (!this.isFresh(token)) {
        return false;
      }
      const videoMeta =
        target.sourceType === "pgc"
          ? await this.bilibiliTransport.resolvePgcEpisodeMeta(target, this)
          : await this.bilibiliTransport.resolveVideoMeta(target.bvid, this);
      if (!this.isFresh(token)) {
        return false;
      }
      const selectedPart = this.bilibiliTransport.pickCid(
        videoMeta.pages,
        videoMeta.sourceType === "pgc" ? 1 : target.page
      );
      const { comments, viewData } = await this.bilibiliTransport.fetchSegmentedDanmaku(
        {
          bvid: videoMeta.bvid,
          aid: videoMeta.aid,
          cid: selectedPart.cid,
          duration: videoMeta.duration,
          partDuration: selectedPart.duration,
          sessionEpisodeId: this.currentMatch?.episodeId ?? null,
        },
        this
      );
      if (!this.isFresh(token)) {
        return false;
      }
      const context = this.resolvePageContext();
      const nextSeriesRule = mode === "manual" ? this.buildBilibiliSeriesRuleFromTarget(target, context, {
        sourceType: videoMeta.sourceType,
        bvid: videoMeta.bvid,
        pgcEpId: videoMeta.pgcEpId,
        pgcSeasonId: videoMeta.pgcSeasonId,
        pgcEpisodeNumber: videoMeta.pgcEpisodeNumber,
        page: selectedPart.page,
        title: videoMeta.title,
      }) : null;
      const activeSeriesRule =
        nextSeriesRule
          ? this.saveBilibiliImportSeriesRule(nextSeriesRule.seriesKey, nextSeriesRule)
          : record?.seriesKey && record?.chainKey
          ? this.getBilibiliImportSeriesRule(record.seriesKey, record.chainKey)
          : null;
      const mergedRecord = normalizeBilibiliImportRecord({
        rawInput: record?.rawInput || target.rawInput,
        resolvedUrl: target.resolvedUrl || videoMeta.resolvedUrl,
        sourceType: videoMeta.sourceType || target.sourceType || "video",
        bvid: videoMeta.bvid,
        pgcEpId: videoMeta.pgcEpId || target.pgcEpId || null,
        pgcSeasonId: videoMeta.pgcSeasonId || target.pgcSeasonId || null,
        pgcEpisodeNumber: videoMeta.pgcEpisodeNumber || target.pgcEpisodeNumber || null,
        page: selectedPart.page,
        cid: selectedPart.cid,
        title: videoMeta.title,
        partTitle: selectedPart.part,
        commentCount: comments.length,
        availableCount: Math.max(safeNumber(viewData?.totalCount, 0), comments.length),
        totalCount: Math.max(safeNumber(videoMeta?.totalDanmakuCount, 0), comments.length),
        segmentCount: Math.max(1, safeNumber(viewData?.totalSegments, 0)),
        segmentDurationMs: Math.max(1000, safeNumber(viewData?.segmentDurationMs, 360000)),
        bindingKey:
          nextSeriesRule?.chainKey ||
          record?.bindingKey ||
          (videoMeta.sourceType === "pgc"
            ? buildBilibiliPgcStandaloneBindingKey(videoMeta.pgcEpId, videoMeta.pgcSeasonId, videoMeta.pgcEpisodeNumber)
            : buildBilibiliStandaloneBindingKey(videoMeta.bvid, selectedPart.page)),
        chainKey: normalizeSpace(nextSeriesRule?.chainKey || record?.chainKey || ""),
        bindingMode: record?.bindingMode === "derived" ? "derived" : "explicit",
        seriesKey: normalizeSpace(record?.seriesKey || ""),
        anchorEpisode: readPositiveInt(record?.anchorEpisode) || null,
        pageOffset: Number.isFinite(Number(record?.pageOffset)) ? Number(record.pageOffset) : null,
        episodeOffset: Number.isFinite(Number(record?.episodeOffset)) ? Number(record.episodeOffset) : null,
        derivedFromRouteKey: normalizeSpace(record?.derivedFromRouteKey || ""),
        updatedAt: Date.now(),
      });
      if (!mergedRecord) {
        throw new Error("无法生成有效的 B 站导入绑定");
      }
      if (nextSeriesRule) {
        mergedRecord.bindingKey = nextSeriesRule.chainKey;
        mergedRecord.chainKey = nextSeriesRule.chainKey;
        mergedRecord.bindingMode = "explicit";
        mergedRecord.seriesKey = nextSeriesRule.seriesKey;
        mergedRecord.anchorEpisode = nextSeriesRule.anchorEpisode;
        mergedRecord.pageOffset = nextSeriesRule.pageOffset;
        mergedRecord.episodeOffset = nextSeriesRule.episodeOffset;
        mergedRecord.pgcEpId = videoMeta.pgcEpId || mergedRecord.pgcEpId;
        mergedRecord.pgcSeasonId = videoMeta.pgcSeasonId || mergedRecord.pgcSeasonId;
        mergedRecord.pgcEpisodeNumber = videoMeta.pgcEpisodeNumber || mergedRecord.pgcEpisodeNumber;
        mergedRecord.derivedFromRouteKey = "";
      } else if (activeSeriesRule && mergedRecord.bindingMode === "explicit" && activeSeriesRule.chainKey === mergedRecord.chainKey) {
        mergedRecord.bindingKey = activeSeriesRule.chainKey;
        mergedRecord.seriesKey = activeSeriesRule.seriesKey;
        mergedRecord.anchorEpisode = activeSeriesRule.anchorEpisode;
        mergedRecord.pageOffset = activeSeriesRule.pageOffset;
        mergedRecord.episodeOffset = activeSeriesRule.episodeOffset;
      }
      const sourceKey = getBilibiliImportSourceKey(mergedRecord.bindingKey);
      this.store.replaceSource(sourceKey, comments, {
        label: `B站 ${formatBilibiliImportLabel(mergedRecord)}`,
        source: "bilibili",
        episodeId: this.currentMatch?.episodeId ?? null,
        rawInput: mergedRecord.rawInput,
        sourceType: mergedRecord.sourceType,
        bvid: mergedRecord.bvid,
        pgcEpId: mergedRecord.pgcEpId,
        pgcSeasonId: mergedRecord.pgcSeasonId,
        pgcEpisodeNumber: mergedRecord.pgcEpisodeNumber,
        page: mergedRecord.page,
        title: mergedRecord.title,
        partTitle: mergedRecord.partTitle,
        bindingKey: mergedRecord.bindingKey,
        chainKey: mergedRecord.chainKey,
        bindingMode: mergedRecord.bindingMode,
        seriesKey: mergedRecord.seriesKey,
        anchorEpisode: mergedRecord.anchorEpisode,
        pageOffset: mergedRecord.pageOffset,
        episodeOffset: mergedRecord.episodeOffset,
        derivedFromRouteKey: mergedRecord.derivedFromRouteKey,
        availableCount: mergedRecord.availableCount,
        totalCount: mergedRecord.totalCount,
        segmentCount: mergedRecord.segmentCount,
      });
      if (shouldRefresh) {
        this.refreshVisibleComments();
      }
      let seededCount = 0;
      if (nextSeriesRule) {
        seededCount = this.seedDerivedBilibiliImportRecords(nextSeriesRule);
      }
      const savedRecord = this.saveCurrentBilibiliImportRecord(mergedRecord, {
        updateState: false,
      });
      const importCountParts = [];
      if (mergedRecord.availableCount) {
        importCountParts.push(`接口可加载 ${mergedRecord.availableCount} 条`);
      }
      if (mergedRecord.totalCount) {
        importCountParts.push(`视频总数 ${mergedRecord.totalCount} 条`);
      }
      if (seededCount) {
        importCountParts.push(`预填 ${seededCount} 集映射`);
      }
      if (shouldUpdateState) {
        this.setBilibiliImportState(
          "ready",
          savedRecord.bindingMode === "derived"
            ? `已按同季映射规则恢复 ${formatBilibiliImportLabel(savedRecord)}`
            : `已导入 ${formatBilibiliImportLabel(savedRecord)}`,
          savedRecord,
          "",
          {
            activeBindingKey: savedRecord.bindingKey,
          }
        );
        this.setStatus(
          `${savedRecord.bindingMode === "derived" ? "已按同季映射规则叠加" : "已叠加"} B 站弹幕 ${comments.length} 条${importCountParts.length ? `（${importCountParts.join(" / ")}）` : ""}，当前共 ${this.store.stats.count} 条`,
          savedRecord.bindingMode === "derived" ? "自动恢复" : "已导入"
        );
      }
      this.panel.update();
      return {
        savedRecord,
        comments,
        sourceKey,
        seededCount,
        importCountParts,
      };
    }

    async importBilibiliFromInput(rawInput) {
      const token = this.token;
      const attemptedRecord = buildBilibiliAttemptRecord(rawInput);
      try {
        const result = await this.applyBilibiliImportRecord({ rawInput }, token, {
          mode: "manual",
        });
        return !!result;
      } catch (error) {
        if (this.isFresh(token)) {
          const pendingImport = this.getPendingBilibiliImportState();
          this.setBilibiliImportState(
            "error",
            `导入失败：${error.message || error}`,
            attemptedRecord || pendingImport.record,
            error.message || String(error),
            {
              activeBindingKey: attemptedRecord?.bindingKey || pendingImport.activeBindingKey,
            }
          );
          this.setStatus(`B 站导入失败：${error.message || error}`, "导入失败");
        }
        return false;
      }
    }

    clearBilibiliImport(removeCache = true, bindingKey = "") {
      const targets = bindingKey
        ? this.getEffectiveCurrentBilibiliImportRecords().filter(
            (record) => record.bindingKey === normalizeSpace(bindingKey || "")
          )
        : this.getEffectiveCurrentBilibiliImportRecords();
      this.removeLoadedBilibiliImportSources(targets.map((record) => record.bindingKey));
      this.refreshVisibleComments();
      if (removeCache) {
        const clearResult = this.clearCurrentBilibiliImportBinding(bindingKey, {
          updateState: false,
        });
        const pendingImport = this.getPendingBilibiliImportState();
        this.setBilibiliImportState(
          pendingImport.phase,
          pendingImport.message,
          pendingImport.record,
          "",
          {
            activeBindingKey: pendingImport.activeBindingKey,
          }
        );
        this.setStatus(
          bindingKey
            ? clearResult.clearedChainCount
              ? "已清除所选 B 站导入及同季映射"
              : "已清除所选 B 站导入"
            : clearResult.clearedChainCount
            ? "已清除当前集所有 B 站导入及同季映射"
            : "已清除当前集所有 B 站导入",
          "就绪"
        );
        return;
      }
      const pendingImport = this.getPendingBilibiliImportState();
      this.setBilibiliImportState(
        pendingImport.phase,
        pendingImport.message,
        pendingImport.record,
        "",
        {
          activeBindingKey: pendingImport.activeBindingKey,
        }
      );
      this.setStatus(
        targets.some((record) => record.bindingMode === "derived")
          ? "已移除 B 站导入，等待按同季映射规则恢复"
          : "已移除 B 站导入，等待恢复",
        "缓存"
      );
    }

    async restoreBilibiliImportIfNeeded(token) {
      const restoreEntries = this.collectBilibiliRestoreRecords();
      if (!restoreEntries.length) {
        this.removeLoadedBilibiliImportSources();
        const pendingImport = this.getPendingBilibiliImportState();
        this.setBilibiliImportState(
          pendingImport.phase,
          pendingImport.message,
          pendingImport.record,
          "",
          {
            activeBindingKey: pendingImport.activeBindingKey,
          }
        );
        return false;
      }
      const primaryPendingRecord = pickPrimaryBilibiliImportRecord(restoreEntries.map((entry) => entry.record));
      this.setBilibiliImportState(
        "restoring",
        `正在恢复 ${restoreEntries.length} 条 B 站导入...`,
        primaryPendingRecord,
        "",
        {
          activeBindingKey: primaryPendingRecord?.bindingKey || "",
        }
      );
      this.setStatus(`正在恢复 ${restoreEntries.length} 条 B 站导入...`, "恢复中");

      const restoredRecords = [];
      const skippedRecords = [];
      const failedEntries = [];

      for (const entry of restoreEntries) {
        try {
          const result = await this.applyBilibiliImportRecord(entry.record, token, {
            mode: entry.mode,
            updateState: false,
            refreshAfter: false,
          });
          if (!this.isFresh(token)) {
            return false;
          }
          restoredRecords.push(result.savedRecord);
        } catch (error) {
          if (!this.isFresh(token)) {
            return false;
          }
          const message = error?.message || String(error);
          const isMissingPage =
            entry.record.bindingMode === "derived" &&
            (/未找到 P\d+/.test(String(message)) ||
              ((entry.record.sourceType === "pgc" || entry.record.pgcEpId) &&
                /(?:未找到 ep\d+|番剧分集|不存在|啥都木有)/.test(String(message))));
          if (entry.mode === "restore-derived") {
            this.removeBilibiliImportRecord(this.route.routeKey, entry.record.bindingKey, {
              updateState: false,
            });
          }
          this.removeLoadedBilibiliImportSources([entry.record.bindingKey]);
          if (isMissingPage) {
            skippedRecords.push({
              record: entry.record,
              message,
            });
          } else {
            failedEntries.push({
              record: entry.record,
              message,
            });
          }
        }
      }

      if (!this.isFresh(token)) {
        return false;
      }
      this.refreshVisibleComments({ clearOverlay: false });

      if (restoredRecords.length) {
        const primaryRecord = pickPrimaryBilibiliImportRecord(restoredRecords);
        const restoreSummary = [`已恢复 ${restoredRecords.length} 条 B 站导入`];
        if (skippedRecords.length) {
          restoreSummary.push(`跳过 ${skippedRecords.length} 条失效映射`);
        }
        if (failedEntries.length) {
          restoreSummary.push(`失败 ${failedEntries.length} 条`);
        }
        this.setBilibiliImportState(
          "ready",
          restoreSummary.join("，"),
          primaryRecord,
          failedEntries.map((entry) => entry.message).join("\n"),
          {
            activeBindingKey: primaryRecord?.bindingKey || "",
          }
        );
        this.setStatus(
          `${restoreSummary.join("，")}，当前共 ${this.store.stats.count} 条弹幕`,
          skippedRecords.length || failedEntries.length ? "部分恢复" : "自动恢复"
        );
        return true;
      }

      if (skippedRecords.length) {
        const pendingImport = this.getPendingBilibiliImportState();
        this.setBilibiliImportState(
          pendingImport.phase,
          `当前集未命中有效映射，已跳过 ${skippedRecords.length} 条自动导入`,
          pendingImport.record,
          skippedRecords.map((entry) => entry.message).join("\n"),
          {
            activeBindingKey: pendingImport.activeBindingKey,
          }
        );
        this.setStatus(`当前集未命中有效映射，已跳过 ${skippedRecords.length} 条自动导入`, "已跳过");
        return false;
      }

      if (failedEntries.length) {
        const primaryFailure = failedEntries[0];
        this.setBilibiliImportState(
          "error",
          `恢复失败：${primaryFailure.message}`,
          primaryFailure.record,
          failedEntries.map((entry) => entry.message).join("\n"),
          {
            activeBindingKey: primaryFailure.record?.bindingKey || "",
          }
        );
        this.setStatus(`B 站导入恢复失败：${primaryFailure.message}`, "导入失败");
      }
      return false;
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
            this.store.clearAll();
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
      this.store.replaceSource(DANDANPLAY_SOURCE_KEY, comments, {
        label: response.endpoint.sourceName || match.sourceName || "弹弹 Play",
        source: response.endpoint.sourceName || match.sourceName || "dandanplay",
        episodeId: match.episodeId,
      });
      this.refreshVisibleComments();
      const restored = await this.restoreBilibiliImportIfNeeded(token);
      if (!restored && this.isFresh(token)) {
        this.setStatus(`已加载 ${this.store.stats.count} 条弹幕`, "就绪");
      }
      this.panel.update();
    }
  }

  class AniChDanmakuApp {
    constructor() {
      this.transport = new DandanplayTransport(this);
      this.bilibiliTransport = new BilibiliTransport(this);
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
      const debugApi = {
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
                similarMerge: this.activeSession.similarMergeStats,
                densityLimit: this.activeSession.densityLimitStats,
                schedulerDensity: this.activeSession.scheduler.getDensityDebugState(),
                invalidRegexes: this.activeSession.invalidRegexes,
                imports: {
                  bilibili: this.activeSession.getBilibiliImportDebugState(),
                },
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
        clearImport: () => this.activeSession?.clearBilibiliImport(true),
        importBilibili: (input) => this.activeSession?.importBilibiliFromInput(input),
        toggle: () => {
          if (!this.activeSession) {
            return null;
          }
          this.activeSession.updateSetting("enabled", !this.activeSession.settings.enabled);
          return this.activeSession.settings.enabled;
        },
      };
      window[DEBUG_NAMESPACE] = debugApi;
      const page = getPageWindow();
      if (page && page !== window) {
        page[DEBUG_NAMESPACE] = debugApi;
      }
    }
  }

  try {
    new AniChDanmakuApp();
  } catch (error) {
    console.error("[AniChDanmaku]", error);
  }
})();
