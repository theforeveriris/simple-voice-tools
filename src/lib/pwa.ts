/**
 * PWA 安装支持
 * 捕获 beforeinstallprompt 延迟展示安装入口（设置页"安装为桌面应用"），
 * 追踪 standalone 运行状态。Service Worker 由 vite-plugin-pwa 注册与更新。
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 的私有属性
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** 触发浏览器安装弹窗（仅在 beforeinstallprompt 已捕获时可用） */
export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') {
    toastInstallAccepted();
  }
  return outcome;
}

function toastInstallAccepted(): void {
  // 延迟动态 import，避免 pwa.ts 在应用启动路径上引入 sonner 副作用
  import('sonner').then(({ toast }) => toast.success('安装成功，可从桌面或主屏幕打开'));
}

/** 初始化事件监听（main.tsx 调用一次） */
export function initPwaInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
  // 从浏览器安装成功后 standalone 状态变化时刷新 UI
  window.matchMedia('(display-mode: standalone)').addEventListener('change', emit);
}

/** React 订阅钩子 */
export function usePwaInstall(): { canInstall: boolean; standalone: boolean } {
  const [state, setState] = useState({ canInstall: canInstall(), standalone: isStandalone() });
  useEffect(() => {
    const update = () => setState({ canInstall: canInstall(), standalone: isStandalone() });
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}
