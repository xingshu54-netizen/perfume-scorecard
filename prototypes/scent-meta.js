/**
 * 十支试香手账 — 共享气味美学元数据、专属瓶身 SVG 与本地持久化适配层
 * 依赖先加载 ../scripts/data.js (window.PERFUME_CATALOG)
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "perfume_scorecard_v1";
  var CATALOG = Array.isArray(global.PERFUME_CATALOG) ? global.PERFUME_CATALOG : [];

  var SCENT_PROFILES = {
    "hermes-terre": {
      palette: { primary: "#9C4A2F", soft: "#F6ECE6", aura: "#C66B47", darkCard: "#211613" },
      notes: { top: "葡萄柚 · 甜橙", heart: "胡椒 · 天竺葵", base: "雪松 · 香根草 · 安息香" },
      poetic: "雨后踩碎橘皮与雪松木的干练暖意，像穿起你的大衣"
    },
    "jo-malone-wild-bluebell": {
      palette: { primary: "#3E6B89", soft: "#EAF1F5", aura: "#5D92B6", darkCard: "#131C24" },
      notes: { top: "风铃草 · 丁香", heart: "铃兰 · 茉莉 · 玫瑰果", base: "白龙涎香 · 白麝香" },
      poetic: "冰镇西瓜露遇上清晨露水野花，透亮得像夏夜穿裙子的风"
    },
    "prada-paradoxe": {
      palette: { primary: "#9E5640", soft: "#F7ECE8", aura: "#CA7A61", darkCard: "#231715" },
      notes: { top: "香梨 · 蜜橘 · 佛手柑", heart: "橙花 · 沙巴茉莉", base: "波旁香草 · 白麝香 · 琥珀" },
      poetic: "清甜脆梨融进奶暖橙花里，温柔又带点小俏皮"
    },
    "armani-my-way": {
      palette: { primary: "#B04E64", soft: "#F9ECEF", aura: "#D46E85", darkCard: "#241419" },
      notes: { top: "佛手柑 · 埃及橙花", heart: "晚香玉 · 印度茉莉", base: "马达加斯加香草 · 白麝香" },
      poetic: "阳光晒透的白花蜜与香草，明媚得像牵手去约会的下午"
    },
    "versace-bright-crystal": {
      palette: { primary: "#B85C72", soft: "#FAEEF1", aura: "#DF7D95", darkCard: "#24151A" },
      notes: { top: "日本柚子 · 冰感石榴", heart: "牡丹 · 木兰 · 莲花", base: "桃花心木 · 琥珀 · 麝香" },
      poetic: "冰镇石榴果汁混合浅粉牡丹，干净甜美、怎么喷都不出错"
    },
    "ysl-mon-paris": {
      palette: { primary: "#8F3B52", soft: "#F6E9ED", aura: "#BE5773", darkCard: "#221218" },
      notes: { top: "草莓 · 树莓 · 香梨", heart: "曼陀罗 · 牡丹 · 橙花", base: "广藿香 · 白麝香 · 龙涎香" },
      poetic: "微醺莓果跌进夜风里的热恋甜意，自带让人回头的气场"
    },
    "chanel-no5": {
      palette: { primary: "#A37E38", soft: "#F7F2E6", aura: "#CCA252", darkCard: "#201B12" },
      notes: { top: "乙醛 · 橙花 · 依兰", heart: "五月玫瑰 · 格拉斯茉莉", base: "檀香木 · 香根草 · 香草" },
      poetic: "复古电影里的丝缎玫瑰与粉感暖意，越到后调越贴肤迷人"
    },
    "guerlain-mandarine-basilic": {
      palette: { primary: "#557A46", soft: "#ECF2E8", aura: "#76A064", darkCard: "#141D13" },
      notes: { top: "克莱门氏小橘 · 苦橙", heart: "罗勒叶 · 绿茶 · 牡丹", base: "檀香 · 琥珀" },
      poetic: "刚剥开鲜橘子溅出的清脆汁水，混着揉碎罗勒叶的草本光感"
    },
    "dior-jadore": {
      palette: { primary: "#B27E32", soft: "#F8F1E4", aura: "#D8A14F", darkCard: "#221A11" },
      notes: { top: "香梨 · 香瓜 · 桃子", heart: "大马士革玫瑰 · 晚香玉", base: "麝香 · 香草 · 黑莓 · 雪松" },
      poetic: "鎏金丝绸包裹住丰盛花果，亮眼大方又温柔的聚光灯主角"
    },
    "bvlgari-pour-homme": {
      palette: { primary: "#4E6C64", soft: "#EAF0EE", aura: "#6E9289", darkCard: "#131C1A" },
      notes: { top: "大吉岭茶 · 睡莲 · 佛手柑", heart: "愈创木 · 黑胡椒 · 小豆蔻", base: "透明麝香 · 雪松" },
      poetic: "刚熨好的白衬衫裹着清冽茶香，像靠在你肩上的干净少年感"
    }
  };

  function padIndex(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getMergedItems() {
    return CATALOG.map(function (item) {
      var profile = SCENT_PROFILES[item.id] || {
        palette: { primary: "#8A5A4D", soft: "#F4ECE8", aura: "#B27A6A", darkCard: "#1D1715" },
        notes: {
          top: item.tastingGuide.keywords.slice(0, 2).join(" · "),
          heart: item.tastingGuide.keywords.slice(2).join(" · ") || item.tastingGuide.scentFamily,
          base: item.tastingGuide.scentFamily
        },
        poetic: item.tastingGuide.styleHint
      };
      return {
        id: item.id,
        index: item.index,
        indexLabel: padIndex(item.index),
        brandZh: item.brandZh,
        brandEn: item.brandEn,
        nameZh: item.nameZh,
        nameEn: item.nameEn,
        specs: item.specs,
        totalVolumeMl: item.totalVolumeMl,
        totalCount: item.totalCount,
        orderSources: item.orderSources,
        isMerged: item.specs.length > 1,
        isUncertain: item.specs.some(function (s) { return !!s.quantityUncertain; }),
        scentFamily: item.tastingGuide.scentFamily,
        palette: profile.palette,
        notes: profile.notes,
        poetic: profile.poetic
      };
    });
  }

  function formatSpecSummary(item, confirmedQty) {
    if (item.isMerged) {
      return "0.5ml×1 + 1ml×2 · 共 3 支 2.5ml（跨单合并）";
    }
    if (item.isUncertain) {
      if (confirmedQty === 1) return "1ml ×1 · 已确认 1 支（截图1）";
      if (confirmedQty === 2) return "1ml ×2 · 已确认 2 支（截图1）";
      return "1ml · 数量待确认（原图被遮挡 · 疑×2）";
    }
    var spec = item.specs[0];
    return spec.volumeMl + "ml ×" + spec.quantity + " · 共 " + item.totalCount + " 支 " + item.totalVolumeMl + "ml";
  }

  function formatCompactSpec(item, confirmedQty) {
    if (item.isMerged) return "0.5ml×1 + 1ml×2 · 3支";
    if (item.isUncertain) {
      if (confirmedQty === 1 || confirmedQty === 2) return "1ml ×" + confirmedQty;
      return "1ml · 待确认";
    }
    var spec = item.specs[0];
    return spec.volumeMl + "ml ×" + spec.quantity;
  }

  /**
   * 依据 10 款香水的标志性瓶身轮廓生成高精度矢量插画 SVG
   */
  function renderBottleSvg(id, options) {
    var opts = options || {};
    var profile = SCENT_PROFILES[id] || { palette: { primary: "#888", aura: "#AAA" } };
    var stroke = opts.stroke || "currentColor";
    var tint = opts.tint || profile.palette.aura;
    var tintOpacity = typeof opts.tintOpacity === "number" ? opts.tintOpacity : 0.24;
    var uid = (opts.uid || id) + "-" + Math.floor(Math.random() * 100000);
    var body = "";

    switch (id) {
      case "hermes-terre":
        body =
          '<rect x="48" y="16" width="24" height="16" rx="2" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<path d="M51 32h18l2 8H49l2-8z" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<rect x="30" y="40" width="60" height="84" rx="5" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="34" y="54" width="52" height="62" rx="3" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<path d="M36 124h48" stroke="' + stroke + '" stroke-width="2.4" stroke-linecap="round"/>' +
          '<line x1="48" y1="22" x2="72" y2="22" stroke="' + stroke + '" stroke-width="1.2"/>' +
          '<line x1="40" y1="50" x2="40" y2="112" stroke="' + stroke + '" stroke-opacity="0.35" stroke-width="1.2" stroke-linecap="round"/>';
        break;

      case "jo-malone-wild-bluebell":
        body =
          '<path d="M47 22c0-7 26-7 26 0v14H47V22z" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<rect x="52" y="36" width="16" height="7" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<rect x="36" y="43" width="48" height="81" rx="3" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="40" y="53" width="40" height="67" rx="2" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<rect x="43" y="65" width="34" height="36" rx="1.5" fill="none" stroke="' + stroke + '" stroke-width="1.2"/>' +
          '<line x1="49" y1="77" x2="71" y2="77" stroke="' + stroke + '" stroke-width="1.1"/>' +
          '<line x1="53" y1="84" x2="67" y2="84" stroke="' + stroke + '" stroke-width="1.1" stroke-opacity="0.6"/>';
        break;

      case "prada-paradoxe":
        body =
          '<rect x="52" y="18" width="16" height="14" rx="2" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<path d="M26 42 L94 42 L66 124 Q60 130 54 124 Z" stroke="' + stroke + '" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<path d="M33 49 L87 49 L64 115 Q60 120 56 115 Z" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<path d="M46 62 L74 62 L60 94 Z" stroke="' + stroke + '" stroke-width="1.2" fill="none"/>';
        break;

      case "armani-my-way":
        body =
          '<ellipse cx="60" cy="24" rx="15" ry="11" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<rect x="51" y="35" width="18" height="7" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<rect x="31" y="42" width="58" height="82" rx="14" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="35" y="52" width="50" height="68" rx="10" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<path d="M51 38h18" stroke="' + stroke + '" stroke-width="1.2"/>' +
          '<line x1="41" y1="56" x2="41" y2="108" stroke="' + stroke + '" stroke-opacity="0.35" stroke-width="1.2" stroke-linecap="round"/>';
        break;

      case "versace-bright-crystal":
        body =
          '<polygon points="44,18 76,18 82,29 74,40 46,40 38,29" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<line x1="44" y1="18" x2="53" y2="40" stroke="' + stroke + '" stroke-width="1.1" stroke-opacity="0.5"/>' +
          '<line x1="76" y1="18" x2="67" y2="40" stroke="' + stroke + '" stroke-width="1.1" stroke-opacity="0.5"/>' +
          '<rect x="52" y="40" width="16" height="6" stroke="' + stroke + '" stroke-width="1.3"/>' +
          '<rect x="30" y="46" width="60" height="78" rx="4" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="34" y="54" width="52" height="65" rx="2" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<circle cx="60" cy="84" r="10" stroke="' + stroke + '" stroke-width="1.1" stroke-opacity="0.55" fill="none"/>';
        break;

      case "ysl-mon-paris":
        body =
          '<rect x="50" y="16" width="20" height="16" rx="2" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<path d="M46 37c-7-4-11 0-11 4s5 5 11 1l14-3 14 3c6 4 11 3 11-1s-4-8-11-4l-14 3-14-3z" stroke="' + stroke + '" stroke-width="1.3" fill="none"/>' +
          '<path d="M35 45h50l7 32-11 47H39L28 77l7-32z" stroke="' + stroke + '" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<path d="M38 54h44l5 23-9 42H42l-9-42 5-23z" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>';
        break;

      case "chanel-no5":
        body =
          '<polygon points="48,16 72,16 76,22 76,34 44,34 44,22" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<rect x="52" y="34" width="16" height="7" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<rect x="30" y="41" width="60" height="83" rx="4" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="34" y="52" width="52" height="67" rx="2" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<rect x="42" y="64" width="36" height="36" fill="none" stroke="' + stroke + '" stroke-width="1.2"/>' +
          '<line x1="50" y1="78" x2="70" y2="78" stroke="' + stroke + '" stroke-width="1.2"/>' +
          '<line x1="55" y1="86" x2="65" y2="86" stroke="' + stroke + '" stroke-width="1.1"/>';
        break;

      case "guerlain-mandarine-basilic":
        body =
          '<circle cx="60" cy="24" r="9" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<rect x="52" y="33" width="16" height="8" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<path d="M36 62c0-15 11-21 24-21s24 6 24 21v54c0 5-4 8-9 8H45c-5 0-9-3-9-8V62z" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<path d="M40 66c0-12 9-17 20-17s20 5 20 17v48c0 3-2 5-5 5H45c-3 0-5-2-5-5V66z" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<path d="M42 57h36M38 66h44" stroke="' + stroke + '" stroke-width="1" stroke-opacity="0.45"/>' +
          '<rect x="46" y="75" width="28" height="24" rx="2" stroke="' + stroke + '" stroke-width="1.2" fill="none"/>';
        break;

      case "dior-jadore":
        body =
          '<circle cx="60" cy="18" r="6" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<path d="M51 24h18l-2 22H53l-2-22z" stroke="' + stroke + '" stroke-width="1.4"/>' +
          '<path d="M52 29h16M52 34h16M53 39h14" stroke="' + stroke + '" stroke-width="1.1" stroke-opacity="0.7"/>' +
          '<path d="M53 46c-17 14-23 36-21 56 2 14 13 22 28 22s26-8 28-22c2-20-4-42-21-56H53z" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<path d="M53 55c-12 12-17 29-15 45 2 11 10 18 22 18s20-7 22-18c2-16-3-33-15-45H53z" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>';
        break;

      case "bvlgari-pour-homme":
      default:
        body =
          '<rect x="52" y="16" width="16" height="14" rx="2" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<path d="M35 34h50c3 0 5 3 5 7v5H30v-5c0-4 2-7 5-7z" stroke="' + stroke + '" stroke-width="1.5"/>' +
          '<rect x="30" y="46" width="60" height="78" rx="4" stroke="' + stroke + '" stroke-width="1.6"/>' +
          '<rect x="34" y="54" width="52" height="65" rx="2" fill="' + tint + '" fill-opacity="' + tintOpacity + '"/>' +
          '<line x1="42" y1="62" x2="78" y2="62" stroke="' + stroke + '" stroke-width="1.2" stroke-opacity="0.5"/>';
        break;
    }

    return (
      '<svg class="bottle-svg" id="bottle-' + uid + '" viewBox="0 0 120 144" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      body +
      "</svg>"
    );
  }

  function createEmptyReview(perfumeId) {
    return {
      perfumeId: perfumeId,
      status: "untested",
      overallScore: null,
      buyIntent: null,
      confirmedQuantity: null,
      dimensions: {
        openingLike: null,
        drydownLike: null,
        longevity: null,
        sillage: null
      },
      sceneTags: [],
      note: "",
      testedAt: null,
      updatedAt: null
    };
  }

  function loadState() {
    var base = {
      schemaVersion: "1.0.0",
      updatedAt: null,
      reviews: {}
    };
    try {
      var raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.reviews) {
          base = parsed;
        }
      }
    } catch (e) {
      // file:// 或隐私模式下回落到内存态
    }
    return base;
  }

  function saveState(state) {
    state.updatedAt = new Date().toISOString();
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      // 忽略沙盒写入限制
    }
  }

  function getReview(state, perfumeId) {
    if (!state.reviews[perfumeId]) {
      state.reviews[perfumeId] = createEmptyReview(perfumeId);
    }
    return state.reviews[perfumeId];
  }

  function updateReview(state, perfumeId, patch) {
    var r = getReview(state, perfumeId);
    var now = new Date().toISOString();
    if ("overallScore" in patch) {
      r.overallScore = patch.overallScore;
      if (typeof r.overallScore === "number") {
        r.status = "tested";
        if (!r.testedAt) r.testedAt = now;
      } else {
        r.status = "untested";
      }
    }
    if ("buyIntent" in patch) r.buyIntent = patch.buyIntent;
    if ("confirmedQuantity" in patch) r.confirmedQuantity = patch.confirmedQuantity;
    if ("note" in patch) r.note = patch.note;
    r.updatedAt = now;
    saveState(state);
    return r;
  }

  function scoreMood(score) {
    if (typeof score !== "number") return "滑动或轻点打分";
    if (score >= 9.5) return "本命香！好闻到想立刻收正装";
    if (score >= 8.5) return "超级心动，约会首选这一支";
    if (score >= 7.0) return "很喜欢，平时会常喷";
    if (score >= 5.5) return "还不错，看心情轮流用";
    return "不太是我的菜，礼貌Pass";
  }

  function formatScore(score) {
    if (typeof score !== "number") return "--";
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  }

  function computeStats(items, state) {
    var tested = [];
    var mustBuy = [];
    var sum = 0;
    items.forEach(function (item) {
      var r = getReview(state, item.id);
      if (typeof r.overallScore === "number") {
        tested.push({ item: item, review: r });
        sum += r.overallScore;
      }
      if (r.buyIntent === "must_buy") {
        mustBuy.push({ item: item, review: r });
      }
    });
    tested.sort(function (a, b) {
      var aMust = a.review.buyIntent === "must_buy" ? 1 : 0;
      var bMust = b.review.buyIntent === "must_buy" ? 1 : 0;
      if (b.review.overallScore !== a.review.overallScore) {
        return b.review.overallScore - a.review.overallScore;
      }
      if (bMust !== aMust) return bMust - aMust;
      return a.item.index - b.item.index;
    });
    return {
      testedCount: tested.length,
      mustBuyCount: mustBuy.length,
      avgText: tested.length ? (sum / tested.length).toFixed(1) : "--",
      top3: tested.slice(0, 3),
      mustBuyList: mustBuy
    };
  }

  function buildWishlistText(items, state) {
    var stats = computeStats(items, state);
    var lines = ["【给你的试香结果与正装许愿单】"];
    lines.push("已试进度：" + stats.testedCount + " / " + items.length + " 支  |  均分：" + stats.avgText);
    if (stats.mustBuyList.length) {
      lines.push("");
      lines.push("想收正装（" + stats.mustBuyList.length + " 支）：");
      stats.mustBuyList.forEach(function (entry) {
        var scoreStr = typeof entry.review.overallScore === "number" ? "（" + formatScore(entry.review.overallScore) + "分）" : "";
        var noteStr = entry.review.note ? " — " + entry.review.note : "";
        lines.push("- " + entry.item.brandZh + " " + entry.item.nameZh + scoreStr + noteStr);
      });
    }
    if (stats.top3.length) {
      lines.push("");
      lines.push("心动 Top 3：");
      stats.top3.forEach(function (entry, idx) {
        lines.push((idx + 1) + ". " + entry.item.brandZh + " " + entry.item.nameZh + " · " + formatScore(entry.review.overallScore) + " 分");
      });
    }
    lines.push("");
    lines.push("全 10 支明细：");
    items.forEach(function (item) {
      var r = getReview(state, item.id);
      var s = typeof r.overallScore === "number" ? formatScore(r.overallScore) + "/10" : "待试";
      var intent = r.buyIntent === "must_buy" ? " [正装锁定]" : r.buyIntent === "retest" ? " [再试试]" : r.buyIntent === "pass" ? " [不合拍]" : "";
      lines.push(item.indexLabel + ". " + item.brandZh + " " + item.nameZh + "（" + formatCompactSpec(item, r.confirmedQuantity) + "）：" + s + intent + (r.note ? " — " + r.note : ""));
    });
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }

  global.SCENT_STUDIO = {
    getMergedItems: getMergedItems,
    formatSpecSummary: formatSpecSummary,
    formatCompactSpec: formatCompactSpec,
    renderBottleSvg: renderBottleSvg,
    loadState: loadState,
    saveState: saveState,
    getReview: getReview,
    updateReview: updateReview,
    scoreMood: scoreMood,
    formatScore: formatScore,
    computeStats: computeStats,
    buildWishlistText: buildWishlistText,
    copyText: copyText,
    escapeHtml: escapeHtml
  };
})(window);
