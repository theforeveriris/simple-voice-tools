# 开发者文档

Simple Voice Tool 的开发指南：架构、数据流、主题系统、动效模型与性能设计。
专题详解见文末文档索引（i18n / 主题 / 状态与持久化 / 设置子页 / PWA 均有独立文档）。

## 项目概览

基于 Web Audio API 的语音测试与分析工具。对麦克风说话即可获得基频（音高）、
共振峰（F1/F2）、能量电平三条实时曲线，停止后生成统计报告，历史记录保存在
浏览器本地。

```
麦克风 ──► 录音引擎(每帧) ──► YIN 音高 ─┐
                       ├─► RMS 能量 ──┼─► 实时缓冲 ──► Canvas 图表 (rAF)
                       └─► LPC 共振峰 ─┘        │
                                               ▼ 停止
                                    分析记录(30Hz 降采样)
                                               │
                        ┌──────────────────────┤
                        ▼                      ▼
                   历史记录(IndexedDB)      分析页(统计+区间缩放)
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | React 19 + TypeScript（strict + verbatimModuleSyntax） |
| 构建 | Vite 7（`outDir: docs/`，`base: './'`，适配 GitHub Pages） |
| 样式 | Tailwind CSS 3.4 + CSS 变量（莫奈动态色板） |
| 状态 | Zustand（主 store + 历史 store，persist 中间件） |
| 动效 | Framer Motion（layout / springs） |
| 音频 | Web Audio API：AnalyserNode + 自研 DSP（纯 TS，无音频依赖） |
| 可视化 | 原生 Canvas 2D（自绘，不依赖图表库） |
| 图标/提示 | lucide-react / sonner |

## 目录结构

```
src/
├── components/
│   ├── charts/
│   │   ├── chartPainters.ts      # 图表共用 Canvas 画笔（音高/能量/共振峰/元音/VRP/十字线/目标区）
│   │   ├── SeriesChart.tsx       # 画布组件：live(实时滚动)/static(区间+十字线，支持键盘) 双模式
│   │   ├── SpecChart.tsx         # 语谱图（静态，叠加 F1/F2 轨迹）
│   │   ├── TrendChart.tsx        # 跨记录趋势图（纵轴可切 基频/MPT/CPPS）
│   │   ├── DiaryHeatmap.tsx      # 用声日记热力图
│   │   ├── LiveSpectrum.tsx      # 实时频谱图（实验性）
│   │   ├── TimeRangeSelector.tsx # 双滑块时间轴（能量密度预览）
│   │   ├── MiniSpark.tsx         # 记录卡迷你波形
│   │   └── specPainter.ts        # 语谱绘制（offscreen 位图 + 伪彩色）
│   ├── layout/
│   │   ├── BottomBar.tsx         # 悬浮底栏 + 录音圆球（纯 transform 运动模型 + 全局快捷键）
│   │   ├── ErrorBoundary.tsx     # 页面级错误边界
│   │   └── ShortcutsHelpSheet.tsx# 快捷键帮助浮层（? 呼出）
│   ├── pages/
│   │   ├── TestPage.tsx          # 测试页（实时图表 + 录音圆球）
│   │   ├── AnalysisPage.tsx      # 分析页（概览/统计/图表/回放/音高算法对比）
│   │   ├── HistoryPage.tsx       # 历史页（列表/趋势/日记热力图/多选/对比）
│   │   ├── SettingsPage.tsx      # 设置页（外壳 + 搜索索引 + 子页面分发）
│   │   ├── CompareSheet.tsx      # 两记录对比浮层（Δ 指标 + 曲线叠加）
│   │   ├── F0LiveSheet.tsx 等    # 实时练习子页（元音落点/F0/频谱/VRP）
│   │   └── VowelLiveSheet.tsx
│   ├── analysis/                 # 分析页卡片（HeroCard/StatsTables/SustainedCard/AdviceCard/…）
│   ├── settings/                 # 设置子页面与区块（见 ARCHITECTURE-SETTINGS.md）
│   │   ├── AppearancePage.tsx    # 外观（深浅/预设/骄傲旗参数）
│   │   ├── LanguagePage.tsx      # 语言（内置 + AI 翻译 + 编辑词条 + 词典分享）
│   │   ├── AppPage.tsx           # 应用（安装/分享/版本/检查更新/运行状态/诊断）
│   │   ├── ConfigPage.tsx        # 配置（录音/训练/提醒）
│   │   ├── DataPage.tsx          # 数据管理（存储用量/备份/导入导出）
│   │   ├── LabsPage.tsx          # 实验性功能（开关/大模型/音区边界/实时功能/GitHub 备份）
│   │   ├── EditStringsSheet.tsx  # 编辑词条浮层（用户自定义译文）
│   │   └── TrainingSection.tsx 等
│   └── ui/                       # shadcn/radix 基础组件（按需使用）
├── hooks/
│   └── useLiveCanvas.ts          # 实时画布尺寸自适应（回调 ref + ResizeObserver）
├── i18n/
│   ├── index.ts                  # 核心 t()：覆盖层→内置→AI→zh-CN 查找链 + 版本订阅
│   ├── hook.ts                   # useI18n：订阅 settings.language 与词典版本
│   ├── aiLocale.ts               # AI 翻译管线（生成/增量补全/术语表/词典分享）
│   ├── aiLocale.test.ts          # 术语表与分享格式单测
│   ├── zh-CN.ts 等 ×5            # 五语言词典（zh-CN 为基准，漂移测试强制一致）
│   └── i18n.test.ts              # 词典漂移防护 + 覆盖层行为
├── lib/
│   ├── pwa.ts                    # 安装捕获 / 检查更新 / SW 状态 / 缓存重置
│   ├── llm.ts                    # 大模型调用（建议/周报/AI 翻译共用 llmChat）
│   ├── advice.ts                 # 训练建议（本地规则引擎，纯函数）
│   ├── trendMetric.ts            # 趋势图纵轴指标（f0/mpt/cpps 取值规则）
│   ├── file.ts                   # 下载触发、音频扩展名→MIME
│   ├── reminder.ts               # 每日练习提醒（本地通知）
│   ├── audio/                    # 录音引擎与 DSP（见文末算法文档）
│   │   ├── recorder.ts           # 录音引擎单例（实时循环/记录生成/统计）
│   │   ├── pitch.ts / pitchAlt.ts# YIN / pYIN / MPM（模块级复用缓冲，零稳态分配）
│   │   ├── formants.ts           # LPC 共振峰（同为复用缓冲）
│   │   ├── voiceQuality.ts / cpp.ts # J/S/HNR / CPPS
│   │   ├── analysisPipeline.ts / analysisWorker.ts / analysisClient.ts
│   │   │                         # 离线管线（Worker，PCM transfer 交付）
│   │   ├── importAudio.ts        # 外部音频导入（含 Share Target）
│   │   ├── pitchCompare.ts       # 音高算法对比（实验性）
│   │   ├── sustained.ts          # 长音指标（MPT/CV/衰减）
│   │   └── demo.ts / spectrogram.ts / testHelpers.ts
│   ├── backup/                   # github（设备流）/ webdav / local（目录句柄）
│   ├── export/                   # csv / shareCard（PNG）/ backup（ZIP）/ settings / interactiveHtml
│   ├── storage/
│   │   └── idb.ts                # IndexedDB：records / audio / kv（键清单见状态文档）
│   └── theme/
│       └── monet.ts              # OKLCH 色板生成 + 预设（见 ARCHITECTURE-THEME.md）
├── store/
│   ├── useStore.ts               # 主状态 + settings 持久化（迁移/模块同步，见状态文档）
│   └── useHistoryStore.ts        # 记录（IDB 持久化，200 条界面截断）
├── types/index.ts                # 全部类型定义
└── constants/index.ts            # 音区/预设/默认设置/轴范围/PRIDE_FLAGS
documentation/                    # 开发者与算法文档（本目录）
public/                           # 静态资源：favicon.svg、PWA 图标、sw-custom.js、OGP
scripts/generate-pwa-assets.py    # 用 Pillow 生成 public/ 下的图片资源
docs/                             # ⚠️ 构建产物输出目录（vite outDir），勿手放文件
```

## 核心数据流

### 录音引擎（`lib/audio/recorder.ts`，单例）

- `start({ deviceId, maxDurationSec, onAutoStop })`：getUserMedia（关闭 AGC/NS/回声消除，
  保证原始音质）→ AudioContext + AnalyserNode（fftSize 4096）→ rAF 分析循环；
- 分析循环每帧：`getFloatTimeDomainData` → `rmsDb` → 电平 > -55dB 时 `detectPitchYin` →
  每 2 帧 `extractFormants`（LPC 开销大）→ 追加到实时缓冲（NaN 表示未检出）；
- 最长时长由循环内检查，触发 `onAutoStop` 回调（由 store 落库并跳转）；
- `stop()`：停止轨道/关闭上下文 → 缓冲 2:1 降采样（60fps→30Hz）→ NaN→null →
  `computeStats` 聚合 → 生成 `AnalysisRecord`。不足 1 秒返回 null（不保存）；
- `finishRecord(record)`：等待 MediaRecorder 冲刷 → `decodeAudioData` 解码 PCM →
  `computeVoiceQuality`（Jitter/Shimmer/HNR）+ `computeCpps`（倒谱峰突出度）→
  合并进 stats；音频 Blob 由调用方连同记录一起落库；
- 实时图表通过 `recorder.getLive()` 每帧直接读缓冲，**不经过 React 状态**（避免 60fps 重渲染）。

### 状态管理

- `useStore`：`currentTab` / `isRecording` / `currentAnalysis`（内存）/ `settings`（持久化）。
  录音的启动失败会抛出异常，由 RecordBall 捕获并 toast；
- `useHistoryStore`：`records`（新记录插头部）+ 增删清导入。IndexedDB（`svt` 库 v2，
  records / audio / kv 三个仓库）承载持久化；kv 仓库存放 GitHub 备份令牌等敏感态，
  不进 localStorage。写入失败降级为内存态并 toast；

### 图表渲染

一套画笔两种模式：`chartPainters.paintChart(kind, ctx, w, h, series, t0, t1, showGrid, showLabels, live)`。
- **live**（测试页）：SeriesChart 挂 rAF 循环，每帧从 recorder 读缓冲，窗口固定 12 秒
  （`LIVE_WINDOW_SEC`），数据不足时轴固定从 0 到 12s，超出后滚动；
- **static**（分析页）：绑定 `series + [t0,t1]`，数据/尺寸变化时重绘一次；
- 音高曲线按每段所在音高区间（`bandOf`）分段着色；网格为淡灰虚线；
  测试页 `showLabels=false`（纯图表），分析页 `true`（简约刻度）；
- 尺寸自适应：ResizeObserver 设置画布物理像素（DPR 缩放），父容器高度由页面布局给定。

## 主题系统（莫奈取色）

`lib/theme/monet.ts`：种子色相 hue → OKLCH 色彩空间生成全套 M3 风格令牌
（surface/card/ink/accent/accent-soft/line…），每个颜色写入两个 CSS 变量：

- `--c-x`：完整 `oklch()` 字符串（Canvas 画笔、CSS color-mix 使用）；
- `--c-x-rgb`：`"r g b"` 三元组（Tailwind 颜色定义 `rgb(var(--c-x-rgb) / <alpha-value>)`，
  使 `bg-accent/35` 这类透明度修饰符可用）。

`applyTheme(hue, dark)` 的 `dark` 参数在 SCALE 表的浅色/深色两组 L,C 参数间切换，
生成对应明暗模式的全套令牌，并同时写入 shadcn 的 HSL 派生变量、`colorScheme`
与 `<meta name="theme-color">`。

应用时机：`main.tsx` 渲染前读取持久化设置解析 hue 与 dark，`applyTheme(savedHue, dark)`
（山桃红兜底）→ App 内监听设置变化（含 system 明暗）重新应用；
`applyTheme` 完成后派发 `app:themechange` 事件，`chartPainters` 据此失效调色板缓存。
`index.css` 的 `:root` 保留一套 hue=15 的静态回退值（首帧防闪烁）。
新增主题相关颜色时：先在 `buildTokens` 加令牌，再到 `tailwind.config.js` 映射。

## 动效模型（底栏为何这样写）

底栏 + 录音圆球采用**纯 transform 运动模型**（详见 BottomBar.tsx 注释）：

- 小球 `position: absolute`（`left-full` 锚在底栏右缘），从不占文档流，缩放进出零重排；
- 容器在测试页用 `animate={{ x: -34 }}` 左移（34 = 小球 56 + 间距 12 的一半），
  使"底栏+小球"组合视觉居中；
- 页签标签宽度**瞬变**（只做 0.14s 透明度淡入）——若做 width 动画，底栏真实布局会
  每帧重排，与 `layout` FLIP 叠加产生"二次移动"；
- 页面切换：旧页即时卸载（不做退场动画）+ 新页仅入场动画；测试页图表延迟 300ms
  启动 rAF，避开底栏弹簧动画的主线程占用（Canvas 2D 绘制在主线程）。

## 性能设计决策

| 决策 | 原因 |
| --- | --- |
| 图表直接读引擎缓冲，不走 React 状态 | 60fps 重渲染整个页面代价过高 |
| LPC 每 2 帧一次 + EMA 平滑 | 求根较贵；30Hz 对共振峰曲线足够 |
| 存储 2:1 降采样（30Hz） | 体积减半，曲线视觉无损 |
| 记录/音频存 IndexedDB（200 条上限） | 绕开 localStorage 配额；音频 Blob 与记录同 id 关联 |
| 测试页图表延迟 300ms 挂载 | 保证底栏动画满帧（实测 p95 16.8ms） |
| 音高用 YIN 替代频谱谐波法 | 半音量化画不出平滑曲线（见算法文档） |

## 构建与部署

```bash
npm install       # 安装依赖
npm run dev       # 开发（默认 5173）
npm run build     # tsc -b && vite build → 输出到 docs/
npm run preview   # 本地预览构建产物
```

- `base: './'` + `outDir: 'docs/'`：可直接用 GitHub Pages 从 docs 目录发布；
- PWA：`vite-plugin-pwa` 在构建时生成 `sw.js` + `manifest.webmanifest` 并自动注入
  注册脚本（`registerType: 'autoUpdate'`，Workbox 预缓存全部静态资源）；
  安装入口在设置页，依赖浏览器的 `beforeinstallprompt` 事件；
- `docs/` 构建时会被清空，**不要**把源文档放进去（源文档在 `documentation/`）；
- 体验示例数据：`?demo=1`（无痕体验分析页）或各页面的"载入示例数据"按钮；
- 麦克风 API 要求 HTTPS 或 localhost。

## 常见开发任务

- **加一个新页面**：`types.ViewType` 加 id → `BottomBar.TABS` 加项（lucide 图标）→
  `App.tsx` 分支渲染 → 新建 `components/pages/XxxPage.tsx`；
- **加一种图表**：`chartPainters.ts` 加画笔函数 + `paintChart` 分支 → `SeriesChart`
  的 `ChartKind` 联合类型加值 → 页面直接用 `<SeriesChart kind="xxx" />`；
- **调主题预设**：`constants/THEME_PRESETS`；
- **调音高区间**：`constants/index.ts` 的音区边界（`DEFAULT_BAND_BOUNDS` +
  `getBandRanges()` / `setBandBounds()`，曲线着色、色带、统计占比共用同一来源）；
- **改录音参数**：`recorder.ts` 顶部常量（降采样率、LPC 节流）与 `constants/PITCH_AXIS` 等。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [ALGORITHM-YIN.md](./ALGORITHM-YIN.md) | 音高检测：差分函数、CMND、抛物线插值 |
| [ALGORITHM-FORMANT-LPC.md](./ALGORITHM-FORMANT-LPC.md) | 共振峰：预加重/抽取/LPC/求根全链路 |
| [ALGORITHM-ENERGY.md](./ALGORITHM-ENERGY.md) | 能量：RMS、分贝、VAD 门限体系 |
| [ALGORITHM-CPPS.md](./ALGORITHM-CPPS.md) | 倒谱峰突出度：实倒谱、回归线基线、时间平滑 |
| [ARCHITECTURE-I18N.md](./ARCHITECTURE-I18N.md) | i18n：查找链、覆盖层、AI 翻译管线与词典分享 |
| [ARCHITECTURE-THEME.md](./ARCHITECTURE-THEME.md) | 主题：OKLCH 令牌、骄傲旗预设、渐变参数、包含块陷阱 |
| [ARCHITECTURE-STATE.md](./ARCHITECTURE-STATE.md) | 状态与持久化：store、IndexedDB、键清单、迁移与降级 |
| [ARCHITECTURE-SETTINGS.md](./ARCHITECTURE-SETTINGS.md) | 设置页：子页面模式、搜索索引、新增子页步骤 |
| [GUIDE-PWA.md](./GUIDE-PWA.md) | PWA：更新流、版本注入、Share Target、修复工具 |
| [PARAMETERS-GUIDE.md](./PARAMETERS-GUIDE.md) | 参数说明书（面向使用者） |
| [README.md](../README.md) | 项目介绍与使用说明 |

应用内路径：**设置 → 关于 → 文档**，可离线阅读以上文档。
