import { describe, it, expect, beforeEach } from 'vitest';
import { computeSpectralVoice } from './spectralVoice';
import { setAlgoParams, ALGO_PARAM_DEFAULTS } from './algoParams';

const FS = 32000;

/**
 * 合成谐波信号：给定各次谐波的相对幅度（下标 1 = 基频）
 * amp[1] 起有效，未给的谐波幅度为 0
 */
function harmonics(f0: number, amps: number[], sec = 1.5, noise = 0): Float32Array {
  const n = Math.round(sec * FS);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 1; k < amps.length; k++) v += amps[k] * Math.sin((2 * Math.PI * k * f0 * i) / FS);
    if (noise) v += noise * (Math.random() * 2 - 1);
    // 轻微包络，避免起止瞬态
    out[i] = v * (0.6 + 0.4 * Math.sin((2 * Math.PI * 2 * i) / n));
  }
  return out;
}

beforeEach(() => {
  setAlgoParams({ ...ALGO_PARAM_DEFAULTS });
});

describe('computeSpectralVoice', () => {
  it('H1–H2 与预设谐波幅度比一致（约 6 dB）', () => {
    // a1=0.5, a2=0.25 → H1−H2 ≈ 20log10(2) ≈ 6.02 dB
    const pcm = harmonics(200, [0, 0.5, 0.25, 0.1, 0.12]);
    const v = computeSpectralVoice(pcm, FS);
    expect(v.h1h2Db).not.toBeNull();
    expect(Math.abs((v.h1h2Db as number) - 6.0)).toBeLessThan(1.5);
  });

  it('H2–H4 与预设一致（约 6.4 dB）', () => {
    // a2=0.25, a4=0.12 → 20log10(0.25/0.12) ≈ 6.38 dB
    const pcm = harmonics(200, [0, 0.5, 0.25, 0.1, 0.12]);
    const v = computeSpectralVoice(pcm, FS);
    expect(Math.abs((v.h2h4Db as number) - 6.4)).toBeLessThan(1.5);
  });

  it('H1–A3：A3 取 F3 区（2–3.5kHz）最强谐波', () => {
    // F3 区（k=10..17 @200Hz）谐波幅度 0.05，a1=0.5 → H1−A3 ≈ 20 dB
    const amps = new Array(18).fill(0);
    amps[1] = 0.5;
    amps[2] = 0.25;
    amps[4] = 0.12;
    for (let k = 10; k <= 17; k++) amps[k] = 0.05;
    const pcm = harmonics(200, amps);
    const v = computeSpectralVoice(pcm, FS);
    expect(Math.abs((v.h1a3Db as number) - 20)).toBeLessThan(2.5);
  });

  it('H1–H2 偏高（收窄第二谐波）→ 气声度更高', () => {
    const pressed = computeSpectralVoice(harmonics(200, [0, 0.3, 0.3, 0.1, 0.1]), FS);
    const breathy = computeSpectralVoice(harmonics(200, [0, 0.6, 0.1, 0.05, 0.05]), FS);
    expect(pressed.breathiness).not.toBeNull();
    expect(breathy.breathiness as number).toBeGreaterThan(pressed.breathiness as number);
  });

  it('加入噪声后气声度上升', () => {
    const clean = computeSpectralVoice(harmonics(200, [0, 0.5, 0.25, 0.1, 0.12]), FS);
    const noisy = computeSpectralVoice(harmonics(200, [0, 0.5, 0.25, 0.1, 0.12], 1.5, 0.5), FS);
    expect(clean.breathiness).not.toBeNull();
    expect(noisy.breathiness).not.toBeNull();
    expect(noisy.breathiness as number).toBeGreaterThan(clean.breathiness as number);
  });

  it('静音返回全 null', () => {
    const v = computeSpectralVoice(new Float32Array(FS), FS);
    expect(v.h1h2Db).toBeNull();
    expect(v.h2h4Db).toBeNull();
    expect(v.h1a3Db).toBeNull();
    expect(v.breathiness).toBeNull();
    expect(v.nasalityDb).toBeNull();
  });

  it('鼻化 A1–P1：低中频鼻腔峰抬高会降低 A1−P1', () => {
    // 口腔：能量集中在 F1≈700Hz 附近（k=3–4 @200Hz）
    const oral = harmonics(200, [0, 0.3, 0.5, 0.6, 0.45, 0.25, 0.12, 0.08]);
    // 鼻化：300–1000Hz（k=2–5）出现强鼻腔峰
    const nasal = harmonics(200, [0, 0.3, 0.62, 0.66, 0.7, 0.5, 0.2, 0.1]);
    const a = computeSpectralVoice(oral, FS).nasalityDb;
    const b = computeSpectralVoice(nasal, FS).nasalityDb;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b as number).toBeLessThan(a as number);
  });
});
