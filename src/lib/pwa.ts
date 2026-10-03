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
 * 手动触发更新检查（设置 → 应用 → 检查更新）。
 * 先比对「页面正在运行的构建」与「线上部署的构建」（version.json 的 builtAt
 * 时间戳）——autoUpdate（skipWaiting + clientsClaim）下新 SW 部署后几秒内就会
 * 装完激活，只轮询 installing / waiting 工作器永远撞不上瞬态，会误报「已是最新」。
 * - 无 SW 注册（本地开发 / 不支持 / 未部署 HTTPS）或线上构建信息拉取失败 → 'unavailable'
 * - builtAt 相同（页面运行的就是线上最新构建）→ 'latest'
 * - 确有新构建：触发 SW 更新，等新工作器激活接管页面（或 8s 兜底）后刷新 → 'found'
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!('serviceWorker' in navigator)) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unavailable';

  const deployed = await fetchDeployedVersion(reg);
  if (!deployed) return 'unavailable';
  if (deployed.builtAt === __BUILD_AT__) return 'latest';

  // 线上确有新构建：触发 SW 更新，等它接管页面后刷新。
  // controllerchange 必须在轮询前挂好——新工作器激活可能比轮询间隔更快；
  // 超时兜底也直接刷新：导航本身会再触发一次更新检查，最多多按一次
  const prevController = navigator.serviceWorker.controller;
  const takenOver = () => {
    const cur = navigator.serviceWorker.controller;
    return !!cur && cur !== prevController;
  };
  void reg.update();
  await new Promise<void>((resolve) => {
    const deadline = setTimeout(resolve, 8000);
    const tick = setInterval(() => {
      if (takenOver()) {
        clearInterval(tick);
        clearTimeout(deadline);
        resolve();
      }
    }, 250);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (takenOver()) {
          clearInterval(tick);
          clearTimeout(deadline);
          resolve();
        }
      },
      { once: true },
    );
  });
  window.location.reload();
  return 'found';
}

interface DeployedVersion {
  version: string;
  builtAt: number;
}

/**
 * 拉取线上构建信息（vite 构建产出的 version.json，不在 SW 预缓存清单内；
 * no-store + 时间戳参数双保险绕过 HTTP 缓存与 Service Worker 透传）
 * @returns 解析失败 / 离线时 null（调用方报「无法检查」）
 */
async function fetchDeployedVersion(reg: ServiceWorkerRegistration): Promise<DeployedVersion | null> {
  try {
    // 相对 SW 脚本 URL 解析：应用部署在任意子路径下都能定位到同目录的 version.json
    const swUrl = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? reg.installing?.scriptURL;
    const url = new URL('version.json', swUrl ?? document.baseURI);
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DeployedVersion>;
    return typeof data.builtAt === 'number' && isFinite(data.builtAt)
      ? { version: typeof data.version === 'string' ? data.version : '', builtAt: data.builtAt }
      : null;
  } catch {
    return null;
  }
}
