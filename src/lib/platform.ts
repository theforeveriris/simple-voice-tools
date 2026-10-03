/**
 * 平台判定与原生桥（Capacitor 安卓壳，见 documentation/GUIDE-CAPACITOR.md）
 * 浏览器 PWA 中 isNative 恒为 false，所有平台分支都保持原 Web 行为；
 * 原生壳内的差异：无 Service Worker（SW 注册/检查更新跳过）、
 * 「分享到」走 ShareTarget 插件（壳内无 SW，PWA 的 POST share target 不可用）。
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

/** 是否运行在原生壳内（Android WebView） */
export const isNative = Capacitor.isNativePlatform();

/* ------------------------------ 原生「分享到」接收 ------------------------------ */

/** 原生侧拷入缓存目录的分享文件 */
export interface SharedNativeFile {
  path: string;
  name: string;
}

/** 一批分享（SEND 单个 / SEND_MULTIPLE 多个） */
export interface ShareTargetBatch {
  files: SharedNativeFile[];
}

interface ShareTargetPluginInterface {
  /**
   * 握手：返回并清空积压的分享批次，插件转入事件推送模式。
   * 调用顺序约定：先 addListener('shareTargetReceived')，再 start()，最后处理返回的批次
   */
  start(): Promise<{ batches: ShareTargetBatch[] }>;
  addListener(
    eventName: 'shareTargetReceived',
    listener: (data: ShareTargetBatch) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** 仅原生壳内可用；Web 端调用其方法会 reject，调用方须以 isNative 分流 */
export const ShareTarget = registerPlugin<ShareTargetPluginInterface>('ShareTarget');

/* ------------------------------ 系统栏配色跟随主题 ------------------------------ */

interface SystemBarsPluginInterface {
  /** color = 系统栏区域底色（#RRGGBB）；dark = 底色偏深（图标转亮色） */
  setColors(opts: { color: string; dark: boolean }): Promise<void>;
}

/** 仅原生壳内可用 */
export const SystemBars = registerPlugin<SystemBarsPluginInterface>('SystemBars');

/** 从 CSS 颜色串取亮度（0-255）；解析失败返回 null */
function luminanceOf(cssColor: string): number | null {
  const m = cssColor.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return null;
  // 相对亮度近似（人眼权重），足够判断图标明暗
  return 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
}

/**
 * 把当前主题底色同步到安卓系统栏（状态栏 + 手势条区域）。
 * 读 body 的计算背景（莫奈动态色板 / 深色模式 / 骄傲旗渐变下的取色）；
 * 透明或解析失败时逐级回退 html 背景、应用默认底色。
 * 在主题应用处调用（main.tsx 首帧 + App 主题变化 effect）。
 */
export function syncNativeSystemBars(): void {
  if (!isNative) return;
  try {
    const cs = getComputedStyle(document.body);
    let css = cs.backgroundColor;
    if (luminanceOf(css) == null) css = getComputedStyle(document.documentElement).backgroundColor;
    // 主题背景是渐变/自定义图片时计算值可能为 transparent，此时状态栏取暗或亮的中性近似
    const lum = luminanceOf(css);
    const color = lum != null
      ? (() => {
          const m = css.match(/(\d+)/g)!;
          return `#${m.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
        })()
      : '#FBF2F2';
    const dark = lum != null ? lum < 128 : false;
    void SystemBars.setColors({ color, dark }).catch(() => {});
  } catch {
    // 系统栏配色属锦上添花：任何环境异常（如 DOM 未就绪）都静默跳过
  }
}
