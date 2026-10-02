# 状态与持久化架构

本文描述应用的状态层与全部持久化位置：两个 Zustand store、IndexedDB schema、
localStorage 键清单、迁移与降级策略。实现：`src/store/`、`src/lib/storage/idb.ts`、
`src/constants/index.ts`（DEFAULT_SETTINGS）。

## Zustand store

### useStore（主状态，`svt:settings:v1` 持久化）

- 内存态：`currentTab` / `isRecording` / `currentAnalysis` / `pendingAutoReplay`；
- **持久化仅 `settings`**（`partialize`），且**排除 `llmApiKey`**（见下）；
- `merge` 承担三代迁移：
  1. 旧版布尔 `adviceEnabled` → 三态 `adviceMode`；
  2. 旧版旗帜直接作为预设（`huePreset: 'transPride'` 等）→ 收敛为
     `huePreset: 'pride'` + `prideFlag`；
  3. 旧版存于 localStorage 的 `llmApiKey` → 一次性迁入 IndexedDB kv。
- `updateSettings(patch)`：patch 含 `llmApiKey` 时同步写入 IDB kv（敏感态不进
  localStorage）；内存态仅为配置解析用。
- **`syncModuleSettings`**：settings 变化时把若干值推入模块级单例
  （音区边界 / 音高轴 / 实时窗口 / 语谱配色 / 音高算法 / 共振峰目标区 /
  骄傲旗参数）——Canvas 画笔等非 React 代码经 getter 读取，避免 60fps 订阅。

### useHistoryStore（记录，IndexedDB 持久化）

- 内存 `records` 仅保留最近 `MAX_HISTORY = 200` 条（列表渲染上限），
  **完整数据永远在 IndexedDB**——导出 / 备份必须走 `getAllRecords()` 全量读，
  否则静默丢早于 200 条的记录（备份模块内有显式注释强调这一点）。
- `addRecord(record, audioBlob?)`：记录与音频同 id 分别入 `records` / `audio` 仓；
  写失败降级为内存态 + 每会话一次的 toast（`warnStorage`）。
- 删除撤销：`removeWithUndo` 预取待删记录的音频 Blob（≤20 条时），
  5 秒内 `addRecord` 原样恢复。
- 旧版 localStorage（`svt:history:v1`）一次性迁入 IDB，守卫键 `svt:idb-migrated`。

## IndexedDB（`src/lib/storage/idb.ts`，库名 `svt`，版本 2）

| 仓库 | keyPath | 内容 |
| --- | --- | --- |
| `records` | `id` | 分析记录（不含音频） |
| `audio` | `id` | 录音音频 Blob（与记录同 id 关联） |
| `kv` | 显式 key | 敏感态与杂项（下表） |

kv 仓库键清单：

| 键 | 写入方 | 内容 |
| --- | --- | --- |
| `gh:token` | backup/github | GitHub 设备流令牌（含 refresh） |
| `gh:login` | backup/github | 登录名 |
| `gh:lastPush` | backup/github | 上次云备份时间 |
| `webdav:config` | backup/webdav | WebDAV 凭据 |
| `llm-api-key` | store/useStore | 大模型 API Key |
| `autoBackup:handle` | backup/local | 本地自动备份目录句柄（FileSystemDirectoryHandle） |
| `autoBackup:lastTs` | backup/local | 上次自动备份时间 |

约定：**凭据与句柄一律进 kv，不进 localStorage**（localStorage 会被设置导出、
容易被顺手清掉，且句柄无法结构化克隆进 localStorage）。

降级：首次打开失败即 `unavailable = true` 永久降级（本会话所有操作 reject），
上层 toast 提示；`onblocked` 同样拒绝。`onupgradeneeded` 目前只建仓库，
**尚无按版本的迁移分支**——给 `AnalysisRecord` 加字段需保持向后兼容（可选字段），
破坏性变更必须在这里补迁移。

## localStorage 键清单

| 键 | 写入方 | 内容 |
| --- | --- | --- |
| `svt:settings:v1` | useStore persist | 设置（zustand persist 结构，排除 llmApiKey） |
| `svt:history:v1` | （遗留，只读迁移源） | 旧版记录 |
| `svt:idb-migrated` | useHistoryStore | 旧记录已迁移守卫 |
| `svt:i18n-ai:<slug>` | i18n/aiLocale | AI 语言词典缓存 |
| `svt:i18n-overrides:<tag>` | i18n/index | 用户自定义词条（tag = localeTag，AI 按 slug） |
| `svt:update-seen` | App | 上次见过的应用版本 |
| `svt:update-notes-open` | App | 「本次更新内容」卡未读标记 |
| `svt:reminder:fired:<date>` | lib/reminder | 每日提醒当日已触发标记 |

新增键时：能进 IDB kv 的不进 localStorage；有结构的走 JSON；命名保持
`svt:<域>[:<子域>]`。

## 录音数据流（状态与持久化的交汇）

```
recorder.stop() → AnalysisRecord（内存）→ finishRecord（解码 + Worker 嗓音质量）
  → useHistoryStore.addRecord(record, audioBlob) → IDB 双仓落库
  → maybeAutoBackup('record')（本地自动备份节流触发）
  → currentAnalysis / pendingAutoReplay → 分析页
```

导入音频（文件 / 系统分享）走 `analyzeAudioFile` → Worker 离线管线 →
同一落库出口；GitHub / WebDAV / ZIP 备份从 IDB 全量读取（见 GUIDE-PWA.md）。

## 容量与配额

- 无自动清理：记录与音频无上限增长（`IMPORT_MAX_SEC` 限制单条 ≤ 5 分钟）；
  界面 200 条截断仅是渲染策略。
- 配额查询与 `persist()` 申请按钮在 数据管理 → 存储用量；
  持久化授予状态也反映在 应用子页 → 运行状态。
- 设置导出 / 导入有白名单 + 类型 / 枚举 / 数值范围校验
  （`lib/export/settings.ts`），未知字段静默忽略。
