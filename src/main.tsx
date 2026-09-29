import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme } from '@/lib/theme/monet'
import { initPwaInstall } from '@/lib/pwa'

// 渲染前先应用主题色板，避免首帧闪烁
applyTheme(15)

// PWA：捕获安装事件（Service Worker 由 vite-plugin-pwa 注入注册）
initPwaInstall()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
