# 十支小样试香手账（手机端交互式打分卡）

整理自两张淘宝香水小样订单截图（共 10 款不重复香水，已合并重复购买的「阿玛尼 自我无界」`0.5ml ×1` + `1ml ×2`，并对被右下角浮标遮挡的「范思哲 粉耀晶钻」支持数量手动确认）。

## 快速打开方式

1. **单文件开箱即用（最方便发送至手机打开）**
   - 直接将 `dist/perfume-scorecard.html` 发送到手机微信/文件管理器，或双击在浏览器打开（支持 `file://`）。
2. **本地静态 HTTP 预览（或同 Wi-Fi 手机扫码访问）**
   ```powershell
   python -m http.server 4173 --bind 127.0.0.1 --directory "e:\给antigravity使用\perfume-scorecard"
   ```
   浏览器访问 `http://127.0.0.1:4173/index.html`（若需手机同一局域网访问，将 `--bind 127.0.0.1` 改为 `--bind 0.0.0.0`）。

## 重新打包单文件交付版

```powershell
node "e:\给antigravity使用\perfume-scorecard\scripts\build-singlefile.mjs"
```

输出产物：`e:\给antigravity使用\perfume-scorecard\dist\perfume-scorecard.html`。

## 目录结构

```text
perfume-scorecard/
├── index.html                  # 主页面（mobile-native 适配 + 内联线性 SVG）
├── styles/main.css             # 沙龙试香纸美学与动效样式系统
├── scripts/
│   ├── data.js                 # 10 款香水只读静态目录（window.PERFUME_CATALOG）
│   ├── app.js                  # 状态管理、localStorage 持久化、抽屉与战报导出
│   └── build-singlefile.mjs    # 零依赖单 HTML 构建脚本
├── dist/perfume-scorecard.html # 单文件交付版
└── README.md
```

## 核心功能与数据说明

- **10 款清单与科学试香排签顺序（由淡入浓防嗅觉疲劳三段十支）**：
  - **第一组 · 清透热身（`N°01`–`N°03`）**：祖玛珑蓝风铃 EDC、娇兰柑橘罗勒 EDT、宝格丽大吉岭原版 EDT；
  - **第二组 · 花木进阶（`N°04`–`N°06`）**：范思哲粉耀晶钻（粉钻）EDT、爱马仕大地 EDT、迪奥真我 EDP；
  - **第三组 · 馥郁压轴（`N°07`–`N°10`）**：香奈儿 5号 EDP、阿玛尼自我无界 EDP、普拉达我本莫测 EDP、圣罗兰 YSL 反转巴黎 EDP。
  - *（注：原订单中阿玛尼自我无界含 `0.5ml ×1` + `1ml ×2` 共 `3 支 · 2.5ml`，且状态持久化以香水 `id` 为键，调整试香顺序不影响已存打分与笔记。）*
- **数量遮挡边界**：截图 1 中「范思哲 粉耀晶钻（粉钻）」数量位置被淘宝“反馈”浮标遮挡，默认展示 `1ml（数量待确认）` 并提供 `确认 ×1` / `确认 ×2` 快捷确认，不无依据硬编码。
- **持久化与导出**：打分与笔记实时保存至 `localStorage`（`perfume_scorecard_v1`）；支持一键复制文字战报（含剪贴板降级选区）、导出纯前端 Canvas 2D 高清 PNG 长图，以及 JSON 备份导入/导出。
