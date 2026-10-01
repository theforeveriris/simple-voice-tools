import { describe, it, expect } from 'vitest';
import { base64FromBytes, bytesFromBase64, dbToU8, spectrumRowToBands } from './spectrogram';
import { SPEC_BANDS } from '@/constants';

describe('base64 编解码', () => {
  it('0..255 全字节值往返一致', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(Array.from(bytesFromBase64(base64FromBytes(bytes)))).toEqual(Array.from(bytes));
  });

  it('跨 8192 分块边界的长数据往返一致', () => {
    const n = 8192 + 100;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 7 + 13) % 256;
    expect(Array.from(bytesFromBase64(base64FromBytes(bytes)))).toEqual(Array.from(bytes));
  });
});

describe('dbToU8', () => {
  it('动态范围映射：-90dB → 0，0dB → 255', () => {
    expect(dbToU8(-90)).toBe(0);
    expect(dbToU8(0)).toBe(255);
  });

  it('越界钳制到 0..255', () => {
    expect(dbToU8(-120)).toBe(0);
    expect(dbToU8(10)).toBe(255);
  });

  it('单调：更大的 dB 不产生更小的字节', () => {
    let prev = -1;
    for (let db = -90; db <= 0; db += 5) {
      const v = dbToU8(db);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('spectrumRowToBands', () => {
  const binHz = 32000 / 2048;

  it('线性抬升频谱 → 非递减字节序列', () => {
    const freqDb = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) freqDb[i] = -90 + (30 * i) / 1023;
    const row = new Uint8Array(SPEC_BANDS);
    spectrumRowToBands(freqDb, binHz, row);
    for (let b = 1; b < SPEC_BANDS; b++) {
      expect(row[b]).toBeGreaterThanOrEqual(row[b - 1]);
    }
    expect(row[SPEC_BANDS - 1]).toBeGreaterThan(row[0]);
  });

  it('单个 bin 变响只提升其所属对数频带的字节', () => {
    const freqDb = new Float32Array(1024).fill(-80);
    const before = new Uint8Array(SPEC_BANDS);
    spectrumRowToBands(freqDb, binHz, before);

    // bin 190 ≈ 2969Hz，仅落在频带 55（center ≈ 2960Hz）的取邻窗 [188,191] 内
    freqDb[190] = -40;
    const after = new Uint8Array(SPEC_BANDS);
    spectrumRowToBands(freqDb, binHz, after);

    let changed = 0;
    for (let b = 0; b < SPEC_BANDS; b++) {
      if (after[b] !== before[b]) changed++;
    }
    expect(changed).toBe(1);
    expect(after[55]).toBeGreaterThan(before[55]);
  });
});
