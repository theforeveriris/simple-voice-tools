/**
 * 历史记录用当前算法参数重算
 * 从记录的录音音频出发，重跑与录音时同一套离线管线（YIN / LPC / 语谱 /
 * 统计聚合 / 嗓音质量），产出一份「仅替换分析结果」的新记录对象——
 * id / createdAt / mode / note 等元数据原样保留，由调用方决定是否落库。
 *
 * 与 importAudio 的关系：解码 / 单声道化 / 重采样 / 管线派发全部同一口径
 * （32kHz 单声道，超 5 分钟截断）；本模块只多了「保留原记录元数据」和
 * 「标记重算时间与参数指纹」两件事。
 *
 * 应用层语义（分析页）：重算结果先以新旧对比呈现、用户确认后才覆盖——
 * 不落盘的对比天然实现了「参数 A vs 参数 B」的敏感性检验。
 */

import { computeStats, computeInTargetPct, toRecordSeries } from './recorder';
import { runFrameAnalysis } from './analysisClient';
import { PIPELINE_HZ, FRAME_HZ, FRAME_SAMPLES } from './analysisPipeline';
import { decodeBlob, mixdown, resample, IMPORT_MAX_SEC, specData } from './importAudio';
import { getAlgoParams } from './algoParams';
import type { AnalysisRecord } from '@/types';

/** 短字符串散列（FNV-1a 变体）：参数指纹用，同 llm.ts 的 hashStr 口径 */
function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 当前算法参数的指纹（记录落库时随行标记，用于判断「参数已变，可重算」） */
export function algoParamsFingerprint(): string {
  return hashStr(JSON.stringify(getAlgoParams()));
}

export interface ReanalyzeOptions {
  /** 训练靶标目标区间（启用时统计达成率写入 stats） */
  targetRange?: [number, number] | null;
  /** 分析进度回调（0-1） */
  onProgress?: (frac: number) => void;
}

export interface ReanalyzeResult {
  /** 仅分析结果被替换的新记录对象（未落库；原记录对象不变） */
  record: AnalysisRecord;
  /** 是否因超过 5 分钟上限被截断 */
  truncated: boolean;
}

/**
 * 从管线 PCM 出发重算（reanalyzeRecord 的可测核心；主线程回退路径下可在 node 跑）
 * @param pcm 管线采样率（32kHz）单声道 PCM
 */
export async function reanalyzePcm(
  pcm: Float32Array,
  original: AnalysisRecord,
  opts: ReanalyzeOptions = {},
): Promise<ReanalyzeResult> {
  const {
    t: bufT, f0: bufF0, db: bufDb, f1: bufF1, f2: bufF2,
    specFlat, specRows, metrics,
  } = await runFrameAnalysis(pcm, opts.onProgress);

  const series = toRecordSeries(bufT, bufF0, bufDb, bufF1, bufF2, 1);
  const durationSec = series.t.length > 0 ? series.t[series.t.length - 1] : 0;
  // 有效内容不足：调用方按消息映射本地化提示（保持本模块不依赖 i18n，与 importAudio 同口径）
  if (durationSec < 1 || series.t.length < 4) throw new Error('tooShort');
  const sampleHz = series.t.length > 1 ? 1 / (series.t[1] - series.t[0]) : FRAME_HZ;
  const stats = computeStats(series, sampleHz);
  const inTargetPct = computeInTargetPct(series, opts.targetRange ?? null);
  if (inTargetPct != null) stats.inTargetPct = inTargetPct;

  // 语谱量化行随管线重出；重算无语谱时去掉旧的（保持 spec 与 series 同源）
  const spec = specData(specFlat, specRows);
  const next: AnalysisRecord = {
    ...original,
    durationSec,
    sampleHz,
    series,
    stats: { ...stats, ...metrics },
    reanalyzedAt: Date.now(),
    paramsFp: algoParamsFingerprint(),
  };
  if (spec) next.spec = spec;
  else delete next.spec;
  return { record: next, truncated: false };
}

/** 录音音频 Blob → 管线 PCM（与导入分析同一口径：混音 + 重采样 + 超长截断） */
export async function audioToPipelinePcm(audio: Blob): Promise<{ pcm: Float32Array; truncated: boolean }> {
  const decoded = await decodeBlob(audio);
  const truncated = decoded.duration > IMPORT_MAX_SEC + 0.5;
  const useSec = Math.min(decoded.duration, IMPORT_MAX_SEC);
  let pcm = mixdown(decoded, useSec);
  if (decoded.sampleRate !== PIPELINE_HZ) {
    pcm = await resample(pcm, decoded.sampleRate);
  }
  return { pcm, truncated };
}

/**
 * 用当前算法参数重算一条历史记录（音频来自 IndexedDB 的录音音频）
 * @throws 解码失败 / 音频过短（有效帧不足）时抛 Error，调用方映射提示文案
 */
export async function reanalyzeRecord(
  original: AnalysisRecord,
  audio: Blob,
  opts: ReanalyzeOptions = {},
): Promise<ReanalyzeResult> {
  const { pcm, truncated } = await audioToPipelinePcm(audio);
  const hop = Math.round(PIPELINE_HZ / FRAME_HZ);
  const frames = Math.max(0, Math.floor((pcm.length - FRAME_SAMPLES) / hop) + 1);
  if (frames < 4) throw new Error('tooShort');
  const out = await reanalyzePcm(pcm, original, opts);
  return { record: out.record, truncated: truncated || out.truncated };
}
