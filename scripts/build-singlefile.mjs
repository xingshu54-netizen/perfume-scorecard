#!/usr/bin/env node
/**
 * 零依赖单文件打包器：
 * 将 index.html、styles/main.css、scripts/bottle-images.js、scripts/data.js、scripts/app.js
 * 内联打包为单 HTML 文件 dist/perfume-scorecard.html，支持手机微信/浏览器直接通过 file:// 离线打开。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const mainCss = fs.readFileSync(path.join(ROOT, "styles", "main.css"), "utf8");
const bottleImagesJs = fs.readFileSync(path.join(ROOT, "scripts", "bottle-images.js"), "utf8");
const dataJs = fs.readFileSync(path.join(ROOT, "scripts", "data.js"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "scripts", "app.js"), "utf8");

function safeInlineScript(jsCode) {
  return jsCode.replace(/<\/script>/gi, "<\\/script>");
}

let output = indexHtml;

output = output.replace(
  /<link\s+rel="stylesheet"\s+href="styles\/main\.css"\s*\/?>/i,
  () => `<style>\n${mainCss}\n  </style>`
);

output = output.replace(
  /<script\s+defer\s+src="scripts\/bottle-images\.js"><\/script>/i,
  ""
);
output = output.replace(
  /<script\s+defer\s+src="scripts\/data\.js"><\/script>/i,
  ""
);
output = output.replace(
  /<script\s+defer\s+src="scripts\/app\.js"><\/script>/i,
  ""
);

const bundledScripts =
  `  <script>\n${safeInlineScript(bottleImagesJs)}\n  </script>\n` +
  `  <script>\n${safeInlineScript(dataJs)}\n  </script>\n` +
  `  <script>\n${safeInlineScript(appJs)}\n  </script>\n`;

output = output.replace(/<\/body>/i, () => `${bundledScripts}</body>`);

const distDir = path.join(ROOT, "dist");
fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, "perfume-scorecard.html");
fs.writeFileSync(outFile, output, "utf8");

console.log(`Built single-file artifact: ${outFile} (${Buffer.byteLength(output, "utf8")} bytes)`);
