import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, prefersDark, presetSpec } from '@/lib/theme/monet'
import { initPwaInstall } from '@/lib/pwa'
import { useHistoryStore } from '@/store/useHistoryStore'
import { setLocale } from '@/i18n'
import type { Locale, ThemeMode } from '@/types'

// 渲染前先应用持久化的主题色板与深浅模式，避免首帧闪烁
const saved = (() => {
  try {
    const raw = localStorage.getItem('svt:settings:v1');
    const parsed = raw ? (JSON.parse(raw) as { state?: { settings?: { hue?: number; theme?: ThemeMode; language?: Locale; huePreset?: string } } }) : null;
    return parsed?.state?.settings ?? {};
  } catch {
    return {};
  }
})();
const dark = saved.theme === 'dark'
  || ((saved.theme ?? 'system') === 'system' && prefersDark());
const savedPreset = presetSpec(saved.huePreset, saved.hue ?? 15);
applyTheme(savedPreset.hue, dark, savedPreset.accentHue, savedPreset.spec)
if (saved.language) setLocale(saved.language)

// PWA：捕获安装事件（Service Worker 由 vite-plugin-pwa 注入注册）
initPwaInstall()

// 加载 IndexedDB 中的历史记录（含旧版 localStorage 迁移），完成后自动刷新界面
void useHistoryStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
