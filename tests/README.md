# 移动端香水小样交互式试香打分卡 — E2E 测试套件说明

本目录包含完全不透明盒（Opaque-box）、零外部依赖（Node.js `v24.19.0+` 原生 ESM + Chrome/Edge 无头 CDP）的四层移动端端到端测试套件。

## 目录结构

```text
tests/
├── e2e-mobile.mjs             # CLI 主入口与四层调度器（支持独立隔离重置）
├── self-test.mjs              # 离线正/反向夹具自检（S1–S6）
├── README.md                  # 本说明文档
├── lib/
│   ├── cdp-client.mjs         # Browser-level WS + flatten session + HTTP服务/进程树清理/下载/截图
│   ├── cli-args.mjs           # CLI 参数解析与校验
│   ├── expected-catalog.mjs   # 10 款权威香水契约 + 英文白名单/模板违禁词表
│   └── semantic-helpers.mjs   # 语义定位、自适应打分、Spy 拦截与几何/无障碍审计原语
├── tiers/
│   ├── tier1-features.mjs     # Tier 1: 功能覆盖用例 54 条（T1-F1-01 ~ T1-F9-06）
│   ├── tier2-boundaries.mjs   # Tier 2: 边界与角落场景 54 条（T2-F1-01 ~ T2-F9-06）
│   ├── tier3-pairwise.mjs     # Tier 3: 跨功能成对组合 15 条（T3-PW-01 ~ T3-PW-15）
│   └── tier4-journeys.mjs     # Tier 4: 真实端到端旅程 6 条（T4-J1 ~ T4-J6）+ 7 张 @2x 截图
└── screenshots/               # Tier 4 输出的高清 @2x 手机截图产物
```

## 常用运行命令

```powershell
# 1. 核验 129 条用例注册清单
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --list

# 2. 离线正/反向脚手架自检（不依赖业务页面）
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --self-test

# 3. 运行全量 129 条 E2E 用例（含 Tier 4 生成 7 张高清手机截图）
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=all

# 4. 按层级运行
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=1
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=2
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=3
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=4

# 5. 可选参数组合（强制视口 / file:// 协议 / JSON 报告 / 指定浏览器）
node "e:\给antigravity使用\perfume-scorecard\tests\e2e-mobile.mjs" --tier=1 --viewport=390x844 --mode=both --browser=chrome --json
```
