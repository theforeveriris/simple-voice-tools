/**
 * 莫奈取色主题系统
 * 参考 Google Material 3 / Monet 动态取色思路：
 * 由一个种子色相（hue）在 OKLCH 色彩空间中生成一套色调和谐、
 * 明度分层（surface / container / on-color）完整的色板，支持浅色 / 深色两套。
 *
 * 每个色板颜色写入两个 CSS 变量：
 *   --c-x      完整 oklch 颜色字符串（Canvas / color-mix 使用）
 *   --c-x-rgb  "r g b" 三元组（Tailwind 颜色 / 透明度修饰符使用）
 * 同时派生 shadcn/radix 组件消费的传统 HSL 语义变量（--background 等），
 * 使深色模式下基础组件自动跟随。
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

/** OKLCH → RGB（0-255 数值数组） */
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const parts = oklchToRgbTriplet(l, c, h).split(' ').map(Number);
  return [parts[0], parts[1], parts[2]];
}

/** RGB（0-255）→ "H S% L%" HSL 三元组字符串（shadcn 语义变量格式） */
function rgbToHslTriplet(r: number, g: number, b: number): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue: number;
  if (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) hue = (bn - rn) / d + 2;
  else hue = (rn - gn) / d + 4;
  hue *= 60;
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** 色板令牌：[oklch 字符串, rgb 三元组] */
function token(l: number, c: number, h: number): [string, string] {
  return [ok(l, c, h), oklchToRgbTriplet(l, c, h)];
}

/** 深浅两套明度/饱和度参数：[light(l,c), dark(l,c)]。as const 使 pick 的键检查可穷举 */
const SCALE = {
  // 页面背景与容器（微色差分层）
  'surface': [[0.968, 0.010], [0.165, 0.012]],
  'card': [[0.995, 0.005], [0.205, 0.014]],
  'surface-hi': [[0.945, 0.016], [0.250, 0.018]],
  // 文字
  'ink': [[0.27, 0.025], [0.92, 0.012]],
  'ink-2': [[0.52, 0.022], [0.70, 0.014]],
  // 主强调色（深色模式提亮以保证对比度）
  'accent': [[0.50, 0.155], [0.74, 0.13]],
  'on-accent': [[0.99, 0.008], [0.16, 0.02]],
  'accent-soft': [[0.905, 0.055], [0.30, 0.055]],
  'on-accent-soft': [[0.36, 0.09], [0.90, 0.045]],
  // 分隔线（极淡）
  'line': [[0.915, 0.012], [0.28, 0.012]],
} as const;

type ScaleKey = keyof typeof SCALE;

/**
 * 由种子色相生成全套色板令牌（含浅色/深色两组语义）
 */
export function buildTokens(hue: number, dark = false): Record<string, string> {
  const h2 = hue + 70; // 次强调色相（类比 M3 的 tertiary）
  const out: Record<string, string> = {};
  const pick = (name: ScaleKey): readonly [number, number] => {
    const [light, darkV] = SCALE[name];
    return dark ? darkV : light;
  };
  const set = (name: string, [o, rgb]: [string, string]) => {
    out[`--c-${name}`] = o;
    out[`--c-${name}-rgb`] = rgb;
  };

  // 注意：列表里的每个名字必须存在于 SCALE（pick 参数为 ScaleKey，缺键会编译报错）
  for (const name of ['surface', 'card', 'surface-hi', 'ink', 'ink-2', 'accent', 'on-accent', 'accent-soft', 'on-accent-soft', 'line'] as const) {
    const [l, c] = pick(name);
    set(name, token(l, c, hue));
  }
  // 次强调色
  set('accent2', token(dark ? 0.77 : 0.55, dark ? 0.11 : 0.13, h2));
  set('accent2-soft', token(dark ? 0.31 : 0.91, dark ? 0.05 : 0.05, h2));
  set('on-accent2-soft', token(dark ? 0.90 : 0.36, dark ? 0.04 : 0.08, h2));

  // 派生 shadcn/radix 传统语义变量（HSL 三元组），基础组件跟随深浅模式
  const hsl = (name: ScaleKey) => {
    const [l, c] = pick(name);
    return rgbToHslTriplet(...oklchToRgb(l, c, hue));
  };
  const cardHsl = hsl('card');
  const inkHsl = hsl('ink');
  const surfaceHsl = hsl('surface');
  const surfaceHiHsl = hsl('surface-hi');
  const ink2Hsl = hsl('ink-2');
  out['--background'] = surfaceHsl;
  out['--foreground'] = inkHsl;
  out['--card'] = cardHsl;
  out['--card-foreground'] = inkHsl;
  out['--popover'] = cardHsl;
  out['--popover-foreground'] = inkHsl;
  out['--primary'] = inkHsl;
  out['--primary-foreground'] = cardHsl;
  out['--secondary'] = surfaceHiHsl;
  out['--secondary-foreground'] = inkHsl;
  out['--muted'] = surfaceHiHsl;
  out['--muted-foreground'] = ink2Hsl;
  out['--accent'] = surfaceHiHsl;
  out['--accent-foreground'] = inkHsl;
  out['--destructive'] = '0 72% 51%';
  out['--destructive-foreground'] = '0 0% 100%';
  out['--border'] = hsl('line');
  out['--input'] = hsl('line');
  out['--ring'] = inkHsl;
  return out;
}

/** 是否跟随系统深色（供 main.tsx 首帧判断） */
export function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 将色板应用到文档根元素
 * @param hue 种子色相 0-360
 * @param dark 深色模式
 */
export function applyTheme(hue: number, dark = false): void {
  const style = document.documentElement.style;
  const tokens = buildTokens(hue, dark);
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(key, value);
  }
  // 原生控件 / 滚动条跟随深浅
  style.colorScheme = dark ? 'dark' : 'light';
  // 浏览器地址栏 / 状态栏颜色同步
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const rgb = tokens['--c-surface-rgb'];
    meta.setAttribute('content', `rgb(${rgb.split(' ').join(',')})`);
  }
  // 通知 Canvas 图表刷新调色板缓存
  window.dispatchEvent(new CustomEvent('app:themechange'));
}
