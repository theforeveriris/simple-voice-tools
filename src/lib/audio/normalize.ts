/**
 * 导入音频的自动增益归一（纯函数）
 *
 * 手机录音 / 语音消息等外部文件常常电平过低，过不了发声门限（voicedGateDb），
 * 直接跑管线会得到一条近乎空的记录。这里按「活跃语音电平」估计增益，把整段
 * 抬进可分析范围，并记录实际增益以便溯源。
 *
 * 只做提升（已足够响的文件不动），并以峰值留白封顶（不引入削波），
 * 因此不会破坏本来就正常的导入文件。
 */

/** 目标活跃电平（dBFS）：与实时录音的正常说话响度同量级 */
export const IMPORT_TARGET_RMS_DB = -20;
/** 最大提升量（dB）：太安静的文件也不无限放大底噪 */
export const IMPORT_MAX_GAIN_DB = 36;
/** 峰值留白（dB）：增益后峰值不超过 -headroom */
const IMPORT_PEAK_HEADROOM_DB = 1;
/** 最小生效增益（dB）：小于此值视为「不需要改」 */
const MIN_EFFECTIVE_GAIN_DB = 0.5;

/** 帧长 / 帧移（秒） */
const FRAME_SEC = 0.02;
const HOP_SEC = 0.01;

/**
 * 估计应施加的增益（dB，仅提升；0 = 不需要）。纯函数，不改数据。
 * 代表电平取帧 RMS 的 90 分位：贴近语音段响度，避开长静音与偶发爆音。
 */
export function estimateImportGainDb(pcm: Float32Array, sampleRate: number): number {
  if (pcm.length === 0 || !(sampleRate > 0)) return 0;
  const win = Math.max(1, Math.round(FRAME_SEC * sampleRate));
  const hop = Math.max(1, Math.round(HOP_SEC * sampleRate));
  const frameRms: number[] = [];
  for (let start = 0; start + win <= pcm.length; start += hop) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const s = pcm[start + i];
      sum += s * s;
    }
    frameRms.push(Math.sqrt(sum / win));
  }
  if (frameRms.length === 0) return 0;
  const sorted = frameRms.slice().sort((a, b) => a - b);
  const level = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  if (!(level > 0)) return 0;

  let gain = IMPORT_TARGET_RMS_DB - 20 * Math.log10(level);
  if (gain < MIN_EFFECTIVE_GAIN_DB) return 0; // 已足够响：不改
  gain = Math.min(gain, IMPORT_MAX_GAIN_DB);

  // 峰值封顶：增益后峰值不超过 -headroom
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) gain = Math.min(gain, -IMPORT_PEAK_HEADROOM_DB - 20 * Math.log10(peak));

  return gain >= MIN_EFFECTIVE_GAIN_DB ? Math.round(gain * 10) / 10 : 0;
}

/** 就地施加增益（线性）。返回是否改动了数据。 */
export function applyGainDb(pcm: Float32Array, gainDb: number): boolean {
  if (!(gainDb >= MIN_EFFECTIVE_GAIN_DB)) return false;
  const g = Math.pow(10, gainDb / 20);
  for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
  return true;
}
