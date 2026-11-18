/**
 * 离线正/反向夹具自检脚本（S1–S6）
 * 100% 独立于业务源码运行，全面校验测试引擎与断言灵敏度
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  findBrowser,
  launchBrowser,
  removeDirWithRetry,
  sleep,
  startMemoryHttpServer,
} from './lib/cdp-client.mjs';
import { parseCliArgs } from './lib/cli-args.mjs';
import {
  EXPECTED_CATALOG,
  EXPECTED_STORAGE_KEY,
} from './lib/expected-catalog.mjs';
import {
  assertCleanDiagnostics,
  auditTextareaFontSize,
  auditTouchTargets,
  auditUnlocalizedText,
  auditViewportOverflow,
  tapElement,
  triggerReset,
} from './lib/semantic-helpers.mjs';
import { TIER1_CASES } from './tiers/tier1-features.mjs';
import { TIER2_CASES } from './tiers/tier2-boundaries.mjs';
import { TIER3_CASES } from './tiers/tier3-pairwise.mjs';
import { TIER4_CASES } from './tiers/tier4-journeys.mjs';

const VALID_FIXTURE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>离线测试合规夹具</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: sans-serif;
      background: #FAF7F2;
      color: #1C1917;
      min-height: 1200px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      min-height: 48px;
      padding: 10px 16px;
      margin: 8px 8px 8px 0;
      border: 1px solid #A65646;
      background: #fff;
      color: #1C1917;
      font-size: 14px;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .icon-hit {
      position: relative;
      display: inline-flex;
      width: 24px;
      height: 24px;
      margin: 16px;
      border: 1px solid #1C1917;
      background: #fff;
      padding: 0;
    }
    .icon-hit::before {
      content: '';
      position: absolute;
      width: 48px;
      height: 48px;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
    textarea {
      display: block;
      width: 100%;
      min-height: 80px;
      font-size: 16px;
      padding: 10px;
      margin-top: 12px;
    }
    @media (prefers-reduced-motion: reduce) {
      .btn { transition-duration: 0.01s; }
    }
    .reset-modal {
      position: fixed;
      left: 16px;
      right: 16px;
      top: 120px;
      padding: 16px;
      background: #fff;
      border: 1px solid #1C1917;
      z-index: 999;
    }
    .reset-modal[hidden] { display: none; }
  </style>
</head>
<body>
  <h1>试香打分卡合规自检夹具</h1>
  <p id="status">点击计数: <span id="cnt">0</span></p>
  <button id="btn-ok" class="btn" type="button">保存记录</button>
  <button id="btn-pseudo" class="icon-hit" type="button" aria-label="扩充热区按钮">★</button>
  <button id="btn-dl" class="btn" type="button">导出测试文件</button>
  <button id="btn-confirm" class="btn" type="button">弹窗确认</button>
  <button id="btn-reset-all" class="btn" type="button">清空全部</button>
  <div id="reset-dialog" class="reset-modal" role="alertdialog" aria-modal="true" hidden>
    <p>确认重置所有试香记录？此操作不可恢复。</p>
    <button id="btn-reset-cancel" class="btn" type="button">暂不清空</button>
    <button id="btn-reset-confirm" class="btn" type="button">确认清空</button>
  </div>
  <textarea id="note-box" placeholder="输入中文试香随手记"></textarea>
  <canvas id="c" width="320" height="120"></canvas>
  <script>
    let count = 0;
    document.getElementById('btn-ok').addEventListener('click', () => {
      count += 1;
      document.getElementById('cnt').textContent = String(count);
      localStorage.setItem('perfume_scorecard_v1', JSON.stringify({ count }));
    });
    document.getElementById('btn-pseudo').addEventListener('click', () => {
      count += 10;
      document.getElementById('cnt').textContent = String(count);
    });
    document.getElementById('btn-dl').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ ok: true, fixture: 'valid' })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'selftest-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    document.getElementById('btn-confirm').addEventListener('click', () => {
      window.__confirmResult = window.confirm('确认执行测试弹窗？');
    });
    document.getElementById('btn-reset-all').addEventListener('click', () => {
      document.getElementById('reset-dialog').removeAttribute('hidden');
    });
    document.getElementById('btn-reset-cancel').addEventListener('click', () => {
      window.__resetAction = 'cancel';
      document.getElementById('reset-dialog').setAttribute('hidden', '');
    });
    document.getElementById('btn-reset-confirm').addEventListener('click', () => {
      window.__resetAction = 'confirm';
      document.getElementById('reset-dialog').setAttribute('hidden', '');
    });
    const ctx = document.getElementById('c').getContext('2d');
    ctx.fillStyle = '#FAF7F2';
    ctx.fillRect(0, 0, 320, 120);
    ctx.fillStyle = '#A65646';
    ctx.fillRect(20, 20, 180, 60);
  </script>
</body>
</html>`;

const BROKEN_FIXTURE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>故意缺陷夹具</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    .overflow-box { width: 480px; height: 40px; background: #ccc; }
    .tiny-btn { width: 24px; height: 24px; padding: 0; border: 1px solid #000; font-size: 10px; }
    .fake-pseudo-btn {
      position: relative;
      display: inline-flex;
      width: 24px;
      height: 24px;
      margin: 16px;
      padding: 0;
      border: 1px solid #000;
    }
    .fake-pseudo-btn::before {
      content: '';
      position: absolute;
      width: 48px;
      height: 48px;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    textarea { font-size: 12px; width: 200px; height: 40px; }
  </style>
</head>
<body>
  <div class="overflow-box">横向溢出 480px 测试条</div>
  <button class="tiny-btn" type="button">Submit</button>
  <button class="fake-pseudo-btn" type="button" aria-label="假伪元素热区">★</button>
  <textarea placeholder="Placeholder"></textarea>
  <img src="/non-existent-broken-image.png" alt="破图" />
  <script>
    console.error('故意触发的 console.error');
    setTimeout(() => {
      throw new Error('故意触发的未捕获异常');
    }, 30);
  </script>
</body>
</html>`;

export async function runSelfTest({ preferredBrowser } = {}) {
  const results = [];
  const record = async (id, name, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      results.push({ id, name, status: 'PASS', ms: Date.now() - t0, detail: detail || 'OK' });
    } catch (err) {
      results.push({ id, name, status: 'FAIL', ms: Date.now() - t0, error: err.stack || err.message });
    }
  };

  // ---------- S1: CLI 参数解析与 129 条注册表核验 ----------
  await record('S1', 'CLI 参数解析与四层 129 条用例注册核验', async () => {
    const p1 = parseCliArgs(['--tier=2', '--viewport=390x844', '--mode=file', '--no-screenshots', '--json']);
    assert.equal(p1.tier, '2');
    assert.equal(p1.viewport, '390x844');
    assert.equal(p1.mode, 'file');
    assert.equal(p1.screenshots, false);
    assert.equal(p1.json, true);

    const p2 = parseCliArgs(['--self-test']);
    assert.equal(p2.selfTest, true);

    assert.throws(() => parseCliArgs(['--browser=']), /无效 --browser 值/);
    assert.throws(() => parseCliArgs(['--tier=']), /无效 --tier 值/);
    assert.throws(() => parseCliArgs(['--browser']), /缺少 --browser 参数值/);

    assert.equal(TIER1_CASES.length, 54, `Tier 1 应为 54 条，实际 ${TIER1_CASES.length}`);
    assert.equal(TIER2_CASES.length, 54, `Tier 2 应为 54 条，实际 ${TIER2_CASES.length}`);
    assert.equal(TIER3_CASES.length, 15, `Tier 3 应为 15 条，实际 ${TIER3_CASES.length}`);
    assert.equal(TIER4_CASES.length, 6, `Tier 4 应为 6 条，实际 ${TIER4_CASES.length}`);

    const allCases = [...TIER1_CASES, ...TIER2_CASES, ...TIER3_CASES, ...TIER4_CASES];
    assert.equal(allCases.length, 129, `总用例数应为 129，实际 ${allCases.length}`);
    const idSet = new Set(allCases.map((c) => c.id));
    assert.equal(idSet.size, 129, '存在重复用例 ID');
    for (const c of allCases) {
      assert.equal(typeof c.run, 'function', `${c.id} 缺少可执行 run 函数`);
    }
    return '129 条用例注册完整无重 (T1=54, T2=54, T3=15, T4=6)';
  });

  // ---------- S2: 权威 10 款目录契约自检 ----------
  await record('S2', '权威 10 款目录契约与规格边界核验', async () => {
    assert.equal(EXPECTED_STORAGE_KEY, 'perfume_scorecard_v1');
    assert.equal(EXPECTED_CATALOG.length, 10);
    assert.equal(new Set(EXPECTED_CATALOG.map((x) => x.suggestedId)).size, 10);

    const armani = EXPECTED_CATALOG.find((x) => x.suggestedId === 'armani-my-way');
    assert.equal(armani.isMerged, true);
    assert.equal(armani.quantity, 3);
    assert.ok(armani.expectedSpecPatterns.length >= 4);

    const pink = EXPECTED_CATALOG.find((x) => x.suggestedId === 'versace-bright-crystal');
    assert.equal(pink.quantity, null);
    assert.equal(pink.quantityUncertain, true);

    const requiredConc = EXPECTED_CATALOG.filter((x) => x.concentrationRequiredInOrder);
    assert.equal(requiredConc.length, 5, '仅 5 款在订单明确写出浓度者应设为必需');
    return '10 款目录契约、双规格合并及 5 款浓度边界核验通过';
  });

  // 准备临时自检目录与内存 HTTP 服务器
  const selfTestTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfume-e2e-selftest-'));
  let browser = null;
  let memServer = null;
  let browserTmpDir = null;

  try {
    memServer = await startMemoryHttpServer((req, res) => {
      if (req.url?.startsWith('/?fixture=broken') || req.url?.startsWith('/broken')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(BROKEN_FIXTURE_HTML);
      } else if (req.url?.includes('non-existent')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(VALID_FIXTURE_HTML);
      }
    });

    // ---------- S3: 无头浏览器探测、启动与 CDP 握手 ----------
    await record('S3', '无头 Chrome/Edge 拉起与 Browser-level CDP 扁平会话握手', async () => {
      const exe = findBrowser(preferredBrowser);
      browser = await launchBrowser({
        browserPath: exe,
        downloadDir: path.join(selfTestTmpDir, 'dl'),
      });
      browserTmpDir = browser.tmpDir;
      const page = await browser.newPage({ width: 375, height: 812 });
      const ua = await page.evaluate(() => navigator.userAgent);
      await page.close();
      return `已连接 ${path.basename(exe)} (${ua.slice(0, 50)}...)`;
    });

    // ---------- S4: 双视口 & prefers-reduced-motion 实测 ----------
    await record('S4', '双视口 (375×812 / 390×844) 突破 500px 限制与 reduced-motion 实测', async () => {
      assert.ok(browser, 'S3 浏览器未就绪');
      const page = await browser.newPage({ width: 375, height: 812 });
      try {
        await page.navigate(`${memServer.baseUrl}/?fixture=valid`);
        const m375 = await page.evaluate(() => ({
          w: window.innerWidth,
          h: window.innerHeight,
          dpr: window.devicePixelRatio,
        }));
        assert.equal(m375.w, 375, `预期 innerWidth=375，实际 ${m375.w}`);
        assert.equal(m375.h, 812);
        assert.equal(m375.dpr, 2);

        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        const m390 = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        assert.equal(m390.w, 390, `预期 innerWidth=390，实际 ${m390.w}`);
        assert.equal(m390.h, 844);

        await page.setReducedMotion(true);
        const rmOn = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        assert.equal(rmOn, true, 'prefers-reduced-motion: reduce 未生效');

        await page.setReducedMotion(false);
        const rmOff = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        assert.equal(rmOff, false, 'prefers-reduced-motion 未能恢复关闭');
        return '375×812 / 390×844 (@2x) 与 reduced-motion 双向切换精确命中';
      } finally {
        await page.close();
      }
    });

    // ---------- S5: 正向夹具全绿 + 反向缺陷夹具精准抓错 ----------
    await record('S5', '正/反向双夹具断言灵敏度验证（合规全绿 & 故意缺陷精准拦截）', async () => {
      assert.ok(browser, 'S3 浏览器未就绪');

      // 5A. 正向合规夹具
      const validPage = await browser.newPage({ width: 375, height: 812 });
      try {
        await browser.grantPermissions({
          origin: memServer.baseUrl,
          permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        });
        await validPage.navigate(`${memServer.baseUrl}/?fixture=valid`);

        const ov = await auditViewportOverflow(validPage, 375);
        assert.equal(ov.hasHorizontalOverflow, false, `合规夹具不应溢出: ${JSON.stringify(ov)}`);

        const touch = await auditTouchTargets(validPage, { minSize: 44 });
        assert.equal(touch.passed, true, `合规夹具热区（含 ::before）应全过: ${JSON.stringify(touch.undersized)}`);

        const fsAudit = await auditTextareaFontSize(validPage, { minFontSize: 16 });
        assert.equal(fsAudit.passed, true, '合规夹具 16px textarea 应通过');

        const loc = await auditUnlocalizedText(validPage);
        assert.equal(loc.passed, true, `合规夹具不应误报未汉化: ${JSON.stringify(loc)}`);

        // 测试真实触控点击普通按钮与 ::before 扩充热区按钮
        await tapElement(validPage, () => document.getElementById('btn-ok'), [], { label: '合规按钮' });
        await tapElement(validPage, () => document.getElementById('btn-pseudo'), [], { label: '扩充热区按钮' });
        const cntText = await validPage.evaluate(() => document.getElementById('cnt').textContent);
        assert.equal(cntText, '11', `触控点击计数应为 11，实际 ${cntText}`);

        // 测试弹窗拦截
        validPage.setDialogHandler(() => ({ accept: true }));
        await tapElement(validPage, () => document.getElementById('btn-confirm'), [], { label: '弹窗确认' });
        await sleep(100);
        assert.equal(validPage.getDialogs().length, 1, '未捕获到 window.confirm 弹窗');
        assert.equal(await validPage.evaluate(() => window.__confirmResult), true);

        // 测试 Blob 下载等待 completed 事件
        const dl = await validPage.waitForDownload(
          () => tapElement(validPage, () => document.getElementById('btn-dl'), [], { label: '导出测试文件' }),
          { timeoutMs: 6000 }
        );
        const dlJson = JSON.parse(dl.buffer.toString('utf8'));
        assert.equal(dlJson.ok, true);

        // 测试二次确认弹窗：取消按钮「暂不清空」排在「确认清空」之前时，triggerReset('confirm') 精确点中「确认清空」
        await triggerReset(validPage, 'confirm');
        assert.equal(
          await validPage.evaluate(() => window.__resetAction),
          'confirm',
          '暂不清空排在前面时 triggerReset(confirm) 应精确点击确认清空'
        );

        // 测试视口截图 (750x1624) 与整页长图 (750x2400)
        const vpShot = await validPage.captureViewport(path.join(selfTestTmpDir, 'vp.png'));
        assert.equal(vpShot.width, 750);
        assert.equal(vpShot.height, 1624);

        const fullShot = await validPage.captureFullPage(path.join(selfTestTmpDir, 'full.png'));
        assert.equal(fullShot.width, 750);
        assert.ok(fullShot.height >= 2400, `整页长图高应 >= 2400，实际 ${fullShot.height}`);

        assertCleanDiagnostics(validPage, { contextLabel: 'S5-valid' });
      } finally {
        await validPage.close();
      }

      // 5B. 反向缺陷夹具：必须精准捕获 5 类故障！
      const brokenPage = await browser.newPage({ width: 375, height: 812 });
      try {
        await brokenPage.navigate(`${memServer.baseUrl}/?fixture=broken`);
        await sleep(150);

        const ovBroken = await auditViewportOverflow(brokenPage, 375);
        assert.equal(ovBroken.hasHorizontalOverflow, true, '缺陷检测失败：未能捕获 480px 横向溢出');

        const touchBroken = await auditTouchTargets(brokenPage, { minSize: 44 });
        assert.equal(touchBroken.passed, false, '缺陷检测失败：未能捕获 24×24px 过小热区');
        assert.equal(
          touchBroken.undersized.some(
            (u) => (u.ariaLabel || u.label || '').includes('假伪元素热区') && u.width < 44 && u.height < 44
          ),
          true,
          `缺陷检测失败：带 pointer-events:none 的假伪元素热区未被拦截: ${JSON.stringify(touchBroken.undersized)}`
        );

        const fsBroken = await auditTextareaFontSize(brokenPage, { minFontSize: 16 });
        assert.equal(fsBroken.passed, false, '缺陷检测失败：未能捕获 12px textarea');

        const locBroken = await auditUnlocalizedText(brokenPage);
        assert.equal(locBroken.passed, false, '缺陷检测失败：未能捕获 Submit/Placeholder 未汉化词');

        let diagThrew = false;
        try {
          assertCleanDiagnostics(brokenPage, { contextLabel: 'S5-broken' });
        } catch {
          diagThrew = true;
        }
        assert.equal(diagThrew, true, '缺陷检测失败：未能捕获 console.error / 未捕获异常 / 404');
      } finally {
        await brokenPage.close();
      }

      return '合规夹具全绿(点击/下载/弹窗/750x1624截图) & 缺陷夹具 5 项异常 100% 精准拦截';
    });
  } finally {
    if (browser) await browser.close();
    if (memServer) await memServer.stop();
    removeDirWithRetry(selfTestTmpDir);
  }

  // ---------- S6: 临时资源彻底清理验证 ----------
  await record('S6', '临时 user-data-dir、自检下载与截图目录彻底清理核验', async () => {
    assert.equal(fs.existsSync(selfTestTmpDir), false, `自检临时目录未删除: ${selfTestTmpDir}`);
    if (browserTmpDir) {
      assert.equal(fs.existsSync(browserTmpDir), false, `浏览器临时 user-data-dir 未删除: ${browserTmpDir}`);
    }
    return '全部临时目录、浏览器进程树与 HTTP 服务均已零残留清理';
  });

  const failed = results.filter((r) => r.status === 'FAIL');
  return {
    passed: failed.length === 0,
    total: results.length,
    failedCount: failed.length,
    results,
  };
}

// 支持独立直接执行：node tests/self-test.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runSelfTest()
    .then((summary) => {
      for (const r of summary.results) {
        console.log(`[${r.status}] ${r.id} ${r.name} (${r.ms}ms) -> ${r.status === 'PASS' ? r.detail : r.error}`);
      }
      if (!summary.passed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
