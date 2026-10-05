/**
 * Praat 互操作导出（纯文本对象格式）
 * 输出与 Praat 6.2+「Save as text file」完全同构的文本：
 *   - PitchTier：测得的基频曲线（逐有声帧一个 point：number = 时间 s，value = F0 Hz）
 *   - Formant：逐帧 F1/F2（管线的两极 LPC；未检出的帧 numberOfFormants = 0，
 *     与 Praat 自身「无共振峰帧」的写法一致）
 *
 * 格式依据（praat/praat 源码，非猜测）：
 *   sys/oo_WRITE_TEXT.h      —— 标量 `name = value`、STRUCTVEC `name []:` + `name [i]:`
 *                               （空时同行追加 "(empty)"）、collection `name: size = N`
 *   fon/RealTier_def.h       —— xmin / xmax / points（RealPoint: number + value）
 *   fon/Formant_def.h        —— xmin / xmax / nx / dx / x1 / maxnFormants /
 *                               frames（intensity + numberOfFormants + formant: frequency + bandwidth）
 */

import type { AnalysisRecord } from '@/types';

const HEADER = 'File type = "ooTextFile"';

/** 数值用最短往返表示（Praat 以 15 位有效数字写 double，reader 对精度不敏感） */
const num = (v: number): string => String(v);

/**
 * 基频曲线 → Praat PitchTier（只含有声帧）
 */
export function recordToPitchTier(record: AnalysisRecord): string {
  const { t, f0 } = record.series;
  const points: [number, number][] = [];
  for (let i = 0; i < t.length; i++) {
    const f = f0[i];
    if (f != null && isFinite(f) && f > 0) points.push([t[i], f]);
  }
  const lines: string[] = [
    HEADER,
    'Object class = "PitchTier"',
    '',
    `xmin = ${num(points.length > 0 ? points[0][0] : 0)}`,
    `xmax = ${num(points.length > 0 ? points[points.length - 1][0] : 0)}`,
    `points: size = ${points.length}`,
  ];
  points.forEach(([time, value], i) => {
    lines.push(`\tpoints [${i + 1}]:`);
    lines.push(`\t\tnumber = ${num(time)}`);
    lines.push(`\t\tvalue = ${num(value)}`);
  });
  return lines.join('\n');
}

/**
 * 共振峰序列 → Praat Formant（帧网格与记录序列一致：x1 = 首帧时间，dx = 帧距）
 */
export function recordToFormant(record: AnalysisRecord): string {
  const { t, f1, f2 } = record.series;
  const nx = t.length;
  const dx = nx > 1 ? t[1] - t[0] : 0;
  const x1 = nx > 0 ? t[0] : 0;
  const lines: string[] = [
    HEADER,
    'Object class = "Formant"',
    '',
    `xmin = ${num(nx > 0 ? Math.max(0, x1 - dx / 2) : 0)}`,
    `xmax = ${num(nx > 0 ? x1 + (nx - 1) * dx + dx / 2 : 0)}`,
    `nx = ${nx}`,
    `dx = ${num(dx)}`,
    `x1 = ${num(x1)}`,
    'maxnFormants = 2',
    nx > 0 ? 'frames []:' : 'frames []: (empty)',
  ];
  for (let i = 0; i < nx; i++) {
    lines.push(`\tframes [${i + 1}]:`);
    lines.push('\t\tintensity = 0');
    const present: [number, number][] = [];
    if (f1[i] != null && isFinite(f1[i]!)) present.push([1, f1[i] as number]);
    if (f2[i] != null && isFinite(f2[i]!)) present.push([2, f2[i] as number]);
    lines.push(`\t\tnumberOfFormants = ${present.length}`);
    // 只有一列检出时也按检出顺序写（Praat 按频率升序的 Formant 轨道处理，
    // 我们的 F1 < F2 恒成立，缺 F1 只剩 F2 时它就是第一共振峰轨道）
    present.sort((a, b) => a[1] - b[1]);
    if (present.length === 0) {
      lines.push('\t\tformant []: (empty)');
    } else {
      lines.push('\t\tformant []:');
      present.forEach(([, freq], k) => {
        lines.push(`\t\t\tformant [${k + 1}]:`);
        lines.push(`\t\t\t\tfrequency = ${num(freq)}`);
        lines.push('\t\t\t\tbandwidth = 0');
      });
    }
  }
  return lines.join('\n');
}
