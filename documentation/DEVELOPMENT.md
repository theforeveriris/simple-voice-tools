# 开发者文档

Simple Voice Tool 的开发指南：架构、数据流、主题系统、动效模型与性能设计。

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
                   历史记录(localStorage)   分析页(统计+区间缩放)
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
│   │   ├── chartPainters.ts      # 三种图表共用的 Canvas 画笔（网格/曲线/着色）
│   │   ├── SeriesChart.tsx       # 画布组件：live(实时滚动) / static(区间) 双模式
│   │   ├── TimeRangeSelector.tsx # 分析页双滑块时间轴（能量密度预览）
│   │   └── MiniSpark.tsx         # 历史卡片迷你波形
│   ├── layout/
│   │   ├── BottomBar.tsx         # 悬浮底栏 + 录音圆球（transform 运动模型）
│   │   └── DocViewer.tsx         # 应用内 Markdown 文档阅读器
│   ├── pages/
│   │   ├── TestPage.tsx          # 测试页（三张实时图表）
│   │   ├── AnalysisPage.tsx      # 分析页（概览卡/统计表/区间缩放图表）
│   │   ├── HistoryPage.tsx       # 历史页
│   │   └── SettingsPage.tsx      # 设置页
│   └── ui/                       # shadcn/radix 基础组件（按需使用）
├── lib/
│   ├── pwa.ts                    # PWA 安装提示（beforeinstallprompt 捕获/触发）
│   ├── audio/
│   │   ├── recorder.ts           # 录音引擎单例：采集/分析循环/记录生成 + computeStats
│   │   ├── pitch.ts              # YIN 音高检测 + RMS 能量
│   │   ├── formants.ts           # LPC 共振峰提取
│   │   ├── voiceQuality.ts       # Jitter/Shimmer/HNR（峰检测周期序列）
│   │   ├── cpp.ts                # CPPS（自写 FFT → 实倒谱 → 回归线基线）
│   │   ├── spectrogram.ts        # 语谱频带量化 + base64 编解码 + magma 伪彩色
│   │   ├── sustained.ts          # 长音指标：MPT / 音高稳定度 CV / 响度衰减斜率
│   │   └── demo.ts               # 示例数据生成（?demo=1 / 载入示例按钮）
│   ├── storage/
│   │   └── idb.ts                # IndexedDB：records / audio / kv 三仓库（DB v2）
│   ├── export/
│   │   ├── csv.ts                # 帧级 CSV / 汇总 CSV
│   │   ├── shareCard.ts          # PNG 分享报告卡
│   │   └── backup.ts             # ZIP 完整备份/恢复（fflate）
│   ├── backup/
│   │   └── github.ts             # GitHub 私有库云备份（Device Flow + Contents API）
│   └── theme/
│       └── monet.ts              # OKLCH 莫奈色板生成 → CSS 变量
├── store/
│   ├── useStore.ts               # 主状态：页面/录音/当前分析/设置（持久化）
│   └── useHistoryStore.ts        # 历史记录（持久化，含容量保护）
├── i18n/
│   ├── index.ts                  # 核心 t()/setLocale()/LOCALES（缺译回退 zh-CN）
│   ├── hook.ts                   # useI18n：订阅 settings.language，渲染期同步 locale
│   ├── zh-CN.ts                  # 简体中文词典（基准，300 键）
│   ├── zh-TW.ts                  # 繁体中文词典
│   ├── en.ts                     # 英语词典（机翻）
│   └── ja.ts                     # 日语词典（机翻）
├── constants/index.ts            # 音高区间/主题预设/默认设置/轴范围
└── types/index.ts                # 全部类型定义
documentation/                    # 开发者与算法文档（本目录）
public/                           # 静态资源：favicon.svg、PWA 图标、OGP 分享图
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
- **调音高区间**：`constants/BAND_RANGES`（曲线着色、色带、统计占比共用同一来源）；
- **改录音参数**：`recorder.ts` 顶部常量（降采样率、LPC 节流）与 `constants/PITCH_AXIS` 等。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [ALGORITHM-YIN.md](./ALGORITHM-YIN.md) | 音高检测：差分函数、CMND、抛物线插值 |
| [ALGORITHM-FORMANT-LPC.md](./ALGORITHM-FORMANT-LPC.md) | 共振峰：预加重/抽取/LPC/求根全链路 |
| [ALGORITHM-ENERGY.md](./ALGORITHM-ENERGY.md) | 能量：RMS、分贝、VAD 门限体系 |
| [ALGORITHM-CPPS.md](./ALGORITHM-CPPS.md) | 倒谱峰突出度：实倒谱、回归线基线、时间平滑 |
| [README.md](../README.md) | 项目介绍与使用说明 |

应用内路径：**设置 → 关于 → 文档**，可离线阅读以上算法文档。
