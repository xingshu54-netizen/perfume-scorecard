/**
 * Tier 1 — 功能覆盖用例（F1–F9 每项 6 条，共 54 条）
 * 用例编号：T1-F1-01 ~ T1-F9-06
 */

import assert from 'node:assert/strict';
import {
  EXPECTED_CATALOG,
  EXPECTED_INTENTS,
  EXPECTED_STORAGE_KEY,
} from '../lib/expected-catalog.mjs';
import {
  assertCleanDiagnostics,
  auditViewportOverflow,
  closeActiveDialog,
  confirmPinkDiamondQuantity,
  exportJsonReport,
  findPerfumeCard,
  importJsonReport,
  installExportSpies,
  locatePerfumeCards,
  openDetailDrawer,
  openReportModal,
  readActiveDialog,
  readActiveDrawerControls,
  readCardState,
  readProgress,
  readReportEntryText,
  selectFilter,
  selectSort,
  setBuyIntent,
  setDrawerDimensions,
  setDrawerNote,
  setPerfumeScore,
  triggerReset,
  verifyCanvasLongImage,
  verifyCopyTextReport,
  waitForCardsReady,
} from '../lib/semantic-helpers.mjs';
import { sleep } from '../lib/cdp-client.mjs';

export const TIER1_CASES = [
  // ==================== F1: 10 款不重复香水清单与去重合并 (6) ====================
  {
    id: 'T1-F1-01',
    tier: 1,
    feature: 'F1',
    title: '主列表严格展示 10 张不重复香水卡片',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      assert.equal(cards.length, 10, `预期 10 张香水卡片，实际为 ${cards.length}`);
      const ids = cards.map((c) => c.id).filter(Boolean);
      if (ids.length === 10) {
        assert.equal(new Set(ids).size, 10, `存在重复的 data-perfume-id: ${ids.join(', ')}`);
      }
      const catalogMatches = new Set(cards.map((c) => c.catalogIndex).filter(Boolean));
      assert.equal(catalogMatches.size, 10, '卡片未能唯一映射到 10 款权威目录');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-01' });
    },
  },
  {
    id: 'T1-F1-02',
    tier: 1,
    feature: 'F1',
    title: '10 款权威品牌与香名完整覆盖无遗漏',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      for (const expected of EXPECTED_CATALOG) {
        const matched = cards.filter(
          (c) =>
            expected.brandMatchers.some((re) => re.test(c.text)) &&
            expected.nameMatchers.some((re) => re.test(c.text))
        );
        assert.equal(
          matched.length,
          1,
          `预期「${expected.brandZh} ${expected.nameZh}」精确出现 1 次，实际命中 ${matched.length} 次`
        );
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-02' });
    },
  },
  {
    id: 'T1-F1-03',
    tier: 1,
    feature: 'F1',
    title: '「阿玛尼 自我无界」跨单合并为单卡且包含双规格与汇总',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      const armaniCards = cards.filter((c) => /自我无界/.test(c.text));
      assert.equal(armaniCards.length, 1, `自我无界应合并为 1 张卡，实际找到 ${armaniCards.length} 张`);
      const text = armaniCards[0].text;
      const expected = EXPECTED_CATALOG.find((x) => x.suggestedId === 'armani-my-way');
      for (const pat of expected.expectedSpecPatterns) {
        assert.match(text, pat, `自我无界卡片缺少预期合并规格/汇总模式 ${pat}；实际文本: ${text}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-03' });
    },
  },
  {
    id: 'T1-F1-04',
    tier: 1,
    feature: 'F1',
    title: '其余 8 款明确规格与订单浓度逐一精确核对',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const item of EXPECTED_CATALOG) {
        if (item.isMerged || item.quantityUncertain) continue;
        const { card } = await findPerfumeCard(session, item);
        for (const pat of item.expectedSpecPatterns) {
          assert.match(
            card.text,
            pat,
            `#${item.index}「${item.brandZh} ${item.nameZh}」缺少预期规格/浓度模式 ${pat}；实际: ${card.text}`
          );
        }
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-04' });
    },
  },
  {
    id: 'T1-F1-05',
    tier: 1,
    feature: 'F1',
    title: '「范思哲 粉耀晶钻」展示 1ml 并诚实标注数量待确认',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const item = EXPECTED_CATALOG.find((x) => x.quantityUncertain);
      const { card } = await findPerfumeCard(session, item);
      assert.match(card.text, /(?<![\d.])1(?:\.0)?\s*ml/i, `粉钻卡片应显示 1ml；实际: ${card.text}`);
      assert.match(
        card.text,
        item.uncertainPromptPattern,
        `粉钻卡片必须诚实呈现待确认/遮挡提示；实际: ${card.text}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-05' });
    },
  },
  {
    id: 'T1-F1-06',
    tier: 1,
    feature: 'F1',
    title: '「范思哲 粉耀晶钻」支持手动点选确认数量 ×2 并更新状态',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const state = await confirmPinkDiamondQuantity(session, 2);
      assert.ok(state, '粉钻确认后未读取到卡片状态');
      assert.match(state.text, /(?:×|x|\*)\s*2|2\s*支/, `确认 ×2 后卡片未显示 ×2；实际: ${state.text}`);
      const { card: pinkCard } = await findPerfumeCard(session, 5);
      const btnActive = await session.evaluate((cardId) => {
        const isInsideDialogOrHidden = (el) => {
          if (el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]')) return true;
          let cur = el;
          while (cur && cur.nodeType === 1) {
            if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') return true;
            const st = getComputedStyle(cur);
            if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return true;
            cur = cur.parentElement;
          }
          return false;
        };

        let pink = cardId
          ? Array.from(document.querySelectorAll('[data-perfume-id]')).find(
              (c) => c.getAttribute('data-perfume-id') === cardId && !isInsideDialogOrHidden(c)
            )
          : null;
        if (!pink) {
          const candidates = Array.from(document.querySelectorAll('article, section, li, div')).filter((el) => {
            if (isInsideDialogOrHidden(el)) return false;
            if (!el.querySelector('button, [role="button"], [role="radio"], input[type="radio"]')) return false;
            const t = el.innerText || el.textContent || '';
            return /(?:范思哲|Versace)/i.test(t) && /(?:粉耀晶钻|粉钻|Bright\s+Crystal)/i.test(t);
          });
          candidates.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
          pink = candidates[0] || null;
        }
        if (!pink) return false;

        const isSemanticActive = (el) => {
          if (!el) return false;
          if (
            el.getAttribute('aria-pressed') === 'true' ||
            el.getAttribute('aria-checked') === 'true' ||
            el.getAttribute('aria-selected') === 'true' ||
            el.getAttribute('data-active') === 'true' ||
            el.getAttribute('data-selected') === 'true' ||
            Boolean(el.checked)
          ) {
            return true;
          }
          if (el.tagName === 'LABEL') {
            const ctrl =
              el.control ||
              (el.getAttribute('for') ? document.getElementById(el.getAttribute('for')) : null) ||
              el.querySelector('input[type="radio"], input[type="checkbox"]');
            if (ctrl && Boolean(ctrl.checked)) return true;
          }
          return false;
        };

        const ctrls = Array.from(
          pink.querySelectorAll('button, [role="button"], [role="radio"], input[type="radio"], input[type="checkbox"], label')
        );
        const matchesQty2 = (el) => {
          const txt = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.value || '').trim();
          return /(?:×|x|\*)\s*2|2\s*支|^2$/.test(txt);
        };
        return ctrls.some((el) => matchesQty2(el) && isSemanticActive(el));
      }, pinkCard.id);
      assert.equal(btnActive, true, '点击粉钻 ×2 后按钮未呈激活选中态（需具备 ARIA / data-active / data-selected / :checked 语义态）');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F1-06' });
    },
  },

  // ==================== F2: 手机端试香卡片与信息层级 (6) ====================
  {
    id: 'T1-F2-01',
    tier: 1,
    feature: 'F2',
    title: '顶部概览呈现中文标题与初始进度 0 / 10',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const progress = await readProgress(session);
      assert.equal(progress.tested, 0, `初始已试计数应为 0，实际为 ${progress.tested}`);
      assert.equal(progress.total, 10, `总数应为 10，实际为 ${progress.total}`);
      if (progress.ariaNow !== null) {
        assert.equal(progress.ariaNow, 0, `progressbar aria-valuenow 应为 0，实际为 ${progress.ariaNow}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-01' });
    },
  },
  {
    id: 'T1-F2-02',
    tier: 1,
    feature: 'F2',
    title: '顶部必入/心动计数随卡片选择必入正装实时递增',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const before = await readProgress(session);
      if (before.favoriteCount !== null) {
        assert.equal(before.favoriteCount, 0, '初始必入计数应为 0');
      }
      await setBuyIntent(session, 1, '必入正装');
      const after = await readProgress(session);
      assert.equal(after.tested, 1, '选择必入正装后已试计数应更新为 1');
      if (after.favoriteCount !== null) {
        assert.equal(after.favoriteCount, 1, `选择必入正装后必入计数应更新为 1，实际为 ${after.favoriteCount}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-02' });
    },
  },
  {
    id: 'T1-F2-03',
    tier: 1,
    feature: 'F2',
    title: '10 张卡片头部均展示编号与初始「待试」状态标签',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      assert.equal(cards.length, 10);
      for (let i = 0; i < 10; i++) {
        const expectedNo = String(i + 1).padStart(2, '0');
        const altNo = String(i + 1);
        const hasIndex = cards[i].text.includes(expectedNo) || new RegExp(`(?:^|\\D)${altNo}(?:\\D|$)`).test(cards[i].text);
        assert.equal(hasIndex, true, `第 ${i + 1} 张卡片未包含序号 ${expectedNo}/${altNo}`);
        assert.match(cards[i].text, /待试|未试/, `第 ${i + 1} 张卡片初始状态应包含「待试/未试」`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-03' });
    },
  },
  {
    id: 'T1-F2-04',
    tier: 1,
    feature: 'F2',
    title: '前 3 张卡片呈现实用香调参考信息以辅助试香',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      for (let i = 0; i < 3; i++) {
        const txt = cards[i].text;
        assert.match(
          txt,
          /香调|木质|水生|柑橘|花香|参考|风铃|葡萄柚|雪松|橙花|琥珀/,
          `第 ${i + 1} 张卡片缺少辅助试香参考文案；实际: ${txt}`
        );
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-04' });
    },
  },
  {
    id: 'T1-F2-05',
    tier: 1,
    feature: 'F2',
    title: '点击卡片详情入口打开 L2 底部抽屉并展示对应香水信息',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 4);
      const dlg = await readActiveDialog(session);
      assert.ok(dlg, '打开详情抽屉后未检测到活动弹窗/抽屉');
      assert.match(dlg.text, /自我无界/, `抽屉内未展示目标香水「自我无界」；实际: ${dlg.text}`);
      assert.ok(dlg.rect.left >= -1 && dlg.rect.right <= 376, '详情抽屉横向超出视口');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-05' });
    },
  },
  {
    id: 'T1-F2-06',
    tier: 1,
    feature: 'F2',
    title: '详情抽屉保存场景标签与短评后在 L1 主卡片实时回显',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { scenes: ['通勤日常'] });
      await setDrawerNote(session, '前调葡萄柚很清爽');
      await closeActiveDialog(session, 'button');
      const cardState = await readCardState(session, 1);
      assert.match(cardState.text, /前调葡萄柚很清爽/, `L1 主卡片未回显笔记；实际: ${cardState.text}`);
      assert.match(cardState.text, /通勤/, `L1 主卡片未回显所选场景标签；实际: ${cardState.text}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F2-06' });
    },
  },

  // ==================== F3: 防误触试香打分与购买意愿控件 (6) ====================
  {
    id: 'T1-F3-01',
    tier: 1,
    feature: 'F3',
    title: '单卡支持 4.5 星（或 9 分）精确点选打分并实时回显',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const res = await setPerfumeScore(session, 1, 4.5);
      assert.ok(res.cardState.score !== null, '打分后卡片未读出分值');
      if (res.scaleType === '10-point') {
        assert.equal(res.cardState.score, 9, `10分制预期为 9，实际为 ${res.cardState.score}`);
      } else {
        assert.equal(res.cardState.score, 4.5, `5星制预期为 4.5，实际为 ${res.cardState.score}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-01' });
    },
  },
  {
    id: 'T1-F3-02',
    tier: 1,
    feature: 'F3',
    title: '对未试卡片打分后自动切换状态为「已试」并推进顶部进度',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.0);
      const state = await readCardState(session, 1);
      assert.equal(state.isTested, true, `打分后卡片应标记为「已试」；实际文本: ${state.text}`);
      const prog = await readProgress(session);
      assert.equal(prog.tested, 1, `打 1 款后进度应为 1/10，实际为 ${prog.tested}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-02' });
    },
  },
  {
    id: 'T1-F3-03',
    tier: 1,
    feature: 'F3',
    title: '购买意愿 4 选 1 胶囊严格互斥切换',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const intent of EXPECTED_INTENTS) {
        const st = await setBuyIntent(session, 2, intent);
        assert.deepEqual(
          st.activeIntents,
          [intent],
          `点选「${intent}」后激活意愿应严格唯一为 [${intent}]，实际: ${JSON.stringify(st.activeIntents)}`
        );
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-03' });
    },
  },
  {
    id: 'T1-F3-04',
    tier: 1,
    feature: 'F3',
    title: '仅选择购买意愿（不打分）也自动计入「已试」与心愿统计',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const st = await setBuyIntent(session, 3, '必入正装');
      assert.equal(st.isTested, true, '选择必入正装后卡片应自动变为「已试」');
      const prog = await readProgress(session);
      assert.equal(prog.tested, 1, '顶部已试计数应实时更新为 1');
      if (prog.favoriteCount !== null) {
        assert.equal(prog.favoriteCount, 1, '顶部必入/心愿计数应实时更新为 1');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-04' });
    },
  },
  {
    id: 'T1-F3-05',
    tier: 1,
    feature: 'F3',
    title: '已选购买意愿可再次点击取消，已评分支持清分或改分实时更新',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.0);
      await setBuyIntent(session, 1, '再试几次');
      const toggledOff = await setBuyIntent(session, 1, '再试几次');
      assert.equal(toggledOff.activeIntents.length, 0, '再次点击同一意愿胶囊应能取消选中');

      const cleared = await setPerfumeScore(session, 1, null, { optional: true });
      if (cleared.cleared) {
        assert.equal(cleared.cardState.score, null, '清除评分后应不再显示分值');
        assert.equal(cleared.cardState.isUntested, true, '清除评分且无意愿后卡片应回到待试状态');
      } else {
        const updated = await setPerfumeScore(session, 1, 2.5);
        const expected = updated.scaleType === '10-point' ? 5 : 2.5;
        assert.equal(
          updated.cardState.score,
          expected,
          `改分为 2.5 后分值应实时更新为 ${expected}，实际 ${updated.cardState.score}`
        );
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-05' });
    },
  },
  {
    id: 'T1-F3-06',
    tier: 1,
    feature: 'F3',
    title: '在 390×844 视口逐一对全部 10 款打分并推进至 10 / 10',
    viewport: { width: 390, height: 844 },
    async run({ session }) {
      const scores = [3.5, 4.0, 4.5, 5.0, 3.5, 3.0, 3.5, 4.0, 5.0, 4.5];
      for (let i = 0; i < 10; i++) {
        await setPerfumeScore(session, i + 1, scores[i]);
        await setBuyIntent(session, i + 1, i % 2 === 0 ? '必入正装' : '再试几次');
      }
      const prog = await readProgress(session);
      assert.equal(prog.tested, 10, `全部打完后应为 10/10，实际为 ${prog.tested}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F3-06' });
    },
  },

  // ==================== F4: 进阶维度与试香随手记抽屉 (6) ====================
  {
    id: 'T1-F4-01',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉内前调与中后调好感度独立选择互不覆盖',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { topNote: 4, baseNote: 5 });
      const topActive = await readActiveDrawerControls(session, /前调/);
      const baseActive = await readActiveDrawerControls(session, /中后调|后调/);
      assert.ok(topActive.some((t) => /4/.test(t)), `前调 4 未保持语义激活态；实际激活: ${topActive.join(',')}`);
      assert.ok(baseActive.some((t) => /5/.test(t)), `中后调 5 未保持语义激活态；实际激活: ${baseActive.join(',')}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-01' });
    },
  },
  {
    id: 'T1-F4-02',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉留香时长单选互斥（短 -> 持久）',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { longevity: '短' });
      await setDrawerDimensions(session, { longevity: '持久' });
      const active = await readActiveDrawerControls(session, /留香/);
      assert.ok(active.some((t) => /持久|长|6h\+/.test(t)), `持久未保持语义激活态: ${active.join(',')}`);
      assert.ok(!active.some((t) => /^(?:短|<3h)/.test(t)), `原选择「短」未取消激活: ${active.join(',')}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-02' });
    },
  },
  {
    id: 'T1-F4-03',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉浓淡扩散单选互斥（偏淡 -> 适中）',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { sillage: '偏淡' });
      await setDrawerDimensions(session, { sillage: '适中' });
      const active = await readActiveDrawerControls(session, /浓淡|扩散/);
      assert.ok(active.some((t) => /适中|刚好/.test(t)), `「适中」未保持语义激活态: ${active.join(',')}`);
      assert.ok(!active.some((t) => /偏淡/.test(t)), `「偏淡」未取消激活: ${active.join(',')}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-03' });
    },
  },
  {
    id: 'T1-F4-04',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉场景标签支持多选与再次点击反选',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { scenes: ['通勤日常', '约会氛围', '春夏清爽'] });
      // 反选中间的「约会氛围」
      await setDrawerDimensions(session, { scenes: ['约会氛围'] });
      const active = await readActiveDrawerControls(session, /场景|标签/);
      assert.ok(active.some((t) => /通勤/.test(t)), `通勤日常应保持语义激活态；实际: ${active.join(',')}`);
      assert.ok(active.some((t) => /春夏/.test(t)), `春夏清爽应保持语义激活态；实际: ${active.join(',')}`);
      assert.ok(!active.some((t) => /约会/.test(t)), '再次点击「约会氛围」应取消选中');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-04' });
    },
  },
  {
    id: 'T1-F4-05',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉试香笔记输入并关闭重开后完整保留',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const note = '中后调雪松很干净，适合秋冬穿大衣';
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, note);
      await closeActiveDialog(session, 'button');
      await openDetailDrawer(session, 1);
      const dlg = await readActiveDialog(session);
      assert.equal(dlg.textareaValue, note, `重开抽屉后笔记不一致: ${dlg.textareaValue}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-05' });
    },
  },
  {
    id: 'T1-F4-06',
    tier: 1,
    feature: 'F4',
    title: '详情抽屉支持按钮关闭以及遮罩/Escape 关闭后恢复交互',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await closeActiveDialog(session, 'button');
      await openDetailDrawer(session, 2);
      await closeActiveDialog(session, 'backdrop');
      // 确认页面恢复可点击打分
      const res = await setPerfumeScore(session, 2, 4.0);
      assert.ok(res.cardState.isTested, '关闭抽屉后主列表应恢复可打分');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F4-06' });
    },
  },

  // ==================== F5: 筛选、排序与 Top3 心愿总结 (6) ====================
  {
    id: 'T1-F5-01',
    tier: 1,
    feature: 'F5',
    title: '筛选栏全部/待试/已试/必入正装精确过滤卡片数量',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 5.0);
      await setBuyIntent(session, 1, '必入正装');
      await setPerfumeScore(session, 2, 3.5);
      await setBuyIntent(session, 2, '再试几次');

      assert.equal((await selectFilter(session, 'all')).length, 10, '「全部」筛选应显示 10 张');
      assert.equal((await selectFilter(session, 'untested')).length, 8, '「待试」筛选应显示 8 张');
      assert.equal((await selectFilter(session, 'tested')).length, 2, '「已试」筛选应显示 2 张');
      const favCards = await selectFilter(session, 'favorite');
      assert.equal(favCards.length, 1, '「必入正装」筛选应显示 1 张');
      assert.equal(favCards[0].catalogIndex, 1, '必入正装筛选结果应为第 1 款');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-01' });
    },
  },
  {
    id: 'T1-F5-02',
    tier: 1,
    feature: 'F5',
    title: '空筛选结果时展示友好中文空状态引导与恢复按钮',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const favCards = await selectFilter(session, 'favorite');
      assert.equal(favCards.length, 0, '无必入记录时筛选列表应为 0 张');
      const emptyInfo = await session.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const resetBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
          /查看全部|重置筛选|显示全部|去试香/.test((b.innerText || b.textContent || '').trim())
        );
        return {
          hasGuide: /暂无|还没有|空空如也|快去|挑/.test(bodyText),
          hasResetBtn: Boolean(resetBtn),
        };
      });
      assert.equal(emptyInfo.hasGuide, true, '空状态应展示清晰中文引导文案');
      assert.equal(emptyInfo.hasResetBtn, true, '空状态应提供恢复全部筛选按钮');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-02' });
    },
  },
  {
    id: 'T1-F5-03',
    tier: 1,
    feature: 'F5',
    title: '点击空状态引导中的恢复按钮切回全部 10 款列表',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await selectFilter(session, 'favorite');
      await session.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
          /查看全部|重置筛选|显示全部/.test((b.innerText || b.textContent || '').trim())
        );
        if (!btn) throw new Error('未找到空状态恢复全部按钮');
        btn.click();
      });
      await sleep(100);
      const cards = await locatePerfumeCards(session);
      assert.equal(cards.length, 10, `点击恢复后应重新展示 10 张卡片，实际 ${cards.length}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-03' });
    },
  },
  {
    id: 'T1-F5-04',
    tier: 1,
    feature: 'F5',
    title: '切换排序为「评分从高到低」后按分值降序重排',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 3.0);
      await setPerfumeScore(session, 4, 5.0);
      await setPerfumeScore(session, 9, 4.0);
      const sorted = await selectSort(session, 'scoreDesc');
      assert.equal(sorted[0].catalogIndex, 4, `第 1 名应为 #4 (5.0)，实际为 #${sorted[0]?.catalogIndex}`);
      assert.equal(sorted[1].catalogIndex, 9, `第 2 名应为 #9 (4.0)，实际为 #${sorted[1]?.catalogIndex}`);
      assert.equal(sorted[2].catalogIndex, 1, `第 3 名应为 #1 (3.0)，实际为 #${sorted[2]?.catalogIndex}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-04' });
    },
  },
  {
    id: 'T1-F5-05',
    tier: 1,
    feature: 'F5',
    title: '从评分降序切回「原单顺序」恢复 01..10 排列',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 4, 5.0);
      await selectSort(session, 'scoreDesc');
      const restored = await selectSort(session, 'original');
      assert.deepEqual(
        restored.map((c) => c.catalogIndex),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        '恢复原单顺序后卡片排列应严格为 1..10'
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-05' });
    },
  },
  {
    id: 'T1-F5-06',
    tier: 1,
    feature: 'F5',
    title: '已试均分与 Top3 心愿总结区准确汇总高分款',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const r1 = await setPerfumeScore(session, 1, 5.0);
      await setPerfumeScore(session, 2, 4.0);
      await setPerfumeScore(session, 3, 3.0);
      const prog = await readProgress(session);
      const expectedAvg = r1.scaleType === '10-point' ? '8' : '4';
      if (prog.averageText) {
        assert.ok(
          prog.averageText.startsWith(expectedAvg),
          `均分预期为 ${expectedAvg}.0，实际为 ${prog.averageText}`
        );
      }
      // 定位含 Top 3/心愿 的最小总结容器校验包含第 1 名「大地」（严禁扫描整页 body）
      const topSummary = await session.evaluate(() => {
        const isExcluded = (el) =>
          Boolean(el.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-perfume-id]'));
        const blocks = Array.from(document.querySelectorAll('section, aside, div, article')).filter((el) => {
          if (isExcluded(el)) return false;
          if (el.querySelector('[data-perfume-id]')) return false;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          return /(?:Top\s*3|心愿榜单|心愿清单|心动\s*Top|心愿总结|榜单)/i.test(t) && t.length > 6;
        });
        blocks.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        const target = blocks[0] || null;
        return target ? { found: true, text: (target.innerText || '').replace(/\s+/g, ' ').trim() } : { found: false, text: '' };
      });
      if (topSummary.found) {
        assert.match(topSummary.text, /大地/, `Top3 总结容器应包含 5.0 分的大地；实际容器文本: ${topSummary.text}`);
      } else {
        const dlg = await openReportModal(session);
        assert.match(dlg.text, /大地/, '战报 Top3 总结应包含 5.0 分的大地');
        await closeActiveDialog(session, 'button');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T1-F5-06' });
    },
  },

  // ==================== F6: 本地持久化与防误触重置 (6) ====================
  {
    id: 'T1-F6-01',
    tier: 1,
    feature: 'F6',
    title: '打分与笔记变更实时序列化写入 localStorage(perfume_scorecard_v1)',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const res = await setPerfumeScore(session, 3, 4.5);
      await setBuyIntent(session, 3, '必入正装');
      await openDetailDrawer(session, 3);
      await setDrawerNote(session, '甜美温柔');
      await closeActiveDialog(session, 'button');

      const raw = await session.evaluate((k) => localStorage.getItem(k), EXPECTED_STORAGE_KEY);
      assert.ok(raw, `localStorage[${EXPECTED_STORAGE_KEY}] 不应为空`);
      const parsed = JSON.parse(raw);
      const serialized = JSON.stringify(parsed);
      assert.match(serialized, /甜美温柔/, 'localStorage 中未持久化笔记内容');
      assert.ok(
        serialized.includes(String(res.appliedScore)) || serialized.includes('4.5') || serialized.includes('9'),
        'localStorage 中未持久化评分数值'
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-01' });
    },
  },
  {
    id: 'T1-F6-02',
    tier: 1,
    feature: 'F6',
    title: '刷新页面后完整恢复评分、意愿、L2 维度与笔记',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const s3 = await setPerfumeScore(session, 3, 4.5);
      await setBuyIntent(session, 3, '必入正装');
      await openDetailDrawer(session, 3);
      await setDrawerDimensions(session, { longevity: '持久', scenes: ['约会氛围'] });
      await setDrawerNote(session, '甜美温柔');
      await closeActiveDialog(session, 'button');
      await setPerfumeScore(session, 1, 3.5);

      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      const prog = await readProgress(session);
      assert.equal(prog.tested, 2, `刷新后进度应保留 2/10，实际 ${prog.tested}`);
      const c3 = await readCardState(session, 3);
      assert.equal(c3.score, s3.cardState.score, '刷新后第 3 款评分未恢复');
      assert.deepEqual(c3.activeIntents, ['必入正装'], '刷新后第 3 款意愿未恢复');
      await openDetailDrawer(session, 3);
      const dlg = await readActiveDialog(session);
      assert.equal(dlg.textareaValue, '甜美温柔', '刷新后抽屉笔记未恢复');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-02' });
    },
  },
  {
    id: 'T1-F6-03',
    tier: 1,
    feature: 'F6',
    title: '「范思哲 粉耀晶钻」手动确认数量刷新后持久保留',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await confirmPinkDiamondQuantity(session, 2);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const st = await readCardState(session, 5);
      assert.match(st.text, /(?:×|x|\*)\s*2|2\s*支/, `刷新后粉钻确认 ×2 未保留；实际: ${st.text}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-03' });
    },
  },
  {
    id: 'T1-F6-04',
    tier: 1,
    feature: 'F6',
    title: '点击清空全部记录先弹出二次确认，不会直接删除数据',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 5.0);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, '保护测试笔记');
      await closeActiveDialog(session, 'button');

      await triggerReset(session, 'cancel');
      const st = await readCardState(session, 1);
      assert.ok(st.score !== null, '取消重置后评分被误删');
      assert.match(st.text, /保护测试笔记/, '取消重置后笔记被误删');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-04' });
    },
  },
  {
    id: 'T1-F6-05',
    tier: 1,
    feature: 'F6',
    title: '二次确认弹窗点取消后 localStorage 与界面均完好无损',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 2, 4.0);
      const beforeLs = await session.evaluate((k) => localStorage.getItem(k), EXPECTED_STORAGE_KEY);
      await triggerReset(session, 'cancel');
      const afterLs = await session.evaluate((k) => localStorage.getItem(k), EXPECTED_STORAGE_KEY);
      assert.equal(afterLs, beforeLs, '取消清空后 localStorage 不应被修改');
      assert.equal((await readProgress(session)).tested, 1, '取消清空后进度应保留 1/10');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-05' });
    },
  },
  {
    id: 'T1-F6-06',
    tier: 1,
    feature: 'F6',
    title: '二次确认弹窗点击确认清空后彻底归零且刷新不复现',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 5.0);
      await confirmPinkDiamondQuantity(session, 2);
      await triggerReset(session, 'confirm');

      const prog = await readProgress(session);
      assert.equal(prog.tested, 0, `确认清空后应回零，实际 ${prog.tested}`);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const progAfter = await readProgress(session);
      assert.equal(progAfter.tested, 0, '确认清空刷新后仍应保持 0/10');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F6-06' });
    },
  },

  // ==================== F7: 试香战报导出与分享视图 (6) ====================
  {
    id: 'T1-F7-01',
    tier: 1,
    feature: 'F7',
    title: '点击生成试香战报弹窗展示已试进度、Top3 与待试清单',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 5.0);
      await setBuyIntent(session, 1, '必入正装');
      await setPerfumeScore(session, 4, 4.5);
      await setBuyIntent(session, 4, '必入正装');
      await setPerfumeScore(session, 9, 4.0);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, '木质稳重');
      await closeActiveDialog(session, 'button');

      const dlg = await openReportModal(session);
      assert.match(dlg.text, /3\s*\/\s*10|已试\s*3/, `战报未包含 3/10 进度: ${dlg.text}`);
      assert.match(dlg.text, /大地/, '战报未包含已试香水大地');
      assert.match(dlg.text, /木质稳重/, '战报未包含已填试香笔记');
      assert.match(dlg.text, /待试|未试/, '战报未包含待试清单区块');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-01' });
    },
  },
  {
    id: 'T1-F7-02',
    tier: 1,
    feature: 'F7',
    title: '试香战报中「阿玛尼 自我无界」条目完整展示双规格与评分',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const r = await setPerfumeScore(session, 4, 5.0);
      const dlg = await openReportModal(session);
      assert.ok(dlg, '未能打开试香战报弹窗');
      const otherNames = ['大地', '蓝风铃', '我本莫测', '粉耀晶钻', '粉钻', '反转巴黎', '5号', '柑橘罗勒', '真我', '大吉岭'];
      const armaniEntry = await readReportEntryText(session, /自我无界/, otherNames);
      assert.equal(armaniEntry.found, true, `战报弹窗内未找到独立的「自我无界」条目容器；弹窗文本: ${dlg.text.slice(0, 200)}`);
      const hasFullMergedEntry = armaniEntry.entries.some(
        (t) =>
          /0\.5\s*ml/i.test(t) &&
          /(?<![\d.])1(?:\.0)?\s*ml/i.test(t) &&
          /(?:×|x|\*)\s*1/i.test(t) &&
          /(?:×|x|\*)\s*2/i.test(t) &&
          t.includes(String(r.cardState.score))
      );
      assert.equal(
        hasFullMergedEntry,
        true,
        `战报「自我无界」条目内部必须同时展示 0.5ml、1ml、×1、×2 与评分 ${r.cardState.score}；实际条目: ${JSON.stringify(armaniEntry.entries)}`
      );
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-02' });
    },
  },
  {
    id: 'T1-F7-03',
    tier: 1,
    feature: 'F7',
    title: '战报弹窗点击「复制文字战报」生成微信友好完整中文战报',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 5.0);
      await setPerfumeScore(session, 4, 4.5);
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, '温柔白花感');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const copyRes = await verifyCopyTextReport(session, { simulateFailure: false });
      assert.ok(copyRes.clipboardCallCount > 0 || copyRes.hasFallbackBox, '点击复制未触发剪贴板写入或降级文本框');
      assert.match(copyRes.copiedText, /自我无界/, '复制文本缺少自我无界');
      assert.match(copyRes.copiedText, /温柔白花感/, '复制文本缺少试香笔记');
      assert.match(copyRes.copiedText, /0\.5\s*ml/, '复制文本缺少阿玛尼 0.5ml 明细');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-03' });
    },
  },
  {
    id: 'T1-F7-04',
    tier: 1,
    feature: 'F7',
    title: '战报弹窗点击「导出战报长图」通过 Canvas 2D 生成非空 PNG',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 5.0);
      await setPerfumeScore(session, 2, 4.0);
      await openReportModal(session);
      const canvasRes = await verifyCanvasLongImage(session);
      assert.equal(canvasRes.securityErrors.length, 0, 'Canvas 导出发生 SecurityError');
      const hasValidCanvas = canvasRes.canvasInfos.some((c) => c.width > 0 && c.height > 0 && c.nonEmptySample);
      const hasValidExportCall =
        canvasRes.newToDataUrlCalls.some((c) => c.length > 3000) ||
        canvasRes.newToBlobCalls.some((c) => c.size > 1500) ||
        canvasRes.previewImgCount > 0;
      assert.equal(hasValidCanvas || hasValidExportCall, true, '未检测到有效的 Canvas 长图绘制或 PNG 导出输出');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-04' });
    },
  },
  {
    id: 'T1-F7-05',
    tier: 1,
    feature: 'F7',
    title: '战报弹窗点击「导出 JSON」生成包含已填评分、粉钻确认态与笔记的合法备份',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 4.5);
      await confirmPinkDiamondQuantity(session, 2);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, '备份验证笔记');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const exported = await exportJsonReport(session);
      assert.match(exported.rawJsonText, /备份验证笔记/, '导出的 JSON 缺少用户笔记');
      assert.equal(typeof exported.parsed, 'object', '导出的 JSON 解析结果应为对象');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-05' });
    },
  },
  {
    id: 'T1-F7-06',
    tier: 1,
    feature: 'F7',
    title: '通过「导入 JSON」从 0/10 初始态完整恢复备份评分与笔记',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 5.0);
      await setPerfumeScore(session, 4, 4.5);
      await setPerfumeScore(session, 9, 4.0);
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, '导入恢复校验');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const exported = await exportJsonReport(session);
      await closeActiveDialog(session, 'button');

      await triggerReset(session, 'confirm');
      assert.equal((await readProgress(session)).tested, 0, '清空后应归零');

      await importJsonReport(session, exported.rawJsonText);
      const prog = await readProgress(session);
      assert.equal(prog.tested, 3, `导入 JSON 后应恢复为 3/10，实际为 ${prog.tested}`);
      const c4 = await readCardState(session, 4);
      assert.match(c4.text, /导入恢复校验/, '导入 JSON 后未恢复第 4 款笔记');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F7-06' });
    },
  },

  // ==================== F8: 沙龙手账视觉美学与 /ask-emil 动效 (6) ====================
  {
    id: 'T1-F8-01',
    tier: 1,
    feature: 'F8',
    title: '页面配色遵循暖白试香纸底色与深墨色高对比 WCAG AA 规范',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const colors = await session.evaluate(() => {
        function parseRgb(str) {
          const m = String(str).match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
        }
        function luminance([r, g, b]) {
          const f = (v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        }
        const bgStr = getComputedStyle(document.body).backgroundColor;
        const fgStr = getComputedStyle(document.body).color;
        const bg = parseRgb(bgStr);
        const fg = parseRgb(fgStr);
        const l1 = bg ? luminance(bg) : 1;
        const l2 = fg ? luminance(fg) : 0;
        const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return { bgStr, fgStr, bg, fg, contrast };
      });
      assert.ok(colors.bg, `未能解析 body 背景色: ${colors.bgStr}`);
      assert.ok(
        colors.bg[0] >= 225 && colors.bg[1] >= 220 && colors.bg[2] >= 210 && colors.bg[0] >= colors.bg[2],
        `背景色应为高明度暖白纸色，实际 RGB=${colors.bg.join(',')}`
      );
      assert.ok(colors.contrast >= 4.5, `主文本与背景对比度应 >= 4.5:1，实际 ${colors.contrast.toFixed(2)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-01' });
    },
  },
  {
    id: 'T1-F8-02',
    tier: 1,
    feature: 'F8',
    title: '采用极简内联 SVG 线性图标而非 Emoji 充当 UI 正式图标',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const iconAudit = await session.evaluate(() => {
        const svgs = Array.from(document.querySelectorAll('svg')).filter((s) => {
          const r = s.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const emojiRe = /\p{Extended_Pictographic}/u;
        const emojiButtons = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"]'))
          .filter((b) => emojiRe.test(b.innerText || ''))
          .map((b) => (b.innerText || '').trim());
        return { svgCount: svgs.length, emojiButtons };
      });
      assert.ok(iconAudit.svgCount >= 5, `页面可见内联 SVG 图标数应 >= 5，实际 ${iconAudit.svgCount}`);
      assert.equal(
        iconAudit.emojiButtons.length,
        0,
        `UI 控制按钮内不应使用 Emoji 图标: ${iconAudit.emojiButtons.join(', ')}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-02' });
    },
  },
  {
    id: 'T1-F8-03',
    tier: 1,
    feature: 'F8',
    title: '视觉卡片克制优雅，杜绝赛博霓虹渐变与重彩外发光',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const visualCheck = await session.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-perfume-id]')).filter(
          (c) => !c.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]') && getComputedStyle(c).display !== 'none'
        );
        const badGradients = [];
        for (const c of cards) {
          const st = getComputedStyle(c);
          if (/linear-gradient|radial-gradient/i.test(st.backgroundImage) && !/data:image\/svg/.test(st.backgroundImage)) {
            badGradients.push(st.backgroundImage.slice(0, 80));
          }
        }
        return { checked: cards.length, badGradients };
      });
      assert.equal(visualCheck.checked, 10);
      assert.equal(
        visualCheck.badGradients.length,
        0,
        `卡片不应使用炫目渐变背景: ${visualCheck.badGradients.join('; ')}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-03' });
    },
  },
  {
    id: 'T1-F8-04',
    tier: 1,
    feature: 'F8',
    title: '排版层级分明且分值显示开启 tabular-nums 等宽对齐',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.5);
      const typo = await session.evaluate(() => {
        const h1 = document.querySelector('h1');
        const h1Fs = h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0;
        const card = document.querySelector('[data-perfume-id]');
        const heading = card ? card.querySelector('h2, h3, h4, strong') : null;
        const cardTitleFs = heading ? parseFloat(getComputedStyle(heading).fontSize) : 16;
        const bodyFs = parseFloat(getComputedStyle(document.body).fontSize);
        const tabularEls = Array.from(document.querySelectorAll('*')).filter((el) =>
          /tabular-nums/.test(getComputedStyle(el).fontVariantNumeric || '')
        ).length;
        return { h1Fs, cardTitleFs, bodyFs, tabularEls };
      });
      assert.ok(typo.h1Fs >= typo.cardTitleFs && typo.cardTitleFs >= 15, `字号层级不合理: ${JSON.stringify(typo)}`);
      assert.ok(typo.bodyFs >= 12, `正文字号过小: ${typo.bodyFs}px`);
      assert.ok(typo.tabularEls >= 1, '未检测到使用 tabular-nums 对齐数字分值的元素');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-04' });
    },
  },
  {
    id: 'T1-F8-05',
    tier: 1,
    feature: 'F8',
    title: '所有过渡动效仅动画合成层属性（禁止 transition: all / width / height）',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const violations = await session.evaluate(() => {
        const forbiddenProps = new Set(['all', 'width', 'height', 'margin', 'padding', 'top', 'left', 'right', 'bottom']);
        const hits = [];
        for (const el of document.querySelectorAll('button, a, [data-perfume-id], [role="dialog"]')) {
          const st = getComputedStyle(el);
          const props = (st.transitionProperty || '').split(',').map((s) => s.trim()).filter(Boolean);
          const durs = (st.transitionDuration || '').split(',').map((s) => parseFloat(s) * (s.includes('ms') ? 1 : 1000));
          const hasNonZero = durs.some((d) => d > 0);
          if (!hasNonZero) continue;
          const bad = props.filter((p) => forbiddenProps.has(p));
          if (bad.length > 0) {
            hits.push({ tag: el.tagName.toLowerCase(), props: bad, dur: st.transitionDuration });
          }
        }
        return hits;
      });
      assert.equal(
        violations.length,
        0,
        `检测到非合成层 transition 属性违规: ${JSON.stringify(violations.slice(0, 5))}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-05' });
    },
  },
  {
    id: 'T1-F8-06',
    tier: 1,
    feature: 'F8',
    title: '详情抽屉入场动效结束后完全可见且内部控件可响应',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await sleep(400);
      const dlg = await readActiveDialog(session);
      assert.equal(dlg.opacity, '1', `抽屉入场后 opacity 应为 1，实际为 ${dlg.opacity}`);
      await setDrawerNote(session, '动效完成后可输入');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F8-06' });
    },
  },

  // ==================== F9: Mobile-Native 窄屏适配与触控保护 (6) ====================
  {
    id: 'T1-F9-01',
    tier: 1,
    feature: 'F9',
    title: '375×812 视口锁定且全页纵向滚动无水平溢出',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const dpr = await session.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 80));
        return window.devicePixelRatio;
      });
      assert.equal(dpr, 2, `dpr 应为 2，实际 ${dpr}`);
      const ov = await auditViewportOverflow(session, 375);
      assert.equal(ov.viewportWidthMatched, true, `innerWidth 应为 375，实际 ${ov.innerWidth}`);
      assert.equal(ov.hasHorizontalOverflow, false, `375px 发生水平溢出/固定节点越界: ${JSON.stringify(ov)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-01' });
    },
  },
  {
    id: 'T1-F9-02',
    tier: 1,
    feature: 'F9',
    title: '390×844 视口锁定且全页纵向滚动无水平溢出',
    viewport: { width: 390, height: 844 },
    async run({ session }) {
      const dpr = await session.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 80));
        return window.devicePixelRatio;
      });
      assert.equal(dpr, 2, `dpr 应为 2，实际 ${dpr}`);
      const ov = await auditViewportOverflow(session, 390);
      assert.equal(ov.viewportWidthMatched, true, `innerWidth 应为 390，实际 ${ov.innerWidth}`);
      assert.equal(ov.hasHorizontalOverflow, false, `390px 发生水平溢出/固定节点越界: ${JSON.stringify(ov)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-02' });
    },
  },
  {
    id: 'T1-F9-03',
    tier: 1,
    feature: 'F9',
    title: 'viewport meta 包含 viewport-fit=cover 且不禁用用户缩放',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const meta = await session.evaluate(() => {
        const vp = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
        const theme = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
        return { vp, theme };
      });
      assert.match(meta.vp, /width=device-width/i, `viewport meta 缺少 width=device-width: ${meta.vp}`);
      assert.match(meta.vp, /viewport-fit=cover/i, `viewport meta 缺少 viewport-fit=cover: ${meta.vp}`);
      assert.doesNotMatch(meta.vp, /user-scalable=no|maximum-scale=1(?:\.0)?/i, 'viewport meta 不应禁止用户缩放');
      assert.ok(meta.theme.length > 0, '缺少 meta[name="theme-color"]');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-03' });
    },
  },
  {
    id: 'T1-F9-04',
    tier: 1,
    feature: 'F9',
    title: '按钮启用 touch-action: manipulation，抽屉滚区启用 overscroll-behavior',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const btnTouch = await session.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).slice(0, 8);
        return btns.map((b) => getComputedStyle(b).touchAction);
      });
      assert.ok(btnTouch.length > 0 && btnTouch.every((t) => t === 'manipulation'), `主按钮应设为 touch-action: manipulation，实际: ${btnTouch.join(',')}`);

      await openDetailDrawer(session, 1);
      const overscroll = await session.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"], dialog, [aria-modal="true"]');
        if (!dlg) return [];
        const nodes = [dlg, ...Array.from(dlg.querySelectorAll('*'))];
        return nodes.map((n) => getComputedStyle(n).overscrollBehavior).filter((v) => v === 'contain' || v === 'none');
      });
      assert.ok(overscroll.length > 0, '详情抽屉应设置 overscroll-behavior: contain/none 防止穿透滚动');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-04' });
    },
  },
  {
    id: 'T1-F9-05',
    tier: 1,
    feature: 'F9',
    title: 'CSS :hover 规则隔离在 @media (hover: hover) 内防止触屏粘滞',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const unguardedHoverRules = await session.evaluate(() => {
        const bad = [];
        function walkRules(rules, insideHoverMedia) {
          for (const rule of Array.from(rules || [])) {
            if (rule.type === CSSRule.MEDIA_RULE) {
              const cond = rule.conditionText || rule.media?.mediaText || '';
              walkRules(rule.cssRules, insideHoverMedia || /hover:\s*hover/.test(cond));
            } else if (rule.type === CSSRule.STYLE_RULE) {
              if (/:hover\b/.test(rule.selectorText || '') && !insideHoverMedia) {
                bad.push(rule.selectorText);
              }
            }
          }
        }
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walkRules(sheet.cssRules, false);
          } catch {
            // 忽略跨域不可读样式表
          }
        }
        return bad;
      });
      assert.equal(
        unguardedHoverRules.length,
        0,
        `存在未隔离在 @media (hover: hover) 内的 :hover 规则: ${unguardedHoverRules.slice(0, 5).join('; ')}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-05' });
    },
  },
  {
    id: 'T1-F9-06',
    tier: 1,
    feature: 'F9',
    title: '完整交互链路中浏览器控制台与网络零未捕获错误',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.5);
      await setBuyIntent(session, 1, '必入正装');
      await openDetailDrawer(session, 2);
      await setDrawerNote(session, '零错误链路验证');
      await closeActiveDialog(session, 'button');
      await openReportModal(session);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T1-F9-06' });
    },
  },
];
