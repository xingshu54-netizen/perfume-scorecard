/**
 * Tier 3 — 跨功能成对组合用例（Pairwise，共 15 条）
 * 用例编号：T3-PW-01 ~ T3-PW-15
 */

import assert from 'node:assert/strict';
import { EXPECTED_STORAGE_KEY } from '../lib/expected-catalog.mjs';
import {
  assertCleanDiagnostics,
  auditViewportOverflow,
  closeActiveDialog,
  confirmPinkDiamondQuantity,
  exportJsonReport,
  importJsonReport,
  installExportSpies,
  locatePerfumeCards,
  openDetailDrawer,
  openReportModal,
  readActiveDialog,
  readCardState,
  readProgress,
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
import { sleep, toFileUrl } from '../lib/cdp-client.mjs';

export const TIER3_CASES = [
  {
    id: 'T3-PW-01',
    tier: 3,
    feature: 'F3×F5',
    title: '打分 + 购买意愿 + 评分降序 + 必入正装筛选四维联动',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 4, 5.0);
      await setBuyIntent(session, 4, '必入正装');
      await setPerfumeScore(session, 9, 4.0);
      await setBuyIntent(session, 9, '必入正装');
      await setPerfumeScore(session, 1, 4.5);
      await setBuyIntent(session, 1, '再试几次');
      await setPerfumeScore(session, 2, 2.0);
      await setBuyIntent(session, 2, '劝退拔草');

      await selectSort(session, 'scoreDesc');
      const favSorted = await selectFilter(session, 'favorite');
      assert.equal(favSorted.length, 2, `必入正装应仅有 2 张卡，实际 ${favSorted.length}`);
      assert.deepEqual(
        favSorted.map((c) => c.catalogIndex),
        [4, 9],
        `降序+必入筛选顺位应为 [4, 9]，实际 ${favSorted.map((c) => c.catalogIndex)}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-01' });
    },
  },
  {
    id: 'T3-PW-02',
    tier: 3,
    feature: 'F3×F6×F7',
    title: '反复修改评分 -> 刷新持久化 -> 战报同步最新分值与均分',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 4, 3.0);
      const r2 = await setPerfumeScore(session, 4, 5.0);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      const st = await readCardState(session, 4);
      assert.equal(st.score, r2.cardState.score, '刷新后应保留最新分值 5.0/10');
      const dlg = await openReportModal(session);
      assert.match(dlg.text, /自我无界/, '战报缺少自我无界');
      assert.ok(dlg.text.includes(String(r2.cardState.score)), '战报未同步最新评分');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-02' });
    },
  },
  {
    id: 'T3-PW-03',
    tier: 3,
    feature: 'F1×F6×F7',
    title: '粉钻手动确认 ×2 并打分 -> 刷新保留 -> 战报包含已确认数量',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await confirmPinkDiamondQuantity(session, 2);
      await setPerfumeScore(session, 5, 4.5);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      const st = await readCardState(session, 5);
      assert.match(st.text, /(?:×|x|\*)\s*2|2\s*支/, '刷新后粉钻确认 ×2 未保留');
      const dlg = await openReportModal(session);
      assert.match(dlg.text, /粉耀晶钻|粉钻/, '战报未包含粉钻条目');
      assert.match(dlg.text, /(?:×|x|\*)\s*2|2\s*支/, '战报中粉钻未反映确认后的 ×2 数量');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-03' });
    },
  },
  {
    id: 'T3-PW-04',
    tier: 3,
    feature: 'F6×F3×F4',
    title: '清空二次确认取消后数据与战报完好，确认清空后同步归零',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 5.0);
      await setPerfumeScore(session, 2, 4.0);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, '重置前笔记');
      await closeActiveDialog(session, 'button');

      await triggerReset(session, 'cancel');
      assert.equal((await readProgress(session)).tested, 2, '取消后进度应仍为 2/10');
      const dlg1 = await openReportModal(session);
      assert.match(dlg1.text, /重置前笔记/, '取消清空后战报仍应包含笔记');
      await closeActiveDialog(session, 'button');

      await triggerReset(session, 'confirm');
      assert.equal((await readProgress(session)).tested, 0, '确认清空后应归零');
      const dlg2 = await openReportModal(session);
      assert.doesNotMatch(dlg2.text, /重置前笔记/, '确认清空后战报不应残余旧笔记');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-04' });
    },
  },
  {
    id: 'T3-PW-05',
    tier: 3,
    feature: 'F4×F5',
    title: '抽屉 L2 维度与笔记保存后历经筛选切换重绘仍完整保留',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 7, 4.0);
      await openDetailDrawer(session, 7);
      await setDrawerDimensions(session, { longevity: '持久', scenes: ['约会氛围'] });
      await setDrawerNote(session, '经典复古花香');
      await closeActiveDialog(session, 'button');

      await selectFilter(session, 'tested');
      await selectFilter(session, 'all');
      await openDetailDrawer(session, 7);
      const dlg = await readActiveDialog(session);
      assert.equal(dlg.textareaValue, '经典复古花香', '筛选重绘后笔记丢失');
      assert.match(dlg.text, /持久/, '筛选重绘后留香维度丢失');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-05' });
    },
  },
  {
    id: 'T3-PW-06',
    tier: 3,
    feature: 'F7×F6',
    title: '390×844 下 JSON 导出 -> 二次确认清空 -> 导入恢复 -> 刷新仍保留',
    viewport: { width: 390, height: 844 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 4.0);
      await setPerfumeScore(session, 4, 5.0);
      await confirmPinkDiamondQuantity(session, 1);
      await setPerfumeScore(session, 5, 3.5);
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, 'JSON闭环测试');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const exported = await exportJsonReport(session);
      await closeActiveDialog(session, 'button');

      await triggerReset(session, 'confirm');
      assert.equal((await readProgress(session)).tested, 0);

      await importJsonReport(session, exported.rawJsonText);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      assert.equal((await readProgress(session)).tested, 3, '导入并刷新后应保留 3/10');
      assert.match((await readCardState(session, 4)).text, /JSON闭环测试/);
      assert.match((await readCardState(session, 5)).text, /(?:×|x|\*)\s*1|1\s*支/);
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-06' });
    },
  },
  {
    id: 'T3-PW-07',
    tier: 3,
    feature: 'F4×F3×F2',
    title: '在 L2 抽屉内改分与选意愿 -> 关闭后 L1 卡片与顶栏计数实时同步',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 9, 3.0);
      await openDetailDrawer(session, 9);
      await setDrawerDimensions(session, { score: 4.5, intent: '必入正装' });
      await closeActiveDialog(session, 'button');

      const c9 = await readCardState(session, 9);
      assert.ok(c9.score === 4.5 || c9.score === 9, `抽屉改分未同步至 L1 卡片: ${c9.score}`);
      assert.deepEqual(c9.activeIntents, ['必入正装'], '抽屉意愿未同步至 L1 卡片');
      const prog = await readProgress(session);
      if (prog.favoriteCount !== null) {
        assert.equal(prog.favoriteCount, 1, '顶栏必入数未随抽屉修改更新');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-07' });
    },
  },
  {
    id: 'T3-PW-08',
    tier: 3,
    feature: 'F1×F3×F7',
    title: '自我无界双规格 + 评分意愿笔记 -> 复制文字战报完整汇总双规格',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 4, 5.0);
      await setBuyIntent(session, 4, '必入正装');
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, '白花温柔');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const copyRes = await verifyCopyTextReport(session, { simulateFailure: false });
      assert.match(copyRes.copiedText, /阿玛尼/);
      assert.match(copyRes.copiedText, /自我无界/);
      assert.match(copyRes.copiedText, /0\.5\s*ml/);
      assert.match(copyRes.copiedText, /1\s*ml/);
      assert.match(copyRes.copiedText, /必入正装/);
      assert.match(copyRes.copiedText, /白花温柔/);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-08' });
    },
  },
  {
    id: 'T3-PW-09',
    tier: 3,
    feature: 'F3×F5',
    title: '在筛选视图内清分或改选唯一卡片后安全过渡到空状态并可一键查看全部',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.0);
      const testedCards = await selectFilter(session, 'tested');
      assert.equal(testedCards.length, 1);

      const cleared = await setPerfumeScore(session, 1, null, { optional: true });
      if (cleared.cleared) {
        await sleep(100);
        const afterCards = await locatePerfumeCards(session);
        assert.equal(afterCards.length, 0, '已试视图内清空唯一评分后卡片应为空');
      } else {
        await selectFilter(session, 'all');
        await setBuyIntent(session, 1, '必入正装');
        const favCards = await selectFilter(session, 'favorite');
        assert.equal(favCards.length, 1);
        await setBuyIntent(session, 1, '劝退拔草');
        await sleep(100);
        const afterFav = await locatePerfumeCards(session);
        assert.equal(afterFav.length, 0, '必入正装视图内改选劝退后卡片应为空');
      }

      const emptyGuide = await session.evaluate(() => {
        const bodyTxt = document.body.innerText || '';
        const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find(
          (b) =>
            !b.closest('[role="dialog"], dialog, [aria-modal="true"]') &&
            getComputedStyle(b).display !== 'none' &&
            /查看全部|重置筛选|显示全部/.test((b.innerText || b.textContent || '').trim())
        );
        if (btn) btn.click();
        return {
          hasEmptyText: /暂无|还没有|没有符合|空空如也/.test(bodyTxt),
          hadRestoreBtn: Boolean(btn),
        };
      });
      assert.equal(emptyGuide.hasEmptyText, true, '空状态应展示友好中文引导');
      assert.equal(emptyGuide.hadRestoreBtn, true, '空状态应提供查看全部/重置筛选按钮');
      await sleep(100);
      assert.equal((await locatePerfumeCards(session)).length, 10, '点击查看全部后应恢复 10 张卡');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-09' });
    },
  },
  {
    id: 'T3-PW-10',
    tier: 3,
    feature: 'F4×F7×F9',
    title: '250 字含 Emoji 长笔记 + 战报 Canvas 长图生成 + 375px 全流程零溢出',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      const longNote = '木质辛辣葡萄柚与雪松碰撞出高级干净的气息🌲🍊✨'.repeat(10);
      await setPerfumeScore(session, 1, 4.5);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, longNote);
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false, '抽屉长笔记溢出');
      await closeActiveDialog(session, 'button');
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false, '主页长笔记溢出');

      await openReportModal(session);
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false, '战报弹窗长笔记溢出');
      const cRes = await verifyCanvasLongImage(session);
      assert.equal(cRes.securityErrors.length, 0);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-10' });
    },
  },
  {
    id: 'T3-PW-11',
    tier: 3,
    feature: 'F4×F5',
    title: 'L2 维度填写 + 必入正装筛选 + 评分降序仅展示匹配项并按分排序',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.0);
      await setBuyIntent(session, 1, '必入正装');
      await setPerfumeScore(session, 4, 5.0);
      await setBuyIntent(session, 4, '必入正装');
      await setPerfumeScore(session, 9, 4.5);
      await setBuyIntent(session, 9, '必入正装');
      await setPerfumeScore(session, 2, 5.0);
      await setBuyIntent(session, 2, '一般般');

      await openDetailDrawer(session, 4);
      await setDrawerDimensions(session, { longevity: '持久' });
      await closeActiveDialog(session, 'button');

      await selectFilter(session, 'favorite');
      const cards = await selectSort(session, 'scoreDesc');
      assert.deepEqual(
        cards.map((c) => c.catalogIndex),
        [4, 9, 1],
        '必入正装+降序应严格排为 [4, 9, 1] 且排除一般般的 #2'
      );
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-11' });
    },
  },
  {
    id: 'T3-PW-12',
    tier: 3,
    feature: 'F9×F6×F3',
    title: 'file:// 协议下打分、写笔记并刷新页面完整留存零报错',
    viewport: { width: 375, height: 812 },
    async run({ session, indexPath }) {
      session.clearDiagnostics();
      await session.navigate(toFileUrl(indexPath));
      await session.waitFor(() => document.querySelectorAll('[data-perfume-id]').length === 10);
      await session.evaluate((k) => {
        try { localStorage.removeItem(k); } catch {}
      }, EXPECTED_STORAGE_KEY);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      const res = await setPerfumeScore(session, 10, 4.5);
      await openDetailDrawer(session, 10);
      await setDrawerNote(session, '干净白衬衫');
      await closeActiveDialog(session, 'button');

      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const st = await readCardState(session, 10);
      assert.equal(st.score, res.cardState.score, 'file:// 刷新后评分应保留');
      assert.match(st.text, /干净白衬衫/, 'file:// 刷新后笔记应保留');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-12' });
    },
  },
  {
    id: 'T3-PW-13',
    tier: 3,
    feature: 'F8×F4×F7',
    title: 'prefers-reduced-motion: reduce 下连续切换抽屉与战报无遮罩残留',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.setReducedMotion(true);
      try {
        await openDetailDrawer(session, 1);
        await setDrawerNote(session, '减弱动效写入');
        await closeActiveDialog(session, 'button');
        await openReportModal(session);
        await closeActiveDialog(session, 'button');
        const res = await setPerfumeScore(session, 2, 4.0);
        assert.ok(res.cardState.isTested);
        assertCleanDiagnostics(session, { contextLabel: 'T3-PW-13' });
      } finally {
        await session.setReducedMotion(false);
      }
    },
  },
  {
    id: 'T3-PW-14',
    tier: 3,
    feature: 'F6×F3',
    title: '损坏 localStorage 降级恢复后再次打分可覆写为合法持久状态',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate((k) => localStorage.setItem(k, '{corrupt:::'), EXPECTED_STORAGE_KEY);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      const res = await setPerfumeScore(session, 2, 4.0);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const st = await readCardState(session, 2);
      assert.equal(st.score, res.cardState.score, '损坏存储修复后二次刷新应持久化新分值');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-14' });
    },
  },
  {
    id: 'T3-PW-15',
    tier: 3,
    feature: 'F9×F7',
    title: '动态视口从 375×812 切换至 390×844 下打开战报并走剪贴板降级成功',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 4.5);
      await setPerfumeScore(session, 4, 5.0);
      await openReportModal(session);
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false);

      await session.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(100);
      assert.equal((await auditViewportOverflow(session, 390)).hasHorizontalOverflow, false);
      const copyRes = await verifyCopyTextReport(session, { simulateFailure: true });
      assert.equal(copyRes.hasFallbackBox, true, '动态视口下剪贴板拒绝应降级文本框');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T3-PW-15' });
    },
  },
];
