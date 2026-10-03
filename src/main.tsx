import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, prefersDark, presetSpec } from '@/lib/theme/monet'
import { loadBgImage } from '@/lib/theme/bgImage'
import { initPwaInstall } from '@/lib/pwa'
import { isNative } from '@/lib/platform'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useStore } from '@/store/useStore'
import { setLocale, DEFAULT_LOCALE } from '@/i18n'
import { hydrateAiLocale } from '@/i18n/aiLocale'
import type { Locale, ThemeMode } from '@/types'

// 渲染前先应用持久化的主题色板与深浅模式，避免首帧闪烁
const saved = (() => {
  try {
    const raw = localStorage.getItem('svt:settings:v1');
    const parsed = raw ? (JSON.parse(raw) as { state?: { settings?: { hue?: number; accentHue?: number; darkHue?: number; theme?: ThemeMode; language?: Locale; huePreset?: string; prideFlag?: string; aiLanguage?: string } } }) : null;
    return parsed?.state?.settings ?? {};
  } catch {
    return {};
  }
})();
const dark = saved.theme === 'dark'
  || ((saved.theme ?? 'system') === 'system' && prefersDark());
// 旧版旗帜直接作为预设存储：收敛为 pride 预设（与 useStore 的迁移同一规则）
const LEGACY_FLAGS = ['transPride', 'nonbinary', 'genderfluid'];
const isLegacyFlag = LEGACY_FLAGS.includes(saved.huePreset ?? '');
const savedPreset = presetSpec(
  isLegacyFlag ? 'pride' : saved.huePreset,
  saved.hue ?? 15,
  isLegacyFlag ? saved.huePreset : saved.prideFlag,
  saved.accentHue ?? saved.hue ?? 15,
  saved.darkHue ?? saved.hue ?? 15,
);
applyTheme(savedPreset.hue, dark, savedPreset.accentHue, savedPreset.spec, savedPrideFlagOf(saved, isLegacyFlag))

/** 迁移后的旗帜：旧预设值优先，其次已存的 prideFlag */
function savedPrideFlagOf(saved: { huePreset?: string; prideFlag?: string }, isLegacyFlag: boolean): string {
  return (isLegacyFlag ? saved.huePreset : saved.prideFlag) ?? 'transPride';
}

/** 首次启动：按浏览器语言匹配内置语言（匹配不上回退英文默认） */
function detectBrowserLocale(): Locale {
  const langs: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const tag = raw.toLowerCase();
    if (tag === 'zh-cn' || tag === 'zh-hans') return 'zh-CN';
    if (tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-mo' || tag === 'zh-hant') return 'zh-TW';
    if (tag.startsWith('ja')) return 'ja';
  }
  if (langs.some((l) => l.toLowerCase().startsWith('zh'))) return 'zh-CN';
  return DEFAULT_LOCALE;
}

// 首次启动（无保存设置）跟随浏览器语言；老用户与已显式选择的语言不受影响
if (!localStorage.getItem('svt:settings:v1')) {
  const detected = detectBrowserLocale();
  if (detected !== DEFAULT_LOCALE) {
    useStore.getState().updateSettings({ language: detected });
  }
  setLocale(detected);
} else if (saved.language === 'ai' && saved.aiLanguage && hydrateAiLocale(saved.aiLanguage)) {
  setLocale('ai')
} else {
  setLocale(saved.language ?? DEFAULT_LOCALE)
}

// PWA：捕获安装事件（原生壳内无 Web 安装流程，跳过）
if (!isNative) initPwaInstall()

// Service Worker：vite-plugin-pwa 的注入已在构建配置关闭（injectRegister: 'null'），
// 改为手动注册——原生壳内无 SW 支持，跳过注册以避免壳内命中陈旧缓存
if (!isNative) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

// 背景图片异步预加载：读取 IndexedDB 后经 opacity 过渡淡入，不阻塞首帧
void loadBgImage()

// 加载 IndexedDB 中的历史记录（含旧版 localStorage 迁移），完成后自动刷新界面
void useHistoryStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
