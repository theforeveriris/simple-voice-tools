/**
 * PWA 安装支持
 * 捕获 beforeinstallprompt 延迟展示安装入口（设置页"安装为桌面应用"），
 * 追踪 standalone 运行状态。Service Worker 由 vite-plugin-pwa 注册与更新。
 */

import { useEffect, useState } from 'react';
import { t } from '@/i18n';

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
  import('sonner').then(({ toast }) => toast.success(t('toast.installSuccess')));
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

/* ------------------------------ 检查更新 ------------------------------ */

export type UpdateCheckResult = 'unavailable' | 'latest' | 'found';

/** Service Worker 状态（设置 → 应用 → 运行状态） */
export type SwStatus = 'unsupported' | 'none' | 'installing' | 'waiting' | 'active';

/** 读取当前 Service Worker 状态 */
export async function getServiceWorkerStatus(): Promise<SwStatus> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'none';
  if (reg.waiting) return 'waiting';
  if (reg.installing) return 'installing';
  return 'active';
}

/** 持久化存储是否已授予（配额不被浏览器自动回收） */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return await navigator.storage?.persisted?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * 修复工具：删除全部缓存并注销 Service Worker，随后由调用方 reload。
 * 录音记录与音频在 IndexedDB，不受影响
 */
export async function resetAppRuntime(): Promise<void> {
  try {
    if ('caches' in window) {
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
    }
  } catch {
    /* 尽力而为：失败也继续刷新 */
  }
}

/**
 * 手动触发 Service Worker 更新检查（设置 → 应用 → 检查更新）。
 * - 无 SW 注册（本地开发 / 不支持 / 未部署 HTTPS）→ 'unavailable'
 * - 轮询 ~2.4s 未发现新版本（registerType autoUpdate 下 skipWaiting
 *   会让新 SW 装完即激活）→ 'latest'
 * - 发现新 SW（installing / waiting）→ 等其激活后自动刷新页面 → 'found'
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!('serviceWorker' in navigator)) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unavailable';
  await reg.update();

  const hasNewWorker = () => !!(reg.installing || reg.waiting);
  const start = Date.now();
  while (Date.now() - start < 2400) {
    if (hasNewWorker()) {
      // 新 SW 激活并接管页面（controllerchange）后刷新，超时兜底直接刷
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      window.location.reload();
      return 'found';
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return 'latest';
}
