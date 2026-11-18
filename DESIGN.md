# DESIGN.md — 十支寻香签 · 法式沙龙试香手账视觉与动效规范

## 1. 美学定位与反面禁令（Anti-Goals）
- **风格锚点**：Le Labo / Byredo 法式沙龙配方印签风。未涂布棉纸底色配高反差衬线编号、细线表格与统一复古朱砂印泥红（`#9E2A2B`）评分盖章。
- **反面禁令**：
  - 严禁出现小样规格/数量字样（如 `1ml`、`0.5ml`、`×1`、`×2`、`跨单合并` 等），全面改为正装实拍图与口碑标签；
  - 严禁出现蓝紫/粉紫渐变、Emoji UI 图标、嵌套多层圆角框套娃与 `1–10` 计算器数字方格；
  - 严禁使用 `transition: all`、`scale(0)` 入场动画、`ease-in` 曲线或未加 `(hover: hover)` 隔离的悬浮样式。

## 2. 色彩 Token 表（严格收敛）
| 用途 | Hex 值 | 说明 |
| :--- | :--- | :--- |
| 棉纸主背景（Canvas） | `#FCFCFA` | 柔和未涂布试香纸底色 |
| 浅纸衬底（Subtle） | `#F6F4EF` | 次级底衬与激活按压态 |
| 碳黑主墨（Ink） | `#141413` | 标题、细框线、选中项反色填充 |
| 次文字（Ink Muted） | `#66635C` | 品牌副名、前中后调键值与引导语 |
| 极细分隔线（Hairline） | `#E5E3DD` | `1px` 表格分隔线 |
| 复古朱砂印泥（Vermilion） | `#9E2A2B` | 五颗半心评分填充、正装锁定方框印章与心动榜单高亮 |
| 朱砂浅底（Vermilion Soft） | `#FBF1F1` | 心愿提示与印章微透底色 |
| 右侧植物气味色条 | Per-Scent `primary` | 仅在印签右侧边缘保留 `4px` 植物色条区分十支香 |

## 3. 字体与排版阶梯
- **衬线主标（Serif）**：`"Noto Serif SC", "Songti SC", "STSong", Georgia, serif` —— 用于 `N°01`–`N°10` 编号（`36px`, `-0.04em`）、香水主名称（`22px`）及总分读数。
- **等宽编码（Mono）**：`ui-monospace, "SF Mono", Menlo, Consolas, monospace`（开启 `font-variant-numeric: tabular-nums`） —— 用于序号标识与数字对齐。
- **正文字体（Sans）**：`system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`，`input[type="text"]` 固定 `16px` 防止 iOS 自动放大。

## 4. 交互架构与 `/ask-emil` 动效规范
- **容器布局**：`100dvh` 弹性单屏 + `scroll-snap-type: x mandatory` 单签横滑，顶部一键切换「单签 | 目录」与底部弹出「心愿单」抽屉。
- **零跳动同框切换（「气味配方 | 穿香处方」）**：
  - 选项卡采用 `clip-path: inset(...)` 双层覆盖滑块（`220ms cubic-bezier(0.77, 0, 0.175, 1)`），文本与背景反色同步丝滑过渡；
  - 面板内容区固定高度，切换时使用 `180ms` `opacity` + `filter: blur(2px)` 叠化过渡，零高度跳动。
- **五颗半心 + 印泥盖章**：
  - 五颗 `1.35px` 细线半心 SVG 支持轻点左/右半心或连续拖动（`setPointerCapture`）精准打 `1–10` 分；
  - 点击「盖章锁定」时，瓶身旁双线朱砂方印章从 `scale(1.14); opacity: 0` 落定至 `scale(1); opacity: 1`（`180ms cubic-bezier(0.23, 1, 0.32, 1)`）；
  - 所有按压按钮统一 `:active { transform: scale(0.97); }`，抽屉使用 `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`，并完整适配 `prefers-reduced-motion: reduce`。
