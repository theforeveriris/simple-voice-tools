/**
 * 共振峰（Formant）提取
 * 语音分析的标准信号链：
 *   预加重 → 抗混叠低通 + 4x 抽取 → 加窗 → 自相关 →
 *   Levinson-Durbin 求 LPC 系数 → 多项式求根（Durand-Kerner）→
 *   由单位圆内根的辐角/模长换算共振峰频率与带宽。
 */

export interface FormantEstimate {
  f1: number | null;
  f2: number | null;
}

/** 抽取倍数：44.1kHz → 约11kHz，足以覆盖 F3 以下频段 */
const DECIMATION = 4;
/** LPC 阶数基准：约 2 + fs/1000 */
const lpcOrder = (fs: number) => 2 + Math.round(fs / 1000);

/**
 * RBJ 双二阶低通滤波器（用于抽取前抗混叠）
 */
function lowPassBiquad(samples: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT2); // Q = 0.707 (Butterworth)
  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  // 归一化
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0;

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    out[i] = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = out[i];
  }
  return out;
}

/**
 * Levinson-Durbin 算法：由自相关序列求 LPC 系数
 * @returns LPC 系数 a[1..order]（a[0] 恒为 1，未包含）
 */
function levinsonDurbin(r: Float64Array, order: number): Float64Array | null {
  const a = new Float64Array(order + 1);
  if (r[0] <= 1e-9) return null;

  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc -= a[j] * r[i - j];
    const k = acc / r[0];
    // 反射系数 |k| >= 1 说明帧不稳定，放弃
    if (Math.abs(k) >= 1) return null;

    // 时间反转更新
    const half = (i - 1) >> 1;
    for (let j = 1; j <= half; j++) {
      const aj = a[j];
      const aim = a[i - j];
      a[j] = aj - k * aim;
      a[i - j] = aim - k * aj;
    }
    if ((i - 1) % 2 === 0) {
      const j = half + 1;
      a[j] = a[j] - k * a[j];
    }
    a[i] = k;
  }
  return a.subarray(1); // 去掉 a[0]
}

/**
 * Durand-Kerner（Weierstrass）法求多项式全部复根
 * 多项式：z^N + c1 z^(N-1) + ... + cN（首一）
 */
function polyRoots(c: Float64Array | Float32Array): { re: number; im: number }[] {
  const N = c.length;
  // 初始化根：w^i，w = 0.4 + 0.9i
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const wRe = 0.4, wIm = 0.9;
  re[0] = 1; im[0] = 0;
  for (let i = 1; i < N; i++) {
    re[i] = re[i - 1] * wRe - im[i - 1] * wIm;
    im[i] = re[i - 1] * wIm + im[i - 1] * wRe;
  }

  const pRe = new Float64Array(N + 1);
  const pIm = new Float64Array(N + 1);
  pRe[0] = 1;
  for (let k = 1; k <= N; k++) pRe[k] = -c[k - 1]; // A(z) = 1 - a1 z - ... - aN z^N

  for (let iter = 0; iter < 60; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < N; i++) {
      // Horner 求 p(z_i)
      let hRe = pRe[0], hIm = pIm[0];
      for (let k = 1; k <= N; k++) {
        const nRe = hRe * re[i] - hIm * im[i] + pRe[k];
        const nIm = hRe * im[i] + hIm * re[i] + pIm[k];
        hRe = nRe; hIm = nIm;
      }
      // 分母 ∏_{j≠i} (z_i - z_j)
      let dRe = 1, dIm = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const sRe = re[i] - re[j];
        const sIm = im[i] - im[j];
        const nRe = dRe * sRe - dIm * sIm;
        const nIm = dRe * sIm + dIm * sRe;
        dRe = nRe; dIm = nIm;
      }
      const denom = dRe * dRe + dIm * dIm;
      if (denom < 1e-12) continue;
      const qRe = (hRe * dRe + hIm * dIm) / denom;
      const qIm = (hIm * dRe - hRe * dIm) / denom;
      re[i] -= qRe; im[i] -= qIm;
      const delta = Math.hypot(qRe, qIm);
      if (delta > maxDelta) maxDelta = delta;
    }
    if (maxDelta < 1e-10) break;
  }

  const roots: { re: number; im: number }[] = [];
  for (let i = 0; i < N; i++) roots.push({ re: re[i], im: im[i] });
  return roots;
}

/**
 * 从一帧时域信号提取 F1 / F2
 * @param samples 时域帧（建议 2048 样本 @ 44.1kHz）
 * @param sampleRate 采样率
 * @param rms 当前帧 RMS dB（用于静音门限）
 * @returns F1/F2，未检出时为 null
 */
export function extractFormants(
  samples: Float32Array,
  sampleRate: number,
  rms: number,
): FormantEstimate {
  // 静音门限：能量太低时 LPC 不稳定
  if (rms < -52) return { f1: null, f2: null };

  // 1. 预加重（提升高频，抵消声道辐射特性）
  const pre = new Float32Array(samples.length);
  pre[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    pre[i] = samples[i] - 0.97 * samples[i - 1];
  }

  // 2. 抗混叠低通 + 4x 抽取
  const fs2 = sampleRate / DECIMATION;
  const lpCut = Math.min(4500, fs2 * 0.42);
  const filtered = lowPassBiquad(pre, sampleRate, lpCut);
  const n2 = Math.floor(filtered.length / DECIMATION);
  const dec = new Float32Array(n2);
  for (let i = 0; i < n2; i++) dec[i] = filtered[i * DECIMATION];
  if (n2 < 128) return { f1: null, f2: null };

  // 3. 归一化 + 汉明窗
  let maxAbs = 0;
  for (let i = 0; i < n2; i++) maxAbs = Math.max(maxAbs, Math.abs(dec[i]));
  if (maxAbs < 1e-5) return { f1: null, f2: null };
  const norm = 1 / maxAbs;
  const win = new Float64Array(n2);
  for (let i = 0; i < n2; i++) {
    win[i] = dec[i] * norm * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n2 - 1)));
  }

  // 4. 自相关
  const order = Math.min(lpcOrder(fs2), n2 >> 2);
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < n2 - k; i++) sum += win[i] * win[i + k];
    r[k] = sum;
  }

  // 5. LPC 系数
  const lpc = levinsonDurbin(r, order);
  if (!lpc) return { f1: null, f2: null };

  // 6. 多项式求根
  const roots = polyRoots(lpc);

  // 7. 单位圆内根 → 共振峰候选
  const candidates: { freq: number; bw: number }[] = [];
  for (const root of roots) {
    const mag = Math.hypot(root.re, root.im);
    if (mag >= 1 || mag < 1e-6) continue;
    const freq = (Math.atan2(root.im, root.re) * fs2) / (2 * Math.PI);
    const bw = (-Math.log(mag) * fs2) / Math.PI;
    if (freq >= 150 && freq <= 4800 && bw < 700) {
      candidates.push({ freq, bw });
    }
  }
  candidates.sort((a, b) => a.freq - b.freq);

  // 8. 挑选 F1 / F2
  let f1: number | null = null;
  let f2: number | null = null;
  const f1Cand = candidates.find((c) => c.freq >= 200 && c.freq <= 1100);
  if (f1Cand) {
    f1 = f1Cand.freq;
    const f2Cand = candidates.find((c) => c.freq >= Math.max(f1! + 150, 700) && c.freq <= 3400);
    f2 = f2Cand ? f2Cand.freq : null;
  }
  return { f1, f2 };
}
