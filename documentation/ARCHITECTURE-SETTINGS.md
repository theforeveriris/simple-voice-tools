# 设置页架构（子页面模式）

本文描述设置页的组织方式与「新增子页面」的标准步骤。实现：
`src/components/pages/SettingsPage.tsx`、`src/components/settings/*`。

## 结构

```
SettingsPage
├── 顶部胶囊：设置 / 关于（AboutTab：简介 + 使用说明 + 开发者文档链接 + 免责声明）
├── 搜索框（非空时切换为 SEARCH_INDEX 结果，点击直达子页面）
└── 主视图：七张入口卡片
    AppearancePage（外观）   LanguagePage（语言）  AppPage（应用）
    ConfigPage（配置）      LlmPage（大模型）     DataPage（数据管理）
    LabsPage（实验性功能）
```

- 入口卡片：`entry(label, icon, onOpen)`；图标 lucide，`aria-label` 即 label。
- **子页面是 SettingsPage 的本地 state**（`appearanceOpen` 等，含 `llmOpen`），
  不持久化、不入 hash——切页签或返回键回主视图即重置。
- 子页面之间靠**提前 return**切换：`if (xxxOpen) return <XxxPage ... />`，
  因此 **hooks 必须在这些 return 之前全部调用**（SettingsPage 自身遵守）。
- 返回手势：子页打开时经 `registerBackClose`（`lib/backNav.ts`）压入返回栈，
  系统返回键/手势先关子页再退页面；新子页沿用 `onBack = history.back()`。

## 搜索索引

`SEARCH_INDEX: { page: SubPage; sectionKey; labelKey }[]`——每条是一个设置项，
`sectionKey` 是所在分区标题、`labelKey` 是设置项名，两者都参与模糊匹配；
点击 → 打开对应子页面。新增设置项时在此登记一条，用户才能搜到它。

## 子页面通用骨架

每个子页面同构（见 `LanguagePage.tsx` / `AppPage.tsx`）：

```tsx
<div className="flex flex-col gap-3.5 pb-4">
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} ...>
    {/* 头：返回圆钮（aria-label=common.back）+ 标题 */}
    {/* 若干 <SettingsSection icon={Icon} title={...}> */}
  </motion.div>
</div>
```

props 约定：`{ settings, update, onBack }`——`update` 即 `updateSettings`；
`AppPage` 无设置项，只收 `onBack`。

## 基础组件（rows.tsx / InfoTip.tsx）

- `<SettingsSection icon title>`：圆角卡片分区，title 行带图标；
- `<SettingRow label desc? stacked?>`：一行 = 左标签（可含 InfoTip）+ 右控件；
  `stacked` 时控件换行到下方（长表单用）；`desc` 是标签下的小字说明，
  **长说明改用 InfoTip 浮窗**（如练习提醒、共振峰目标区）；
- `<InfoTip label text>`：标签右侧 ⓘ 图标，点击弹出说明浮层；
- 控件用 shadcn（`Select` / `Switch` / `AlertDialog`），风格约定见现有代码：
  下拉 `w-44 border-0 bg-transparent px-0 text-sm shadow-none`，弹层
  `rounded-2xl border-0 bg-card shadow-lg`。

## 新增子页面（步骤清单）

1. 建 `components/settings/XxxPage.tsx`（上面的骨架）；
2. `SettingsPage`：`SubPage` 联合类型加 id、`useState(xxxOpen)`、
   提前 return 分支、主视图 `entry(t('settings.xxx'), Icon, ...)`、
   `registerBackClose` 压返回栈；
3. `SEARCH_INDEX` 登记子页的设置项（否则搜索不到）；
4. `i18n` 五语言加子页标题键（搜索索引用的 sectionKey / labelKey 也要有词条）；
5. 若子页含持久化设置项：`types.AppSettings` + `DEFAULT_SETTINGS` +
   `lib/export/settings.ts` 白名单（可选字符串进 `OPTIONAL_STRING_KEYS`，
   枚举进 `STRING_ENUMS`，数值范围进 `NUMBER_RANGE`）。

参考实现：`AppPage`（无设置项的最简形态）、`LanguagePage`（开关 + 下拉 +
表单 + 浮层 + 进度条的最全形态）。

## 变体：二级页与独立全屏页

- **二级页**：子页之下再挂一层本地 state 页，如 `LlmPage` → `PromptPage`
  （提示词调节）；骨架与 props 约定相同，只是由 LlmPage 自己管理开合。
- **独立全屏页**：不完全属于设置的概念页放在 `components/` 顶级目录，如
  `components/ai/AssistantPage.tsx`（AI 助手聊天页，从 LlmPage 进入）——
  仍是 SettingsPage 的提前 return 分支，但组件不在 settings/ 目录下。

## 各子页速览（区块 → 去处）

| 子页 | 区块 | 关键实现 |
| --- | --- | --- |
| 外观 | 主题（深浅 / 预设三卡 / 骄傲旗参数）· 自定义背景图 · 图表辅助 | `applyPreset` 立即重放主题；背景图管线见 ARCHITECTURE-THEME.md |
| 语言 | 界面语言 + AI 翻译（合一区块） | 见 ARCHITECTURE-I18N.md |
| 应用 | 安装与分享 · 版本与更新 · 运行状态 | 见 GUIDE-PWA.md；原生壳内「检查更新」比对 GitHub Releases APK（`lib/appUpdate.ts`） |
| 配置 | 录音 · 训练 · 提醒 · 图表与回放 · 通用 | 录音区含启动页开关；图表与回放 = 实时窗口/音高轴/语谱配色/回放倍速 |
| 大模型 | AI 助手入口 · 模型配置 · 配置档案 · 提示词调节 · 用量与费用 | 档案制（`llm:profiles`），支持 openai/anthropic 双协议；请求日志在数据页 |
| 数据管理 | 数据去向（页首，含 AI 请求日志）· 存储用量 · 备份与恢复（含口令加密）· WebDAV · 数据操作 | `PrivacyPanel`；加密见 ARCHITECTURE-STATE.md |
| 实验性功能 | 功能开关 · 音区边界 · 算法参数 · 实时功能 · 导入音频 · GitHub 备份 | 算法参数 13 项见 PARAMETERS-GUIDE.md |

## 文案规范

设置项标签 / 说明一律走 i18n（`t('settings.xxx')`）；组合键名、单位（Hz、px）
等不译内容直接内联。新增说明超过一行时用 InfoTip 而非 `desc`。
