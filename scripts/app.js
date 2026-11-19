/**
 * 十支寻香签 — 法式沙龙试香手账交互逻辑、持久化与战报长图导出
 */
(function () {
  "use strict";

  var STORAGE_KEY = "perfume_scorecard_v2";
  var LEGACY_KEY = "perfume_scorecard_v1";

  var CATALOG = Array.isArray(window.PERFUME_CATALOG) ? window.PERFUME_CATALOG : [];
  var BOTTLE_IMAGES = window.PERFUME_BOTTLE_IMAGES || {};

  var SUB_DIMENSIONS = [
    {
      key: "opening",
      label: "前调初印象",
      options: ["微冲", "顺鼻好闻", "一闻惊艳"]
    },
    {
      key: "drydown",
      label: "后调耐闻度",
      options: ["平淡", "越闻越爱", "上头贴肤"]
    },
    {
      key: "longevity",
      label: "留香持久度",
      options: ["偏短", "半天适中", "持香超久"]
    }
  ];

  var HEART_PATH =
    "M12 20.5s-7.4-4.6-9.8-8.9A5.4 5.4 0 0 1 12 6.2a5.4 5.4 0 0 1 9.8 5.4C19.4 15.9 12 20.5 12 20.5z";

  var state = loadState();
  var currentView = "deck";
  var currentIndex = 0;
  var activeTabs = {};
  var toastTimer = null;

  var deckEl = document.getElementById("deck-view");
  var indexEl = document.getElementById("index-view");
  var topProgressEl = document.getElementById("top-progress");
  var wishCountEl = document.getElementById("wish-count");
  var sheetEl = document.getElementById("wish-sheet");
  var backdropEl = document.getElementById("sheet-backdrop");
  var sheetBodyEl = document.getElementById("sheet-body");
  var resetStripEl = document.getElementById("reset-confirm-strip");
  var toastEl = document.getElementById("toast");

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function padIndex(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function createEmptyReview(perfumeId) {
    return {
      perfumeId: perfumeId,
      overallScore: null,
      buyIntent: null,
      opening: null,
      drydown: null,
      longevity: null,
      note: "",
      updatedAt: null
    };
  }

  function loadState() {
    var base = { schemaVersion: "2.0.0", updatedAt: null, reviews: {} };
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.reviews) {
          return parsed;
        }
      }
      // 兼容迁移 v1 已记录的分数、正装心愿与笔记
      var legacyRaw = window.localStorage ? window.localStorage.getItem(LEGACY_KEY) : null;
      if (legacyRaw) {
        var legacy = JSON.parse(legacyRaw);
        if (legacy && typeof legacy === "object" && legacy.reviews) {
          Object.keys(legacy.reviews).forEach(function (pid) {
            var lr = legacy.reviews[pid];
            if (!lr) return;
            var r = createEmptyReview(pid);
            if (typeof lr.overallScore === "number") {
              r.overallScore = Math.max(1, Math.min(10, Math.round(lr.overallScore)));
            }
            if (lr.buyIntent === "must_buy") r.buyIntent = "must_buy";
            if (typeof lr.note === "string") r.note = lr.note;
            r.updatedAt = lr.updatedAt || null;
            base.reviews[pid] = r;
          });
          return base;
        }
      }
    } catch (e) {
      // 隐私模式或限制环境使用内存状态
    }
    return base;
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      // 忽略存储限制
    }
  }

  function getReview(id) {
    if (!state.reviews[id]) {
      state.reviews[id] = createEmptyReview(id);
    }
    return state.reviews[id];
  }

  function isItemTested(r) {
    return (
      typeof r.overallScore === "number" ||
      r.buyIntent === "must_buy" ||
      Boolean(r.opening || r.drydown || r.longevity) ||
      Boolean(r.note && r.note.trim())
    );
  }

  function updateReview(id, patch) {
    var r = getReview(id);
    Object.keys(patch).forEach(function (k) {
      r[k] = patch[k];
    });
    r.updatedAt = new Date().toISOString();
    saveState();
    return r;
  }

  function formatScore(score) {
    if (typeof score !== "number") return "--";
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  }

  function scoreMood(score) {
    if (typeof score !== "number") return "滑动或轻点爱心打分";
    if (score >= 9.5) return "本命香！好闻到想立刻收正装";
    if (score >= 8.5) return "超级心动，约会首选这一支";
    if (score >= 7.0) return "很喜欢，平时会常喷";
    if (score >= 5.0) return "还不错，看心情轮流穿";
    return "不太合拍，礼貌跳过这一支";
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-show");
    }, 2000);
  }

  function computeStats() {
    var tested = [];
    var scored = [];
    var mustBuy = [];
    var sum = 0;

    CATALOG.forEach(function (item) {
      var r = getReview(item.id);
      if (isItemTested(r)) tested.push({ item: item, review: r });
      if (typeof r.overallScore === "number") {
        scored.push({ item: item, review: r });
        sum += r.overallScore;
      }
      if (r.buyIntent === "must_buy") {
        mustBuy.push({ item: item, review: r });
      }
    });

    scored.sort(function (a, b) {
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
      scoredCount: scored.length,
      mustBuyCount: mustBuy.length,
      avgText: scored.length ? (sum / scored.length).toFixed(1) : "--",
      top3: scored.slice(0, 3),
      mustBuyList: mustBuy
    };
  }

  function renderHeartsHtml(id, score) {
    var val = typeof score === "number" ? score : 0;
    var html = "";
    for (var i = 1; i <= 5; i++) {
      var fullThreshold = i * 2;
      var halfThreshold = fullThreshold - 1;
      var fillState = val >= fullThreshold ? "full" : val >= halfThreshold ? "half" : "empty";
      var gid = "hclip-" + id + "-" + i;
      var fillLayer = "";
      if (fillState === "full") {
        fillLayer = '<path d="' + HEART_PATH + '" fill="#9E2A2B"/>';
      } else if (fillState === "half") {
        fillLayer =
          '<defs><clipPath id="' + gid + '"><rect x="0" y="0" width="12" height="24"/></clipPath></defs>' +
          '<path d="' + HEART_PATH + '" fill="#9E2A2B" clip-path="url(#' + gid + ')"/>';
      }
      var strokeColor = fillState === "empty" ? "#C9C5BC" : "#9E2A2B";
      html +=
        '<span class="heart-slot" data-heart="' + i + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            fillLayer +
            '<path d="' + HEART_PATH + '" fill="none" stroke="' + strokeColor + '" stroke-width="1.35"/>' +
          "</svg>" +
        "</span>";
    }
    return html;
  }

  function renderBottleImg(item, className) {
    var src = BOTTLE_IMAGES[item.id] || "";
    return (
      '<img class="' + className + '" src="' + src + '" alt="' +
      escapeHtml(item.brandZh + " " + item.nameZh) + ' 正装实拍图" decoding="async" />'
    );
  }

  function renderDeck() {
    deckEl.innerHTML = CATALOG.map(function (item, idx) {
      var r = getReview(item.id);
      var idxLabel = padIndex(item.index);
      var tab = activeTabs[item.id] || "notes";
      var isStamped = r.buyIntent === "must_buy";
      var score = r.overallScore;

      var tagsHtml = (item.reputationTags || [])
        .map(function (t) {
          return '<span class="rep-tag">' + escapeHtml(t) + "</span>";
        })
        .join("");

      var subdimsHtml = SUB_DIMENSIONS.map(function (dim) {
        var optsHtml = dim.options
          .map(function (opt) {
            var active = r[dim.key] === opt;
            return (
              '<button type="button" class="dim-chip' + (active ? " is-active" : "") + '" ' +
              'data-dim-id="' + item.id + '" data-dim-key="' + dim.key + '" data-dim-val="' + escapeHtml(opt) + '" ' +
              'aria-pressed="' + (active ? "true" : "false") + '">' +
              escapeHtml(opt) +
              "</button>"
            );
          })
          .join("");
        return (
          '<div class="subdim-row">' +
            '<span class="subdim-label">' + escapeHtml(dim.label) + "</span>" +
            '<div class="subdim-opts" role="group" aria-label="' + escapeHtml(dim.label) + '">' + optsHtml + "</div>" +
          "</div>"
        );
      }).join("");

      var dotsHtml = CATALOG.map(function (it, dIdx) {
        var dr = getReview(it.id);
        var cls = "pager-dot" + (dIdx === idx ? " is-active" : "") + (isItemTested(dr) ? " is-tested" : "");
        return '<button type="button" class="' + cls + '" data-jump="' + dIdx + '" aria-label="第 ' + (dIdx + 1) + ' 支"></button>';
      }).join("");

      return (
        '<article class="slide" data-index="' + idx + '" data-id="' + item.id + '">' +
          '<div class="label-sheet" style="--scent-color:' + item.palette.primary + '">' +
            '<span class="label-edge" aria-hidden="true"></span>' +

            '<div class="label-head">' +
              "<div>" +
                '<div class="label-num tabular">N°' + idxLabel + "<span>/ 10</span></div>" +
                '<div class="label-brand">' + escapeHtml(item.brandZh + " · " + item.brandEn.toUpperCase()) + "</div>" +
                '<h2 class="label-title">' + escapeHtml(item.nameZh) + "</h2>" +
                '<div class="label-en">' + escapeHtml(item.nameEn) + "</div>" +
                '<div class="rep-tags">' + tagsHtml + "</div>" +
              "</div>" +
              '<div class="bottle-stage">' +
                renderBottleImg(item, "bottle-photo") +
                '<div class="vermilion-seal' + (isStamped ? " is-stamped" : "") + '" data-seal aria-hidden="true">' +
                  '<div class="vermilion-seal-inner"><span>正装锁定</span><small>FLACON</small></div>' +
                "</div>" +
              "</div>" +
            "</div>" +

            '<p class="poetic-line">“' + escapeHtml(item.poetic) + '”</p>' +

            '<div class="prescription-block">' +
              '<div class="clip-tabs-wrap" data-tab="' + tab + '" data-tab-id="' + item.id + '">' +
                '<div class="clip-tabs-base">' +
                  '<button type="button" class="clip-tab-btn" data-switch-tab="notes">气味配方</button>' +
                  '<button type="button" class="clip-tab-btn" data-switch-tab="usage">穿香处方</button>' +
                "</div>" +
                '<div class="clip-tabs-active-layer" aria-hidden="true">' +
                  '<span class="clip-tab-mirror">气味配方</span>' +
                  '<span class="clip-tab-mirror">穿香处方</span>' +
                "</div>" +
              "</div>" +
              '<div class="panel-swap-stage">' +
                '<div class="swap-panel' + (tab === "notes" ? " is-visible" : "") + '" data-panel="notes">' +
                  '<div class="info-row"><span class="info-key">前调</span><span class="info-val">' + escapeHtml(item.notes.top) + "</span></div>" +
                  '<div class="info-row"><span class="info-key">中调</span><span class="info-val">' + escapeHtml(item.notes.heart) + "</span></div>" +
                  '<div class="info-row"><span class="info-key">后调</span><span class="info-val">' + escapeHtml(item.notes.base) + "</span></div>" +
                "</div>" +
                '<div class="swap-panel' + (tab === "usage" ? " is-visible" : "") + '" data-panel="usage">' +
                  '<div class="info-row"><span class="info-key">喷法</span><span class="info-val">' + escapeHtml(item.wearingGuide.spray) + "</span></div>" +
                  '<div class="info-row"><span class="info-key">穿搭</span><span class="info-val">' + escapeHtml(item.wearingGuide.outfit) + "</span></div>" +
                  '<div class="info-row"><span class="info-key">贴士</span><span class="info-val">' + escapeHtml(item.wearingGuide.tip) + "</span></div>" +
                "</div>" +
              "</div>" +
            "</div>" +

            '<div class="subdims-block">' + subdimsHtml + "</div>" +

            '<div class="hearts-section">' +
              '<div class="hearts-head">' +
                '<span class="hearts-mood" data-mood>' + escapeHtml(scoreMood(score)) + "</span>" +
                '<span class="hearts-score tabular"><span data-score-val>' + formatScore(score) + "</span><small> / 10</small></span>" +
              "</div>" +
              '<div class="hearts-bar" data-hearts="' + item.id + '" role="slider" aria-label="总体心动打分" aria-valuemin="1" aria-valuemax="10" aria-valuenow="' + (typeof score === "number" ? score : 0) + '">' +
                renderHeartsHtml(item.id, score) +
              "</div>" +
            "</div>" +

            '<div class="bottom-actions">' +
              '<button type="button" class="stamp-btn' + (isStamped ? " is-stamped" : "") + '" data-stamp="' + item.id + '" aria-pressed="' + (isStamped ? "true" : "false") + '">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (isStamped ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="' + HEART_PATH + '"/></svg>' +
                "<span>" + (isStamped ? "已盖章 · 正装心愿已锁定" : "盖章锁定 · 想要这瓶正装") + "</span>" +
              "</button>" +
              '<input type="text" class="note-line-input" data-note="' + item.id + '" maxlength="120" value="' + escapeHtml(r.note || "") + '" placeholder="写一句闻后感（例如：两小时后贴肤变很温柔）" />' +
            "</div>" +
          "</div>" +

          '<div class="deck-pager">' +
            '<button type="button" class="pager-btn" data-step="-1"' + (idx === 0 ? " disabled" : "") + ">&larr; 上一支</button>" +
            '<div class="pager-dots">' + dotsHtml + "</div>" +
            '<button type="button" class="pager-btn" data-step="1"' + (idx === CATALOG.length - 1 ? " disabled" : "") + ">下一支 &rarr;</button>" +
          "</div>" +
        "</article>"
      );
    }).join("");

    bindHearts();
  }

  function renderIndex() {
    var stats = computeStats();
    var GROUP_HEADS = {
      1: '<div class="index-group-head"><strong>第一组 · 清透热身</strong><span>古龙与轻淡香 · 闻后歇鼻换气</span></div>',
      4: '<div class="index-group-head"><strong>第二组 · 花木进阶</strong><span>清甜花果过渡至干爽木质与繁花</span></div>',
      7: '<div class="index-group-head"><strong>第三组 · 馥郁压轴</strong><span>醛香脂粉至高甜浓香 · 留韵收尾</span></div>'
    };
    var html =
      '<div class="index-intro tabular">' +
        "<span>已按由淡入浓防疲劳排序</span>" +
        "<span>已试 " + stats.testedCount + "/10 · 均分 " + stats.avgText + "</span>" +
      "</div>";

    html += CATALOG.map(function (item, idx) {
      var r = getReview(item.id);
      var isWish = r.buyIntent === "must_buy";
      return (
        (GROUP_HEADS[item.index] || "") +
        '<button type="button" class="index-row" data-jump="' + idx + '">' +
          '<span class="index-thumb-wrap">' +
            '<span class="index-swatch" style="background:' + item.palette.primary + '"></span>' +
            renderBottleImg(item, "index-thumb") +
          "</span>" +
          '<span class="index-main">' +
            '<div class="index-title">' + padIndex(item.index) + " · " + escapeHtml(item.brandZh + " " + item.nameZh) + "</div>" +
            '<div class="index-tags">' + escapeHtml((item.reputationTags || []).join(" · ")) + "</div>" +
          "</span>" +
          '<span class="index-score tabular">' +
            (typeof r.overallScore === "number" ? formatScore(r.overallScore) + " 分" : "--") +
            (isWish ? '<span class="index-wish-flag">正装锁定</span>' : "") +
          "</span>" +
        "</button>"
      );
    }).join("");

    indexEl.innerHTML = html;
  }

  function syncHeader() {
    var stats = computeStats();
    topProgressEl.textContent = padIndex(stats.testedCount) + "/10";
    wishCountEl.textContent = "心愿 " + stats.mustBuyCount;
  }

  function syncDots(activeIdx) {
    deckEl.querySelectorAll(".slide").forEach(function (slide, sIdx) {
      slide.querySelectorAll(".pager-dot").forEach(function (dot, dIdx) {
        var it = CATALOG[dIdx];
        var dr = getReview(it.id);
        dot.classList.toggle("is-active", dIdx === sIdx);
        dot.classList.toggle("is-tested", isItemTested(dr));
      });
    });
  }

  function updateCardScoreAndStamp(slide, id, r) {
    var score = r.overallScore;
    slide.querySelector("[data-score-val]").textContent = formatScore(score);
    slide.querySelector("[data-mood]").textContent = scoreMood(score);
    var bar = slide.querySelector("[data-hearts]");
    bar.innerHTML = renderHeartsHtml(id, score);
    bar.setAttribute("aria-valuenow", String(typeof score === "number" ? score : 0));

    var isStamped = r.buyIntent === "must_buy";
    slide.querySelector("[data-seal]").classList.toggle("is-stamped", isStamped);
    var btn = slide.querySelector("[data-stamp]");
    btn.classList.toggle("is-stamped", isStamped);
    btn.setAttribute("aria-pressed", isStamped ? "true" : "false");
    btn.querySelector("span").textContent = isStamped ? "已盖章 · 正装心愿已锁定" : "盖章锁定 · 想要这瓶正装";
    btn.querySelector("svg").setAttribute("fill", isStamped ? "currentColor" : "none");
  }

  function bindHearts() {
    deckEl.querySelectorAll("[data-hearts]").forEach(function (bar) {
      var id = bar.getAttribute("data-hearts");
      var slide = bar.closest(".slide");

      function applyClientX(clientX) {
        var rect = bar.getBoundingClientRect();
        var ratio = Math.max(0.05, Math.min(1, (clientX - rect.left) / rect.width));
        var score = Math.max(1, Math.min(10, Math.ceil(ratio * 10)));
        var r = updateReview(id, { overallScore: score });
        updateCardScoreAndStamp(slide, id, r);
        syncHeader();
        syncDots(currentIndex);
      }

      var down = false;
      bar.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        down = true;
        if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
        applyClientX(e.clientX);
      });
      bar.addEventListener("pointermove", function (e) {
        if (!down) return;
        e.stopPropagation();
        applyClientX(e.clientX);
      });
      bar.addEventListener("pointerup", function () {
        down = false;
      });
      bar.addEventListener("pointercancel", function () {
        down = false;
      });
    });
  }

  function jumpToSlide(idx) {
    currentIndex = Math.max(0, Math.min(CATALOG.length - 1, idx));
    if (currentView !== "deck") switchView("deck");
    var w = deckEl.clientWidth || 390;
    deckEl.scrollTo({ left: currentIndex * w, behavior: "smooth" });
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach(function (b) {
      var active = b.getAttribute("data-view") === view;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (view === "index") {
      renderIndex();
      deckEl.hidden = true;
      indexEl.hidden = false;
    } else {
      renderDeck();
      indexEl.hidden = true;
      deckEl.hidden = false;
      deckEl.scrollLeft = currentIndex * (deckEl.clientWidth || 390);
    }
  }

  function buildWishlistText() {
    var stats = computeStats();
    var lines = ["【十支寻香签 · 试香结果与正装心愿单】"];
    lines.push("已试进度：" + stats.testedCount + " / " + CATALOG.length + " 支  |  均分：" + stats.avgText);

    if (stats.mustBuyList.length) {
      lines.push("");
      lines.push("盖章锁定正装（" + stats.mustBuyList.length + " 瓶）：");
      stats.mustBuyList.forEach(function (entry) {
        var r = entry.review;
        var scoreStr = typeof r.overallScore === "number" ? "（" + formatScore(r.overallScore) + "分）" : "";
        var dims = [r.opening, r.drydown, r.longevity].filter(Boolean).join(" / ");
        var noteStr = r.note ? " — " + r.note : "";
        lines.push("- " + entry.item.brandZh + " " + entry.item.nameZh + scoreStr + (dims ? " [" + dims + "]" : "") + noteStr);
      });
    }

    if (stats.top3.length) {
      lines.push("");
      lines.push("心动排行 Top 3：");
      stats.top3.forEach(function (entry, i) {
        lines.push((i + 1) + ". " + entry.item.brandZh + " " + entry.item.nameZh + " · " + formatScore(entry.review.overallScore) + " 分");
      });
    }

    lines.push("");
    lines.push("十支完整记录：");
    CATALOG.forEach(function (item) {
      var r = getReview(item.id);
      var s = typeof r.overallScore === "number" ? formatScore(r.overallScore) + "/10" : "待试";
      var dims = [r.opening, r.drydown, r.longevity].filter(Boolean).join(" · ");
      var flag = r.buyIntent === "must_buy" ? " [正装锁定]" : "";
      lines.push(
        padIndex(item.index) + ". " + item.brandZh + " " + item.nameZh + "：" + s + flag +
        (dims ? "（" + dims + "）" : "") +
        (r.note ? " — " + r.note : "")
      );
    });

    return lines.join("\n");
  }

  function renderSheet(pngUrl) {
    var stats = computeStats();
    var html =
      '<div class="sheet-kpis tabular">' +
        '<div class="sheet-kpi"><span>已试进度</span><strong>' + stats.testedCount + ' / 10</strong></div>' +
        '<div class="sheet-kpi"><span>已试均分</span><strong>' + stats.avgText + "</strong></div>" +
        '<div class="sheet-kpi"><span>正装锁定</span><strong style="color:var(--vermilion)">' + stats.mustBuyCount + " 瓶</strong></div>" +
      "</div>";

    html += '<div class="sheet-section-title">正装锁定清单</div>';
    if (stats.mustBuyList.length) {
      html += stats.mustBuyList.map(function (entry) {
        var r = entry.review;
        var dims = [r.opening, r.drydown, r.longevity].filter(Boolean).join(" · ");
        return (
          '<div class="sheet-item">' +
            "<div>" +
              "<strong>" + escapeHtml(entry.item.brandZh + " · " + entry.item.nameZh) + "</strong>" +
              (dims || r.note ? '<span class="sheet-item-sub">' + escapeHtml(dims + (dims && r.note ? " | " : "") + (r.note || "")) + "</span>" : "") +
            "</div>" +
            '<strong class="tabular" style="color:var(--vermilion)">' + formatScore(r.overallScore) + " 分</strong>" +
          "</div>"
        );
      }).join("");
    } else {
      html += '<div class="sheet-item" style="color:var(--ink-muted)">还没有盖章锁定正装，看到喜欢的签就盖上朱砂章吧。</div>';
    }

    html += '<div class="sheet-section-title">评分排行 TOP 3</div>';
    if (stats.top3.length) {
      html += stats.top3.map(function (entry, i) {
        return (
          '<div class="sheet-item">' +
            "<span>" + (i + 1) + ". " + escapeHtml(entry.item.brandZh + " · " + entry.item.nameZh) + "</span>" +
            '<strong class="tabular" style="color:var(--vermilion)">' + formatScore(entry.review.overallScore) + " 分</strong>" +
          "</div>"
        );
      }).join("");
    } else {
      html += '<div class="sheet-item" style="color:var(--ink-muted)">轻点或滑动五颗爱心打分后，这里会自动生成排名。</div>';
    }

    if (pngUrl) {
      html +=
        '<div class="png-preview-wrap" id="png-preview-wrap">' +
          '<div class="png-preview-head">' +
            "<span>试香手账长图已生成（长按图片可保存相册）</span>" +
            '<a href="' + pngUrl + '" download="十支寻香签试香战报.png">保存 PNG</a>' +
          "</div>" +
          '<img class="png-preview-img" src="' + pngUrl + '" alt="十支寻香签试香战报长图" />' +
        "</div>";
    }

    sheetBodyEl.innerHTML = html;
  }

  function openSheet() {
    resetStripEl.hidden = true;
    renderSheet(null);
    backdropEl.classList.add("is-open");
    sheetEl.classList.add("is-open");
  }

  function closeSheet() {
    backdropEl.classList.remove("is-open");
    sheetEl.classList.remove("is-open");
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

  function loadImageAsync(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var chars = String(text || "").split("");
    var line = "";
    var lines = [];
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, y + j * lineHeight);
    }
    return lines.length * lineHeight;
  }

  function exportSalonPosterPng() {
    var stats = computeStats();
    var width = 1080;
    var rowHeight = 148;
    var headerH = 260;
    var footerH = 84;
    var height = headerH + CATALOG.length * rowHeight + footerH;

    Promise.all(CATALOG.map(function (it) { return loadImageAsync(BOTTLE_IMAGES[it.id]); })).then(function (imgs) {
      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext("2d");

      // 未涂布棉纸底色 + 细线边框
      ctx.fillStyle = "#FCFCFA";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#141413";
      ctx.lineWidth = 3;
      ctx.strokeRect(28, 28, width - 56, height - 56);

      // 头部标题与 KPI
      ctx.fillStyle = "#141413";
      ctx.font = "700 46px Georgia, serif";
      ctx.fillText("十支寻香签 · 试香战报", 64, 118);

      ctx.fillStyle = "#66635C";
      ctx.font = "24px sans-serif";
      ctx.fillText(
        "已试 " + stats.testedCount + " / 10 支   ·   均分 " + stats.avgText + "   ·   正装锁定 " + stats.mustBuyCount + " 瓶",
        64,
        172
      );

      ctx.strokeStyle = "#141413";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, 212);
      ctx.lineTo(width - 64, 212);
      ctx.stroke();

      // 10 支明细行
      CATALOG.forEach(function (item, idx) {
        var r = getReview(item.id);
        var topY = headerH + idx * rowHeight;
        var img = imgs[idx];

        // 右侧色条指示
        ctx.fillStyle = item.palette.primary;
        ctx.fillRect(width - 36, topY + 12, 6, rowHeight - 24);

        // 瓶身缩略图
        if (img) {
          var scale = Math.min(84 / img.width, 108 / img.height);
          var dw = img.width * scale;
          var dh = img.height * scale;
          ctx.drawImage(img, 64 + (84 - dw) / 2, topY + (rowHeight - dh) / 2, dw, dh);
        }

        // 品牌与香名
        var textX = 174;
        ctx.fillStyle = "#66635C";
        ctx.font = "600 18px monospace";
        ctx.fillText("N°" + padIndex(item.index) + "  " + item.brandZh.toUpperCase(), textX, topY + 36);

        ctx.fillStyle = "#141413";
        ctx.font = "700 28px Georgia, serif";
        ctx.fillText(item.nameZh, textX, topY + 72);

        // 细评短词与随手记
        var dims = [r.opening, r.drydown, r.longevity].filter(Boolean).join(" · ");
        var detailLine = dims || (item.reputationTags || []).join(" · ");
        if (r.note) detailLine += (detailLine ? "  |  " : "") + r.note;
        ctx.fillStyle = "#66635C";
        ctx.font = "20px sans-serif";
        wrapCanvasText(ctx, detailLine, textX, topY + 106, 590, 26, 1);

        // 右侧评分与正装印章
        ctx.textAlign = "right";
        ctx.fillStyle = typeof r.overallScore === "number" ? "#9E2A2B" : "#9B978E";
        ctx.font = "700 34px Georgia, serif";
        ctx.fillText(
          typeof r.overallScore === "number" ? formatScore(r.overallScore) + " / 10" : "待试",
          width - 64,
          topY + 62
        );

        if (r.buyIntent === "must_buy") {
          ctx.strokeStyle = "#9E2A2B";
          ctx.lineWidth = 2;
          ctx.strokeRect(width - 178, topY + 78, 114, 34);
          ctx.fillStyle = "#9E2A2B";
          ctx.font = "700 18px Georgia, serif";
          ctx.fillText("正装锁定", width - 78, topY + 102);
        }
        ctx.textAlign = "left";

        // 底部分隔线
        ctx.strokeStyle = "#E5E3DD";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(64, topY + rowHeight - 2);
        ctx.lineTo(width - 64, topY + rowHeight - 2);
        ctx.stroke();
      });

      ctx.fillStyle = "#9B978E";
      ctx.font = "18px monospace";
      ctx.fillText("十支寻香签 · 沙龙试香手账记录导出", 64, height - 48);

      var pngUrl = canvas.toDataURL("image/png");
      renderSheet(pngUrl);
      var a = document.createElement("a");
      a.href = pngUrl;
      a.download = "十支寻香签试香战报.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("高清手账长图已生成");
    });
  }

  // ========================================================================
  // 事件绑定
  // ========================================================================

  document.querySelector(".top-actions").addEventListener("click", function (e) {
    var viewBtn = e.target.closest("[data-view]");
    if (viewBtn) {
      switchView(viewBtn.getAttribute("data-view"));
    }
  });

  deckEl.addEventListener("click", function (e) {
    var tabBtn = e.target.closest("[data-switch-tab]");
    if (tabBtn) {
      var targetTab = tabBtn.getAttribute("data-switch-tab");
      var wrap = tabBtn.closest("[data-tab-id]");
      var id = wrap.getAttribute("data-tab-id");
      activeTabs[id] = targetTab;
      wrap.setAttribute("data-tab", targetTab);
      var block = wrap.closest(".prescription-block");
      block.querySelectorAll(".swap-panel").forEach(function (panel) {
        panel.classList.toggle("is-visible", panel.getAttribute("data-panel") === targetTab);
      });
      return;
    }

    var dimBtn = e.target.closest("[data-dim-key]");
    if (dimBtn) {
      var dId = dimBtn.getAttribute("data-dim-id");
      var dKey = dimBtn.getAttribute("data-dim-key");
      var dVal = dimBtn.getAttribute("data-dim-val");
      var cur = getReview(dId);
      var nextVal = cur[dKey] === dVal ? null : dVal;
      var patch = {};
      patch[dKey] = nextVal;
      updateReview(dId, patch);
      var group = dimBtn.closest(".subdim-opts");
      group.querySelectorAll(".dim-chip").forEach(function (btn) {
        var on = btn.getAttribute("data-dim-val") === nextVal;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      syncHeader();
      syncDots(currentIndex);
      return;
    }

    var stampBtn = e.target.closest("[data-stamp]");
    if (stampBtn) {
      var sId = stampBtn.getAttribute("data-stamp");
      var sCur = getReview(sId);
      var nextIntent = sCur.buyIntent === "must_buy" ? null : "must_buy";
      var sr = updateReview(sId, { buyIntent: nextIntent });
      updateCardScoreAndStamp(stampBtn.closest(".slide"), sId, sr);
      syncHeader();
      syncDots(currentIndex);
      showToast(nextIntent === "must_buy" ? "已盖章锁定！加入正装心愿单" : "已取消这瓶正装印章");
      return;
    }

    var stepBtn = e.target.closest("[data-step]");
    if (stepBtn) {
      jumpToSlide(currentIndex + Number(stepBtn.getAttribute("data-step")));
      return;
    }

    var jumpDot = e.target.closest("[data-jump]");
    if (jumpDot) {
      jumpToSlide(Number(jumpDot.getAttribute("data-jump")));
    }
  });

  deckEl.addEventListener("input", function (e) {
    var noteInput = e.target.closest("[data-note]");
    if (noteInput) {
      updateReview(noteInput.getAttribute("data-note"), { note: noteInput.value });
      syncHeader();
      syncDots(currentIndex);
    }
  });

  deckEl.addEventListener("scroll", function () {
    var w = deckEl.clientWidth || 390;
    var nextIdx = Math.round(deckEl.scrollLeft / w);
    if (nextIdx !== currentIndex && nextIdx >= 0 && nextIdx < CATALOG.length) {
      currentIndex = nextIdx;
    }
  }, { passive: true });

  indexEl.addEventListener("click", function (e) {
    var row = e.target.closest("[data-jump]");
    if (row) jumpToSlide(Number(row.getAttribute("data-jump")));
  });

  document.getElementById("open-sheet-btn").addEventListener("click", openSheet);
  document.getElementById("close-sheet-btn").addEventListener("click", closeSheet);
  backdropEl.addEventListener("click", closeSheet);

  document.getElementById("copy-report-btn").addEventListener("click", function () {
    copyText(buildWishlistText()).then(function () {
      showToast("心愿单已复制，快贴去微信发给他吧");
    });
  });

  document.getElementById("export-png-btn").addEventListener("click", exportSalonPosterPng);

  document.getElementById("export-json-btn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "十支寻香签备份.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("已导出 JSON 备份文件");
  });

  document.getElementById("import-json-input").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || "{}"));
        if (parsed && typeof parsed === "object" && parsed.reviews) {
          state = parsed;
          saveState();
          renderDeck();
          if (!indexEl.hidden) renderIndex();
          syncHeader();
          renderSheet(null);
          showToast("已成功恢复试香记录");
        } else {
          showToast("备份文件格式不正确");
        }
      } catch (err) {
        showToast("读取备份文件失败");
      }
      e.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  });

  document.getElementById("ask-reset-btn").addEventListener("click", function () {
    resetStripEl.hidden = false;
  });

  document.getElementById("cancel-reset-btn").addEventListener("click", function () {
    resetStripEl.hidden = true;
  });

  document.getElementById("confirm-reset-btn").addEventListener("click", function () {
    state = { schemaVersion: "2.0.0", updatedAt: new Date().toISOString(), reviews: {} };
    saveState();
    resetStripEl.hidden = true;
    renderDeck();
    if (!indexEl.hidden) renderIndex();
    syncHeader();
    renderSheet(null);
    showToast("已清空全部记录");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sheetEl.classList.contains("is-open")) {
      closeSheet();
    }
  });

  renderDeck();
  syncHeader();
})();
