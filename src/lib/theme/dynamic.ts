/**
 * 「跟随壁纸」动态取色（Material You）
 * 原生壳内读取系统壁纸的主/次/三色（SystemBars.wallpaperColors，API 27+），
 * 把三个色相映射进应用的莫奈色板（主色相 / 强调色相 / 深色色相）。
 * 结果按会话缓存；壁纸变化后由调用方在应用回前台时 force 刷新。
 * 浏览器中恒返回 null（该预设仅原生壳内可选）。
 */

import { isNative, SystemBars } from '@/lib/platform';

export interface DynamicHues {
  hue: number;
  accentHue: number;
  darkHue: number;
}

let cache: DynamicHues | null = null;

/** #RRGGBB → HSL 色相（0-360）；解析失败或无彩色返回 null */
export function hexHue(hex: string): number | null {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const r = ((v >> 16) & 0xff) / 255;
  const g = ((v >> 8) & 0xff) / 255;
  const b = (v & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null; // 无彩色，色相不可靠
  const d = max - min;
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = Math.round(hue * 60);
  return hue < 0 ? hue + 360 : hue;
}

/** 当前缓存的壁纸色相（未解析时 null，供设置页色卡即时展示） */
export function cachedDynamicHues(): DynamicHues | null {
  return cache;
}

/**
 * 解析壁纸色相（会话缓存；force = 跳过缓存重新读取，用于回到前台刷新）。
 * 主色不可用（低饱和 / 无壁纸信息 / 非原生）返回 null，调用方回退默认配色。
 */
export async function getWallpaperHues(force = false): Promise<DynamicHues | null> {
  if (!isNative) return null;
  if (!force && cache) return cache;
  try {
    const r = await SystemBars.wallpaperColors();
    const primaryHue = r?.primary ? hexHue(r.primary) : null;
    if (primaryHue == null) {
      cache = null;
      return null;
    }
    const accentHue = (r?.secondary ? hexHue(r.secondary) : null) ?? primaryHue;
    const darkHue = (r?.tertiary ? hexHue(r.tertiary) : null) ?? primaryHue;
    cache = { hue: primaryHue, accentHue, darkHue };
    return cache;
  } catch {
    return null;
  }
}
