/**
 * 「莫奈取色」首启默认 = 壁纸色（Material You）
 * 原生壳内读取系统壁纸的主/次/三色（SystemBars.wallpaperColors，API 27+），
 * 转成 HSL 色相写入莫奈三滑条（主/强调/深色）作为首启默认值——
 * 此后配色与手动调色完全同轨（用户滑条可改），不作为独立预设存在。
 * 浏览器中恒返回 null（保持原默认色相）。
 */

import { isNative, SystemBars } from '@/lib/platform';

export interface WallpaperHues {
  hue: number;
  accentHue: number;
  darkHue: number;
}

/** #RRGGBB → HSL 色相（0-360）；解析失败或无彩色（纯灰）返回 null */
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

/**
 * 解析壁纸三色的色相。主色不可用（纯灰 / 无壁纸信息 / 非原生）返回 null，
 * 调用方（main.tsx 首启）保持默认色相不变。
 */
export async function getWallpaperHues(): Promise<WallpaperHues | null> {
  if (!isNative) return null;
  try {
    const r = await SystemBars.wallpaperColors();
    const primaryHue = r?.primary ? hexHue(r.primary) : null;
    if (primaryHue == null) return null;
    return {
      hue: primaryHue,
      accentHue: (r?.secondary ? hexHue(r.secondary) : null) ?? primaryHue,
      darkHue: (r?.tertiary ? hexHue(r.tertiary) : null) ?? primaryHue,
    };
  } catch {
    return null;
  }
}
