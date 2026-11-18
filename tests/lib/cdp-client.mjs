/**
 * Windows Node.js 24 零依赖 Chrome/Edge 无头 CDP 驱动与静态服务基础设施
 * 采用 Browser-level WebSocket + Target.attachToTarget({ flatten: true }) 架构
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 睡眠辅助函数（仅用于短动画稳定或超时控制）
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 解析 PNG 文件宽高（读取 IHDR Chunk）
 * @param {Buffer} buf
 */
export function parsePngDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) {
    throw new Error(`PNG 数据长度不足: ${buf ? buf.length : 0}`);
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('非法的 PNG 魔数头');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/**
 * 自动探测本机 Chrome / Edge 可执行文件路径
 * @param {'chrome'|'edge'|undefined} preferred
 */
export function findBrowser(preferred) {
  if (process.env.CDP_BROWSER_PATH && fs.existsSync(process.env.CDP_BROWSER_PATH)) {
    return process.env.CDP_BROWSER_PATH;
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  const edgeCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];

  const candidates =
    preferred === 'edge'
      ? [...edgeCandidates, ...chromeCandidates]
      : [...chromeCandidates, ...edgeCandidates];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(`未在本机探测到 Chrome 或 Edge 浏览器。已检查路径:\n${candidates.join('\n')}`);
}

/**
 * 获取动态空闲 TCP 端口
 * @param {string} host
 */
export function getFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

/**
 * Windows 下强制终止进程树
 * @param {number|undefined} pid
 */
export function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // 忽略已退出进程错误
  }
}

/**
 * 递归删除临时目录（带重试应对 Windows 文件句柄延迟释放）
 * @param {string} dirPath
 */
export function removeDirWithRetry(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 120,
    });
  } catch {
    // 兜底再次尝试
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // 忽略最终清理错误避免覆盖主流程异常
    }
  }
}

/**
 * 使用原生 http.get 探活，避免 Node 24 undici fetch + AbortSignal.timeout 在端口未就绪时的偶发断言异常
 * @param {string} probeUrl
 * @param {number} timeoutMs
 */
function probeHttpOk(probeUrl, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(probeUrl, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * 启动 python -m http.server 动态端口静态服务并轮询探活
 * @param {{ rootDir: string, host?: string, entry?: string, timeoutMs?: number }} options
 */
export async function startStaticServer({
  rootDir,
  host = '127.0.0.1',
  entry = 'index.html',
  timeoutMs = 8000,
}) {
  const port = await getFreePort(host);
  const proc = spawn(
    'python',
    ['-m', 'http.server', String(port), '--bind', host, '--directory', rootDir],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stderrBuf = '';
  let exited = false;
  let exitCode = null;
  proc.stderr?.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf8');
  });
  proc.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const baseUrl = `http://${host}:${port}`;
  const probeUrl = `${baseUrl}/${entry.replace(/^\/+/, '')}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`静态服务器提前退出 (code=${exitCode}): ${stderrBuf}`);
    }
    const ok = await probeHttpOk(probeUrl, 1000);
    if (ok) {
      return {
        url: probeUrl,
        baseUrl,
        port,
        stop: async () => {
          if (exited) return;
          try {
            proc.kill('SIGTERM');
          } catch {
            // ignore
          }
          const waitExit = new Promise((resolve) => {
            if (exited) return resolve();
            const timer = setTimeout(() => {
              killProcessTree(proc.pid);
              resolve();
            }, 1000);
            proc.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
          });
          await waitExit;
        },
      };
    }
    await sleep(60);
  }

  killProcessTree(proc.pid);
  throw new Error(`静态服务器探活超时 (${timeoutMs}ms): ${probeUrl}\n${stderrBuf}`);
}

/**
 * 启动内存级 Node HTTP 夹具服务器（用于 self-test 离线测试）
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 */
export async function startMemoryHttpServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    port,
    baseUrl,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/**
 * 封装单个页面 Target 的 CDP 会话
 */
export class CdpSession {
  /**
   * @param {CdpBrowser} browser
   * @param {string} targetId
   * @param {string} sessionId
   */
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this._listeners = new Map();
    this._dialogHandler = null;
    this._closed = false;
    this._viewport = { width: 375, height: 812, deviceScaleFactor: 2, mobile: true };

    this.diagnostics = {
      exceptions: [],
      consoleErrors: [],
      consoleWarnings: [],
      logErrors: [],
      networkFailures: [],
      httpErrors: [],
      dialogs: [],
    };
  }

  /**
   * 向当前 Target Session 发送 CDP 命令
   * @param {string} method
   * @param {object} params
   * @param {number} timeoutMs
   */
  send(method, params = {}, timeoutMs = 15000) {
    return this.browser.send(method, params, this.sessionId, timeoutMs);
  }

  /**
   * 订阅 Session 级 CDP 事件
   * @param {string} eventName
   * @param {(params: any) => void} handler
   */
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    this._listeners.get(eventName)?.delete(handler);
  }

  /**
   * 内部派发事件并记录诊断信息
   * @param {string} method
   * @param {any} params
   */
  _handleEvent(method, params) {
    if (method === 'Runtime.exceptionThrown') {
      const details = params?.exceptionDetails || {};
      const text =
        details.exception?.description ||
        details.text ||
        '未知未捕获 JS 异常';
      this.diagnostics.exceptions.push({
        text,
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        url: details.url,
      });
    } else if (method === 'Runtime.consoleAPICalled') {
      const msg = (params?.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      if (params?.type === 'error') {
        this.diagnostics.consoleErrors.push({ message: msg, timestamp: params.timestamp });
      } else if (params?.type === 'warning') {
        this.diagnostics.consoleWarnings.push({ message: msg, timestamp: params.timestamp });
      }
    } else if (method === 'Log.entryAdded') {
      if (params?.entry?.level === 'error') {
        this.diagnostics.logErrors.push({
          text: params.entry.text,
          source: params.entry.source,
          url: params.entry.url,
        });
      }
    } else if (method === 'Network.loadingFailed') {
      if (!params?.canceled) {
        this.diagnostics.networkFailures.push({
          requestId: params.requestId,
          errorText: params.errorText,
          type: params.type,
        });
      }
    } else if (method === 'Network.responseReceived') {
      const status = params?.response?.status;
      if (typeof status === 'number' && status >= 400) {
        this.diagnostics.httpErrors.push({
          url: params.response.url,
          status,
          statusText: params.response.statusText,
        });
      }
    } else if (method === 'Page.javascriptDialogOpening') {
      const dialogInfo = {
        type: params.type,
        message: params.message,
        defaultPrompt: params.defaultPrompt,
        timestamp: Date.now(),
      };
      this.diagnostics.dialogs.push(dialogInfo);
      let decision = { accept: true, promptText: undefined };
      if (typeof this._dialogHandler === 'function') {
        try {
          const res = this._dialogHandler(dialogInfo);
          if (typeof res === 'boolean') {
            decision = { accept: res };
          } else if (res && typeof res === 'object') {
            decision = res;
          }
        } catch {
          decision = { accept: true };
        }
      }
      this.send('Page.handleJavaScriptDialog', decision).catch(() => {});
    }

    const set = this._listeners.get(method);
    if (set) {
      for (const fn of set) {
        try {
          fn(params);
        } catch {
          // 忽略事件监听内部异常
        }
      }
    }
  }

  /**
   * 启用必要域
   */
  async init() {
    await Promise.all([
      this.send('Page.enable'),
      this.send('Runtime.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
      this.send('DOM.enable'),
    ]);
  }

  /**
   * 设置视口与移动端仿真指标
   * @param {{ width: number, height: number, deviceScaleFactor?: number, mobile?: boolean }} vp
   */
  async setViewport({ width, height, deviceScaleFactor = 2, mobile = true }) {
    this._viewport = { width, height, deviceScaleFactor, mobile };
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile,
      maxTouchPoints: 5,
    });
  }

  /**
   * 模拟 prefers-reduced-motion 媒体特性
   * @param {boolean} enabled
   */
  async setReducedMotion(enabled) {
    await this.send('Emulation.setEmulatedMedia', {
      features: enabled
        ? [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        : [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  }

  /**
   * 导航到指定 URL 并等待加载就绪
   * @param {string} url
   * @param {{ timeoutMs?: number }} options
   */
  async navigate(url, { timeoutMs = 15000 } = {}) {
    let loaded = false;
    const loadPromise = new Promise((resolve) => {
      const off = this.on('Page.loadEventFired', () => {
        loaded = true;
        off();
        resolve();
      });
      setTimeout(() => {
        off();
        resolve();
      }, timeoutMs);
    });

    const navResult = await this.send('Page.navigate', { url });
    if (navResult?.errorText) {
      throw new Error(`导航失败 (${url}): ${navResult.errorText}`);
    }
    await loadPromise;

    await this.waitFor(
      () => document.readyState === 'complete',
      { timeoutMs, intervalMs: 40 }
    );
    await this.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return loaded || true;
    }).catch(() => {});
  }

  /**
   * 刷新当前页面并等待加载就绪
   * @param {{ ignoreCache?: boolean, timeoutMs?: number }} options
   */
  async reload({ ignoreCache = true, timeoutMs = 15000 } = {}) {
    const loadPromise = new Promise((resolve) => {
      const off = this.on('Page.loadEventFired', () => {
        off();
        resolve();
      });
      setTimeout(() => {
        off();
        resolve();
      }, timeoutMs);
    });

    await this.send('Page.reload', { ignoreCache });
    await loadPromise;
    await this.waitFor(() => document.readyState === 'complete', {
      timeoutMs,
      intervalMs: 40,
    });
    await this.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }).catch(() => {});
  }

  /**
   * 在页面上下文执行函数或表达式并自动解包返回
   * @param {Function|string} fnOrExpr
   * @param {...any} args
   */
  async evaluate(fnOrExpr, ...args) {
    const expression =
      typeof fnOrExpr === 'function'
        ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
        : String(fnOrExpr);

    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (res?.exceptionDetails) {
      const ex = res.exceptionDetails;
      const msg =
        ex.exception?.description ||
        ex.text ||
        '页面脚本求值异常';
      const err = new Error(`CDP evaluate 失败: ${msg}`);
      err.exceptionDetails = ex;
      throw err;
    }
    return res?.result?.value;
  }

  /**
   * 轮询等待页面条件为真
   * @param {Function|string} fnOrExpr
   * @param {{ timeoutMs?: number, intervalMs?: number, args?: any[], message?: string }} options
   */
  async waitFor(
    fnOrExpr,
    { timeoutMs = 5000, intervalMs = 50, args = [], message = '等待页面条件超时' } = {}
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const val = await this.evaluate(fnOrExpr, ...args);
        if (val) return val;
      } catch (err) {
        lastError = err;
      }
      await sleep(intervalMs);
    }
    throw new Error(
      `${message} (${timeoutMs}ms)${lastError ? `；最后一次错误: ${lastError.message}` : ''}`
    );
  }

  /**
   * 模拟真实移动端手指轻点（并可回退/兼容鼠标点击事件链路）
   * @param {number} x
   * @param {number} y
   */
  async tapAt(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    // 发送完整鼠标指针事件在 mobile: true + touchEmulationEnabled 下也会触发完整 pointer/click 流，
    // 为真实模拟手指触控，优先 dispatchTouchEvent；Chromium 会自动合成 tap/click 事件。
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: px, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await sleep(25);
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }

  /**
   * 模拟精确鼠标坐标点击（用于特定场景）
   * @param {number} x
   * @param {number} y
   */
  async clickAt(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: px,
      y: py,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: px,
      y: py,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: px,
      y: py,
      button: 'left',
      clickCount: 1,
    });
  }

  /**
   * 通过 CDP Input.insertText 输入文本
   * @param {string} text
   */
  async insertText(text) {
    await this.send('Input.insertText', { text });
  }

  /**
   * 发送键盘按键（如 Escape / Enter）
   * @param {string} key
   */
  async pressKey(key) {
    const codeMap = {
      Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
      Enter: { code: 'Enter', windowsVirtualKeyCode: 13 },
      Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
    };
    const meta = codeMap[key] || { code: key, windowsVirtualKeyCode: 0 };
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: meta.code,
      windowsVirtualKeyCode: meta.windowsVirtualKeyCode,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: meta.code,
      windowsVirtualKeyCode: meta.windowsVirtualKeyCode,
    });
  }

  /**
   * 通过 CDP DOM.setFileInputFiles 向隐藏或可见的 <input type="file"> 注入文件
   * @param {string} selector
   * @param {string[]} filePaths
   */
  async setFileInputFiles(selector, filePaths) {
    const doc = await this.send('DOM.getDocument', { depth: -1 });
    const queried = await this.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!queried?.nodeId) {
      throw new Error(`未找到匹配 "${selector}" 的文件上传控件`);
    }
    await this.send('DOM.setFileInputFiles', {
      nodeId: queried.nodeId,
      files: filePaths.map((p) => path.resolve(p)),
    });
  }

  /**
   * 注册页面加载前初始化脚本
   * @param {string} source
   */
  async addInitScript(source) {
    const res = await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    return res.identifier;
  }

  async removeInitScript(identifier) {
    if (!identifier) return;
    await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
  }

  /**
   * 设置 JS 弹窗处理策略
   * @param {(dialog: { type: string, message: string }) => boolean | { accept: boolean, promptText?: string }} handler
   */
  setDialogHandler(handler) {
    this._dialogHandler = handler;
  }

  getDialogs() {
    return [...this.diagnostics.dialogs];
  }

  getDiagnostics() {
    return {
      exceptions: [...this.diagnostics.exceptions],
      consoleErrors: [...this.diagnostics.consoleErrors],
      consoleWarnings: [...this.diagnostics.consoleWarnings],
      logErrors: [...this.diagnostics.logErrors],
      networkFailures: [...this.diagnostics.networkFailures],
      httpErrors: [...this.diagnostics.httpErrors],
      dialogs: [...this.diagnostics.dialogs],
    };
  }

  clearDiagnostics() {
    this.diagnostics.exceptions.length = 0;
    this.diagnostics.consoleErrors.length = 0;
    this.diagnostics.consoleWarnings.length = 0;
    this.diagnostics.logErrors.length = 0;
    this.diagnostics.networkFailures.length = 0;
    this.diagnostics.httpErrors.length = 0;
    this.diagnostics.dialogs.length = 0;
  }

  /**
   * 清空所属浏览器的待消费下载队列与记录
   * @param {{ deleteFiles?: boolean }} options
   */
  clearDownloads(options = {}) {
    this.browser.clearDownloads(options);
  }

  /**
   * 触发下载并等待 Browser.downloadProgress 达到 completed
   * @param {(() => Promise<void>) | null} triggerFn
   * @param {{ timeoutMs?: number, match?: RegExp | string | ((info: any) => boolean), filenamePattern?: RegExp | string | ((info: any) => boolean), predicate?: (info: any) => boolean }} options
   */
  async waitForDownload(triggerFn, options = {}) {
    let fn = triggerFn;
    let opts = options || {};
    if (fn && typeof fn === 'object' && typeof fn !== 'function') {
      opts = fn;
      fn = null;
    }
    const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 8000;
    let cancelWaiter = null;
    const downloadPromise = this.browser.waitForNextDownload(
      timeoutMs,
      (cancel) => {
        cancelWaiter = cancel;
      },
      opts
    );
    // 防止 triggerFn 抛错时产生未捕获 Promise Rejection
    downloadPromise.catch(() => {});
    if (typeof fn === 'function') {
      try {
        await fn();
      } catch (err) {
        if (typeof cancelWaiter === 'function') {
          cancelWaiter();
        }
        throw err;
      }
    }
    return await downloadPromise;
  }

  /**
   * 等待页面字体、图片与两帧绘制稳定
   */
  async waitForVisualStability() {
    await this.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
                setTimeout(resolve, 1500);
              })
        )
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }).catch(() => {});
  }

  /**
   * 截取当前视口 PNG（@2x 物理分辨率，适合抽屉/弹窗/首屏）
   * @param {string} outPath
   */
  async captureViewport(outPath) {
    await this.waitForVisualStability();
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(res.data, 'base64');
    const dims = parsePngDimensions(buf);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return { outPath, ...dims, byteLength: buf.length };
  }

  /**
   * 截取整页长图 PNG（保持 clip.scale: 1 以配合 DPR=2 自动输出 2x）
   * @param {string} outPath
   */
  async captureFullPage(outPath) {
    await this.waitForVisualStability();
    const metrics = await this.send('Page.getLayoutMetrics');
    const content = metrics?.cssContentSize || {
      width: this._viewport.width,
      height: this._viewport.height,
    };
    const width = Math.max(1, Math.ceil(content.width));
    const height = Math.max(1, Math.ceil(content.height));
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const buf = Buffer.from(res.data, 'base64');
    const dims = parsePngDimensions(buf);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return { outPath, ...dims, byteLength: buf.length };
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    this.browser._sessions.delete(this.sessionId);
    if (this.browser._sessions.size === 0) {
      this.browser.clearDownloads();
    }
  }
}

function buildDownloadInfo(rec) {
  const filePath = rec?.filePath || null;
  const baseName = filePath ? path.basename(filePath) : '';
  const suggested = rec?.suggestedFilename || '';
  return {
    guid: rec?.guid || '',
    suggestedFilename: suggested,
    filePath,
    filename: baseName || suggested,
    url: rec?.url || '',
    state: rec?.state || '',
    totalBytes: rec?.totalBytes ?? 0,
    receivedBytes: rec?.receivedBytes ?? 0,
  };
}

function compileDownloadMatcher(options = {}) {
  const raw = options?.match ?? options?.filenamePattern ?? options?.predicate ?? null;
  if (raw === null || raw === undefined) {
    return { matches: () => true, description: '' };
  }
  if (typeof raw === 'function') {
    return {
      matches: (rec) => Boolean(raw(buildDownloadInfo(rec))),
      description: raw.name ? `predicate:${raw.name}` : 'predicate(fn)',
    };
  }
  if (raw instanceof RegExp) {
    const safeRe = raw.global || raw.sticky
      ? new RegExp(raw.source, raw.flags.replace(/[gy]/g, ''))
      : raw;
    return {
      matches: (rec) => {
        const info = buildDownloadInfo(rec);
        const candidates = [info.suggestedFilename, info.filename].filter(Boolean);
        return candidates.some((name) => safeRe.test(name));
      },
      description: String(raw),
    };
  }
  if (typeof raw === 'string') {
    const needle = raw;
    const isExt = needle.startsWith('.');
    return {
      matches: (rec) => {
        const info = buildDownloadInfo(rec);
        const candidates = [info.suggestedFilename, info.filename].filter(Boolean);
        if (isExt) {
          const lower = needle.toLowerCase();
          return candidates.some((name) => name.toLowerCase().endsWith(lower));
        }
        return candidates.some((name) => name.includes(needle));
      },
      description: JSON.stringify(needle),
    };
  }
  throw new Error(`不支持的下载匹配条件类型: ${typeof raw}`);
}

/**
 * Browser 级 CDP 连接与进程生命周期管理器
 */
export class CdpBrowser {
  constructor({ proc, ws, tmpDir, downloadDir }) {
    this.proc = proc;
    this.ws = ws;
    this.tmpDir = tmpDir;
    this.downloadDir = downloadDir;
    this._nextId = 1;
    this._pending = new Map();
    this._sessions = new Map();
    this._downloadRecords = new Map();
    this._downloadWaiters = [];
    this._completedDownloads = [];
    this._closed = false;

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }

      if (msg.id) {
        const entry = this._pending.get(msg.id);
        if (entry) {
          this._pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) {
            entry.reject(new Error(`CDP 错误 (${entry.method}): ${msg.error.message} [${msg.error.code}]`));
          } else {
            entry.resolve(msg.result);
          }
        }
        return;
      }

      // 事件分发
      if (msg.sessionId) {
        const session = this._sessions.get(msg.sessionId);
        if (session) {
          session._handleEvent(msg.method, msg.params);
        }
      } else {
        this._handleBrowserEvent(msg.method, msg.params);
      }
    });

    ws.addEventListener('close', () => {
      for (const [, entry] of this._pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`CDP WebSocket 已关闭 (${entry.method})`));
      }
      this._pending.clear();
      for (const waiter of this._downloadWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('CDP WebSocket 已关闭，等待下载中断'));
      }
    });
  }

  /**
   * 清空下载队列与已缓冲未消费的完成记录，防止跨测试或跨流程残留污染
   * @param {{ deleteFiles?: boolean }} options
   */
  clearDownloads({ deleteFiles = false } = {}) {
    for (const waiter of this._downloadWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('下载队列已被清空'));
    }
    this._completedDownloads.length = 0;
    this._downloadRecords.clear();
    if (deleteFiles && this.downloadDir && fs.existsSync(this.downloadDir)) {
      try {
        for (const name of fs.readdirSync(this.downloadDir)) {
          fs.rmSync(path.join(this.downloadDir, name), { force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  _handleBrowserEvent(method, params) {
    if (method === 'Browser.downloadWillBegin') {
      this._downloadRecords.set(params.guid, {
        guid: params.guid,
        suggestedFilename: params.suggestedFilename || '',
        url: params.url || '',
        state: 'inProgress',
        filePath: null,
        totalBytes: 0,
        receivedBytes: 0,
        createdAt: Date.now(),
      });
    } else if (method === 'Browser.downloadProgress') {
      const rec = this._downloadRecords.get(params.guid) || {
        guid: params.guid,
        suggestedFilename: '',
        url: '',
        filePath: null,
        createdAt: Date.now(),
      };
      rec.state = params.state;
      rec.totalBytes = params.totalBytes;
      rec.receivedBytes = params.receivedBytes;
      if (params.filePath) {
        rec.filePath = params.filePath;
      }
      this._downloadRecords.set(params.guid, rec);

      if (params.state === 'completed' || params.state === 'canceled') {
        const waiterIdx = this._downloadWaiters.findIndex((w) => w.matches(rec));
        if (waiterIdx >= 0) {
          const [waiter] = this._downloadWaiters.splice(waiterIdx, 1);
          clearTimeout(waiter.timer);
          if (params.state === 'completed') {
            waiter.resolve(rec);
          } else {
            waiter.reject(new Error(`下载被取消: ${rec.suggestedFilename || rec.guid}`));
          }
        } else if (params.state === 'completed') {
          // 尚未有匹配的 waiter 或完成事件先于 waitForDownload 到达：保留在缓冲队列中供后续匹配消费
          this._completedDownloads.push(rec);
        }
      }
    }
  }

  /**
   * 等待下一个满足过滤条件的下载完成事件并读取文件
   * 兼容 waitForNextDownload(timeoutMs, onRegister, options) 与 waitForNextDownload(options)
   * @param {number | { timeoutMs?: number, match?: RegExp | string | ((info: any) => boolean), filenamePattern?: RegExp | string | ((info: any) => boolean), predicate?: (info: any) => boolean, onRegister?: (cancelFn: () => void) => void }} timeoutOrOptions
   * @param {((cancelFn: () => void) => void) | null} onRegister
   * @param {{ match?: RegExp | string | ((info: any) => boolean), filenamePattern?: RegExp | string | ((info: any) => boolean), predicate?: (info: any) => boolean }} extraOptions
   */
  async waitForNextDownload(timeoutOrOptions = 8000, onRegister = null, extraOptions = {}) {
    let timeoutMs = 8000;
    let registerCb = onRegister;
    let opts = extraOptions || {};
    if (timeoutOrOptions && typeof timeoutOrOptions === 'object') {
      opts = timeoutOrOptions;
      timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 8000;
      registerCb = typeof opts.onRegister === 'function' ? opts.onRegister : null;
    } else if (typeof timeoutOrOptions === 'number') {
      timeoutMs = timeoutOrOptions;
    }

    const { matches, description: matcherDesc } = compileDownloadMatcher(opts);

    // 1. 优先检查先于 waitForNextDownload 到达并已完成的缓冲记录
    let rec = null;
    const bufferedIdx = this._completedDownloads.findIndex((item) => matches(item));
    if (bufferedIdx >= 0) {
      [rec] = this._completedDownloads.splice(bufferedIdx, 1);
      if (typeof registerCb === 'function') {
        registerCb(() => {});
      }
    } else {
      // 2. 挂起按条件匹配的等待者
      rec = await new Promise((resolve, reject) => {
        let settled = false;
        const entry = {
          matches,
          description: matcherDesc,
          resolve: (val) => {
            if (settled) return;
            settled = true;
            clearTimeout(entry.timer);
            resolve(val);
          },
          reject: (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(entry.timer);
            reject(err);
          },
          timer: null,
        };
        entry.timer = setTimeout(() => {
          const idx = this._downloadWaiters.indexOf(entry);
          if (idx >= 0) this._downloadWaiters.splice(idx, 1);
          const bufferedNames = this._completedDownloads.map(
            (d) => d.suggestedFilename || (d.filePath ? path.basename(d.filePath) : d.guid)
          );
          const filterHint = matcherDesc ? `（匹配条件: ${matcherDesc}）` : '';
          const bufferedHint =
            bufferedNames.length > 0 ? `；缓冲队列中未匹配文件: [${bufferedNames.join(', ')}]` : '';
          entry.reject(new Error(`等待浏览器下载完成超时 (${timeoutMs}ms)${filterHint}${bufferedHint}`));
        }, timeoutMs);
        this._downloadWaiters.push(entry);
        if (typeof registerCb === 'function') {
          registerCb(() => {
            const idx = this._downloadWaiters.indexOf(entry);
            if (idx >= 0) this._downloadWaiters.splice(idx, 1);
            entry.reject(new Error('下载触发器执行失败，已清理下载监听器'));
          });
        }
      });
    }

    let resolvedPath = rec.filePath;
    if (!resolvedPath && rec.suggestedFilename) {
      resolvedPath = path.join(this.downloadDir, rec.suggestedFilename);
    }
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      // 兜底查找下载目录中符合匹配条件的最新已落盘文件（排除未完成临时文件）
      const files = fs.existsSync(this.downloadDir)
        ? fs
            .readdirSync(this.downloadDir)
            .filter((name) => !/\.(?:crdownload|tmp|part)$/i.test(name))
            .map((name) => path.join(this.downloadDir, name))
            .filter((p) => {
              try {
                if (!fs.statSync(p).isFile()) return false;
              } catch {
                return false;
              }
              return matches({
                suggestedFilename: path.basename(p),
                filePath: p,
                url: rec.url || '',
                state: 'completed',
              });
            })
        : [];
      if (files.length === 0) {
        const filterHint = matcherDesc ? `，匹配条件: ${matcherDesc}` : '';
        throw new Error(
          `下载已完成但未在目录找到匹配落盘文件: ${this.downloadDir} (suggested=${rec.suggestedFilename || 'unknown'}${filterHint})`
        );
      }
      files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      resolvedPath = files[0];
    }

    const buffer = fs.readFileSync(resolvedPath);
    return {
      ...rec,
      filePath: resolvedPath,
      buffer,
    };
  }

  /**
   * 发送 Browser 或 Session 级 CDP 命令
   */
  send(method, params = {}, sessionId = null, timeoutMs = 15000) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`WebSocket 未连接，无法发送 ${method}`));
    }
    const id = this._nextId++;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP 请求超时 (${timeoutMs}ms): ${method}`));
      }, timeoutMs);
      this._pending.set(id, { method, resolve, reject, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }

  /**
   * 设置或更新下载目录策略
   * @param {string} downloadPath
   */
  async setDownloadBehavior(downloadPath) {
    fs.mkdirSync(downloadPath, { recursive: true });
    this.downloadDir = downloadPath;
    await this.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
      eventsEnabled: true,
    });
  }

  /**
   * 授予剪贴板等浏览器权限
   * @param {{ origin?: string, permissions: string[] }} options
   */
  async grantPermissions({ origin, permissions }) {
    const params = { permissions };
    if (origin) params.origin = origin;
    await this.send('Browser.grantPermissions', params);
  }

  /**
   * 创建新页面并挂载扁平化 Session
   */
  async newPage({
    width = 375,
    height = 812,
    deviceScaleFactor = 2,
    mobile = true,
    reducedMotion = false,
    hasTouch = true,
  } = {}) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const session = new CdpSession(this, targetId, sessionId);
    this._sessions.set(sessionId, session);
    await session.init();
    await session.setViewport({ width, height, deviceScaleFactor, mobile });
    await session.send('Emulation.setTouchEmulationEnabled', {
      enabled: hasTouch,
      maxTouchPoints: 5,
    });
    if (reducedMotion) {
      await session.setReducedMotion(true);
    }
    return session;
  }

  /**
   * 彻底关闭浏览器进程树与临时用户目录
   */
  async close() {
    if (this._closed) return;
    this._closed = true;

    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        await Promise.race([
          this.send('Browser.close', {}, null, 2000),
          sleep(2000),
        ]).catch(() => {});
      }
    } finally {
      try {
        this.ws.close();
      } catch {
        // ignore
      }

      if (this.proc && this.proc.exitCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            killProcessTree(this.proc.pid);
            resolve();
          }, 2000);
          this.proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      removeDirWithRetry(this.tmpDir);
    }
  }
}

/**
 * 启动无头 Chrome/Edge 并建立 Browser-level CDP 连接
 * @param {{ preferredBrowser?: 'chrome'|'edge', browserPath?: string, downloadDir?: string }} options
 */
export async function launchBrowser({
  preferredBrowser,
  browserPath,
  downloadDir,
} = {}) {
  const exePath = browserPath || findBrowser(preferredBrowser);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perfume-cdp-'));
  const dlDir = downloadDir || path.join(tmpDir, 'downloads');
  fs.mkdirSync(dlDir, { recursive: true });

  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${tmpDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ];

  const proc = spawn(exePath, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  const browserWsUrl = await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`等待无头浏览器 DevTools WebSocket 超时 (15s)。stderr:\n${stderrBuf}`));
      }
    }, 15000);

    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      stderrBuf += text;
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\r\n]+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[1].trim());
      }
    };

    proc.stderr?.on('data', onData);
    proc.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`无头浏览器启动后提前退出 (code=${code})。stderr:\n${stderrBuf}`));
      }
    });
  }).catch((err) => {
    killProcessTree(proc.pid);
    removeDirWithRetry(tmpDir);
    throw err;
  });

  const ws = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('连接 Browser WebSocket 超时')), 8000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Browser WebSocket 错误: ${e.message || '连接失败'}`));
    }, { once: true });
  }).catch((err) => {
    killProcessTree(proc.pid);
    removeDirWithRetry(tmpDir);
    throw err;
  });

  const browser = new CdpBrowser({ proc, ws, tmpDir, downloadDir: dlDir });
  await browser.setDownloadBehavior(dlDir);
  return browser;
}

/**
 * 将本地路径转为标准 file:// URL
 * @param {string} filePath
 */
export function toFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}
