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
