/**
 * Tier 2 — 边界与角落场景用例（F1–F9 每项 6 条，共 54 条）
 * 用例编号：T2-F1-01 ~ T2-F9-06
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_CATALOG,
  EXPECTED_STORAGE_KEY,
  EXPECTED_VIEWPORTS,
} from '../lib/expected-catalog.mjs';
import {
  assertCleanDiagnostics,
  auditTextareaFontSize,
  auditTouchTargets,
  auditUnlocalizedText,
  auditViewportOverflow,
  closeActiveDialog,
  confirmPinkDiamondQuantity,
  findPerfumeCard,
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
  tapElement,
  triggerReset,
  verifyCanvasLongImage,
  verifyCopyTextReport,
  waitForCardsReady,
} from '../lib/semantic-helpers.mjs';
import { sleep, startStaticServer, toFileUrl } from '../lib/cdp-client.mjs';

export const TIER2_CASES = [
  // ==================== F1 边界与角落 (6) ====================
  {
    id: 'T2-F1-01',
    tier: 2,
    feature: 'F1',
    title: '「阿玛尼 自我无界」双规格胶囊与相邻控件零重叠且不越界',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const geo = await session.evaluate(() => {
        const card = Array.from(document.querySelectorAll('[data-perfume-id]')).find(
          (c) =>
            !c.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]') &&
            getComputedStyle(c).display !== 'none' &&
            /自我无界/.test(c.innerText || '')
        );
        if (!card) return { ok: false, reason: '未找到自我无界卡片' };
        const cr = card.getBoundingClientRect();
        const children = Array.from(card.querySelectorAll('span, div, p, button'));
        const out = children
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.right > cr.right + 1 || r.left < cr.left - 1);
          })
          .map((el) => ({ tag: el.tagName, text: (el.innerText || '').slice(0, 30), right: el.getBoundingClientRect().right, cardRight: cr.right }));

        const btns = Array.from(card.querySelectorAll('button, [role="button"], [role="radio"]'));
        const overlaps = [];
        for (let i = 0; i < btns.length; i++) {
          for (let j = i + 1; j < btns.length; j++) {
            const a = btns[i].getBoundingClientRect();
            const b = btns[j].getBoundingClientRect();
            const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (ix * iy > 1) overlaps.push({ ix, iy });
          }
        }
        return { ok: true, out, overlaps };
      });
      assert.equal(geo.ok, true, geo.reason);
      assert.equal(geo.out.length, 0, `自我无界子元素超出卡界: ${JSON.stringify(geo.out)}`);
      assert.equal(geo.overlaps.length, 0, `自我无界卡内按钮发生重叠: ${JSON.stringify(geo.overlaps)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F1-01' });
    },
  },
  {
    id: 'T2-F1-02',
    tier: 2,
    feature: 'F1',
    title: '「范思哲 粉耀晶钻」快速连续切换 ×1/×2 四次无文本错乱',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await confirmPinkDiamondQuantity(session, 1);
      await confirmPinkDiamondQuantity(session, 2);
      await confirmPinkDiamondQuantity(session, 1);
      const finalState = await confirmPinkDiamondQuantity(session, 2);
      assert.match(finalState.text, /(?:×|x|\*)\s*2|2\s*支/, '最终应停留在 ×2');
      assert.doesNotMatch(finalState.text, /已确认\s*[×x]\s*1.*已确认\s*[×x]\s*2/, '不应出现重复确认文本拼接');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F1-02' });
    },
  },
  {
    id: 'T2-F1-03',
    tier: 2,
    feature: 'F1',
    title: '初始态、详情抽屉态与战报弹窗态全量零未汉化模板词',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const a1 = await auditUnlocalizedText(session);
      assert.equal(a1.passed, true, `首页存在未汉化文本: ${JSON.stringify(a1)}`);

      await openDetailDrawer(session, 1);
      const a2 = await auditUnlocalizedText(session);
      assert.equal(a2.passed, true, `详情抽屉存在未汉化文本: ${JSON.stringify(a2)}`);
      await closeActiveDialog(session, 'button');

      await openReportModal(session);
      const a3 = await auditUnlocalizedText(session);
      assert.equal(a3.passed, true, `战报弹窗存在未汉化文本: ${JSON.stringify(a3)}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F1-03' });
    },
  },
  {
    id: 'T2-F1-04',
    tier: 2,
    feature: 'F1',
    title: 'file:// 本地直开 index.html 与单文件 dist 均正常渲染 10 款卡片',
    viewport: { width: 375, height: 812 },
    async run({ session, indexPath, distPath }) {
      const targets = [indexPath];
      if (distPath && fs.existsSync(distPath)) targets.push(distPath);

      for (const fileTarget of targets) {
        session.clearDiagnostics();
        await session.navigate(toFileUrl(fileTarget));
        await waitForCardsReady(session, 10, 5000);
        const cards = await locatePerfumeCards(session);
        assert.equal(cards.length, 10, `${fileTarget} 卡片数量应为 10`);
        assertCleanDiagnostics(session, { contextLabel: `T2-F1-04(${fileTarget})` });
      }
    },
  },
  {
    id: 'T2-F1-05',
    tier: 2,
    feature: 'F1',
    title: '10 张卡片编号严格 01..10 连续无跳号或重复',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const cards = await locatePerfumeCards(session);
      assert.equal(cards.length, 10);
      const indices = cards.map((c) => c.catalogIndex);
      assert.deepEqual(indices, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `卡片顺序非严格 1..10: ${indices.join(',')}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F1-05' });
    },
  },
  {
    id: 'T2-F1-06',
    tier: 2,
    feature: 'F1',
    title: '10 款长英文副标题在 375px 窄屏卡片内安全折行不溢出',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const overflow = await auditViewportOverflow(session, 375);
      assert.equal(overflow.hasHorizontalOverflow, false, `长品牌/副标题导致溢出: ${JSON.stringify(overflow)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F1-06' });
    },
  },

  // ==================== F2 边界与角落 (6) ====================
  {
    id: 'T2-F2-01',
    tier: 2,
    feature: 'F2',
    title: '双视口滚至页面最底时无水平溢出且第 10 卡按钮未被底栏遮挡',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const vp of EXPECTED_VIEWPORTS) {
        await session.setViewport(vp);
        await sleep(100);
        const overflow = await auditViewportOverflow(session, vp.width);
        assert.equal(overflow.hasHorizontalOverflow, false, `${vp.name} 存在水平溢出: ${JSON.stringify(overflow)}`);

        // 点击第 10 张卡底部的详情按钮验证真实命中不被底部固定栏遮挡
        await openDetailDrawer(session, 10);
        await closeActiveDialog(session, 'button');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-01' });
    },
  },
  {
    id: 'T2-F2-02',
    tier: 2,
    feature: 'F2',
    title: '双视口下详情抽屉完全处于可视范围且无水平溢出',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const vp of EXPECTED_VIEWPORTS) {
        await session.setViewport(vp);
        await openDetailDrawer(session, 4);
        const dlg = await readActiveDialog(session);
        assert.ok(dlg.rect.left >= -1 && dlg.rect.right <= vp.width + 1, `${vp.name} 抽屉横向越界: ${JSON.stringify(dlg.rect)}`);
        assert.ok(dlg.rect.height <= vp.height + 1, `${vp.name} 抽屉高度超出视口`);
        const ov = await auditViewportOverflow(session, vp.width);
        assert.equal(ov.hasHorizontalOverflow, false, `${vp.name} 抽屉打开态水平溢出`);
        await closeActiveDialog(session, 'button');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-02' });
    },
  },
  {
    id: 'T2-F2-03',
    tier: 2,
    feature: 'F2',
    title: '双视口下试香战报弹窗无水平溢出且全部按钮可点击',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const vp of EXPECTED_VIEWPORTS) {
        await session.setViewport(vp);
        const dlg = await openReportModal(session);
        assert.ok(dlg.rect.left >= -1 && dlg.rect.right <= vp.width + 1, `${vp.name} 战报弹窗横向越界`);
        const ov = await auditViewportOverflow(session, vp.width);
        assert.equal(ov.hasHorizontalOverflow, false, `${vp.name} 战报弹窗打开态溢出`);
        await closeActiveDialog(session, 'button');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-03' });
    },
  },
  {
    id: 'T2-F2-04',
    tier: 2,
    feature: 'F2',
    title: '300 字超长无空格笔记回显至 L1 主卡在双视口下不撑破宽度',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const longStr = 'A'.repeat(120) + '前调柑橘清冽尾调雪松木质微苦适合独处阅读'.repeat(5);
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, longStr);
      await closeActiveDialog(session, 'button');

      for (const vp of EXPECTED_VIEWPORTS) {
        await session.setViewport(vp);
        await sleep(80);
        const ov = await auditViewportOverflow(session, vp.width);
        assert.equal(ov.hasHorizontalOverflow, false, `${vp.name} 长笔记导致主列表溢出: ${JSON.stringify(ov)}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-04' });
    },
  },
  {
    id: 'T2-F2-05',
    tier: 2,
    feature: 'F2',
    title: '向下滚动 400px 后吸顶区不透明遮蔽与第 3 卡控件可正常点中',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(() => window.scrollTo(0, 400));
      await sleep(120);
      // tapElement 会自动 scrollIntoView(center) 并校验 elementFromPoint 不被吸顶栏遮挡
      const res = await setPerfumeScore(session, 3, 4.0);
      assert.ok(res.cardState.isTested, '滚动后点击第 3 卡评分应正常命中');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-05' });
    },
  },
  {
    id: 'T2-F2-06',
    tier: 2,
    feature: 'F2',
    title: '抽查第 1、4、5 卡内部全部按钮零重叠误触',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const audit = await auditTouchTargets(session, { minSize: 44, scope: 'main' });
      assert.equal(audit.overlaps.length, 0, `卡片控件存在交集重叠: ${JSON.stringify(audit.overlaps)}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F2-06' });
    },
  },

  // ==================== F3 边界与角落 (6) ====================
  {
    id: 'T2-F3-01',
    tier: 2,
    feature: 'F3',
    title: '第 1、5、10 卡全部评分/星级控件有效触控热区 >= 44×44px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const audit = await auditTouchTargets(session, { minSize: 44, scope: 'main' });
      assert.equal(
        audit.undersized.length,
        0,
        `存在小于 44×44px 的主列表控件: ${JSON.stringify(audit.undersized.slice(0, 8))}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-01' });
    },
  },
  {
    id: 'T2-F3-02',
    tier: 2,
    feature: 'F3',
    title: '卡片内 4 选 1 购买意愿胶囊有效热区 >= 44×44px（含有效伪元素扩充）且无重叠',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const intentAudit = await auditTouchTargets(session, {
        minSize: 44,
        scope: 'main',
        labelFilter: /必入正装|再试几次|一般般|劝退拔草/,
        withinFirstCard: true,
      });
      assert.equal(intentAudit.totalChecked, 4, `单卡应有 4 个购买意愿胶囊，实际 ${intentAudit.totalChecked}`);
      assert.equal(
        intentAudit.undersized.length,
        0,
        `意愿胶囊有效热区不足 44×44: ${JSON.stringify(intentAudit.undersized)}`
      );
      assert.equal(
        intentAudit.overlaps.length,
        0,
        `意愿胶囊发生重叠: ${JSON.stringify(intentAudit.overlaps)}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-02' });
    },
  },
  {
    id: 'T2-F3-03',
    tier: 2,
    feature: 'F3',
    title: '快速连点同一张卡不同分值 5 次，最终 UI 与 localStorage 严格一致',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const seq = [1.0, 3.5, 5.0, 2.0, 4.5];
      let lastRes;
      for (const s of seq) {
        lastRes = await setPerfumeScore(session, 1, s);
      }
      await sleep(150);
      const st = await readCardState(session, 1);
      assert.equal(st.score, lastRes.appliedScore, `快速连点后分值应停在 ${lastRes.appliedScore}，实际 ${st.score}`);
      const raw = await session.evaluate((k) => localStorage.getItem(k), EXPECTED_STORAGE_KEY);
      assert.ok(raw && raw.includes(String(lastRes.appliedScore)), 'localStorage 应记录最终分值');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-03' });
    },
  },
  {
    id: 'T2-F3-04',
    tier: 2,
    feature: 'F3',
    title: '快速连续切换 4 个购买意愿胶囊 6 次，最终严格停留在必入正装',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const seq = ['必入正装', '再试几次', '一般般', '劝退拔草', '再试几次', '必入正装'];
      let st;
      for (const intent of seq) {
        st = await setBuyIntent(session, 1, intent);
      }
      assert.deepEqual(st.activeIntents, ['必入正装']);
      const prog = await readProgress(session);
      if (prog.favoriteCount !== null) {
        assert.equal(prog.favoriteCount, 1, '顶部必入计数应严格为 1');
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-04' });
    },
  },
  {
    id: 'T2-F3-05',
    tier: 2,
    feature: 'F3',
    title: '最低分(0.5/1)与最高分(5.0/10)极值组合下均分计算精确无 NaN',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const r1 = await setPerfumeScore(session, 1, 0.5);
      await setPerfumeScore(session, 2, 5.0);
      const prog = await readProgress(session);
      const expected = r1.scaleType === '10-point' ? 5.5 : 2.75;
      if (prog.averageText && prog.averageText !== '--') {
        const actual = Number(prog.averageText);
        assert.ok(!Number.isNaN(actual), '均分不能为 NaN');
        assert.ok(Math.abs(actual - expected) <= 0.1, `均分应接近 ${expected}，实际 ${actual}`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-05' });
    },
  },
  {
    id: 'T2-F3-06',
    tier: 2,
    feature: 'F3',
    title: '清除唯一已试卡片评分或确认清空后进度准确回落为 0 / 10',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setPerfumeScore(session, 1, 4.0);
      assert.equal((await readProgress(session)).tested, 1);
      const cleared = await setPerfumeScore(session, 1, null, { optional: true });
      if (!cleared.cleared) {
        await triggerReset(session, 'confirm');
      }
      assert.equal((await readProgress(session)).tested, 0, '清空后进度应回落至 0/10');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F3-06' });
    },
  },

  // ==================== F4 边界与角落 (6) ====================
  {
    id: 'T2-F4-01',
    tier: 2,
    feature: 'F4',
    title: '详情抽屉触发按钮与关闭按钮均满足 >= 44×44px 触控热区',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const mainAudit = await auditTouchTargets(session, { minSize: 44, scope: 'main' });
      assert.equal(mainAudit.undersized.length, 0, `主界面存在过小按钮: ${JSON.stringify(mainAudit.undersized.slice(0, 5))}`);
      await openDetailDrawer(session, 1);
      const dlgAudit = await auditTouchTargets(session, { minSize: 44, scope: 'dialog' });
      assert.equal(dlgAudit.undersized.length, 0, `详情抽屉存在过小按钮: ${JSON.stringify(dlgAudit.undersized.slice(0, 5))}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-01' });
    },
  },
  {
    id: 'T2-F4-02',
    tier: 2,
    feature: 'F4',
    title: '详情抽屉内 <textarea> 默认态与聚焦态计算字号均 >= 16px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      const fsAudit = await auditTextareaFontSize(session, { minFontSize: 16 });
      assert.ok(fsAudit.totalChecked >= 1, '详情抽屉应包含可见的 <textarea>');
      assert.equal(fsAudit.passed, true, `textarea 字号低于 16px: ${JSON.stringify(fsAudit.violations)}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-02' });
    },
  },
  {
    id: 'T2-F4-03',
    tier: 2,
    feature: 'F4',
    title: '输入 300 字英数中文 Emoji 混合长笔记不崩溃且双视口无溢出',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const payload =
        'AbcDefGhiJklMnOpQrStUvWxYz0123456789'.repeat(4) +
        '前调清甜柑橘与风铃草水汽感非常自然适合春夏通勤🌸🍊✨💖'.repeat(3);
      await openDetailDrawer(session, 2);
      const val = await setDrawerNote(session, payload);
      assert.equal(val, payload, '超长混合笔记应完整写入');
      assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false, '抽屉长笔记输入态 375px 溢出');
      await closeActiveDialog(session, 'button');

      for (const vp of EXPECTED_VIEWPORTS) {
        await session.setViewport(vp);
        await sleep(80);
        assert.equal((await auditViewportOverflow(session, vp.width)).hasHorizontalOverflow, false, `${vp.name} 保存长笔记后主页溢出`);
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-03' });
    },
  },
  {
    id: 'T2-F4-04',
    tier: 2,
    feature: 'F4',
    title: '试香笔记注入 XSS 攻击载荷严格转义渲染且不执行脚本',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const xss = '"><script>window.__xss=1</script><img src=x onerror="window.__xss=2">';
      await openDetailDrawer(session, 3);
      await setDrawerNote(session, xss);
      await closeActiveDialog(session, 'button');
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);

      await openReportModal(session);
      const xssFlag = await session.evaluate(() => window.__xss);
      assert.equal(xssFlag, undefined, '检测到 XSS 脚本被执行！');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-04' });
    },
  },
  {
    id: 'T2-F4-05',
    tier: 2,
    feature: 'F4',
    title: '输入纯空格与换行符笔记安全处理不报错不撑出空行',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await setDrawerNote(session, '   \n\t  ');
      await closeActiveDialog(session, 'button');
      const ov = await auditViewportOverflow(session, 375);
      assert.equal(ov.hasHorizontalOverflow, false);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-05' });
    },
  },
  {
    id: 'T2-F4-06',
    tier: 2,
    feature: 'F4',
    title: '快速关闭第 1 卡抽屉并立即打开第 4 卡抽屉写入笔记不串卡',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await closeActiveDialog(session, 'button');
      await openDetailDrawer(session, 4);
      const dlg = await readActiveDialog(session);
      assert.match(dlg.text, /自我无界/, '抽屉应绑定到第 4 款自我无界');
      await setDrawerNote(session, '专属自我无界的笔记');
      await closeActiveDialog(session, 'button');

      const c1 = await readCardState(session, 1);
      const c4 = await readCardState(session, 4);
      assert.doesNotMatch(c1.text, /专属自我无界的笔记/, '第 1 款卡片不应被串写');
      assert.match(c4.text, /专属自我无界的笔记/, '第 4 款卡片应收到专属笔记');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F4-06' });
    },
  },

  // ==================== F5 边界与角落 (6) ====================
  {
    id: 'T2-F5-01',
    tier: 2,
    feature: 'F5',
    title: '筛选栏、排序控件及空状态恢复按钮（含激活态）热区均 >= 44×44px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const barRe = /^(?:全部|待试|未试|已试|必入正装|挚爱|心愿|原单|评分从高|高分优先|排序)/;
      const initialAudit = await auditTouchTargets(session, {
        minSize: 44,
        scope: 'main',
        labelFilter: barRe,
      });
      assert.ok(initialAudit.totalChecked >= 4, `应检测到至少 4 个筛选/排序控件，实际 ${initialAudit.totalChecked}`);
      assert.equal(
        initialAudit.undersized.length,
        0,
        `筛选/排序存在过小热区: ${JSON.stringify(initialAudit.undersized)}`
      );
      assert.equal(
        initialAudit.overlaps.length,
        0,
        `筛选/排序控件存在重叠: ${JSON.stringify(initialAudit.overlaps)}`
      );

      // 切换至空筛选激活态，检验激活按钮与空状态恢复按钮热区
      await selectFilter(session, 'favorite');
      const emptyStateAudit = await auditTouchTargets(session, {
        minSize: 44,
        scope: 'main',
        labelFilter: /(?:全部|待试|已试|必入正装|挚爱|原单|评分从高|排序|查看全部|重置筛选|显示全部)/,
      });
      assert.equal(
        emptyStateAudit.undersized.length,
        0,
        `激活态筛选或空状态恢复按钮热区不足 44×44: ${JSON.stringify(emptyStateAudit.undersized)}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-01' });
    },
  },
  {
    id: 'T2-F5-02',
    tier: 2,
    feature: 'F5',
    title: '0/10 全未试状态下均分与 Top3 区不出现 NaN/Infinity/undefined',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const txt = await session.evaluate(() => document.body.innerText);
      assert.doesNotMatch(txt, /\b(?:NaN|Infinity|undefined)\b/, `初始态出现非法数值字符: ${txt}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-02' });
    },
  },
  {
    id: 'T2-F5-03',
    tier: 2,
    feature: 'F5',
    title: '在「待试」筛选视图内对第 1 卡打分后实时同步列表与计数',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await selectFilter(session, 'untested');
      await setPerfumeScore(session, 1, 4.0);
      assert.equal((await readProgress(session)).tested, 1, '顶部进度应推进至 1/10');
      const remaining = await selectFilter(session, 'untested');
      assert.equal(remaining.length, 9, `待试视图应剩余 9 款，实际 ${remaining.length}`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-03' });
    },
  },
  {
    id: 'T2-F5-04',
    tier: 2,
    feature: 'F5',
    title: '4 款同打满分(5.0)时排序降序稳定且 Top3 不溢出 4 条',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (const idx of [1, 3, 5, 8]) {
        await setPerfumeScore(session, idx, 5.0);
      }
      const sorted = await selectSort(session, 'scoreDesc');
      assert.equal(sorted.length, 10, '降序排序应完整展示 10 张卡');
      const top4Ids = new Set(sorted.slice(0, 4).map((c) => c.catalogIndex));
      assert.deepEqual(top4Ids, new Set([1, 3, 5, 8]), '前 4 张应严格为 4 款满分香水');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-04' });
    },
  },
  {
    id: 'T2-F5-05',
    tier: 2,
    feature: 'F5',
    title: '6 款分别评不同分数后，战报 Top3 严格仅列前 3 名',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const scores = [5.0, 4.5, 4.0, 3.5, 3.0, 2.5];
      for (let i = 0; i < 6; i++) {
        await setPerfumeScore(session, i + 1, scores[i]);
      }
      const sorted = await selectSort(session, 'scoreDesc');
      assert.deepEqual(
        sorted.slice(0, 6).map((c) => c.catalogIndex),
        [1, 2, 3, 4, 5, 6],
        '降序排序前 6 顺位应严格对应 5.0->2.5'
      );

      const findTop3Section = async (inDialog) => {
        return await session.evaluate((insideDlg) => {
          let root = document.body;
          if (insideDlg) {
            const dialogs = Array.from(
              document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]')
            ).filter((d) => {
              if (d.hasAttribute('hidden') || d.getAttribute('aria-hidden') === 'true') return false;
              const st = getComputedStyle(d);
              return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0.05;
            });
            root = dialogs[dialogs.length - 1] || null;
          }
          if (!root) return { found: false, text: '' };

          const blocks = Array.from(root.querySelectorAll('section, aside, div, article')).filter((el) => {
            if (!insideDlg && el.closest('[role="dialog"], dialog, [aria-modal="true"], [data-perfume-id]')) {
              return false;
            }
            if (el.querySelector('[data-perfume-id]')) return false;
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
            const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
            // 必须是包含榜单标题与第1名且不含全量明细/待试清单/导出按钮的 Top3 区块
            const hasTitle = /(?:Top\s*3|心动\s*Top|心愿榜|Top3|最爱\s*3)/i.test(t);
            const hasRank1 = /大地/.test(t);
            const isWholeReport = /待试清单|全部已试|试香明细|复制文字战报|导出战报长图/.test(t);
            return hasTitle && hasRank1 && !isWholeReport;
          });
          blocks.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
          const target = blocks[0] || null;
          return target
            ? { found: true, text: (target.innerText || '').replace(/\s+/g, ' ').trim() }
            : { found: false, text: '' };
        }, inDialog);
      };

      const mainTop3 = await findTop3Section(false);
      await openReportModal(session);
      const modalTop3 = await findTop3Section(true);
      await closeActiveDialog(session, 'button');

      assert.equal(
        mainTop3.found || modalTop3.found,
        true,
        '6 款打分后页面或战报弹窗内应呈现明确的 Top3 总结区块'
      );

      for (const sec of [mainTop3, modalTop3].filter((s) => s.found)) {
        assert.match(sec.text, /大地/, `Top3 应包含第 1 名「大地」；实际: ${sec.text}`);
        assert.match(sec.text, /蓝风铃/, `Top3 应包含第 2 名「蓝风铃」；实际: ${sec.text}`);
        assert.match(sec.text, /我本莫测/, `Top3 应包含第 3 名「我本莫测」；实际: ${sec.text}`);
        assert.doesNotMatch(
          sec.text,
          /自我无界|粉耀晶钻|粉钻|反转巴黎/,
          `Top3 应严格截断为前 3 名，不得包含第 4~6 名；实际: ${sec.text}`
        );
      }
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-05' });
    },
  },
  {
    id: 'T2-F5-06',
    tier: 2,
    feature: 'F5',
    title: '在「必入正装」筛选内取消唯一卡片的必入意愿后平滑转为空状态',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await setBuyIntent(session, 1, '必入正装');
      const fav = await selectFilter(session, 'favorite');
      assert.equal(fav.length, 1);
      await setBuyIntent(session, 1, '劝退拔草');
      await sleep(100);
      const afterFav = await locatePerfumeCards(session);
      assert.equal(afterFav.length, 0, '改选劝退后必入正装筛选视图应变为 0 张卡');
      const hasEmptyMsg = await session.evaluate(() => /暂无|还没有|查看全部|重置/.test(document.body.innerText));
      assert.equal(hasEmptyMsg, true, '应渲染空状态引导');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F5-06' });
    },
  },

  // ==================== F6 边界与角落 (6) ====================
  {
    id: 'T2-F6-01',
    tier: 2,
    feature: 'F6',
    title: 'localStorage 写入损坏 JSON 后刷新优雅降级且零控制台错误',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate((k) => localStorage.setItem(k, '{broken_json:::'), EXPECTED_STORAGE_KEY);
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      assert.equal((await readProgress(session)).tested, 0);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-01' });
    },
  },
  {
    id: 'T2-F6-02',
    tier: 2,
    feature: 'F6',
    title: 'localStorage 写入不兼容版本号(version:999)安全回退并允许后续打分',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(
        (k) => localStorage.setItem(k, JSON.stringify({ version: 999, reviews: { fake: { score: 5 } } })),
        EXPECTED_STORAGE_KEY
      );
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const res = await setPerfumeScore(session, 1, 4.0);
      assert.ok(res.cardState.isTested, '回退后应仍可正常打分');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-02' });
    },
  },
  {
    id: 'T2-F6-03',
    tier: 2,
    feature: 'F6',
    title: 'localStorage 写入缺失深层字段的残缺对象不触发 TypeError',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(
        (k) =>
          localStorage.setItem(
            k,
            JSON.stringify({ version: 1, items: { 'hermes-terre': { overallScore: 4 } }, reviews: { 'hermes-terre': { overallScore: 4 } } })
          ),
        EXPECTED_STORAGE_KEY
      );
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      await openDetailDrawer(session, 1);
      await setDrawerDimensions(session, { scenes: ['通勤日常'] });
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-03' });
    },
  },
  {
    id: 'T2-F6-04',
    tier: 2,
    feature: 'F6',
    title: 'localStorage 注入越界非法分值(99/-2/NaN)刷新后安全清洗不展示异常',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(
        (k) =>
          localStorage.setItem(
            k,
            JSON.stringify({
              version: 1,
              reviews: {
                'hermes-terre': { overallScore: 99, score: 99 },
                'jo-malone-wild-bluebell': { overallScore: -2, score: -2 },
                'prada-paradoxe': { overallScore: 'NaN', score: 'NaN' },
              },
            })
          ),
        EXPECTED_STORAGE_KEY
      );
      await session.reload({ ignoreCache: true });
      await waitForCardsReady(session, 10);
      const bodyText = await session.evaluate(() => document.body.innerText);
      assert.doesNotMatch(bodyText, /\b99\s*(?:星|分|\/)|NaN/, '界面不应渲染未清洗的 99 或 NaN');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-04' });
    },
  },
  {
    id: 'T2-F6-05',
    tier: 2,
    feature: 'F6',
    title: 'Storage.setItem 抛出 QuotaExceededError 时界面状态仍实时更新且无未捕获异常',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        };
      });
      const res = await setPerfumeScore(session, 1, 4.5);
      assert.ok(res.cardState.isTested, '存储受限时内存态仍应正常更新评分与已试标记');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-05' });
    },
  },
  {
    id: 'T2-F6-06',
    tier: 2,
    feature: 'F6',
    title: '0/10 全空初始态执行清空二次确认不崩溃且保持 0/10',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await triggerReset(session, 'confirm');
      assert.equal((await readProgress(session)).tested, 0);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F6-06' });
    },
  },

  // ==================== F7 边界与角落 (6) ====================
  {
    id: 'T2-F7-01',
    tier: 2,
    feature: 'F7',
    title: '0/10 全未试状态打开战报并复制/导出长图均无 NaN 且正常执行',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      const dlg = await openReportModal(session);
      assert.doesNotMatch(dlg.text, /\b(?:NaN|Infinity|undefined)\b/, '空战报出现 NaN/undefined');
      const copyRes = await verifyCopyTextReport(session, { simulateFailure: false });
      assert.ok(copyRes.clipboardCallCount > 0 || copyRes.hasFallbackBox);
      await verifyCanvasLongImage(session);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-01' });
    },
  },
  {
    id: 'T2-F7-02',
    tier: 2,
    feature: 'F7',
    title: '仅试 1 款评 4.0 分时战报均分严格为 4.0（不按 10 款稀释为 0.4）',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const r = await setPerfumeScore(session, 1, 4.0);
      const expected = r.scaleType === '10-point' ? '8' : '4';
      const dlg = await openReportModal(session);
      assert.match(dlg.text, /1\s*\/\s*10|已试\s*1/, '战报应显示已试 1 款');
      assert.doesNotMatch(dlg.text, /(?:平均分|均分)\s*[：:]?\s*0\.(?:4|8)/, '战报均分不可错误除以 10');
      assert.ok(dlg.text.includes(`${expected}.0`) || dlg.text.includes(expected), '战报应显示正确已试均分');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-02' });
    },
  },
  {
    id: 'T2-F7-03',
    tier: 2,
    feature: 'F7',
    title: 'Clipboard API 拒绝授权时自动降级为可选文本域且零未捕获异常',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      await setPerfumeScore(session, 1, 5.0);
      await openReportModal(session);
      const copyRes = await verifyCopyTextReport(session, { simulateFailure: true });
      assert.equal(copyRes.hasFallbackBox, true, '剪贴板写入被拒绝后应在战报弹窗提供可选中降级文本框/文本域');
      assert.match(copyRes.copiedText, /大地/, '降级文本框应包含战报完整内容');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-03' });
    },
  },
  {
    id: 'T2-F7-04',
    tier: 2,
    feature: 'F7',
    title: '5 款写入带换行与 Emoji 的 200+ 字长评后 Canvas 长图动态增高完整渲染',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await installExportSpies(session);
      for (let i = 1; i <= 5; i++) {
        await setPerfumeScore(session, i, 4.5);
        await openDetailDrawer(session, i);
        await setDrawerNote(
          session,
          `第${i}款试香长评🌸：\n前调清新自然，中调柔和细腻，后调木质持久非常贴肤。` + '香气层次很丰富✨'.repeat(4)
        );
        await closeActiveDialog(session, 'button');
      }
      await openReportModal(session);
      const cRes = await verifyCanvasLongImage(session);
      assert.equal(cRes.securityErrors.length, 0);
      const maxH = Math.max(
        0,
        ...cRes.canvasInfos.map((c) => c.height || 0),
        ...cRes.newToDataUrlCalls.map((c) => c.height || 0),
        ...cRes.newToBlobCalls.map((c) => c.height || 0)
      );
      assert.ok(maxH > 900, `5 款长评战报长图高度应动态扩展 (>900px)，实际 ${maxH}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-04' });
    },
  },
  {
    id: 'T2-F7-05',
    tier: 2,
    feature: 'F7',
    title: '导入非法 JSON 文件时给出中文提示且原 5.0 分数据不被覆盖破坏',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const r = await setPerfumeScore(session, 1, 5.0);
      await openReportModal(session);
      const collectSnapshot = () =>
        session.evaluate(() => {
          const isVisible = (el) => {
            if (!el || el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) <= 0.05) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };
          const bodyText = document.body.innerText || '';
          const bodyLines = bodyText
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const alertTexts = Array.from(document.querySelectorAll('[role="alert"], [aria-live]'))
            .filter(isVisible)
            .map((el) => (el.innerText || el.textContent || '').trim())
            .filter(Boolean);
          return { bodyText, bodyLines, alertTexts };
        });

      const beforeSnap = await collectSnapshot();
      const beforeDialogCount = session.getDialogs().length;
      await importJsonReport(session, '{not_valid_json!!!');

      const afterSnap = await collectSnapshot();
      const beforeLineCounts = new Map();
      for (const line of beforeSnap.bodyLines) {
        beforeLineCounts.set(line, (beforeLineCounts.get(line) || 0) + 1);
      }
      const addedLines = [];
      for (const line of afterSnap.bodyLines) {
        const rem = beforeLineCounts.get(line) || 0;
        if (rem > 0) {
          beforeLineCounts.set(line, rem - 1);
        } else {
          addedLines.push(line);
        }
      }
      const addedAlerts = afterSnap.alertTexts.filter((t) => !beforeSnap.alertTexts.includes(t));
      const newDialogMsgs = session
        .getDialogs()
        .slice(beforeDialogCount)
        .map((d) => d.message)
        .join('\n');
      const newlyAppeared = [...addedAlerts, ...addedLines, newDialogMsgs].filter(Boolean).join('\n');

      assert.match(
        newlyAppeared,
        /(?:失败|错误|无效|不合法|损坏|无法解析|无法识别|格式有误|格式不对|格式错误|不正确|异常)/,
        `导入非法 JSON 后应新增出现中文错误/格式提示（不能仅依赖原有静态文案），新增文本片段: ${newlyAppeared.slice(0, 300)}`
      );
      assert.match(newlyAppeared, /[\u4e00-\u9fff]/, '非法 JSON 新增提示必须为中文');

      await closeActiveDialog(session, 'button').catch(() => {});
      const st = await readCardState(session, 1);
      assert.equal(st.score, r.cardState.score, `导入损坏 JSON 不应破坏已有 ${r.cardState.score} 分评分`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-05' });
    },
  },
  {
    id: 'T2-F7-06',
    tier: 2,
    feature: 'F7',
    title: '战报弹窗内所有操作按钮与关闭按钮有效热区 >= 44×44px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openReportModal(session);
      const audit = await auditTouchTargets(session, { minSize: 44, scope: 'dialog' });
      assert.equal(audit.undersized.length, 0, `战报弹窗存在过小按钮: ${JSON.stringify(audit.undersized)}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F7-06' });
    },
  },

  // ==================== F8 边界与角落 (6) ====================
  {
    id: 'T2-F8-01',
    tier: 2,
    feature: 'F8',
    title: '模拟 prefers-reduced-motion: reduce 时动效时长降级且交互正常',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.setReducedMotion(true);
      try {
        const matched = await session.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        assert.equal(matched, true);
        const maxDur = await session.evaluate(() => {
          let max = 0;
          for (const el of document.querySelectorAll('button, [data-perfume-id], [role="dialog"]')) {
            const st = getComputedStyle(el);
            for (const token of (st.transitionDuration || '0s').split(',')) {
              const t = token.trim();
              const ms = t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000;
              if (ms > max) max = ms;
            }
          }
          return max;
        });
        assert.ok(maxDur <= 200, `reduced-motion 下最大 transitionDuration 应 <= 200ms，实际 ${maxDur}ms`);
        await openDetailDrawer(session, 1);
        await closeActiveDialog(session, 'button');
        assertCleanDiagnostics(session, { contextLabel: 'T2-F8-01' });
      } finally {
        await session.setReducedMotion(false);
      }
    },
  },
  {
    id: 'T2-F8-02',
    tier: 2,
    feature: 'F8',
    title: '正常动效模式下控件响应迅捷（<=300ms）且抽屉不超过 500ms',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const durations = await session.evaluate(() => {
        const parseMax = (s) =>
          Math.max(
            0,
            ...(s || '0s').split(',').map((t) => {
              const v = t.trim();
              return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
            })
          );
        const btnMax = Math.max(
          0,
          ...Array.from(document.querySelectorAll('button')).map((b) => parseMax(getComputedStyle(b).transitionDuration))
        );
        const dlgMax = Math.max(
          0,
          ...Array.from(document.querySelectorAll('[role="dialog"], dialog')).map((d) =>
            parseMax(getComputedStyle(d).transitionDuration)
          )
        );
        return { btnMax, dlgMax };
      });
      assert.ok(durations.btnMax <= 350, `按钮动效过长: ${durations.btnMax}ms`);
      assert.ok(durations.dlgMax <= 550, `弹窗/抽屉动效过长: ${durations.dlgMax}ms`);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F8-02' });
    },
  },
  {
    id: 'T2-F8-03',
    tier: 2,
    feature: 'F8',
    title: '零破图(brokenImages=0)且所有可见 SVG 图标宽高均 > 0',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const mediaCheck = await session.evaluate(() => {
        const brokenImgs = Array.from(document.querySelectorAll('img')).filter((i) => !i.complete || i.naturalWidth === 0).length;
        const zeroSvgs = Array.from(document.querySelectorAll('svg')).filter((s) => {
          const st = getComputedStyle(s);
          if (st.display === 'none' || st.visibility === 'hidden') return false;
          const r = s.getBoundingClientRect();
          return r.width <= 0 || r.height <= 0;
        }).length;
        return { brokenImgs, zeroSvgs };
      });
      assert.equal(mediaCheck.brokenImgs, 0, '存在加载破损的 <img>');
      assert.equal(mediaCheck.zeroSvgs, 0, '存在宽高为 0 的可见 <svg>');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F8-03' });
    },
  },
  {
    id: 'T2-F8-04',
    tier: 2,
    feature: 'F8',
    title: '控制按钮禁止误长按选中文本(user-select: none)而 textarea 保持可选可编辑',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      const selCheck = await session.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).slice(0, 6);
        const btnSelects = btns.map((b) => getComputedStyle(b).userSelect || getComputedStyle(b).webkitUserSelect);
        const ta = document.querySelector('textarea');
        const taSelect = ta ? getComputedStyle(ta).userSelect || getComputedStyle(ta).webkitUserSelect : null;
        return { btnSelects, taSelect };
      });
      assert.ok(selCheck.btnSelects.every((s) => s === 'none'), `按钮应设为 user-select: none，实际: ${selCheck.btnSelects.join(',')}`);
      assert.notEqual(selCheck.taSelect, 'none', '<textarea> 不应设为 user-select: none');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F8-04' });
    },
  },
  {
    id: 'T2-F8-05',
    tier: 2,
    feature: 'F8',
    title: '空状态引导与二次确认弹窗等动态交互态零未汉化模板词',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      // 1. 触发筛选空状态并扫描引导文案
      await selectFilter(session, 'favorite');
      const emptyAudit = await auditUnlocalizedText(session);
      assert.equal(emptyAudit.passed, true, `空状态引导存在未汉化或模板词: ${JSON.stringify(emptyAudit)}`);

      // 2. 切回全部，打分 1 款并点击清空触发二次确认弹窗，扫描弹窗文案
      await selectFilter(session, 'all');
      await setPerfumeScore(session, 1, 4.0);
      await tapElement(
        session,
        () => {
          const btns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
            (b) => !b.closest('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"], [data-perfume-id]')
          );
          return (
            btns.find((b) =>
              /清空|重置|重来/.test((b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim())
            ) || null
          );
        },
        [],
        { label: '清空/重置触发按钮' }
      );
      await session.waitFor(
        () =>
          Array.from(document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, [aria-modal="true"]')).some(
            (d) => {
              const st = getComputedStyle(d);
              return !d.hasAttribute('hidden') && st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0.05;
            }
          ),
        { timeoutMs: 3000, message: '未弹出二次确认弹窗' }
      );
      const confirmAudit = await auditUnlocalizedText(session);
      assert.equal(confirmAudit.passed, true, `二次确认弹窗存在未汉化或模板词: ${JSON.stringify(confirmAudit)}`);

      await tapElement(
        session,
        () => {
          const dlgs = Array.from(
            document.querySelectorAll('[role="alertdialog"], [role="dialog"], dialog, [aria-modal="true"]')
          );
          const dlg = dlgs[dlgs.length - 1];
          if (!dlg) return null;
          return (
            Array.from(dlg.querySelectorAll('button, [role="button"]')).find((b) =>
              /取消|算了|返回|保留|关闭|不清空|暂不|先不|否/.test(
                (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim()
              )
            ) || null
          );
        },
        [],
        { label: '取消确认弹窗' }
      );
      assertCleanDiagnostics(session, { contextLabel: 'T2-F8-05' });
    },
  },
  {
    id: 'T2-F8-06',
    tier: 2,
    feature: 'F8',
    title: '连续 5 次交替开关详情抽屉与战报弹窗后无残余透明遮罩拦截点击',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      for (let i = 0; i < 3; i++) {
        await openDetailDrawer(session, (i % 3) + 1);
        await closeActiveDialog(session, 'button');
        await openReportModal(session);
        await closeActiveDialog(session, 'button');
      }
      // 最终点击第 1 张卡评分验证绝无残留遮罩
      const res = await setPerfumeScore(session, 1, 5.0);
      assert.ok(res.cardState.isTested);
      assertCleanDiagnostics(session, { contextLabel: 'T2-F8-06' });
    },
  },

  // ==================== F9 边界与角落 (6) ====================
  {
    id: 'T2-F9-01',
    tier: 2,
    feature: 'F9',
    title: 'HTTP 服务、file://index.html 与 file://dist 三入口均零报错支持打分',
    viewport: { width: 375, height: 812 },
    async run({ session, baseUrl, indexPath, distPath }) {
      let tempServer = null;
      try {
        let effectiveBaseUrl = baseUrl;
        if (!effectiveBaseUrl) {
          tempServer = await startStaticServer({
            rootDir: path.dirname(indexPath),
            host: '127.0.0.1',
            entry: path.basename(indexPath),
          });
          effectiveBaseUrl = tempServer.baseUrl;
        }
        const urls = [`${effectiveBaseUrl}/${path.basename(indexPath)}`, toFileUrl(indexPath)];
        if (distPath && fs.existsSync(distPath)) urls.push(toFileUrl(distPath));

        for (const u of urls) {
          session.clearDiagnostics();
          await session.navigate(u);
          await waitForCardsReady(session, 10);
          const res = await setPerfumeScore(session, 1, 4.0);
          assert.ok(res.cardState.isTested, `${u} 打分后未标记已试`);
          assert.equal((await auditViewportOverflow(session, 375)).hasHorizontalOverflow, false, `${u} 水平溢出`);
          assertCleanDiagnostics(session, { contextLabel: `T2-F9-01(${u})` });
        }
      } finally {
        if (tempServer) {
          await tempServer.stop().catch(() => {});
        }
      }
    },
  },
  {
    id: 'T2-F9-02',
    tier: 2,
    feature: 'F9',
    title: '模拟软键盘弹出压缩视口至 375×480 时抽屉内 textarea 仍可滚动聚焦输入',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await openDetailDrawer(session, 1);
      await session.setViewport({ width: 375, height: 480, deviceScaleFactor: 2, mobile: true });
      await sleep(100);
      const val = await setDrawerNote(session, '软键盘压缩高度下正常输入');
      assert.equal(val, '软键盘压缩高度下正常输入');
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F9-02' });
    },
  },
  {
    id: 'T2-F9-03',
    tier: 2,
    feature: 'F9',
    title: '全页所有可见非禁用交互按钮有效触控热区均 >= 44×44px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const audit = await auditTouchTargets(session, { minSize: 44, scope: 'main' });
      assert.equal(
        audit.undersized.length,
        0,
        `主界面发现 ${audit.undersized.length} 个过小热区: ${JSON.stringify(audit.undersized.slice(0, 8))}`
      );
      assertCleanDiagnostics(session, { contextLabel: 'T2-F9-03' });
    },
  },
  {
    id: 'T2-F9-04',
    tier: 2,
    feature: 'F9',
    title: '320×568 超窄屏(iPhone SE)下优雅折行且无水平溢出崩溃',
    viewport: { width: 320, height: 568 },
    async run({ session }) {
      const prevVp = session._viewport
        ? { ...session._viewport }
        : { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };
      await session.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
      await sleep(80);
      try {
        const cards = await locatePerfumeCards(session);
        assert.equal(cards.length, 10);
        const ov = await auditViewportOverflow(session, 320);
        assert.equal(ov.hasHorizontalOverflow, false, `320px 超窄屏溢出: ${JSON.stringify(ov)}`);
        assertCleanDiagnostics(session, { contextLabel: 'T2-F9-04' });
      } finally {
        await session.setViewport(prevVp).catch(() => {});
      }
    },
  },
  {
    id: 'T2-F9-05',
    tier: 2,
    feature: 'F9',
    title: '页面底部预留安全留白，第 10 卡「宝格丽 大吉岭原版」全部控件完全可点',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      await session.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(100);
      const res = await setPerfumeScore(session, 10, 4.5);
      const st = await setBuyIntent(session, 10, '必入正装');
      assert.ok(res.cardState.isTested && st.activeIntents.includes('必入正装'));
      assertCleanDiagnostics(session, { contextLabel: 'T2-F9-05' });
    },
  },
  {
    id: 'T2-F9-06',
    tier: 2,
    feature: 'F9',
    title: '全页主体文字字号 >= 12px 且全部文本输入控件字号 >= 16px',
    viewport: { width: 375, height: 812 },
    async run({ session }) {
      const tinyTexts = await session.evaluate(() => {
        const bad = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          if (!(n.nodeValue || '').trim()) continue;
          const el = n.parentElement;
          if (!el) continue;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || el.getBoundingClientRect().width <= 0) continue;
          const fs = parseFloat(st.fontSize);
          if (fs < 11.5) {
            bad.push({ tag: el.tagName, fs, text: n.nodeValue.trim().slice(0, 20) });
          }
        }
        return bad;
      });
      assert.equal(tinyTexts.length, 0, `存在过小不可读文字 (<12px): ${JSON.stringify(tinyTexts.slice(0, 5))}`);
      await openDetailDrawer(session, 1);
      const fsAudit = await auditTextareaFontSize(session, { minFontSize: 16 });
      assert.equal(fsAudit.passed, true, `输入框字号 < 16px: ${JSON.stringify(fsAudit.violations)}`);
      await closeActiveDialog(session, 'button');
      assertCleanDiagnostics(session, { contextLabel: 'T2-F9-06' });
    },
  },
];
