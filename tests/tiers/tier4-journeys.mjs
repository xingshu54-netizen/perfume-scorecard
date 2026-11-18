/**
 * Tier 4 — 真实端到端试香场景与手机端截图产物（共 6 个旅程，7 张 @2x 截图）
 * 用例编号：T4-J1 ~ T4-J6
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
import { sleep, toFileUrl } from '../lib/cdp-client.mjs';

/**
 * 辅助：通过真实页面交互完成 10 款试香打分（用于 J3-J6 独立运行准备数据）
 */
async function performRealisticBatchScoring(session) {
  const plan = [
    { index: 1, score: 3.5, intent: '再试几次' },
    { index: 2, score: 4.0, intent: '再试几次' },
    { index: 3, score: 4.5, intent: '必入正装' },
    { index: 4, score: 5.0, intent: '必入正装' },
    { index: 5, score: 3.5, intent: '再试几次' },
    { index: 6, score: 3.0, intent: '劝退拔草' },
    { index: 7, score: 3.5, intent: '一般般' },
    { index: 8, score: 4.0, intent: '一般般' },
    { index: 9, score: 5.0, intent: '必入正装' },
    { index: 10, score: 4.5, intent: '必入正装' },
  ];
  await confirmPinkDiamondQuantity(session, 2);
  for (const item of plan) {
    await setPerfumeScore(session, item.index, item.score);
    await setBuyIntent(session, item.index, item.intent);
  }
}

export const TIER4_CASES = [
  {
    id: 'T4-J1',
    tier: 4,
    feature: 'F1,F2,F8,F9',
    title: 'Journey 1：首次开箱浏览 10 款小样，识别自我无界双规格与粉钻待确认并手动确认 ×2',
    viewport: { width: 375, height: 812 },
    async run({ session, screenshotsDir, captureScreenshots }) {
      const prog = await readProgress(session);
      assert.equal(prog.tested, 0);
      const cards = await locatePerfumeCards(session);
      assert.equal(cards.length, 10);

      // 截图 1：初始开箱首页（375x812 视口首屏）
      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j1-initial-home.png'));
      }

      // 核对自我无界双规格
      const { card: armani } = await findPerfumeCard(session, 4);
      assert.match(armani.text, /0\.5\s*ml/i);
      assert.match(armani.text, /(?<![\d.])1(?:\.0)?\s*ml/i);
      assert.match(armani.text, /3\s*支/);
      assert.match(armani.text, /2\.5\s*ml/i);

      // 核对粉钻待确认并手动确认 ×2
      const { card: pink } = await findPerfumeCard(session, 5);
      assert.match(pink.text, /待确认|遮挡|未明|疑似|需确认|确认数量/);
      const confirmed = await confirmPinkDiamondQuantity(session, 2);
      assert.match(confirmed.text, /(?:×|x|\*)\s*2|2\s*支/);

      // 滚动到粉钻附近截取确认态
      await session.evaluate(() => {
        const el = Array.from(document.querySelectorAll('[data-perfume-id]')).find(
          (n) =>
            !n.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]') &&
            getComputedStyle(n).display !== 'none' &&
            /粉耀晶钻|粉钻/.test(n.innerText || '')
        );
        el?.scrollIntoView({ block: 'center' });
      });
      await sleep(120);
      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j1-confirmed-pink-diamond.png'));
      }

      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false);
      assertCleanDiagnostics(session, { contextLabel: 'T4-J1' });
    },
  },
  {
    id: 'T4-J2',
    tier: 4,
    feature: 'F2,F3,F6,F9',
    title: 'Journey 2：分两批模拟跨日试香（4 款 + 刷新续填 + 剩余 6 款 = 10/10）',
    viewport: { width: 390, height: 844 },
    async run({ session, screenshotsDir, captureScreenshots }) {
      // 第一批：试喷 4 款
      const day1 = [
        { index: 1, score: 3.5, intent: '再试几次' },
        { index: 2, score: 4.0, intent: '再试几次' },
        { index: 4, score: 5.0, intent: '必入正装' },
        { index: 8, score: 4.0, intent: '一般般' },
      ];
      for (const item of day1) {
        await setPerfumeScore(session, item.index, item.score);
        await setBuyIntent(session, item.index, item.intent);
      }
      assert.equal((await readProgress(session)).tested, 4, '首日试香后进度应为 4/10');

      // 模拟次日刷新
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      assert.equal((await readProgress(session)).tested, 4, '次日刷新后 4/10 进度应完整恢复');

      // 第二批：完成剩余 6 款
      const day2 = [
        { index: 3, score: 4.5, intent: '必入正装' },
        { index: 5, score: 3.5, intent: '再试几次' },
        { index: 6, score: 3.0, intent: '劝退拔草' },
        { index: 7, score: 3.5, intent: '一般般' },
        { index: 9, score: 5.0, intent: '必入正装' },
        { index: 10, score: 4.5, intent: '必入正装' },
      ];
      for (const item of day2) {
        await setPerfumeScore(session, item.index, item.score);
        await setBuyIntent(session, item.index, item.intent);
      }
      assert.equal((await readProgress(session)).tested, 10, '第二批完成后应达到 10/10');
      assert.equal((await auditViewportOverflow(session, 390)).hasHorizontalOverflow, false);

      await session.evaluate(() => window.scrollTo(0, 0));
      await sleep(120);
      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j2-all-10-completed.png'));
      }
      assertCleanDiagnostics(session, { contextLabel: 'T4-J2' });
    },
  },
  {
    id: 'T4-J3',
    tier: 4,
    feature: 'F2,F4,F6,F8',
    title: 'Journey 3：深度试香体验（详情抽屉多维记录与真实随手记）',
    viewport: { width: 375, height: 812 },
    async run({ session, screenshotsDir, captureScreenshots }) {
      await setPerfumeScore(session, 4, 5.0);
      await setBuyIntent(session, 4, '必入正装');
      await openDetailDrawer(session, 4);

      await setDrawerDimensions(session, {
        topNote: 4,
        baseNote: 5,
        longevity: '持久',
        sillage: '适中',
        scenes: ['约会氛围', '春夏清爽'],
      });
      const diary = '前调微甜橙花，两小时后白花和香草变特别温柔，和男朋友周末约会喷刚好🌸';
      await setDrawerNote(session, diary);

      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j3-detail-drawer-open.png'));
      }
      await closeActiveDialog(session, 'button');

      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const c4 = await readCardState(session, 4);
      assert.match(c4.text, /前调微甜橙花/, '刷新后 L1 卡片未回显日记');
      await openDetailDrawer(session, 4);
      const dlg = await readActiveDialog(session);
      assert.equal(dlg.textareaValue, diary, '刷新后重开抽屉日记应 100% 一致');
      await closeActiveDialog(session, 'button');
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false);
      assertCleanDiagnostics(session, { contextLabel: 'T4-J3' });
    },
  },
  {
    id: 'T4-J4',
    tier: 4,
    feature: 'F5,F8,F9',
    title: 'Journey 4：挑出 Top3 心动正装并筛选排序核对',
    viewport: { width: 375, height: 812 },
    async run({ session, screenshotsDir, captureScreenshots }) {
      await performRealisticBatchScoring(session);
      await selectSort(session, 'scoreDesc');
      const favSorted = await selectFilter(session, 'favorite');
      assert.equal(favSorted.length, 4, '必入正装共有 4 款');
      assert.ok(
        favSorted[0].catalogIndex === 4 || favSorted[0].catalogIndex === 9,
        '评分最高 5.0 款应排在最前'
      );
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false);

      await session.evaluate(() => window.scrollTo(0, 0));
      await sleep(120);
      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j4-top3-filtered-sorted.png'));
      }

      await selectFilter(session, 'all');
      await selectSort(session, 'original');
      assertCleanDiagnostics(session, { contextLabel: 'T4-J4' });
    },
  },
  {
    id: 'T4-J5',
    tier: 4,
    feature: 'F1,F7,F8,F9',
    title: 'Journey 5：生成试香战报分享给男朋友（文本复制 + Canvas 长图 + JSON 导出）',
    viewport: { width: 390, height: 844 },
    async run({ session, screenshotsDir, captureScreenshots }) {
      await installExportSpies(session);
      await performRealisticBatchScoring(session);
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, '周末约会本命香');
      await closeActiveDialog(session, 'button');

      const dlg = await openReportModal(session);
      assert.match(dlg.text, /10\s*\/\s*10|已试\s*10/);
      const armani4 = await readCardState(session, 4);
      const otherNames = ['大地', '蓝风铃', '我本莫测', '粉耀晶钻', '粉钻', '反转巴黎', '5号', '柑橘罗勒', '真我', '大吉岭'];
      const armaniEntry = await readReportEntryText(session, /自我无界/, otherNames);
      assert.equal(armaniEntry.found, true, '战报弹窗内未找到独立的「自我无界」条目');
      const hasMergedInEntry = armaniEntry.entries.some(
        (t) =>
          /0\.5\s*ml/i.test(t) &&
          /(?<![\d.])1(?:\.0)?\s*ml/i.test(t) &&
          /(?:×|x|\*)\s*1/i.test(t) &&
          /(?:×|x|\*)\s*2/i.test(t) &&
          (armani4?.score == null || t.includes(String(armani4.score)))
      );
      assert.equal(
        hasMergedInEntry,
        true,
        `战报「自我无界」条目内部必须同时展示 0.5ml、1ml、×1、×2 与分值；实际条目: ${JSON.stringify(armaniEntry.entries)}`
      );

      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j5-report-modal.png'));
      }

      const copyRes = await verifyCopyTextReport(session, { simulateFailure: false });
      assert.match(copyRes.copiedText, /周末约会本命香/);

      const canvasRes = await verifyCanvasLongImage(session);
      assert.equal(canvasRes.securityErrors.length, 0);

      const jsonRes = await exportJsonReport(session);
      assert.match(jsonRes.rawJsonText, /周末约会本命香/);

      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T4-J5' });
    },
  },
  {
    id: 'T4-J6',
    tier: 4,
    feature: 'F6,F7,F9',
    title: 'Journey 6：防误触清空、JSON 导入全量恢复与 file:// 单文件直开验收',
    viewport: { width: 375, height: 812 },
    async run({ session, distPath, indexPath, screenshotsDir, captureScreenshots }) {
      await installExportSpies(session);
      await performRealisticBatchScoring(session);
      await openDetailDrawer(session, 4);
      await setDrawerNote(session, '防丢失完整备份');
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const exported = await exportJsonReport(session);
      await closeActiveDialog(session, 'button');

      // 1. 先误触清空点取消
      await triggerReset(session, 'cancel');
      assert.equal((await readProgress(session)).tested, 10, '取消后 10/10 记录应完整保留');

      // 2. 再确认清空归零
      await triggerReset(session, 'confirm');
      assert.equal((await readProgress(session)).tested, 0, '确认清空后应归零');

      // 3. 导入备份 JSON 全量恢复
      await importJsonReport(session, exported.rawJsonText);
      assert.equal((await readProgress(session)).tested, 10, '导入后应瞬时恢复 10/10');
      assert.match((await readCardState(session, 4)).text, /防丢失完整备份/);

      await session.evaluate(() => window.scrollTo(0, 0));
      await sleep(120);
      if (captureScreenshots) {
        await session.captureViewport(path.join(screenshotsDir, 't4-j6-restored-after-import.png'));
      }

      // 4. file:// 验证单文件直开（优先 dist/perfume-scorecard.html，若尚未生成则验证 index.html）
      const singleTarget = distPath && fs.existsSync(distPath) ? distPath : indexPath;
      session.clearDiagnostics();
      await session.navigate(toFileUrl(singleTarget));
      await waitForCardsReady(session, 10);
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false);
      assertCleanDiagnostics(session, { contextLabel: `T4-J6(${singleTarget})` });
    },
  },
];
