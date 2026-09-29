/**
 * 莫奈取色主题系统
 * 参考 Google Material 3 / Monet 动态取色思路：
 * 由一个种子色相（hue）在 OKLCH 色彩空间中生成一套色调和谐、
 * 明度分层（surface / container / on-color）完整的浅色色板。
 *
 * 每个色板颜色写入两个 CSS 变量：
 *   --c-x      完整 oklch 颜色字符串（Canvas / color-mix 使用）
 *   --c-x-rgb  "r g b" 三元组（Tailwind 颜色 / 透明度修饰符使用）
 */

/** 生成一个 oklch 颜色字符串 */
const ok = (l: number, c: number, h: number) =>
  `oklch(${l} ${c} ${((h % 360) + 360) % 360}`;

/**
 * OKLCH → sRGB（0-255 三元组字符串）
 * 标准 Björn Ottosson 转换矩阵
 */
export function oklchToRgbTriplet(l: number, c: number, h: number): string {
  const hr = ((h % 360) + 360) % 360 * (Math.PI / 180);
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lo = l_ ** 3, mo = m_ ** 3, so = s_ ** 3;

  let r = 4.0767416621 * lo - 3.3077115913 * mo + 0.2309699292 * so;
  let g = -1.2684380046 * lo + 2.6097574011 * mo - 0.3413193965 * so;
  let bl = -0.0041960863 * lo - 0.7034186147 * mo + 1.707614701 * so;

  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const to8 = (x: number) => Math.round(Math.max(0, Math.min(1, gamma(x))) * 255);

  r = to8(r); g = to8(g); bl = to8(bl);
  return `${r} ${g} ${bl}`;
}

/** 色板令牌：[oklch 字符串, rgb 三元组] */
function token(l: number, c: number, h: number): [string, string] {
  return [ok(l, c, h), oklchToRgbTriplet(l, c, h)];
}

/**
 * 由种子色相生成全套色板令牌
 */
export function buildTokens(hue: number): Record<string, string> {
  const h2 = hue + 70; // 次强调色相（类比 M3 的 tertiary）
  const out: Record<string, string> = {};
  const set = (name: string, [o, rgb]: [string, string]) => {
    out[`--c-${name}`] = o;
    out[`--c-${name}-rgb`] = rgb;
  };

  // 页面背景与容器（微色差分层）
  set('surface', token(0.968, 0.010, hue));
  set('card', token(0.995, 0.005, hue));
  set('surface-hi', token(0.945, 0.016, hue));
  // 文字
  set('ink', token(0.27, 0.025, hue));
  set('ink-2', token(0.52, 0.022, hue));
  // 主强调色
  set('accent', token(0.50, 0.155, hue));
  set('on-accent', token(0.99, 0.008, hue));
  set('accent-soft', token(0.905, 0.055, hue));
  set('on-accent-soft', token(0.36, 0.09, hue));
  // 次强调色
  set('accent2', token(0.55, 0.13, h2));
  set('accent2-soft', token(0.91, 0.05, h2));
  set('on-accent2-soft', token(0.36, 0.08, h2));
  // 分隔线（极淡）
  set('line', token(0.915, 0.012, hue));
  return out;
}

/**
 * 将色板应用到文档根元素
 * @param hue 种子色相 0-360
 */
export function applyTheme(hue: number): void {
  const style = document.documentElement.style;
  const tokens = buildTokens(hue);
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(key, value);
  }
  // 通知 Canvas 图表刷新调色板缓存
  window.dispatchEvent(new CustomEvent('app:themechange'));
}
