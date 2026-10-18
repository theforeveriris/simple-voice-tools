/**
 * 声音签名（音频水印，实验性，默认关闭）
 * 把 64-bit 签名（昵称哈希）用直接序列扩频（DSSS）嵌入导出音频的极低电平层：
 *   - 每比特用 63 位 m 序列的一个循环移位作为扩频码，正码 = 1、反码 = 0
 *   - 载体按帧（1024 样本）与码片相乘叠加，幅度默认 -34 dBFS（可听阈以下）
 *   - 提取不需要原音频：逐帧与全部 64 个码序列做相关，符号投票还原比特
 * 抗性定位：抗转码/音量变化，不敌变调或裁剪——定位是「出处可验证」而非「防篡改」。
 * 完全自愿：设置里显式开启并填署名后才生效；导出链路统一挂接。
 */

/** 比特数（昵称 SHA-256 截取） */
const BITS = 64;
/** 每比特的码片数（帧长 1024 = m 序列周期 1023 的裁剪） */
export const CHIP_LEN = 1023;
/** 默认嵌入幅度（dBFS 相对载体）：-34dB ≈ 2% 线性 */
export const DEFAULT_AMPLITUDE = 0.02;

/** 63 位 m 序列（本原多项式 x^6+x+1 的 LFSR，周期 63×…——实际生成 1023 位用 x^10+x^3+1） */
function mSequence(length: number, seed = 0x155): Uint8Array {
  let reg = seed | 1;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = reg & 1;
    // x^10 + x^3 + 1
    const fb = ((reg >> 0) ^ (reg >> 3)) & 1;
    reg = ((reg >> 1) | (fb << 9)) & 0x3ff;
  }
  return out;
}

/** 基础 m 序列（1023 位） */
const BASE_SEQ = mSequence(1023);

/** 比特 i 的扩频码 = 基础序列循环移位 (i × 16) 取前 CHIP_LEN 位，映射 {0,1}→{-1,+1} */
function chipSequence(bitIndex: number): Int8Array {
  const shift = (bitIndex * 16) % 1023;
  const out = new Int8Array(CHIP_LEN);
  for (let i = 0; i < CHIP_LEN; i++) {
    out[i] = BASE_SEQ[(i + shift) % 1023] === 1 ? 1 : -1;
  }
  return out;
}

/** 署名 → 64-bit 签名比特（SHA-256 前 8 字节；不存原文，不可逆） */
export async function signatureBits(signature: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature.trim().toLowerCase()));
  const bytes = new Uint8Array(digest.slice(0, 8));
  const bits = new Uint8Array(BITS);
  for (let i = 0; i < BITS; i++) {
    bits[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  return bits;
}

/**
 * 嵌入水印（原地修改拷贝）：每帧（CHIP_LEN 样本）承载一个码片位置 × 比特循环。
 * 每比特的完整码序列被重复写入直到音频结束——任何足够长的片段都可提取。
 */
export function embedWatermark(pcm: Float32Array, bits: Uint8Array, amplitude = DEFAULT_AMPLITUDE): Float32Array {
  const out = pcm.slice();
  const totalChips = Math.floor(out.length / CHIP_LEN) * BITS; // 码片位置按比特循环
  if (totalChips === 0) return out;
  const seqs = Array.from({ length: BITS }, (_, i) => chipSequence(i));
  let chipPos = 0;
  for (let frame = 0; frame + CHIP_LEN <= out.length; frame += CHIP_LEN) {
    const bit = bits[chipPos % BITS];
    const seq = seqs[chipPos % BITS];
    for (let i = 0; i < CHIP_LEN; i++) {
      // 码片 +1/-1 → 加或减幅度；正码表 1、反码表 0
      out[frame + i] += (bit === 1 ? seq[i] : -seq[i]) * amplitude;
    }
    chipPos++;
  }
  return out;
}

/**
 * 提取水印：逐帧与各比特的码序列做相关，按帧内符号 → 比特多数投票。
 * 返回 64-bit；提取质量（每比特的置信度均值）供调用方判断是否「存在水印」。
 */
export function extractWatermark(pcm: Float32Array): { bits: Uint8Array; confidence: number } {
  const frames = Math.floor(pcm.length / CHIP_LEN);
  if (frames === 0) return { bits: new Uint8Array(BITS), confidence: 0 };
  const seqs = Array.from({ length: BITS }, (_, i) => chipSequence(i));
  // 每比特的投票计数（帧循环，第 frame 帧承载比特 frame % BITS）
  const votes = Array.from({ length: BITS }, () => ({ plus: 0, minus: 0 }));
  for (let frame = 0; frame < frames; frame++) {
    const bitIdx = frame % BITS;
    const seq = seqs[bitIdx];
    let corr = 0;
    for (let i = 0; i < CHIP_LEN; i++) {
      corr += pcm[frame * CHIP_LEN + i] * seq[i];
    }
    if (corr > 0) votes[bitIdx].plus++;
    else votes[bitIdx].minus++;
  }
  const bits = new Uint8Array(BITS);
  let agree = 0;
  for (let b = 0; b < BITS; b++) {
    const { plus, minus } = votes[b];
    bits[b] = plus >= minus ? 1 : 0;
    agree += Math.max(plus, minus) / (plus + minus || 1);
  }
  return { bits, confidence: agree / BITS };
}

/** 两个签名比特串的匹配率（0–1）：≥0.94（≥60/64）视为同一署名 */
export function bitsMatchRate(a: Uint8Array, b: Uint8Array): number {
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) same++;
  }
  return same / BITS;
}

/** 提取结果是否可判定为某署名（置信度与匹配率双门槛） */
export function verifyWatermark(pcm: Float32Array, expected: Uint8Array): { match: boolean; rate: number; confidence: number } {
  const { bits, confidence } = extractWatermark(pcm);
  const rate = bitsMatchRate(bits, expected);
  return { match: confidence >= 0.9 && rate >= 0.94, rate, confidence };
}
