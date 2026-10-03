# 主题系统架构（莫奈取色与骄傲旗预设）

本文描述配色系统的完整链路：OKLCH 令牌生成、预设机制、CSS 变量分层、
骄傲旗渐变与毛玻璃参数化，以及已踩过的坑。实现：`src/lib/theme/monet.ts`、
`src/index.css`（主题相关区块在文件尾部）、`vite.config.ts`。

## 双变量令牌（一切的基础）

每个色板令牌写入**两个** CSS 变量：

- `--c-x`：完整 `oklch()` 字符串 —— Canvas 画笔与 `color-mix()` 使用；
- `--c-x-rgb`：`"r g b"` 三元组 —— Tailwind 颜色经
  `rgb(var(--c-x-rgb) / <alpha-value>)` 消费，使 `bg-accent/35` 可用。

令牌清单（`SCALE`）：`surface / card / surface-hi / ink / ink-2 / accent /
on-accent / accent-soft / on-accent-soft / line`，另派生 `accent2`（次强调）
与 `on-accent2-soft` / `accent2-soft`。同时派生 shadcn/radix 的 HSL 语义变量
（`--background` 等，`rgbToHslTriplet` 换算）供基础组件使用。

生成入口 `buildTokens(hue, dark, accentHue, spec)`：

- 表面 / 文字 / 线条用**种子色相**着色；强调色系用 `accentHue`；
- 深浅两套明度/彩度参数在 `SCALE` 中，预设可用 `overrides` 逐令牌覆盖；
- **`darkHue`**（预设专用）：深色模式的表面色相可不同于浅色——
  例如非二元旗的浅色用黄相铺底、深色换紫黑（黄相在近黑会读作土棕）。
  次强调色相始终按浅色 hue 计算，保证图表曲线深浅两模式色相一致。

## 应用与切换（`applyTheme` / `presetSpec`）

`presetSpec(preset, userHue, prideFlag)` → `{ hue, accentHue, spec }`；
`applyTheme(hue, dark, accentHue, spec, prideFlag)`：

1. 调 `buildTokens` 并把全部令牌写入 `document.documentElement.style`；
2. `colorScheme`、`<meta name="theme-color">` 同步；
3. **类切换**：`dark`（shadcn dark: 变体）+ 预设类（`theme-pride`），
   骄傲旗另写 `data-pride-flag="<flagId>"` 供 CSS 选渐变；
4. `dispatchEvent('app:themechange')` —— `chartPainters` / 语谱图 LUT
   据此失效调色板缓存（Canvas 不会自动感知 CSS 变量变化）。

调用点三处：`main.tsx`（首帧前）、`App.tsx`（订阅 hue / huePreset / prideFlag /
theme / 系统深浅变化）、外观页 `applyPreset`（立即重放）。

## 预设

`THEME_PRESETS: { monet: null, transPride, nonbinary, genderfluid }`，
`ThemePresetSpec { hue, accentHue, themeClass?, darkHue?, overrides? }`：

- **monet**：spec 为 null，完全跟随用户色相滑条（8 预设色相 + 自定义）；
- **骄傲旗三款**：`themeClass: 'theme-pride'` 共用一套渐变/毛玻璃 CSS，
  渐变按 `data-pride-flag` 区分，强调色与深浅铺底各自指定。

新增旗帜的完整步骤：

1. `types.HuePreset` / `PRIDE_FLAGS`（constants，含条纹色）加 id；
2. `THEME_PRESETS` 加 spec（hue / accentHue / themeClass: 'theme-pride' / overrides）；
3. `index.css` 加 `html.theme-pride[data-pride-flag='xxx'] body::before` 渐变
   （浅色 + `.dark` 微光两组）；
4. 外观页下拉自动出现（由 `PRIDE_FLAGS` 驱动）；导入白名单 `STRING_ENUMS.prideFlag` 加 id；
5. i18n 五语言加旗帜名。

## 渐变背景与毛玻璃（index.css）

渐变挂在 `html.theme-pride body::before`（`position: fixed; inset: -12%;
z-index: -1`，多层 radial-gradient + `blur(48px)`，`pride-drift` 32s 缓慢漂移，
`prefers-reduced-motion` 与 `theme-pride-static` 类可关闭）。

**三个用户可调参数**（`applyPrideParams` 由 useStore 订阅写入 CSS 变量）：

| CSS 变量 | 设置项 | 作用 |
| --- | --- | --- |
| `--pride-glow` | 渐变浓度（20–160%） | 光斑层整体 opacity |
| `--pride-saturation` | 饱和度（30–200%） | 光斑层 saturate 滤镜 |
| `--pride-glass-blur` | 毛玻璃强度（0–28px） | 卡片 backdrop-blur 半径 |

毛玻璃分层：`.bg-card`（55% + blur）、`.bg-background`（弹层，72% + blur+4px）、
`.bg-surface-hi`（60% 无模糊，控制合成层数量）；页面与全屏浮层 `.bg-surface`
透明让出背景。所有规则都在 `.theme-pride` 作用域下，莫奈主题零影响。

## 氛围彩蛋（ambient.ts）

三个环境效果共享一个 20Hz 心跳（`startAmbientLoop`，App.tsx 模块级启动一次），
每 tick 读取 `recorder` 实时数据——录音（`isRecording()`）或监听练习
（`isMonitoring()`）时麦克风视为活跃，其余时刻不产生任何样式写入：

- **声音染色**（设置 → 外观 → 主题，`voiceTint`）：种子色相与强调色相同时
  替换为「染色值」——实时音高（80–400 Hz 对数映射）在蓝 255° → 粉 335° 弧上
  的位置经 EMA 平滑所得；明度 / 彩度规格沿用当前预设（`presetSpec().spec`），
  pride 渐变背景不受影响（走 CSS）。复用 `applyTheme` 写入，Canvas 图表随
  `app:themechange` 一同流动。性能设计：仅当色相变化越过 1.5°（最短弧）才
  重写令牌，平稳发声时几乎零样式开销；静音段保持色相（取最近 0.5s 内最后
  有声帧）；麦克风停止或开关关闭时恢复基准主题（同一 tick 内一次性）。
- **音量呼吸**（设置 → 外观 → 骄傲旗参数，`volumeBreath`）：按最新帧
  rmsDb（-50 → -10 dBFS 归一）快起慢落平滑后写 `--pride-breath`（1–1.5 倍率），
  CSS 中与 `--pride-glow` 相乘决定渐变层透明度（另有 150ms transition 兜底
  平滑）；仅 pride 渐变主题可见，退出活跃态时一次性复位为 1。
- **凌晨极光**：`watchAuroraHours` 在本地时间 3:00–4:59 给 `<html>` 加
  `aurora` 类（启动先判一次避免闪旗面 + 每分钟复查跨边界），index.css 中
  极光规则置于旗帜规则之后（同特异性靠源顺序取胜，深色单独一组），
  覆盖三旗渐变为极光配色。无设置项、无提示，只在深夜撞见。

## ⚠️ 已踩过的坑：backdrop-filter 与 fixed 包含块

**任何**带 `backdrop-filter`（或 transform / filter / perspective）的元素会成为
其后代 `position: fixed` 元素的包含块。`body` 在 base 层被
`@apply bg-background`，pride 的弹层毛玻璃规则曾因此误命中 body，导致：

- 底栏（fixed bottom-5）被定位到整个文档底部——长页面里"消失"；
- `body::before` 渐变层改为相对 body 定位，`inset: -12%` 撑出横向滚动。

规则现为 `.bg-background:not(body)`；`html/body` 另有 `overflow-x: clip` 兜底。
**教训**：给全局类名加 filter/backdrop-filter/transform 前，先确认它不会命中
`body` 或任何 fixed 元素的祖先。页面内 in-tree 的 fixed 元素（多选操作条等）
若未来出现定位异常，优先排查祖先链上的包含块触发者。

## 画布联动

Canvas 不感知 CSS 变量。`chartPalette()`（chartPainters）在读取时缓存调色板，
`app:themechange` 事件触发重建；语谱图 LUT（accentRamp）同理。新增主题相关
的 Canvas 颜色时，务必走 `chartPalette()` 而非直接 `getComputedStyle`。

## 首帧无闪烁

`main.tsx` 在 React 渲染前从 localStorage 读持久化设置（含旧版结构迁移）
计算 `presetSpec` 并 `applyTheme`；`index.css` 的 `:root` 保留一套 hue=15
的静态回退值兜底解析失败。
