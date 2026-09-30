import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme } from '@/lib/theme/monet'
import { initPwaInstall } from '@/lib/pwa'
import { useHistoryStore } from '@/store/useHistoryStore'

// 渲染前先应用持久化的主题色板，避免首帧闪烁
const savedHue = (() => {
  try {
    const raw = localStorage.getItem('svt:settings:v1');
    const parsed = raw ? (JSON.parse(raw) as { state?: { settings?: { hue?: number } } }) : null;
    return parsed?.state?.settings?.hue ?? 15;
  } catch {
    return 15;
  }
})();
applyTheme(savedHue)

// PWA：捕获安装事件（Service Worker 由 vite-plugin-pwa 注入注册）
initPwaInstall()

// 加载 IndexedDB 中的历史记录（含旧版 localStorage 迁移），完成后自动刷新界面
void useHistoryStore.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
