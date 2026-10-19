/**
 * 实时音高曲线的显示平滑（纯函数，实验性「F0 显示平滑」）
 *
 * 只作用于图表的观感：不改动录音缓冲，也不进入记录与统计——音符、读数、
 * 时长占比等仍取自原始数据，避免「看起来顺滑但数字是假的」。
 * 级别 0 = 关闭（返回原数组引用）；1–3 递增平滑强度（EMA 系数递减）。
 *
 * 每次绘制对整段缓冲重新平滑（无跨帧状态）：结果只取决于数据与级别，
 * 稳定可复现，窗口滚动时不会因为起点变化而跳变。
 */

/** 各级别的 EMA 系数（新样本权重）：越小越平滑、滞后越大；[0] 恒为 1（关闭） */
export const PITCH_SMOOTH_ALPHA = [1, 0.5, 0.33, 0.22] as const;

/** 最大级别 */
export const PITCH_SMOOTH_MAX = PITCH_SMOOTH_ALPHA.length - 1;

/**
 * 平滑音高序列（Hz，null = 未检出）
 * @param f0 原始序列（不修改）
 * @param level 0–3（越界自动夹紧；0 返回原数组）
 */
export function smoothPitch(f0: (number | null)[], level: number): (number | null)[] {
  const lvl = Math.max(0, Math.min(PITCH_SMOOTH_MAX, Math.round(level) || 0));
  const alpha = PITCH_SMOOTH_ALPHA[lvl];
  if (alpha >= 1) return f0;
  const out: (number | null)[] = new Array(f0.length);
  let prev: number | null = null;
  for (let i = 0; i < f0.length; i++) {
    const v = f0[i];
    if (v == null || !isFinite(v)) {
      // 静音/未检出段不跨段平滑，避免把两段发音连成一条
      out[i] = null;
      prev = null;
      continue;
    }
    prev = prev == null ? v : prev + alpha * (v - prev);
    out[i] = prev;
  }
  return out;
}
