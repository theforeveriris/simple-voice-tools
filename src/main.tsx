import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, prefersDark, presetSpec } from '@/lib/theme/monet'
import { initPwaInstall } from '@/lib/pwa'
import { useHistoryStore } from '@/store/useHistoryStore'
import { setLocale } from '@/i18n'
import { hydrateAiLocale } from '@/i18n/aiLocale'
import type { Locale, ThemeMode } from '@/types'

// 渲染前先应用持久化的主题色板与深浅模式，避免首帧闪烁
const saved = (() => {
  try {
    const raw = localStorage.getItem('svt:settings:v1');
    const parsed = raw ? (JSON.parse(raw) as { state?: { settings?: { hue?: number; theme?: ThemeMode; language?: Locale; huePreset?: string; prideFlag?: string; aiLanguage?: string } } }) : null;
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
);
applyTheme(savedPreset.hue, dark, savedPreset.accentHue, savedPreset.spec, savedPrideFlagOf(saved, isLegacyFlag))

/** 迁移后的旗帜：旧预设值优先，其次已存的 prideFlag */
function savedPrideFlagOf(saved: { huePreset?: string; prideFlag?: string }, isLegacyFlag: boolean): string {
  return (isLegacyFlag ? saved.huePreset : saved.prideFlag) ?? 'transPride';
}
// 无保存语言时用默认英文（同步 <html lang> 与词典）；AI 语言需先注册缓存词典
if (saved.language === 'ai' && saved.aiLanguage && hydrateAiLocale(saved.aiLanguage)) {
  setLocale('ai')
} else {
  setLocale(saved.language ?? 'en')
}

// PWA：捕获安装事件（Service Worker 由 vite-plugin-pwa 注入注册）
initPwaInstall()

// 加载 IndexedDB 中的历史记录（含旧版 localStorage 迁移），完成后自动刷新界面
void useHistoryStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
