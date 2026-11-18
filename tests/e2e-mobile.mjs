#!/usr/bin/env node
/**
 * 手机端香水小样交互式试香打分卡 — Opaque-box 4-Tier CDP 自动化测试套件主入口
 * 零外部依赖，运行于 Node.js v24.19.0+ ESM
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  launchBrowser,
  startStaticServer,
  toFileUrl,
} from './lib/cdp-client.mjs';
import { parseCliArgs } from './lib/cli-args.mjs';
import { EXPECTED_STORAGE_KEY } from './lib/expected-catalog.mjs';
import { runSelfTest } from './self-test.mjs';
import { TIER1_CASES } from './tiers/tier1-features.mjs';
import { TIER2_CASES } from './tiers/tier2-boundaries.mjs';
import { TIER3_CASES } from './tiers/tier3-pairwise.mjs';
import { TIER4_CASES } from './tiers/tier4-journeys.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

export function getRegisteredCases(tierFilter = 'all') {
  const groups = {
    '1': TIER1_CASES,
    '2': TIER2_CASES,
    '3': TIER3_CASES,
    '4': TIER4_CASES,
  };
  if (tierFilter === 'all') {
    return [...TIER1_CASES, ...TIER2_CASES, ...TIER3_CASES, ...TIER4_CASES];
  }
  return groups[tierFilter] || [];
}

function printHelp() {
  console.log(`用法: node tests/e2e-mobile.mjs [选项]

选项:
  --tier=1|2|3|4|all           选择执行的测试层级（默认: all）
  --viewport=375x812|390x844|both  强制覆盖视口或按用例默认（默认: both）
  --mode=http|file|both        测试协议入口（默认: http）
  --browser=chrome|edge        首选无头浏览器（默认自动探测 Chrome -> Edge）
  --no-screenshots             跳过 Tier 4 截图保存
  --self-test                  执行离线正/反向夹具脚手架自检 (S1–S6)
  --list                       列出全部已注册的 129 条用例及分层统计
  --json                       以结构化 JSON 输出最终结果
  -h, --help                   显示帮助信息
`);
}

function printCaseList(cases, asJson) {
  const byTier = {
    tier1: cases.filter((c) => c.tier === 1).length,
    tier2: cases.filter((c) => c.tier === 2).length,
    tier3: cases.filter((c) => c.tier === 3).length,
    tier4: cases.filter((c) => c.tier === 4).length,
    total: cases.length,
  };

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          summary: byTier,
          cases: cases.map((c) => ({
            id: c.id,
            tier: c.tier,
            feature: c.feature,
            title: c.title,
            viewport: c.viewport,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log('=== E2E 移动端测试套件用例注册清单 ===');
  console.log(
    `分布统计: Tier 1=${byTier.tier1} | Tier 2=${byTier.tier2} | Tier 3=${byTier.tier3} | Tier 4=${byTier.tier4} | 合计=${byTier.total}`
  );
  console.log('');
  for (const c of cases) {
    const vp = c.viewport ? `${c.viewport.width}x${c.viewport.height}` : '375x812';
    console.log(`  [${c.id}] (Tier ${c.tier} / ${c.feature} / ${vp}) ${c.title}`);
  }
}

/**
 * 每条用例执行前的统一隔离重置钩子
 */
async function resetPageState(session, targetUrl, viewport) {
  await session.setReducedMotion(false);
  await session.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  session.clearDiagnostics();

  // 先确保进入目标 origin 并清空 localStorage
  await session.navigate(targetUrl);
  await session.evaluate((storageKey) => {
    try {
      localStorage.removeItem(storageKey);
      localStorage.clear();
    } catch {
      // 忽略受限存储异常
    }
  }, EXPECTED_STORAGE_KEY);

  await session.reload({ ignoreCache: true });
  session.clearDiagnostics();
  await session.waitFor(
    () => {
      const cards = Array.from(document.querySelectorAll('[data-perfume-id]')).filter((el) => {
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
      return cards.length === 10;
    },
    {
      timeoutMs: 6000,
      message: `页面 ${targetUrl} 未渲染出 10 张香水卡片`,
    }
  );
}

function resolveViewportForCase(testCase, viewportOpt) {
  if (viewportOpt === '375x812' || viewportOpt === '375') {
    return { width: 375, height: 812 };
  }
  if (viewportOpt === '390x844' || viewportOpt === '390') {
    return { width: 390, height: 844 };
  }
  return testCase.viewport || { width: 375, height: 812 };
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs();
  } catch (err) {
    if (process.argv.slice(2).includes('--json')) {
      console.log(JSON.stringify({ passed: false, error: err.message }, null, 2));
    } else {
      console.error(`[参数错误] ${err.message}`);
    }
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.list) {
    const cases = getRegisteredCases(opts.tier);
    printCaseList(cases, opts.json);
    process.exit(0);
  }

  if (opts.selfTest) {
    const summary = await runSelfTest({ preferredBrowser: opts.browser });
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('=== E2E 测试基础设施离线自检 (S1–S6) ===');
      for (const r of summary.results) {
        const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
        console.log(`  [${icon}] ${r.id} ${r.name} (${r.ms}ms) -> ${r.status === 'PASS' ? r.detail : r.error}`);
      }
      console.log(`汇总: ${summary.total - summary.failedCount}/${summary.total} 通过`);
    }
    process.exit(summary.passed ? 0 : 1);
  }

  // 检查应用入口是否存在
  const indexPath = path.join(PROJECT_ROOT, 'index.html');
  const distPath = path.join(PROJECT_ROOT, 'dist', 'perfume-scorecard.html');
  if (!fs.existsSync(indexPath)) {
    console.error(`[错误] 未找到应用入口文件: ${indexPath}`);
    console.error('提示: 若应用尚在开发，可运行 `node tests/e2e-mobile.mjs --self-test` 验证测试基础设施。');
    process.exit(1);
  }

  const cases = getRegisteredCases(opts.tier);
  const modes = opts.mode === 'both' ? ['http', 'file'] : [opts.mode];

  if (opts.screenshots) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  let server = null;
  let browser = null;

  const cleanup = async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    if (server) {
      await server.stop().catch(() => {});
      server = null;
    }
  };

  const onSignal = async () => {
    await cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const reportRows = [];
  let passedCount = 0;
  let failedCount = 0;

  try {
    if (modes.includes('http')) {
      server = await startStaticServer({
        rootDir: PROJECT_ROOT,
        host: '127.0.0.1',
        entry: 'index.html',
      });
    }

    browser = await launchBrowser({
      preferredBrowser: opts.browser,
    });

    if (server) {
      await browser.grantPermissions({
        origin: server.baseUrl,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      }).catch(() => {});
    }

    for (const runMode of modes) {
      const targetUrl = runMode === 'http' ? `${server.baseUrl}/index.html` : toFileUrl(indexPath);

      for (const tc of cases) {
        const vp = resolveViewportForCase(tc, opts.viewport);
        const t0 = Date.now();
        const session = await browser.newPage({
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: true,
        });
        // 默认自动接受未预期的 JS 弹窗避免阻塞
        session.setDialogHandler(() => ({ accept: true }));

        try {
          await resetPageState(session, targetUrl, vp);
          await tc.run({
            session,
            browser,
            baseUrl: server ? server.baseUrl : null,
            indexPath,
            distPath,
            screenshotsDir: SCREENSHOTS_DIR,
            captureScreenshots: opts.screenshots && runMode === modes[0],
          });

          const ms = Date.now() - t0;
          passedCount++;
          reportRows.push({
            id: tc.id,
            tier: tc.tier,
            feature: tc.feature,
            mode: runMode,
            viewport: `${vp.width}x${vp.height}`,
            status: 'PASS',
            ms,
          });
          if (!opts.json) {
            console.log(`[PASS] ${tc.id} (${runMode} ${vp.width}x${vp.height}, ${ms}ms) ${tc.title}`);
          }
        } catch (err) {
          const ms = Date.now() - t0;
          failedCount++;
          const diag = session.getDiagnostics();
          reportRows.push({
            id: tc.id,
            tier: tc.tier,
            feature: tc.feature,
            mode: runMode,
            viewport: `${vp.width}x${vp.height}`,
            status: 'FAIL',
            ms,
            error: err.message,
            diagnostics: diag,
          });
          if (!opts.json) {
            console.error(`[FAIL] ${tc.id} (${runMode} ${vp.width}x${vp.height}, ${ms}ms) ${tc.title}`);
            console.error(`       原因: ${err.message}`);
          }
        } finally {
          await session.close().catch(() => {});
        }
      }
    }
  } finally {
    await cleanup();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }

  const summary = {
    passed: failedCount === 0,
    total: reportRows.length,
    passedCount,
    failedCount,
    tier: opts.tier,
    modes,
    results: reportRows,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('');
    console.log('=== E2E 执行汇总 ===');
    console.log(`总计执行: ${summary.total} | 通过: ${passedCount} | 失败: ${failedCount}`);
  }

  process.exit(failedCount === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[致命异常] ${err.stack || err.message}`);
    process.exit(1);
  });
}
