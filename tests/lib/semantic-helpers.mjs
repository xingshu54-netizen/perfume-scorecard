/**
 * 不透明盒（Opaque-box）语义定位、交互原语与几何/无障碍审计引擎
 * 严禁耦合任何 CSS 类名或实现私有变量名，仅依赖语义属性、ARIA 角色、文本与几何计算样式
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EXPECTED_CATALOG,
  EXPECTED_FILTERS,
  EXPECTED_INTENTS,
  EXPECTED_SORTS,
  EXPECTED_STORAGE_KEY,
  scanUnlocalizedText,
} from './expected-catalog.mjs';
import { parsePngDimensions, sleep } from './cdp-client.mjs';

/**
 * 校验 CDP 诊断事件无未捕获异常/报错/加载失败
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {{ contextLabel?: string, allowConsoleErrors?: boolean }} options
 */
export function assertCleanDiagnostics(session, { contextLabel = '', allowConsoleErrors = false } = {}) {
  const diag = session.getDiagnostics();
  const problems = [];
  if (diag.exceptions.length > 0) {
    problems.push(`未捕获 JS 异常 (${diag.exceptions.length}): ${JSON.stringify(diag.exceptions)}`);
  }
  if (!allowConsoleErrors && diag.consoleErrors.length > 0) {
    problems.push(`console.error (${diag.consoleErrors.length}): ${JSON.stringify(diag.consoleErrors)}`);
  }
  if (diag.logErrors.length > 0) {
    problems.push(`Log.entryAdded error (${diag.logErrors.length}): ${JSON.stringify(diag.logErrors)}`);
  }
  if (diag.networkFailures.length > 0) {
    problems.push(`网络加载失败 (${diag.networkFailures.length}): ${JSON.stringify(diag.networkFailures)}`);
  }
  if (diag.httpErrors.length > 0) {
    problems.push(`HTTP >= 400 (${diag.httpErrors.length}): ${JSON.stringify(diag.httpErrors)}`);
  }
  if (problems.length > 0) {
    const prefix = contextLabel ? `[${contextLabel}] ` : '';
    throw new Error(`${prefix}检测到运行时/资源错误:\n${problems.join('\n')}`);
  }
}

/**
 * 在页面上下文运行并查找主列表卡片（严格隔离弹窗与隐藏元素）
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function locatePerfumeCards(session) {
  const rawCards = await session.evaluate((catalogMeta) => {
    function isInsideDialogOrHidden(el) {
      if (!el) return true;
      if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) {
        return true;
      }
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') {
          return true;
        }
        const st = getComputedStyle(cur);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') {
          return true;
        }
        cur = cur.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width <= 0 || rect.height <= 0;
    }

    function matchCatalogIndex(text) {
      for (const item of catalogMeta) {
        const brandOk = item.brandPatterns.some((p) => new RegExp(p.source, p.flags).test(text));
        const nameOk = item.namePatterns.some((p) => new RegExp(p.source, p.flags).test(text));
        if (brandOk && nameOk) return item.index;
      }
      return null;
    }

    let elements = Array.from(document.querySelectorAll('[data-perfume-id]')).filter(
      (el) => !isInsideDialogOrHidden(el)
    );

    // 若无可见 [data-perfume-id] 且 DOM 中完全不存在 [data-perfume-id] 节点（如纯语义结构），
    // 直接执行语义容器发现（不因页头含「暂无」等文本提前短路，空筛选态在无匹配交互卡片时自然返回 []）
    const hasAnyPerfumeIdNode = document.querySelectorAll('[data-perfume-id]').length > 0;

    if (elements.length === 0 && !hasAnyPerfumeIdNode) {
      // 兜底语义容器发现：寻找含单一品牌+香名且含交互按钮的最小卡片容器（无匹配卡片时自然返回 []）
      const candidates = Array.from(document.querySelectorAll('article, section, li, div')).filter(
        (el) => {
          if (isInsideDialogOrHidden(el)) return false;
          if (!el.querySelector('button, [role="button"], [role="radio"], input[type="radio"]')) return false;
          const text = el.innerText || el.textContent || '';
          // 排除整页外壳、顶部进度汇总、空筛选引导与页脚说明等非单卡容器
          if (/试香进度|已试\s*\d+\s*\/\s*10|还没有|没有符合|空空如也|查看全部|重置筛选|清单数据整理自/.test(text)) {
            return false;
          }
          if (!/(?:\d+(?:\.\d+)?\s*ml|待试|已试|星|分|必入|再试|一般|劝退|详情|笔记|随手记)/.test(text)) {
            return false;
          }
          const matched = catalogMeta.filter((item) => {
            const b = item.brandPatterns.some((p) => new RegExp(p.source, p.flags).test(text));
            const n = item.namePatterns.some((p) => new RegExp(p.source, p.flags).test(text));
            return b && n;
          });
          return matched.length === 1;
        }
      );
      elements = candidates.filter(
        (el) => !candidates.some((other) => other !== el && el.contains(other))
      );
    }

    return elements.map((el, orderIdx) => {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const id = el.getAttribute('data-perfume-id') || '';
      return {
        orderIdx,
        id,
        catalogIndex: matchCatalogIndex(text),
        text,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    });
  }, EXPECTED_CATALOG.map((item) => ({
    index: item.index,
    brandPatterns: item.brandMatchers.map((r) => ({ source: r.source, flags: r.flags })),
    namePatterns: item.nameMatchers.map((r) => ({ source: r.source, flags: r.flags })),
  })));

  return rawCards;
}

/**
 * 等待主列表指定数量可见卡片就绪（严格排除弹窗与隐藏节点）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number} expectedCount
 * @param {number} timeoutMs
 */
export async function waitForCardsReady(session, expectedCount = 10, timeoutMs = 6000) {
  await session.waitFor(
    (cnt) => {
      const visible = Array.from(document.querySelectorAll('[data-perfume-id]')).filter((el) => {
        if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) {
          return false;
        }
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') return false;
          const st = getComputedStyle(cur);
          if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
          cur = cur.parentElement;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return visible.length === cnt;
    },
    {
      args: [expectedCount],
      timeoutMs,
      message: `等待主列表 ${expectedCount} 张可见卡片就绪超时`,
    }
  );
}

/**
 * 解析并定位单个预期条目对应的页面卡片
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number|string|object} target
 */
export async function findPerfumeCard(session, target) {
  const expected = resolveExpectedItem(target);
  const cards = await locatePerfumeCards(session);
  const match = cards.find((c) => {
    if (c.catalogIndex === expected.index) return true;
    if (c.id && c.id === expected.suggestedId) return true;
    const brandOk = expected.brandMatchers.some((re) => re.test(c.text));
    const nameOk = expected.nameMatchers.some((re) => re.test(c.text));
    return brandOk && nameOk;
  });
  if (!match) {
    throw new Error(
      `未在主列表中找到香水卡片 #${expected.index}「${expected.brandZh} ${expected.nameZh}」。当前可见卡片 (${cards.length}): ${cards.map((c) => c.id || c.text.slice(0, 30)).join(' | ')}`
    );
  }
  return { expected, card: match };
}

export function resolveExpectedItem(target) {
  if (typeof target === 'number') {
    const found = EXPECTED_CATALOG.find((x) => x.index === target);
    if (!found) throw new Error(`未知香水编号: ${target}`);
    return found;
  }
  if (typeof target === 'string') {
    const found = EXPECTED_CATALOG.find(
      (x) =>
        x.suggestedId === target ||
        x.nameZh === target ||
        x.nameAliases.includes(target) ||
        x.brandZh === target
    );
    if (!found) throw new Error(`未在权威目录找到目标: ${target}`);
    return found;
  }
  if (target && typeof target === 'object' && target.index) {
    return target;
  }
  throw new Error(`无效香水定位目标: ${String(target)}`);
}

/**
 * 读取顶部进度与核心摘要数值（排除弹窗内容）
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function readProgress(session) {
  return await session.evaluate(() => {
    function isExcluded(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) {
        return true;
      }
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') {
          return true;
        }
        const st = getComputedStyle(cur);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    }

    function extractVisibleNonDialogText(root, excludePerfumeCards = false) {
      const parts = [];
      const blockTags = new Set([
        'DIV', 'P', 'SECTION', 'HEADER', 'MAIN', 'FOOTER', 'ARTICLE',
        'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'LABEL', 'BUTTON',
      ]);
      function walk(node) {
        if (!node) return;
        if (node.nodeType === 3) {
          const t = (node.nodeValue || '').trim();
          if (t) parts.push(t);
          return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return;
        if (node.matches('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) return;
        if (excludePerfumeCards && node.hasAttribute('data-perfume-id')) return;
        if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return;
        const st = getComputedStyle(node);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return;
        for (const child of node.childNodes) {
          walk(child);
        }
        if (blockTags.has(tag)) parts.push('\n');
      }
      walk(root);
      return parts.join(' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    }

    const candidates = Array.from(
      document.querySelectorAll('header, [data-testid*="progress"], [role="progressbar"], [aria-live], main > div, body > div')
    ).filter((el) => !isExcluded(el) && !el.closest('[data-perfume-id]'));

    const headerText = candidates
      .map((el) => extractVisibleNonDialogText(el, true))
      .filter(Boolean)
      .join('\n');
    const bodyText = extractVisibleNonDialogText(document.body, false);

    const combined = `${headerText}\n${bodyText}`;
    const progressMatch = combined.match(/已试\s*(\d+)\s*\/\s*(\d+)/);
    const bar =
      Array.from(document.querySelectorAll('[role="progressbar"]')).find((b) => !isExcluded(b)) || null;
    const ariaNow = bar ? Number(bar.getAttribute('aria-valuenow')) : null;
    const ariaMax = bar ? Number(bar.getAttribute('aria-valuemax')) : null;

    // 读取必入/心动计数（如 "必入 2" 或 "心愿 2" 或 "必入正装 (2)"）
    const favMatch = combined.match(/(?:必入正装|必入|心愿|挚爱)\s*[：:（(]?\s*(\d+)\s*[）)]?/);
    // 读取均分（如 "均分 4.5" 或 "平均分：4.5"）
    const avgMatch = combined.match(/(?:平均分|均分)\s*[：:]?\s*(\d+(?:\.\d+)?|--|暂无)/);

    return {
      tested: progressMatch ? Number(progressMatch[1]) : null,
      total: progressMatch ? Number(progressMatch[2]) : null,
      ariaNow: Number.isFinite(ariaNow) ? ariaNow : null,
      ariaMax: Number.isFinite(ariaMax) ? ariaMax : null,
      favoriteCount: favMatch ? Number(favMatch[1]) : null,
      averageText: avgMatch ? avgMatch[1] : null,
      headerSnippet: headerText.slice(0, 300),
    };
  });
}

/**
 * 真实触控点击预检：滚动至视口中央 -> 可见校验 -> elementFromPoint 遮挡校验 -> CDP 触控点击
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {Function} locateInPageFn 返回单个 HTMLElement 的页面上下文函数
 * @param {any[]} args 传给 locateInPageFn 的参数
 * @param {{ xRatio?: number, yRatio?: number, label?: string, useMouseFallback?: boolean }} options
 */
export async function tapElement(
  session,
  locateInPageFn,
  args = [],
  { xRatio = 0.5, yRatio = 0.5, label = '目标控件', useMouseFallback = false } = {}
) {
  const prep = await session.evaluate(
    (fnSrc, fnArgs, xr, yr, desc) => {
      const fn = eval(`(${fnSrc})`);
      const el = fn(...fnArgs);
      if (!el) {
        return { ok: false, reason: `未找到元素: ${desc}` };
      }
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return { ok: false, reason: `元素不可见 (${desc}): display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}` };
      }
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      return { ok: true };
    },
    locateInPageFn.toString(),
    args,
    xRatio,
    yRatio,
    label
  );

  if (!prep.ok) {
    throw new Error(prep.reason);
  }

  await sleep(100);

  const hitCheck = await session.evaluate(
    (fnSrc, fnArgs, xr, yr, desc) => {
      const fn = eval(`(${fnSrc})`);
      const el = fn(...fnArgs);
      if (!el) return { ok: false, reason: `滚动后丢失元素: ${desc}` };
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { ok: false, reason: `元素宽高为 0 (${desc}): ${rect.width}x${rect.height}` };
      }
      const cx = rect.left + rect.width * xr;
      const cy = rect.top + rect.height * yr;
      const hit = document.elementFromPoint(cx, cy);
      const isSameOrDescendant = hit && (el === hit || el.contains(hit) || hit.contains(el));
      if (!isSameOrDescendant) {
        const hitInfo = hit
          ? `${hit.tagName.toLowerCase()}[role=${hit.getAttribute('role') || ''}] "${(hit.innerText || hit.textContent || '').trim().slice(0, 40)}"`
          : 'null';
        return {
          ok: false,
          reason: `点击中心 (${cx.toFixed(1)}, ${cy.toFixed(1)}) 被其他元素遮挡 (${desc})，命中了: ${hitInfo}`,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        };
      }
      return {
        ok: true,
        cx,
        cy,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    },
    locateInPageFn.toString(),
    args,
    xRatio,
    yRatio,
    label
  );

  if (!hitCheck.ok) {
    throw new Error(hitCheck.reason);
  }

  if (useMouseFallback) {
    await session.clickAt(hitCheck.cx, hitCheck.cy);
  } else {
    await session.tapAt(hitCheck.cx, hitCheck.cy);
  }
  await sleep(80);
  return hitCheck;
}

/**
 * 切换筛选按钮（全部 / 待试 / 已试 / 必入正装）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {'all'|'untested'|'tested'|'favorite'} filterKey
 */
export async function selectFilter(session, filterKey) {
  const pattern = EXPECTED_FILTERS[filterKey];
  if (!pattern) throw new Error(`未知筛选键值: ${filterKey}`);

  await tapElement(
    session,
    (patSrc, patFlags) => {
      const re = new RegExp(patSrc, patFlags);
      const controls = Array.from(
        document.querySelectorAll('button, [role="tab"], [role="button"], [role="radio"]')
      ).filter((el) => {
        if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-perfume-id]')) {
          return false;
        }
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return (
        controls.find((el) => re.test((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())) ||
        controls.find((el) => re.test((el.getAttribute('aria-label') || '').trim())) ||
        null
      );
    },
    [pattern.source, pattern.flags],
    { label: `筛选按钮(${filterKey})` }
  );

  await sleep(100);
  return await locatePerfumeCards(session);
}

/**
 * 切换排序方式（原单顺序 / 评分从高到低）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {'original'|'scoreDesc'} sortKey
 */
export async function selectSort(session, sortKey) {
  const pattern = EXPECTED_SORTS[sortKey];
  if (!pattern) throw new Error(`未知排序键值: ${sortKey}`);

  const info = await session.evaluate((patSrc, patFlags) => {
    const re = new RegExp(patSrc, patFlags);
    // 1. 先检查 <select>
    const selects = Array.from(document.querySelectorAll('select')).filter(
      (s) => !s.closest('[role="dialog"], dialog, [aria-modal="true"]')
    );
    for (const sel of selects) {
      const opt = Array.from(sel.options).find((o) => re.test(o.textContent || ''));
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { mode: 'select', matched: opt.textContent };
      }
    }

    // 2. 检查分段按钮 / 独立排序按钮
    const buttons = Array.from(
      document.querySelectorAll('button, [role="button"], [role="radio"], [role="tab"]')
    ).filter((el) => !el.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]'));

    const exactBtn = buttons.find((el) =>
      re.test((el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim())
    );
    if (exactBtn) {
      return { mode: 'button', text: (exactBtn.innerText || exactBtn.textContent || '').trim() };
    }

    // 3. 检查单按钮循环排序触发器（文本含"排序"字样）
    const toggleBtn = buttons.find((el) =>
      /排序|顺序|评分/.test((el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim())
    );
    if (toggleBtn) {
      return { mode: 'toggle', text: (toggleBtn.innerText || toggleBtn.textContent || '').trim() };
    }
    return { mode: 'none' };
  }, pattern.source, pattern.flags);

  if (info.mode === 'select') {
    await sleep(100);
    return await locatePerfumeCards(session);
  }

  if (info.mode === 'button') {
    await tapElement(
      session,
      (patSrc, patFlags) => {
        const re = new RegExp(patSrc, patFlags);
        const buttons = Array.from(
          document.querySelectorAll('button, [role="button"], [role="radio"], [role="tab"]')
        ).filter((el) => !el.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]'));
        return (
          buttons.find((el) =>
            re.test((el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim())
          ) || null
        );
      },
      [pattern.source, pattern.flags],
      { label: `排序按钮(${sortKey})` }
    );
    await sleep(100);
    return await locatePerfumeCards(session);
  }

  if (info.mode === 'toggle') {
    // 最多点两次切到目标排序文案
    for (let i = 0; i < 3; i++) {
      const matchedNow = await session.evaluate((patSrc, patFlags) => {
        const re = new RegExp(patSrc, patFlags);
        const btns = Array.from(
          document.querySelectorAll('button, [role="button"]')
        ).filter((el) => !el.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]'));
        return btns.some((b) => re.test((b.innerText || b.textContent || '').trim()) &&
          (b.getAttribute('aria-pressed') === 'true' || b.getAttribute('data-active') === 'true' || /排序/.test(b.innerText || '')));
      }, pattern.source, pattern.flags);
      if (matchedNow) break;

      await tapElement(
        session,
        () => {
          const btns = Array.from(
            document.querySelectorAll('button, [role="button"]')
          ).filter((el) => !el.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]'));
          return btns.find((b) => /排序|原单|高到低|顺序/.test((b.innerText || b.textContent || '').trim())) || null;
        },
        [],
        { label: `排序切换按钮(${sortKey})` }
      );
      await sleep(100);
    }
    return await locatePerfumeCards(session);
  }

  throw new Error(`未找到匹配 "${sortKey}" 的排序控件`);
}

/**
 * 读取单卡内部状态（分值、状态徽标、激活意愿、数量确认态、可见文本）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number|string|object} target
 */
export async function readCardState(session, target) {
  const { expected, card } = await findPerfumeCard(session, target);
  return await session.evaluate(
    (cardId, idx, brandPats, namePats, intents) => {
      function findCardEl() {
        if (cardId) {
          const el = Array.from(document.querySelectorAll('[data-perfume-id]')).find(
            (n) =>
              n.getAttribute('data-perfume-id') === cardId &&
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
          );
          if (el) return el;
        }
        const candidates = Array.from(document.querySelectorAll('article, section, li, div')).filter(
          (n) => !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
        );
        return (
          candidates.find((n) => {
            const t = n.innerText || '';
            return (
              brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              n.querySelector('button, [role="radio"]')
            );
          }) || null
        );
      }

      const el = findCardEl();
      if (!el) return null;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

      function isActive(btn) {
        return (
          btn.getAttribute('aria-pressed') === 'true' ||
          btn.getAttribute('aria-checked') === 'true' ||
          btn.getAttribute('aria-selected') === 'true' ||
          btn.getAttribute('data-active') === 'true' ||
          btn.getAttribute('data-selected') === 'true' ||
          Boolean(btn.checked)
        );
      }

      // 分值提取：
      // 1) 优先读取明确语义属性 [data-current-score] / [aria-valuenow]
      // 2) 其次读取剥离范围/提示文本后的页面渲染分值文本（如 "4.5★" / "4.5 / 5"，避免 5 星半星重绘下误读第 5 颗星按钮的 data-score=5）
      // 3) 最后回退到当前激活打分按钮的数值
      const scoreAttrEl = el.querySelector('[data-current-score], [aria-valuenow]');
      let score = null;
      if (scoreAttrEl) {
        const raw = scoreAttrEl.getAttribute('data-current-score') || scoreAttrEl.getAttribute('aria-valuenow');
        if (raw && !Number.isNaN(Number(raw)) && Number(raw) > 0) score = Number(raw);
      }

      const buttons = Array.from(
        el.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"], input[type="checkbox"]')
      );

      if (score === null) {
        const clone = el.cloneNode(true);
        clone
          .querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"], input[type="checkbox"]')
          .forEach((n) => n.remove());
        let displayOnly = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
        // 剔除提示性说明与范围描述（如 "1–10 分"、"1-10分"、"0.5–5.0 星"、"满分 5 分"、"满分 10 分"）
        displayOnly = displayOnly
          .replace(/直达打分[（(][^）)]*[）)]/g, ' ')
          .replace(/未(?:评分|打分)[（(][^）)]*[）)]/g, ' ')
          .replace(/\d+(?:\.\d+)?\s*[–—\-~～至到]\s*\d+(?:\.\d+)?\s*(?:分制?|星|★)?/g, ' ')
          .replace(/(?:满分|最高|总分|共)\s*(?:为|：|:)?\s*(?:5|10)(?:\.0)?\s*(?:分|星|★)?/g, ' ')
          .replace(/(?:5|10)\s*分制/g, ' ');
        const m = displayOnly.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(?:5|10)|★|星|分)/);
        if (m) {
          const parsedVal = Number(m[1]);
          if (parsedVal > 0 && parsedVal <= 10) score = parsedVal;
        }
      }

      if (score === null) {
        const activeScoreBtn = buttons.find(
          (b) =>
            isActive(b) &&
            (b.hasAttribute('data-score') ||
              b.hasAttribute('data-value') ||
              (b.tagName === 'INPUT' && b.type === 'radio' && /^\d+(?:\.\d+)?$/.test(b.value || '')) ||
              /星|分/.test(b.getAttribute('aria-label') || '') ||
              /^(?:[1-9]|10)(?:\s*分)?$/.test((b.innerText || '').trim()))
        );
        if (activeScoreBtn) {
          const av =
            activeScoreBtn.getAttribute('data-score') ||
            activeScoreBtn.getAttribute('data-value') ||
            (activeScoreBtn.tagName === 'INPUT' ? activeScoreBtn.value : null) ||
            (activeScoreBtn.innerText || '').trim().match(/^(\d+(?:\.\d+)?)/)?.[1];
          if (av && !Number.isNaN(Number(av)) && Number(av) > 0) score = Number(av);
        }
      }

      const activeIntents = [];
      for (const intent of intents) {
        const btn = buttons.find((b) =>
          (b.innerText || b.textContent || b.getAttribute('aria-label') || '').includes(intent)
        );
        if (btn && isActive(btn)) activeIntents.push(intent);
      }

      const isTested = /已试/.test(text) && !/待试|未试/.test(text.replace(/已试/, ''));
      const isUntested = /待试|未试/.test(text) && !/已试/.test(text);

      return {
        id: el.getAttribute('data-perfume-id') || cardId || '',
        catalogIndex: idx,
        text,
        score,
        activeIntents,
        isTested,
        isUntested,
      };
    },
    card.id,
    expected.index,
    expected.brandMatchers.map((r) => ({ source: r.source, flags: r.flags })),
    expected.nameMatchers.map((r) => ({ source: r.source, flags: r.flags })),
    EXPECTED_INTENTS
  );
}

async function isNonAllFilterActive(session) {
  return await session.evaluate(
    (allSrc, allFlags, nonAllPatterns) => {
      const allRe = new RegExp(allSrc, allFlags);
      const nonAllRes = nonAllPatterns.map((p) => new RegExp(p.source, p.flags));
      const controls = Array.from(
        document.querySelectorAll('button, [role="tab"], [role="button"], [role="radio"]')
      ).filter((el) => {
        if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-perfume-id]')) {
          return false;
        }
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      const isSelected = (el) =>
        el.getAttribute('aria-selected') === 'true' ||
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-checked') === 'true' ||
        el.getAttribute('data-active') === 'true' ||
        el.getAttribute('data-selected') === 'true';

      const labelOf = (el) =>
        (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();

      const allCtrl = controls.find((el) => allRe.test(labelOf(el)));
      if (allCtrl && isSelected(allCtrl)) return false;

      return controls.some((el) => {
        const lbl = labelOf(el);
        return !allRe.test(lbl) && nonAllRes.some((re) => re.test(lbl)) && isSelected(el);
      });
    },
    EXPECTED_FILTERS.all.source,
    EXPECTED_FILTERS.all.flags,
    [EXPECTED_FILTERS.untested, EXPECTED_FILTERS.tested, EXPECTED_FILTERS.favorite].map((r) => ({
      source: r.source,
      flags: r.flags,
    }))
  );
}

async function isCardVisibleInMainList(session, expected) {
  const visibleCards = await locatePerfumeCards(session);
  return visibleCards.some((c) => {
    if (c.catalogIndex === expected.index) return true;
    if (c.id && c.id === expected.suggestedId) return true;
    const brandOk = expected.brandMatchers.some((re) => re.test(c.text));
    const nameOk = expected.nameMatchers.some((re) => re.test(c.text));
    return brandOk && nameOk;
  });
}

/**
 * 通用自适应单卡打分原语（自动兼容 0.5-5.0 半星与 1-10 刻度；传 null 表示清除评分）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number|string|object} target
 * @param {number|{ fiveStar: number, tenPoint?: number }|null} scoreSpec
 * @param {{ optional?: boolean }} options
 */
export async function setPerfumeScore(session, target, scoreSpec, { optional = false } = {}) {
  const { expected, card } = await findPerfumeCard(session, target);
  const serializedBrands = expected.brandMatchers.map((r) => ({ source: r.source, flags: r.flags }));
  const serializedNames = expected.nameMatchers.map((r) => ({ source: r.source, flags: r.flags }));

  if (scoreSpec === null) {
    const isTargetCardVisible = async () => {
      const visibleCards = await locatePerfumeCards(session);
      return visibleCards.some((c) => {
        if (c.catalogIndex === expected.index) return true;
        if (c.id && c.id === expected.suggestedId) return true;
        const brandOk = expected.brandMatchers.some((re) => re.test(c.text));
        const nameOk = expected.nameMatchers.some((re) => re.test(c.text));
        return brandOk && nameOk;
      });
    };

    const verifyCleared = async (method) => {
      if (!(await isTargetCardVisible())) {
        return {
          scaleType: 'clear',
          cleared: true,
          method,
          appliedScore: null,
          cardState: null,
          removedFromFilteredView: true,
        };
      }
      const after = await readCardState(session, expected.index);
      if (after && after.score === null && after.isUntested === true) {
        return {
          scaleType: 'clear',
          cleared: true,
          method,
          appliedScore: null,
          cardState: after,
        };
      }
      return null;
    };

    // 1) 检查 L1 卡片是否存在显式清分按钮或可反选的激活评分按钮
    const l1Action = await session.evaluate(
      (cardId, brandPats, namePats) => {
        const cardEl = cardId
          ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
              (n) => n.getAttribute('data-perfume-id') === cardId && !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
            )
          : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
              const t = n.innerText || '';
              return (
                !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
                brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
                namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
                n.querySelector('button, [role="radio"], input[type="radio"]')
              );
            });
        if (!cardEl) return { found: false, hasDrawerBtn: false };
        const btns = Array.from(cardEl.querySelectorAll('button, [role="button"], [role="radio"], input[type="radio"]'));
        const hasDrawerBtn = btns.some((b) =>
          /详情|笔记|写感受|展开|记录|更多|随手记/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        );
        const clearBtn = btns.find((b) =>
          /清除|撤销|重评|归零|清分|清空评分|清空此款/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        );
        if (clearBtn) {
          return { found: true, mode: 'clear-btn', hasDrawerBtn };
        }
        const activeScoreBtn = btns.find(
          (b) =>
            (b.hasAttribute('data-score') ||
              b.hasAttribute('data-value') ||
              (b.tagName === 'INPUT' && b.type === 'radio') ||
              /星|分/.test(b.getAttribute('aria-label') || '') ||
              /^(?:[1-9]|10)$/.test((b.innerText || '').trim())) &&
            (b.getAttribute('aria-pressed') === 'true' ||
              b.getAttribute('aria-checked') === 'true' ||
              b.getAttribute('aria-selected') === 'true' ||
              b.getAttribute('data-active') === 'true' ||
              b.getAttribute('data-selected') === 'true' ||
              Boolean(b.checked))
        );
        if (activeScoreBtn) {
          return { found: true, mode: 'toggle-off', hasDrawerBtn };
        }
        return { found: false, hasDrawerBtn };
      },
      card.id,
      serializedBrands,
      serializedNames
    );

    if (l1Action.found) {
      await tapElement(
        session,
        (cardId, brandPats, namePats, mode) => {
          const cardEl = cardId
            ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
                (n) => n.getAttribute('data-perfume-id') === cardId && !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
              )
            : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
                const t = n.innerText || '';
                return (
                  !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
                  brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
                  namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
                  n.querySelector('button, [role="radio"], input[type="radio"]')
                );
              });
          if (!cardEl) return null;
          const btns = Array.from(cardEl.querySelectorAll('button, [role="button"], [role="radio"], input[type="radio"]'));
          let targetEl = null;
          if (mode === 'clear-btn') {
            targetEl = btns.find((b) =>
              /清除|撤销|重评|归零|清分|清空评分|清空此款/.test(
                (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
              )
            );
          } else {
            targetEl = btns.find(
              (b) =>
                (b.hasAttribute('data-score') ||
                  b.hasAttribute('data-value') ||
                  (b.tagName === 'INPUT' && b.type === 'radio') ||
                  /星|分/.test(b.getAttribute('aria-label') || '') ||
                  /^(?:[1-9]|10)$/.test((b.innerText || '').trim())) &&
                (b.getAttribute('aria-pressed') === 'true' ||
                  b.getAttribute('aria-checked') === 'true' ||
                  b.getAttribute('aria-selected') === 'true' ||
                  b.getAttribute('data-active') === 'true' ||
                  b.getAttribute('data-selected') === 'true' ||
                  Boolean(b.checked))
            );
          }
          if (targetEl && targetEl.tagName === 'INPUT') {
            const lbl =
              targetEl.closest('label') ||
              (targetEl.id ? cardEl.querySelector(`label[for="${CSS.escape(targetEl.id)}"]`) : null);
            if (lbl) return lbl;
          }
          return targetEl || null;
        },
        [card.id, serializedBrands, serializedNames, l1Action.mode],
        { label: `清除评分(#${expected.index})` }
      );
      await sleep(100);
      const l1Cleared = await verifyCleared(l1Action.mode);
      if (l1Cleared) {
        return l1Cleared;
      }
    }

    // 2) 若 L1 未清除成功且存在 L2 详情抽屉，检查抽屉内是否提供单卡清分按钮（如「清空此款评分」）
    if (l1Action.hasDrawerBtn) {
      await openDetailDrawer(session, expected.index);
      const hasDrawerClear = await session.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
          if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
          const st = getComputedStyle(d);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
            return false;
          }
          const r = d.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
        });
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg) return false;
        const btns = Array.from(dlg.querySelectorAll('button, [role="button"]'));
        return btns.some((b) =>
          /清空此款|清空评分|清除评分|重置此款|清除|归零/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        );
      });

      if (hasDrawerClear) {
        await tapElement(
          session,
          () => {
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
              if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
              const st = getComputedStyle(d);
              if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
                return false;
              }
              const r = d.getBoundingClientRect();
              return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
            });
            const dlg = dialogs[dialogs.length - 1];
            if (!dlg) return null;
            const btns = Array.from(dlg.querySelectorAll('button, [role="button"]'));
            return (
              btns.find((b) =>
                /清空此款|清空评分|清除评分|重置此款|清除|归零/.test(
                  (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
                )
              ) || null
            );
          },
          [],
          { label: `抽屉清分(#${expected.index})` }
        );
        await sleep(120);
        if (await readActiveDialog(session)) {
          await closeActiveDialog(session, 'button');
        }
        const l2Cleared = await verifyCleared('l2-drawer-clear');
        if (l2Cleared) {
          return l2Cleared;
        }
      } else {
        await closeActiveDialog(session, 'button');
      }
    }

    if (optional) {
      const stillVisible = await isTargetCardVisible();
      return {
        scaleType: 'clear',
        cleared: false,
        method: 'unsupported',
        appliedScore: null,
        cardState: stillVisible ? await readCardState(session, expected.index) : null,
        ...(stillVisible ? {} : { removedFromFilteredView: true }),
      };
    }
    throw new Error(`卡片 #${expected.index} 未找到有效的清除/取消评分入口或清除未生效`);
  }

  const fiveStar = typeof scoreSpec === 'number' ? scoreSpec : scoreSpec.fiveStar;
  const tenPoint =
    typeof scoreSpec === 'number'
      ? Math.round(scoreSpec * 2)
      : scoreSpec.tenPoint ?? Math.round(fiveStar * 2);

  // 探测卡内评分控件形态与稳定序号（不依赖易被重绘销毁的临时 DOM 属性）
  const probe = await session.evaluate(
    (cardId, brandPats, namePats, target5, target10) => {
      const cardEl = cardId
        ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
            (n) =>
              n.getAttribute('data-perfume-id') === cardId &&
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
          )
        : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
            const t = n.innerText || '';
            return (
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
              brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              n.querySelector('button, [role="radio"], input[type="radio"]')
            );
          });
      if (!cardEl) return { ok: false, reason: '未找到卡片 DOM' };

      const controls = Array.from(
        cardEl.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"]')
      ).filter((el) => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden';
      });

      function extractNumericScore(el) {
        const attrVal = el.getAttribute('data-score') || el.getAttribute('data-value') || el.getAttribute('value');
        if (attrVal && /^\d+(?:\.\d+)?$/.test(attrVal.trim())) {
          return Number(attrVal.trim());
        }
        const aria = el.getAttribute('aria-label') || '';
        const ariaMatch = aria.match(/(\d+(?:\.\d+)?)\s*(?:星|分)/);
        if (ariaMatch) return Number(ariaMatch[1]);
        const txt = (el.innerText || el.textContent || '').trim();
        const txtMatch = txt.match(/^(\d+(?:\.\d+)?)\s*(?:星|分)?$/);
        if (txtMatch) return Number(txtMatch[1]);
        return null;
      }

      const scoredControls = controls
        .map((el) => ({ el, val: extractNumericScore(el) }))
        .filter((x) => x.val !== null && x.val > 0 && x.val <= 10);

      // 情形 A: 1–10 分胶囊尺
      const hasTenPoint = scoredControls.some((x) => x.val > 5 && x.val <= 10);
      if (hasTenPoint) {
        const hit = scoredControls.find((x) => Math.abs(x.val - target10) < 0.01);
        if (!hit) return { ok: false, reason: `10 分制控件未找到分值 ${target10}` };
        return { ok: true, scaleType: '10-point', expectedVal: target10, xRatio: 0.5, starOrdinal: null };
      }

      // 情形 B: 10 档显式半星按钮 (0.5..5.0)
      const hasHalfValues = scoredControls.some((x) => x.val % 1 === 0.5);
      if (hasHalfValues) {
        const hit = scoredControls.find((x) => Math.abs(x.val - target5) < 0.01);
        if (!hit) return { ok: false, reason: `半星控件未找到分值 ${target5}` };
        return { ok: true, scaleType: '5-star-10btn', expectedVal: target5, xRatio: 0.5, starOrdinal: null };
      }

      // 情形 C: 5 颗星按钮（按整星 1..5 或从左到右 5 个星按钮）
      let fiveBtns = scoredControls.filter((x) => x.val >= 1 && x.val <= 5).sort((a, b) => a.val - b.val);
      if (fiveBtns.length < 5) {
        const starBtns = controls
          .filter((el) => /星|star/i.test((el.getAttribute('aria-label') || '') + (el.innerHTML || '')))
          .map((el, idx) => ({ el, val: idx + 1 }));
        if (starBtns.length >= 5) fiveBtns = starBtns.slice(0, 5);
      }

      if (fiveBtns.length >= 5) {
        const starIndex = Math.max(1, Math.min(5, Math.ceil(target5)));
        const isHalf = target5 % 1 === 0.5;
        return {
          ok: true,
          scaleType: '5-star-5btn',
          expectedVal: target5,
          isHalf,
          xRatio: isHalf ? 0.25 : 0.75,
          starOrdinal: starIndex - 1,
        };
      }

      return {
        ok: false,
        reason: `卡片内未探测到合规打分控件 (找到数值控件: ${scoredControls.map((x) => x.val).join(',')})`,
      };
    },
    card.id,
    serializedBrands,
    serializedNames,
    fiveStar,
    tenPoint
  );

  if (!probe.ok) {
    throw new Error(`#${expected.index} 打分控件探测失败: ${probe.reason}`);
  }

  const locateScoreControl = (cardId, brandPats, namePats, scaleType, target5, target10, starOrdinal) => {
    const cardEl = cardId
      ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
          (n) =>
            n.getAttribute('data-perfume-id') === cardId &&
            !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
        )
      : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
          const t = n.innerText || '';
          return (
            !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
            brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
            namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
            n.querySelector('button, [role="radio"], input[type="radio"]')
          );
        });
    if (!cardEl) return null;

    const controls = Array.from(
      cardEl.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"]')
    ).filter((el) => {
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden';
    });

    function extractNumericScore(el) {
      const attrVal = el.getAttribute('data-score') || el.getAttribute('data-value') || el.getAttribute('value');
      if (attrVal && /^\d+(?:\.\d+)?$/.test(attrVal.trim())) {
        return Number(attrVal.trim());
      }
      const aria = el.getAttribute('aria-label') || '';
      const ariaMatch = aria.match(/(\d+(?:\.\d+)?)\s*(?:星|分)/);
      if (ariaMatch) return Number(ariaMatch[1]);
      const txt = (el.innerText || el.textContent || '').trim();
      const txtMatch = txt.match(/^(\d+(?:\.\d+)?)\s*(?:星|分)?$/);
      if (txtMatch) return Number(txtMatch[1]);
      return null;
    }

    const scoredControls = controls
      .map((el) => ({ el, val: extractNumericScore(el) }))
      .filter((x) => x.val !== null && x.val > 0 && x.val <= 10);

    let targetEl = null;
    if (scaleType === '10-point') {
      targetEl = scoredControls.find((x) => Math.abs(x.val - target10) < 0.01)?.el || null;
    } else if (scaleType === '5-star-10btn') {
      targetEl = scoredControls.find((x) => Math.abs(x.val - target5) < 0.01)?.el || null;
    } else if (scaleType === '5-star-5btn') {
      let fiveBtns = scoredControls.filter((x) => x.val >= 1 && x.val <= 5).sort((a, b) => a.val - b.val);
      if (fiveBtns.length < 5) {
        const starBtns = controls
          .filter((el) => /星|star/i.test((el.getAttribute('aria-label') || '') + (el.innerHTML || '')))
          .map((el, idx) => ({ el, val: idx + 1 }));
        if (starBtns.length >= 5) fiveBtns = starBtns.slice(0, 5);
      }
      const starIndex = (starOrdinal ?? 0) + 1;
      targetEl = (fiveBtns.find((x) => x.val === starIndex) || fiveBtns[starOrdinal])?.el || null;
    }

    if (targetEl && targetEl.tagName === 'INPUT') {
      const r = targetEl.getBoundingClientRect();
      const st = getComputedStyle(targetEl);
      if (r.width < 10 || r.height < 10 || st.opacity === '0') {
        const lbl =
          targetEl.closest('label') ||
          (targetEl.id ? cardEl.querySelector(`label[for="${CSS.escape(targetEl.id)}"]`) : null);
        if (lbl) return lbl;
      }
    }
    return targetEl;
  };

  await tapElement(
    session,
    locateScoreControl,
    [card.id, serializedBrands, serializedNames, probe.scaleType, fiveStar, tenPoint, probe.starOrdinal],
    { xRatio: probe.xRatio, yRatio: 0.5, label: `评分控件(#${expected.index} -> ${probe.expectedVal})` }
  );

  await sleep(100);
  if ((await isNonAllFilterActive(session)) && !(await isCardVisibleInMainList(session, expected))) {
    return {
      scaleType: probe.scaleType,
      appliedScore: probe.expectedVal,
      cardState: null,
      removedFromFilteredView: true,
    };
  }
  let state = await readCardState(session, expected.index);

  // 若是 5 颗星按钮且目标含 .5，若第一次点整星（如 5.0）而非半星（4.5），每次重定位卡片与按钮序号 k 补点一次
  if (probe.scaleType === '5-star-5btn' && probe.isHalf && state && state.score !== null) {
    if (Math.abs(state.score - probe.expectedVal) > 0.1) {
      await tapElement(
        session,
        locateScoreControl,
        [card.id, serializedBrands, serializedNames, probe.scaleType, fiveStar, tenPoint, probe.starOrdinal],
        { xRatio: probe.xRatio, yRatio: 0.5, label: `半星补点(#${expected.index} -> ${probe.expectedVal})` }
      );
      await sleep(100);
      state = await readCardState(session, expected.index);
    }
  }

  return {
    scaleType: probe.scaleType,
    appliedScore: probe.expectedVal,
    cardState: state,
  };
}

/**
 * 在卡片内点选购买意愿胶囊（必入正装 / 再试几次 / 一般般 / 劝退拔草）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number|string|object} target
 * @param {string} intentText
 */
export async function setBuyIntent(session, target, intentText) {
  const { expected, card } = await findPerfumeCard(session, target);
  await tapElement(
    session,
    (cardId, brandPats, namePats, intent) => {
      const cardEl = cardId
        ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
            (n) =>
              n.getAttribute('data-perfume-id') === cardId &&
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
          )
        : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
            const t = n.innerText || '';
            return (
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
              brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              n.querySelector('button')
            );
          });
      if (!cardEl) return null;
      const btns = Array.from(cardEl.querySelectorAll('button, [role="radio"], [role="button"]'));
      return (
        btns.find((b) =>
          (b.innerText || b.textContent || b.getAttribute('aria-label') || '').includes(intent)
        ) || null
      );
    },
    [
      card.id,
      expected.brandMatchers.map((r) => ({ source: r.source, flags: r.flags })),
      expected.nameMatchers.map((r) => ({ source: r.source, flags: r.flags })),
      intentText,
    ],
    { label: `购买意愿(#${expected.index} -> ${intentText})` }
  );
  await sleep(80);
  if ((await isNonAllFilterActive(session)) && !(await isCardVisibleInMainList(session, expected))) {
    return {
      id: card.id || expected.suggestedId || '',
      catalogIndex: expected.index,
      cardState: null,
      removedFromFilteredView: true,
    };
  }
  return await readCardState(session, expected.index);
}

/**
 * 确认「范思哲 粉耀晶钻」数量（×1 或 ×2）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {1|2} quantity
 */
export async function confirmPinkDiamondQuantity(session, quantity) {
  const { expected, card } = await findPerfumeCard(session, 5);
  await tapElement(
    session,
    (cardId, qty) => {
      const cardEl = cardId
        ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
            (n) =>
              n.getAttribute('data-perfume-id') === cardId &&
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
          )
        : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
            const t = n.innerText || '';
            return !n.closest('[role="dialog"], dialog, [aria-modal="true"]') && /范思哲|Versace/i.test(t) && /粉耀晶钻|粉钻/.test(t);
          });
      if (!cardEl) return null;
      const re = new RegExp(`^(?:确认)?\\s*[×x\\*]\\s*${qty}(?:\\s*支)?$|^确认\\s*${qty}\\s*支$`);
      const btns = Array.from(cardEl.querySelectorAll('button, [role="button"], [role="radio"]'));
      return (
        btns.find((b) => re.test((b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim())) ||
        btns.find((b) => new RegExp(`[×x\\*]\\s*${qty}|${qty}\\s*支`).test(b.getAttribute('aria-label') || '')) ||
        null
      );
    },
    [card.id, quantity],
    { label: `粉钻数量确认(×${quantity})` }
  );
  await sleep(100);
  return await readCardState(session, expected.index);
}

/**
 * 打开指定香水的详情抽屉 (L2)
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number|string|object} target
 */
export async function openDetailDrawer(session, target) {
  const { expected, card } = await findPerfumeCard(session, target);
  await tapElement(
    session,
    (cardId, brandPats, namePats) => {
      const cardEl = cardId
        ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
            (n) =>
              n.getAttribute('data-perfume-id') === cardId &&
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]')
          )
        : Array.from(document.querySelectorAll('article, section, li, div')).find((n) => {
            const t = n.innerText || '';
            return (
              !n.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
              brandPats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              namePats.some((p) => new RegExp(p.source, p.flags).test(t)) &&
              n.querySelector('button')
            );
          });
      if (!cardEl) return null;
      const btns = Array.from(cardEl.querySelectorAll('button, [role="button"]'));
      return (
        btns.find((b) =>
          /详情|笔记|写感受|展开|记录|更多|随手记/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        ) || null
      );
    },
    [
      card.id,
      expected.brandMatchers.map((r) => ({ source: r.source, flags: r.flags })),
      expected.nameMatchers.map((r) => ({ source: r.source, flags: r.flags })),
    ],
    { label: `打开详情抽屉(#${expected.index})` }
  );

  // 等待抽屉显现
  await session.waitFor(
    () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      });
      return dialogs.length > 0;
    },
    { timeoutMs: 3000, message: `打开 #${expected.index} 详情抽屉超时` }
  );
  await sleep(250);
}

/**
 * 读取当前活动详情抽屉文本与字段状态
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function readActiveDialog(session) {
  return await session.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
      if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
      const st = getComputedStyle(d);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
        return false;
      }
      const r = d.getBoundingClientRect();
      return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    });
    const dlg = dialogs[dialogs.length - 1];
    if (!dlg) return null;
    const rect = dlg.getBoundingClientRect();
    const ta = dlg.querySelector('textarea');
    const st = getComputedStyle(dlg);
    return {
      text: (dlg.innerText || dlg.textContent || '').replace(/\s+/g, ' ').trim(),
      opacity: st.opacity,
      transform: st.transform,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      textareaValue: ta ? ta.value : null,
    };
  });
}

/**
 * 关闭当前详情抽屉或战报弹窗
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {'button'|'backdrop'|'escape'} method
 */
export async function closeActiveDialog(session, method = 'button') {
  if (method === 'escape') {
    await session.pressKey('Escape');
  } else if (method === 'backdrop') {
    const pt = await session.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const dlg = dialogs[dialogs.length - 1];
      if (!dlg) return null;
      const r = dlg.getBoundingClientRect();
      // 点击弹窗上方空白遮罩（如 top > 30 则点 (20, 20)，否则点左外侧）
      if (r.top > 24) return { x: Math.min(24, window.innerWidth / 2), y: Math.max(8, r.top / 2) };
      if (r.left > 16) return { x: r.left / 2, y: window.innerHeight / 2 };
      return null;
    });
    if (pt) {
      await session.tapAt(pt.x, pt.y);
    } else {
      await session.pressKey('Escape');
    }
  } else {
    await tapElement(
      session,
      () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
          if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
          const st = getComputedStyle(d);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
            return false;
          }
          const r = d.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
        });
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg) return null;
        const btns = Array.from(dlg.querySelectorAll('button, [role="button"]'));
        return (
          btns.find((b) =>
            /关闭|收起|完成|知道了|返回/.test(
              (b.getAttribute('aria-label') || '') + ' ' + (b.innerText || b.textContent || '')
            )
          ) ||
          btns.find((b) => /^[×✕✖]$/.test((b.innerText || b.textContent || '').trim())) ||
          null
        );
      },
      [],
      { label: '关闭弹窗/抽屉按钮' }
    );
  }

  await session.waitFor(
    () => {
      const visible = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      });
      return visible.length === 0;
    },
    { timeoutMs: 3000, message: `通过 ${method} 关闭弹窗/抽屉超时` }
  );
  await sleep(150);
}

/**
 * 在活动详情抽屉内设置进阶维度与标签
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {{ topNote?: number, baseNote?: number, longevity?: string, sillage?: string, scenes?: string[], score?: number, intent?: string }} opts
 */
export async function setDrawerDimensions(session, opts) {
  const findGroupAndTap = async (groupRegex, btnMatchRegex, desc) => {
    await tapElement(
      session,
      (gSrc, gFlags, bSrc, bFlags) => {
        const gRe = new RegExp(gSrc, gFlags);
        const bRe = new RegExp(bSrc, bFlags);
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
          if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
          const st = getComputedStyle(d);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
            return false;
          }
          const r = d.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
        });
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg) return null;

        const ctrlSel = 'button, [role="radio"], [role="button"], [role="checkbox"], input[type="radio"], input[type="checkbox"], label';

        function getCtrlText(el) {
          let txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
          if (!txt && el.tagName === 'INPUT') {
            const wrapLbl = el.closest('label');
            if (wrapLbl) txt = (wrapLbl.innerText || wrapLbl.textContent || '').trim();
            if (!txt && el.id) {
              const forLbl = dlg.querySelector(`label[for="${CSS.escape(el.id)}"]`);
              if (forLbl) txt = (forLbl.innerText || forLbl.textContent || '').trim();
            }
            if (!txt) txt = (el.value || '').trim();
          }
          return txt.replace(/\s+/g, ' ').trim();
        }

        function toTapTarget(el) {
          if (!el) return null;
          if (el.tagName === 'INPUT') {
            const wrapLbl = el.closest('label');
            if (wrapLbl && getComputedStyle(wrapLbl).display !== 'none') return wrapLbl;
            if (el.id) {
              const forLbl = dlg.querySelector(`label[for="${CSS.escape(el.id)}"]`);
              if (forLbl && getComputedStyle(forLbl).display !== 'none') return forLbl;
            }
          }
          return el;
        }

        function matchInContainer(container) {
          const primary = Array.from(
            container.querySelectorAll('button, [role="radio"], [role="button"], [role="checkbox"], input[type="radio"], input[type="checkbox"]')
          );
          const hitPrimary = primary.find((b) => bRe.test(getCtrlText(b)));
          if (hitPrimary) return toTapTarget(hitPrimary);

          const labels = Array.from(container.querySelectorAll('label'));
          const hitLabel = labels.find((lbl) => bRe.test(getCtrlText(lbl)));
          return hitLabel || null;
        }

        // 先找最小包含 groupRegex 标题且内含按钮/单复选控件的块
        const blocks = Array.from(dlg.querySelectorAll('section, fieldset, div')).filter((blk) => {
          const t = blk.innerText || '';
          return gRe.test(t) && blk.querySelector(ctrlSel);
        });
        blocks.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);

        for (const blk of blocks) {
          const hit = matchInContainer(blk);
          if (hit) return hit;
        }
        // 兜底在抽屉全量控件查找
        return matchInContainer(dlg);
      },
      [groupRegex.source, groupRegex.flags, btnMatchRegex.source, btnMatchRegex.flags],
      { label: desc }
    );
    await sleep(60);
  };

  if (typeof opts.topNote === 'number') {
    await findGroupAndTap(/前调/, new RegExp(`^${opts.topNote}(?:\\s*分)?$`), `抽屉前调=${opts.topNote}`);
  }
  if (typeof opts.baseNote === 'number') {
    await findGroupAndTap(/中后调|后调/, new RegExp(`^${opts.baseNote}(?:\\s*分)?$`), `抽屉中后调=${opts.baseNote}`);
  }
  if (opts.longevity) {
    const lonMap = {
      短: /短|<3h/,
      中: /^(?:中|适中|3-6h)|3-6h/,
      长: /长|持久|6h\+/,
      持久: /持久|长|6h\+/,
    };
    const re = lonMap[opts.longevity] || new RegExp(opts.longevity);
    await findGroupAndTap(/留香/, re, `抽屉留香=${opts.longevity}`);
  }
  if (opts.sillage) {
    const silMap = {
      偏淡: /偏淡|清淡|淡/,
      适中: /适中|刚好/,
      偏浓: /偏浓|浓郁|浓/,
    };
    const re = silMap[opts.sillage] || new RegExp(opts.sillage);
    await findGroupAndTap(/浓淡|扩散/, re, `抽屉浓淡=${opts.sillage}`);
  }
  if (Array.isArray(opts.scenes)) {
    for (const sc of opts.scenes) {
      await findGroupAndTap(/场景|标签/, new RegExp(sc), `抽屉场景=${sc}`);
    }
  }
  if (opts.intent) {
    await findGroupAndTap(/购买意愿|意愿|结论/, new RegExp(opts.intent), `抽屉意愿=${opts.intent}`);
  }
  if (typeof opts.score === 'number') {
    const fiveStar = opts.score;
    const tenPoint = Math.round(fiveStar * 2);
    await tapElement(
      session,
      (s5, s10) => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
          if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
          const st = getComputedStyle(d);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
            return false;
          }
          const r = d.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
        });
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg) return null;
        const btns = Array.from(dlg.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"]'));
        const byData = btns.find((b) => {
          const v = Number(b.getAttribute('data-score') || b.getAttribute('data-value') || (b.tagName === 'INPUT' ? b.value : NaN));
          return v === s5 || v === s10;
        });
        const chosen =
          byData ||
          btns.find((b) => new RegExp(`^${s5}\\s*星$|^${s10}\\s*分?$`).test((b.getAttribute('aria-label') || b.innerText || '').trim())) ||
          null;
        if (chosen && chosen.tagName === 'INPUT') {
          const lbl =
            chosen.closest('label') ||
            (chosen.id ? dlg.querySelector(`label[for="${CSS.escape(chosen.id)}"]`) : null);
          if (lbl && getComputedStyle(lbl).display !== 'none') return lbl;
        }
        return chosen;
      },
      [fiveStar, tenPoint],
      { xRatio: fiveStar % 1 === 0.5 ? 0.25 : 0.5, label: `抽屉评分=${fiveStar}` }
    );
  }
}

/**
 * 读取活动详情抽屉内具语义激活态（ARIA / data-active / data-selected / :checked）的控件文本
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {RegExp|null} groupRegex
 */
export async function readActiveDrawerControls(session, groupRegex = null) {
  return await session.evaluate(
    (gSrc, gFlags) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const dlg = dialogs[dialogs.length - 1];
      if (!dlg) return [];

      let scopeRoot = dlg;
      if (gSrc) {
        const gRe = new RegExp(gSrc, gFlags);
        const blocks = Array.from(dlg.querySelectorAll('section, fieldset, div')).filter((blk) => {
          const t = blk.innerText || '';
          return (
            gRe.test(t) &&
            blk.querySelector('button, [role="radio"], [role="button"], [role="checkbox"], input[type="radio"], input[type="checkbox"]')
          );
        });
        blocks.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        if (blocks[0]) scopeRoot = blocks[0];
      }

      const semanticActive = Array.from(
        scopeRoot.querySelectorAll(
          '[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], [data-active="true"], [data-selected="true"]'
        )
      );
      const nativeChecked = Array.from(
        scopeRoot.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked')
      );

      const texts = [];
      const seen = new Set();
      const pushUnique = (txt) => {
        const norm = (txt || '').replace(/\s+/g, ' ').trim();
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          texts.push(norm);
        }
      };

      for (const el of semanticActive) {
        pushUnique(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
      }
      for (const inp of nativeChecked) {
        const wrapLbl = inp.closest('label');
        const forLbl = inp.id ? dlg.querySelector(`label[for="${CSS.escape(inp.id)}"]`) : null;
        const lbl = wrapLbl || forLbl;
        pushUnique(lbl ? lbl.innerText || lbl.textContent : inp.getAttribute('aria-label') || inp.value || '');
      }
      return texts;
    },
    groupRegex ? groupRegex.source : null,
    groupRegex ? groupRegex.flags : ''
  );
}

/**
 * 在活动详情抽屉内写入试香笔记（使用原生 setter + input/change 事件）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {string} text
 */
export async function setDrawerNote(session, text) {
  const res = await session.evaluate((val) => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
      if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
      const st = getComputedStyle(d);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
        return false;
      }
      const r = d.getBoundingClientRect();
      return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
    });
    const dlg = dialogs[dialogs.length - 1];
    if (!dlg) return { ok: false, reason: '未找到打开的详情抽屉' };
    const ta = dlg.querySelector('textarea');
    if (!ta) return { ok: false, reason: '详情抽屉内未找到 <textarea>' };
    ta.scrollIntoView({ block: 'center' });
    ta.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(ta, val);
    else ta.value = val;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: ta.value };
  }, text);

  if (!res.ok) throw new Error(res.reason);
  await sleep(80);
  return res.value;
}

/**
 * 触发清空/重置全部记录并验证二次确认弹窗
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {'cancel'|'confirm'} action
 */
export async function triggerReset(session, action = 'confirm') {
  await tapElement(
    session,
    () => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
        (b) => !b.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-perfume-id]')
      );
      return (
        btns.find((b) =>
          /清空|重置|重来/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        ) || null
      );
    },
    [],
    { label: '清空/重置触发按钮' }
  );

  const confirmDialogRe = /确认清空|确定重置|确认重置|不可恢复|无法撤销|清空全部|全部清空|重置全部|确定清空|确认清除|确定/;

  // 等待二次确认弹窗出现
  await session.waitFor(
    (src, flags) => {
      const dlgRe = new RegExp(src, flags);
      const dialogs = Array.from(
        document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, [aria-modal="true"]')
      ).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      return dialogs.some((d) => dlgRe.test(d.innerText || d.textContent || ''));
    },
    {
      args: [confirmDialogRe.source, confirmDialogRe.flags],
      timeoutMs: 3000,
      message: '点击清空后未弹出二次确认对话框',
    }
  );

  const cancelRe = /取消|算了|返回|保留|留着|手滑|点错|再想想|关闭|不清空|暂不|先不|不要|别|否/;

  await tapElement(
    session,
    (act, dlgSrc, dlgFlags, cancelSrc, cancelFlags) => {
      const dlgRe = new RegExp(dlgSrc, dlgFlags);
      const cRe = new RegExp(cancelSrc, cancelFlags);
      const dialogs = Array.from(
        document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, [aria-modal="true"]')
      ).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const confirmDlg =
        dialogs.find((d) => dlgRe.test(d.innerText || d.textContent || '')) ||
        dialogs[dialogs.length - 1];
      if (!confirmDlg) return null;

      const btns = Array.from(confirmDlg.querySelectorAll('button, [role="button"]'));
      const btnText = (b) => (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim();
      const btnLabel = (b) => (b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      const matchesRe = (b, re) => re.test(btnText(b)) || re.test(btnLabel(b));

      if (act === 'cancel') {
        return btns.find((b) => matchesRe(b, cRe)) || null;
      }

      // action === 'confirm': 先过滤剔除所有含否定/取消词的按钮，再按优先级匹配肯定按钮
      const nonCancelBtns = btns.filter((b) => !matchesRe(b, cRe));
      const p1 = /^(?:确认清空|确定清空|确认重置|确定重置|确认清除|立即清空|确定|确认)$/;
      const p2 = /确认|确定/;
      const p3 = /清空|重置/;
      return (
        nonCancelBtns.find((b) => matchesRe(b, p1)) ||
        nonCancelBtns.find((b) => matchesRe(b, p2)) ||
        nonCancelBtns.find((b) => matchesRe(b, p3)) ||
        null
      );
    },
    [action, confirmDialogRe.source, confirmDialogRe.flags, cancelRe.source, cancelRe.flags],
    { label: `重置确认弹窗(${action})` }
  );

  // 等待确认弹窗消失/关闭
  await session.waitFor(
    (dlgSrc, dlgFlags) => {
      const dlgRe = new RegExp(dlgSrc, dlgFlags);
      const visible = Array.from(
        document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, [aria-modal="true"]')
      ).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      return !visible.some((d) => dlgRe.test(d.innerText || d.textContent || ''));
    },
    {
      args: [confirmDialogRe.source, confirmDialogRe.flags],
      timeoutMs: 3000,
      message: `重置确认弹窗(${action})点击后未关闭`,
    }
  );
  await sleep(120);
}

/**
 * 生成供 addInitScript 和动态注入的导出/剪贴板零侵入 Spy 代码
 */
export function getExportSpyScriptSource() {
  return `
  (() => {
    if (window.__e2eSpyInstalled) return;
    window.__e2eSpyInstalled = true;
    const spy = {
      clipboard: { calls: [], simulateFailure: false },
      execCommandCalls: [],
      canvas: { toDataUrlCalls: [], toBlobCalls: [], securityErrors: [] },
      downloads: [],
      blobs: [],
    };
    window.__e2eSpy = spy;

    // 1. 剪贴板 Spy
    try {
      const origClipboard = navigator.clipboard;
      const wrappedWriteText = async (text) => {
        spy.clipboard.calls.push({ text: String(text), ts: Date.now(), failed: spy.clipboard.simulateFailure });
        if (spy.clipboard.simulateFailure) {
          throw new DOMException('Simulated clipboard denial', 'NotAllowedError');
        }
        if (origClipboard && typeof origClipboard.writeText === 'function') {
          try {
            return await origClipboard.writeText(text);
          } catch {
            return undefined;
          }
        }
        return undefined;
      };
      if (origClipboard) {
        try {
          Object.defineProperty(origClipboard, 'writeText', {
            configurable: true,
            value: wrappedWriteText,
          });
        } catch {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            get: () => ({
              writeText: wrappedWriteText,
              readText: async () => (spy.clipboard.calls.at(-1)?.text || ''),
            }),
          });
        }
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          get: () => ({
            writeText: wrappedWriteText,
            readText: async () => (spy.clipboard.calls.at(-1)?.text || ''),
          }),
        });
      }
    } catch {}

    // 2. execCommand Spy
    const origExec = document.execCommand?.bind(document);
    if (origExec) {
      document.execCommand = function (cmd, ...rest) {
        let selected = '';
        try { selected = window.getSelection()?.toString() || ''; } catch {}
        spy.execCommandCalls.push({ cmd, selected, ts: Date.now() });
        if (spy.clipboard.simulateFailure && cmd === 'copy') return false;
        return origExec(cmd, ...rest);
      };
    }

    // 3. Canvas Spy
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, ...rest) {
      try {
        const res = origToDataURL.call(this, type, ...rest);
        spy.canvas.toDataUrlCalls.push({
          type: type || 'image/png',
          width: this.width,
          height: this.height,
          length: res.length,
          prefix: res.slice(0, 32),
        });
        return res;
      } catch (err) {
        spy.canvas.securityErrors.push(String(err));
        throw err;
      }
    };

    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, ...rest) {
      return origToBlob.call(this, (blob) => {
        spy.canvas.toBlobCalls.push({
          type: blob?.type || type || 'image/png',
          size: blob?.size || 0,
          width: this.width,
          height: this.height,
        });
        cb(blob);
      }, type, ...rest);
    };

    // 4. Blob 与 URL.createObjectURL / a.click 捕获（用于无痛校验 JSON 与 PNG 下载文本）
    const blobContentMap = new WeakMap();
    const OrigBlob = window.Blob;
    window.Blob = function (parts = [], options = {}) {
      const b = new OrigBlob(parts, options);
      try {
        const text = parts.map((p) => (typeof p === 'string' ? p : '')).join('');
        if (text) blobContentMap.set(b, text);
        spy.blobs.push({ type: options?.type || b.type, size: b.size, textPreview: text.slice(0, 200) });
      } catch {}
      return b;
    };
    window.Blob.prototype = OrigBlob.prototype;

    const urlToBlob = new Map();
    const origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      const u = origCreateObjectURL(obj);
      urlToBlob.set(u, obj);
      return u;
    };

    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const blob = urlToBlob.get(this.href);
      const text = blob ? blobContentMap.get(blob) || null : null;
      spy.downloads.push({
        download: this.download || '',
        href: (this.href || '').slice(0, 120),
        blobType: blob?.type || null,
        blobSize: blob?.size || null,
        text,
      });
      return origAnchorClick.call(this);
    };
  })();
  `;
}

/**
 * 安装导出/剪贴板 Spy（注册于新文档并在当前页立即激活）
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function installExportSpies(session) {
  const src = getExportSpyScriptSource();
  const identifier = await session.addInitScript(src);
  await session.evaluate(src);
  return identifier;
}

/**
 * 打开试香战报弹窗
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function openReportModal(session) {
  await tapElement(
    session,
    () => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
        (b) => !b.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]')
      );
      return (
        btns.find((b) =>
          /生成试香战报|试香战报|导出分享|分享战报|生成战报/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        ) || null
      );
    },
    [],
    { label: '生成试香战报按钮' }
  );

  await session.waitFor(
    () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      return dialogs.length > 0;
    },
    { timeoutMs: 3000, message: '打开试香战报弹窗超时' }
  );
  await sleep(200);
  return await readActiveDialog(session);
}

/**
 * 验证文字战报复制（支持正常授权路径与降级失败路径）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {{ simulateFailure?: boolean }} options
 */
export async function verifyCopyTextReport(session, { simulateFailure = false } = {}) {
  await session.evaluate((failFlag) => {
    if (!window.__e2eSpy) throw new Error('尚未安装 __e2eSpy');
    window.__e2eSpy.clipboard.simulateFailure = Boolean(failFlag);
  }, simulateFailure);

  await tapElement(
    session,
    () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const dlg = dialogs[dialogs.length - 1];
      if (!dlg) return null;
      const btns = Array.from(dlg.querySelectorAll('button, [role="button"]'));
      return (
        btns.find((b) =>
          /复制文字战报|复制战报|一键复制/.test(
            (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
          )
        ) || null
      );
    },
    [],
    { label: '复制文字战报按钮' }
  );

  await sleep(150);

  return await session.evaluate((expectedFail) => {
    const spy = window.__e2eSpy;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
      if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
      const st = getComputedStyle(d);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
        return false;
      }
      const r = d.getBoundingClientRect();
      return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
    });
    const dlg = dialogs[dialogs.length - 1];
    const fallbackBox = dlg
      ? Array.from(dlg.querySelectorAll('textarea, pre, [readonly]')).find((el) => {
          const st = getComputedStyle(el);
          return st.display !== 'none' && ((el.value || el.innerText || '').length > 20);
        })
      : null;

    const lastCall = spy.clipboard.calls.at(-1) || null;
    return {
      expectedFail,
      clipboardCallCount: spy.clipboard.calls.length,
      copiedText: lastCall?.text || (fallbackBox ? fallbackBox.value || fallbackBox.innerText : ''),
      hasFallbackBox: Boolean(fallbackBox),
      dialogText: dlg ? dlg.innerText : '',
    };
  }, simulateFailure);
}

/**
 * 触发导出战报长图并校验 Canvas 2D 与实际落盘 PNG 签名/宽高/非空
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function verifyCanvasLongImage(session) {
  const beforeCalls = await session.evaluate(() => ({
    toDataUrl: window.__e2eSpy?.canvas?.toDataUrlCalls?.length || 0,
    toBlob: window.__e2eSpy?.canvas?.toBlobCalls?.length || 0,
    downloads: window.__e2eSpy?.downloads?.length || 0,
  }));

  const downloadedPng = await session.waitForDownload(
    () =>
      tapElement(
        session,
        () => {
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
            if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
            const st = getComputedStyle(d);
            if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
              return false;
            }
            const r = d.getBoundingClientRect();
            return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
          });
          const dlg = dialogs[dialogs.length - 1];
          if (!dlg) return null;
          const btns = Array.from(dlg.querySelectorAll('button, [role="button"]'));
          return (
            btns.find((b) =>
              /导出战报长图|生成长图|保存长图|导出图片|长图/.test(
                (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
              )
            ) || null
          );
        },
        [],
        { label: '导出战报长图按钮' }
      ),
    { timeoutMs: 8000, match: /\.png$/i }
  );

  if (!downloadedPng || !downloadedPng.filePath || !fs.existsSync(downloadedPng.filePath)) {
    throw new Error('点击「导出战报长图」后未检测到落盘的 PNG 文件');
  }

  let pngDims;
  let diskByteLength = 0;
  try {
    const diskBuf = fs.readFileSync(downloadedPng.filePath);
    diskByteLength = diskBuf ? diskBuf.length : 0;
    if (diskByteLength < 1024) {
      throw new Error(`导出的战报长图 PNG 文件过小 (${diskByteLength} bytes)`);
    }
    pngDims = parsePngDimensions(diskBuf);
    if (!pngDims || pngDims.width <= 0 || pngDims.height <= 0) {
      throw new Error(`导出的战报长图 PNG 宽高异常: ${JSON.stringify(pngDims)}`);
    }
  } finally {
    try {
      fs.unlinkSync(downloadedPng.filePath);
    } catch {
      // ignore
    }
  }

  const evalSummary = await session.evaluate((prev) => {
    const spy = window.__e2eSpy;
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const previewImgs = Array.from(document.querySelectorAll('img')).filter((img) =>
      (img.src || '').startsWith('data:image/png') || (img.src || '').startsWith('blob:')
    );

    const canvasInfos = canvases.map((c) => {
      let nonEmptySample = false;
      try {
        const ctx = c.getContext('2d');
        if (ctx && c.width > 0 && c.height > 0) {
          const data = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
          const first = `${data[0]},${data[1]},${data[2]},${data[3]}`;
          for (let i = 4; i < data.length; i += 4) {
            if (`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}` !== first) {
              nonEmptySample = true;
              break;
            }
          }
        }
      } catch {}
      return { width: c.width, height: c.height, nonEmptySample };
    });

    return {
      securityErrors: spy?.canvas?.securityErrors || [],
      newToDataUrlCalls: (spy?.canvas?.toDataUrlCalls || []).slice(prev.toDataUrl),
      newToBlobCalls: (spy?.canvas?.toBlobCalls || []).slice(prev.toBlob),
      newDownloads: (spy?.downloads || []).slice(prev.downloads),
      canvasInfos,
      previewImgCount: previewImgs.length,
    };
  }, beforeCalls);

  return {
    ...evalSummary,
    downloadedPng: {
      suggestedFilename: downloadedPng.suggestedFilename || path.basename(downloadedPng.filePath),
      byteLength: diskByteLength,
      width: pngDims.width,
      height: pngDims.height,
    },
  };
}

/**
 * 在战报弹窗点击「导出 JSON」并提取完整 JSON 文本与对象
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function exportJsonReport(session) {
  const beforeDl = await session.evaluate(() => window.__e2eSpy?.downloads?.length || 0);
  let downloadedFile = null;
  let downloadError = null;

  try {
    downloadedFile = await session.waitForDownload(
      () =>
        tapElement(
          session,
          () => {
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
              if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
              const st = getComputedStyle(d);
              if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
                return false;
              }
              const r = d.getBoundingClientRect();
              return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
            });
            const dlg = dialogs[dialogs.length - 1] || document;
            const btns = Array.from(dlg.querySelectorAll('button, [role="button"], a[download]'));
            return (
              btns.find((b) =>
                /导出\s*JSON|备份\s*JSON|导出数据/i.test(
                  (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
                )
              ) || null
            );
          },
          [],
          { label: '导出 JSON 按钮' }
        ),
      { timeoutMs: 4000, match: /\.json$/i }
    );
  } catch (err) {
    downloadError = err;
    // 若未触发浏览器文件落盘（如使用 dataURL 或仅 Spy 捕获），继续从 Spy 读取
  }

  await sleep(120);
  const spyDl = await session.evaluate((prev) => (window.__e2eSpy?.downloads || []).slice(prev), beforeDl);

  let rawJsonText = downloadedFile ? downloadedFile.buffer.toString('utf8') : null;
  if (!rawJsonText && spyDl.length > 0) {
    const rec = spyDl.find(
      (d) =>
        (d.text && (!d.download || /\.json$/i.test(d.download))) ||
        (d.href || '').startsWith('data:application/json')
    );
    if (rec?.text) rawJsonText = rec.text;
    else if (rec?.href?.startsWith('data:')) {
      const idx = rec.href.indexOf(',');
      if (idx >= 0) rawJsonText = decodeURIComponent(rec.href.slice(idx + 1));
    }
  }

  if (!rawJsonText) {
    throw new Error(
      `点击「导出 JSON」后既未收到匹配的 .json 下载文件，也未通过 Spy 捕获 JSON 文本${
        downloadError ? ` (${downloadError.message})` : ''
      }`
    );
  }
  const parsed = JSON.parse(rawJsonText);
  return { rawJsonText, parsed, filePath: downloadedFile?.filePath || null };
}

/**
 * 通过隐藏/可见 <input type="file"> 导入 JSON 备份（写入临时文件并调用 DOM.setFileInputFiles）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {string} jsonText
 */
export async function importJsonReport(session, jsonText) {
  const tmpFile = path.join(os.tmpdir(), `perfume-import-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tmpFile, jsonText, 'utf8');
  try {
    // 检查当前弹窗或主页面是否存在 input[type="file"]
    const hasFileInput = await session.evaluate(() => Boolean(document.querySelector('input[type="file"]')));
    if (!hasFileInput) {
      await openReportModal(session);
    }
    await session.setFileInputFiles('input[type="file"]', [tmpFile]);
    await sleep(250);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

/**
 * 几何审计 1：视口锁定与水平溢出检测
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {number} expectedWidth
 */
export async function auditViewportOverflow(session, expectedWidth) {
  const report = await session.evaluate((expW) => {
    const innerWidth = window.innerWidth;
    const docScroll = document.documentElement.scrollWidth;
    const bodyScroll = document.body.scrollWidth;

    const overflowNodes = [];
    const all = Array.from(document.querySelectorAll('body *'));
    for (const el of all) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      // 若自身处于一个不溢出的横向滚动容器内，豁免子节点
      let p = el.parentElement;
      let insideBoundedScroll = false;
      while (p && p !== document.body) {
        const pst = getComputedStyle(p);
        if ((pst.overflowX === 'auto' || pst.overflowX === 'scroll') && p.getBoundingClientRect().right <= expW + 1) {
          insideBoundedScroll = true;
          break;
        }
        p = p.parentElement;
      }
      if (insideBoundedScroll) continue;

      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > expW + 1 || r.left < -1) {
        overflowNodes.push({
          tag: el.tagName.toLowerCase(),
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          text: (el.innerText || el.textContent || '').trim().slice(0, 40),
        });
      }
    }

    return {
      expectedWidth: expW,
      innerWidth,
      docScrollWidth: docScroll,
      bodyScrollWidth: bodyScroll,
      viewportWidthMatched: innerWidth === expW,
      hasHorizontalOverflow:
        innerWidth !== expW || docScroll > expW || bodyScroll > expW || overflowNodes.length > 0,
      overflowNodes: overflowNodes.slice(0, 15),
    };
  }, expectedWidth);

  return report;
}

/**
 * 在活动战报弹窗内提取单款香水的条目容器文本（隔离其他香水条目防止串读假绿）
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {RegExp} targetNameRegex
 * @param {string[]} otherPerfumeNames
 */
export async function readReportEntryText(session, targetNameRegex, otherPerfumeNames) {
  return await session.evaluate(
    (tSrc, tFlags, others) => {
      const tRe = new RegExp(tSrc, tFlags);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')).filter((d) => {
        if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05 || st.pointerEvents === 'none') {
          return false;
        }
        const r = d.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const dlg = dialogs[dialogs.length - 1];
      if (!dlg) return { found: false, entries: [] };

      const candidates = Array.from(dlg.querySelectorAll('li, tr, article, section, div, p')).filter((el) => {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!tRe.test(t)) return false;
        return !others.some((name) => t.includes(name));
      });

      const outerEntries = candidates.filter(
        (el) => !candidates.some((other) => other !== el && other.contains(el))
      );
      const entryTexts = outerEntries.map((el) =>
        (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
      );

      if (entryTexts.length === 0) {
        const lines = (dlg.innerText || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => tRe.test(l) && !others.some((n) => l.includes(n)));
        return { found: lines.length > 0, entries: lines };
      }
      return { found: entryTexts.length > 0, entries: entryTexts };
    },
    targetNameRegex.source,
    targetNameRegex.flags,
    otherPerfumeNames
  );
}

/**
 * 几何审计 2：移动端触控热区（>= 44×44px，含有效 ::before/::after 扩充热区）与兄弟误触重叠检测
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {{ minSize?: number, scope?: 'all'|'dialog'|'main', labelFilter?: RegExp|null, withinFirstCard?: boolean }} options
 */
export async function auditTouchTargets(
  session,
  { minSize = 44, scope = 'all', labelFilter = null, withinFirstCard = false } = {}
) {
  return await session.evaluate(
    (minDim, targetScope, filterSrc, filterFlags, firstCardOnly) => {
      const selector =
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';
      const labelRe = filterSrc ? new RegExp(filterSrc, filterFlags) : null;

      function isVisible(el) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          const st = getComputedStyle(cur);
          if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
          if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') return false;
          cur = cur.parentElement;
        }
        return true;
      }

      const activeDialogs = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')
      ).filter(isVisible);
      const topDialog = activeDialogs[activeDialogs.length - 1] || null;

      let rootEl = document;
      if (firstCardOnly) {
        let firstCard = Array.from(document.querySelectorAll('[data-perfume-id]')).find(
          (el) => !el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]') && isVisible(el)
        );
        if (!firstCard) {
          const candidates = Array.from(document.querySelectorAll('article, section, li, div')).filter((el) => {
            if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]') || !isVisible(el)) return false;
            if (!el.querySelector('button, [role="radio"], [role="button"]')) return false;
            const t = el.innerText || '';
            return /爱马仕|Herm[eè]s/i.test(t) && /大地/.test(t);
          });
          candidates.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
          firstCard = candidates[0] || null;
        }
        if (!firstCard) {
          return {
            totalChecked: 0,
            minSize: minDim,
            undersized: [{ tag: 'card', label: '未找到主列表首张卡片', width: 0, height: 0 }],
            outOfBounds: [],
            overlaps: [],
            passed: false,
          };
        }
        rootEl = firstCard;
      }

      const elements = Array.from(rootEl.querySelectorAll(selector)).filter((el) => {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        if (!isVisible(el)) return false;
        if (targetScope === 'dialog' && (!topDialog || !topDialog.contains(el))) return false;
        if (targetScope === 'main' && el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) {
          return false;
        }
        if (targetScope === 'all' && topDialog && !topDialog.contains(el)) return false;
        if (labelRe) {
          const txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
          if (!labelRe.test(txt)) return false;
        }
        return true;
      });

      function getEffectiveBox(el) {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        let left = r.left;
        let top = r.top;
        let right = r.right;
        let bottom = r.bottom;

        // 仅当宿主非 position: static 且未设置 overflow: hidden/clip，且伪元素本身 pointer-events !== 'none' 时，才认可伪元素扩充热区
        const hostAllowsPseudo =
          st.position !== 'static' &&
          st.overflow !== 'hidden' &&
          st.overflow !== 'clip' &&
          st.overflowX !== 'hidden' &&
          st.overflowX !== 'clip' &&
          st.overflowY !== 'hidden' &&
          st.overflowY !== 'clip';

        if (hostAllowsPseudo) {
          for (const pseudo of ['::before', '::after']) {
            const pst = getComputedStyle(el, pseudo);
            if (
              pst &&
              pst.content &&
              pst.content !== 'none' &&
              pst.position === 'absolute' &&
              pst.pointerEvents !== 'none'
            ) {
              const pw = parseFloat(pst.width) || 0;
              const ph = parseFloat(pst.height) || 0;
              if (pw > 0 && ph > 0) {
                const cx = (r.left + r.right) / 2;
                const cy = (r.top + r.bottom) / 2;
                left = Math.min(left, cx - pw / 2);
                right = Math.max(right, cx + pw / 2);
                top = Math.min(top, cy - ph / 2);
                bottom = Math.max(bottom, cy + ph / 2);
              }
            }
          }
        }
        return {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
          rawWidth: r.width,
          rawHeight: r.height,
        };
      }

      const undersized = [];
      const outOfBounds = [];
      const boxes = [];

      for (const el of elements) {
        const box = getEffectiveBox(el);
        const label = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.tagName)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40);
        if (box.width < minDim - 0.1 || box.height < minDim - 0.1) {
          undersized.push({
            tag: el.tagName.toLowerCase(),
            label,
            ariaLabel: (el.getAttribute('aria-label') || '').trim(),
            width: Math.round(box.width * 10) / 10,
            height: Math.round(box.height * 10) / 10,
            rawWidth: Math.round(box.rawWidth * 10) / 10,
            rawHeight: Math.round(box.rawHeight * 10) / 10,
          });
        }
        if (box.left < -1 || box.right > window.innerWidth + 1) {
          outOfBounds.push({ tag: el.tagName.toLowerCase(), label, left: box.left, right: box.right });
        }
        boxes.push({ el, label, box });
      }

      function getFixedAncestor(el) {
        let cur = el;
        while (cur && cur.nodeType === 1 && cur !== document.documentElement && cur !== document.body) {
          if (getComputedStyle(cur).position === 'fixed') return cur;
          cur = cur.parentElement;
        }
        return null;
      }

      // 相邻防误触重叠检测（同层交互控件，排除 fixed 浮层与普通滚动流跨层遮挡误报）
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const fa = getFixedAncestor(a.el);
          const fb = getFixedAncestor(b.el);
          if (Boolean(fa) !== Boolean(fb)) continue;
          // 使用原始视觉矩形检测重叠，避免 ::before 负边距透明扩展误报相邻
          const ra = a.el.getBoundingClientRect();
          const rb = b.el.getBoundingClientRect();
          const ix = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
          const iy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
          if (ix * iy > 4) {
            overlaps.push({ a: a.label, b: b.label, area: Math.round(ix * iy) });
          }
        }
      }

      return {
        totalChecked: elements.length,
        minSize: minDim,
        undersized,
        outOfBounds,
        overlaps,
        passed: undersized.length === 0 && outOfBounds.length === 0 && overlaps.length === 0,
      };
    },
    minSize,
    scope,
    labelFilter ? labelFilter.source : null,
    labelFilter ? labelFilter.flags : '',
    withinFirstCard
  );
}

/**
 * 几何审计 3：文本输入与 <textarea> 计算字号 >= 16px（防止 iOS 自动缩放）
 * @param {import('./cdp-client.mjs').CdpSession} session
 */
export async function auditTextareaFontSize(session, { minFontSize = 16 } = {}) {
  return await session.evaluate((minFs) => {
    const inputs = Array.from(
      document.querySelectorAll('textarea, input[type="text"], input[type="search"], input:not([type])')
    ).filter((el) => {
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
    });

    const violations = [];
    for (const el of inputs) {
      const fsBefore = parseFloat(getComputedStyle(el).fontSize);
      el.focus();
      const fsFocus = parseFloat(getComputedStyle(el).fontSize);
      if (fsBefore < minFs || fsFocus < minFs) {
        violations.push({
          tag: el.tagName.toLowerCase(),
          fontSize: fsBefore,
          focusFontSize: fsFocus,
          placeholder: el.getAttribute('placeholder') || '',
        });
      }
    }
    return {
      totalChecked: inputs.length,
      minFontSize: minFs,
      violations,
      passed: violations.length === 0,
    };
  }, minFontSize);
}

/**
 * 文本审计 4：未汉化模板词与残留英文单词扫描
 * @param {import('./cdp-client.mjs').CdpSession} session
 * @param {{ ignoredUserTexts?: string[] }} options
 */
export async function auditUnlocalizedText(session, { ignoredUserTexts = [] } = {}) {
  const chunks = await session.evaluate(() => {
    const out = [];
    function isVisible(node) {
      let el = node.nodeType === 1 ? node : node.parentElement;
      while (el && el.nodeType === 1) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
        el = el.parentElement;
      }
      return true;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const txt = (n.nodeValue || '').trim();
      if (!txt) continue;
      if (!isVisible(n)) continue;
      const parentTag = n.parentElement?.tagName?.toLowerCase() || '';
      if (parentTag === 'script' || parentTag === 'style' || parentTag === 'textarea') continue;
      out.push({ tag: parentTag, text: txt });
    }

    document.querySelectorAll('[placeholder]').forEach((el) => {
      if (isVisible(el)) {
        const ph = (el.getAttribute('placeholder') || '').trim();
        if (ph) out.push({ tag: `${el.tagName.toLowerCase()}[placeholder]`, text: ph });
      }
    });

    document.querySelectorAll('input[type="button"], input[type="submit"], input[type="reset"]').forEach((el) => {
      if (isVisible(el)) {
        const val = (el.value || el.getAttribute('value') || '').trim();
        if (val) out.push({ tag: `input[type="${el.type}"]`, text: val });
      }
    });

    document.querySelectorAll('button, [role="button"], [role="tab"]').forEach((el) => {
      if (!isVisible(el)) return;
      const visText = (el.innerText || el.textContent || '').trim();
      if (!/[\u4e00-\u9fff]/.test(visText)) {
        const aria = (el.getAttribute('aria-label') || '').trim();
        if (aria) out.push({ tag: `${el.tagName.toLowerCase()}[aria-label]`, text: aria });
      }
    });
    return out;
  });

  const forbiddenHits = [];
  const suspiciousTokens = [];
  for (const chunk of chunks) {
    let text = chunk.text;
    for (const ign of ignoredUserTexts) {
      if (ign) text = text.split(ign).join(' ');
    }
    const res = scanUnlocalizedText(text);
    for (const f of res.forbiddenHits) {
      forbiddenHits.push({ tag: chunk.tag, ...f });
    }
    for (const s of res.suspiciousTokens) {
      suspiciousTokens.push({ tag: chunk.tag, token: s, context: text.slice(0, 80) });
    }
  }

  return {
    forbiddenHits,
    suspiciousTokens,
    passed: forbiddenHits.length === 0 && suspiciousTokens.length === 0,
  };
}
