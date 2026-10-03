/**
 * 离线分析任务调度
 * 优先派发到 Worker（analysisWorker.ts）；Worker 不可用时回退到主线程执行
 * 同一纯函数管线。PCM 一律以 transfer 交付（请求发起即移交所有权），
 * 因此「单个请求失败后回退主线程」不再可行——失败直接向上抛，
 * 由调用方决定降级策略（如 finishRecord 保留无嗓音质量的记录）。
 */

import { analyzePcmFrames, analyzePitchFrames, computeVqMetrics, type FrameAnalysisResult, type PitchSeriesResult, type VqMetrics } from './analysisPipeline';
import { getAlgoParams } from './algoParams';
import type { AnalysisRequest } from './analysisWorker';
import type { PitchAlgorithm } from '@/types';

type WorkerResponse =
  | { type: 'frames'; id: number; result: FrameAnalysisResult }
  | { type: 'vq'; id: number; metrics: VqMetrics }
  | { type: 'pitch'; id: number; series: PitchSeriesResult }
  | { type: 'progress'; id: number; frac: number }
  | { type: 'error'; id: number; message: string };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  onProgress?: (frac: number) => void;
}

let worker: Worker | null = null;
/** Worker 创建失败或多次出错后置位：后续请求直接走主线程回退 */
let workerBroken = false;
let seq = 0;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress') {
        entry.onProgress?.(msg.frac);
      } else if (msg.type === 'error') {
        pending.delete(msg.id);
        entry.reject(new Error(msg.message));
      } else {
        pending.delete(msg.id);
        entry.resolve(
          msg.type === 'frames' ? msg.result
            : msg.type === 'pitch' ? msg.series
              : msg.metrics,
        );
      }
    };
    worker.onerror = () => {
      // 脚本加载失败等致命错误：拒绝所有在途请求并永久降级主线程
      for (const entry of pending.values()) entry.reject(new Error('analysis worker failed'));
      pending.clear();
      workerBroken = true;
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    worker = null;
    return null;
  }
}

/** Worker 内跑逐帧分析（主线程回退见 runFrameAnalysis） */
function requestFrames(
  w: Worker,
  pcm: Float32Array,
  onProgress?: (frac: number) => void,
): Promise<FrameAnalysisResult> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
    // PCM 以 transfer 交付（几秒音频即数 MB，结构化克隆是纯浪费的整块拷贝）；
    // 交付后主线程这份 buffer 即失效，本请求失败无法再回退主线程（见 runFrameAnalysis）。
    // 算法参数快照随请求下发（Worker 模块实例独立，见 analysisWorker）
    w.postMessage({ type: 'frames', id, pcm, params: { ...getAlgoParams() } } satisfies AnalysisRequest, [pcm.buffer]);
  });
}

/** Worker 内跑嗓音质量四项 */
function requestVq(w: Worker, pcm: Float32Array, sampleRate: number): Promise<VqMetrics> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    w.postMessage({ type: 'vq', id, pcm, sampleRate, params: { ...getAlgoParams() } } satisfies AnalysisRequest, [pcm.buffer]);
  });
}

/** Worker 内跑单算法音高重算（音高算法对比） */
function requestPitch(
  w: Worker,
  pcm: Float32Array,
  algo: PitchAlgorithm,
  onProgress?: (frac: number) => void,
): Promise<PitchSeriesResult> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
    w.postMessage({ type: 'pitch', id, pcm, algo, params: { ...getAlgoParams() } } satisfies AnalysisRequest, [pcm.buffer]);
  });
}

/**
 * 逐帧分析（YIN / LPC / 语谱 / 嗓音质量）。
 * @param pcm 管线采样率（32kHz）单声道 PCM。派发 Worker 时以 transfer 交付，
 *            返回后 pcm 不可再用；Worker 不可用时直接主线程执行，pcm 保持可用
 */
export async function runFrameAnalysis(
  pcm: Float32Array,
  onProgress?: (frac: number) => void,
): Promise<FrameAnalysisResult> {
  const w = ensureWorker();
  if (w) return requestFrames(w, pcm, onProgress);
  return analyzePcmFrames(pcm, onProgress);
}

/** 嗓音质量四项（Jitter/Shimmer/HNR/CPPS）。pcm 交付语义同 runFrameAnalysis */
export async function runVqMetrics(pcm: Float32Array, sampleRate: number): Promise<VqMetrics> {
  const w = ensureWorker();
  if (w) return requestVq(w, pcm, sampleRate);
  return computeVqMetrics(pcm, sampleRate);
}

/**
 * 单算法音高重算（音高算法对比用）
 * @param pcm 管线采样率（32kHz）单声道 PCM。pcm 交付语义同 runFrameAnalysis
 */
export async function runPitchOnly(
  pcm: Float32Array,
  algo: PitchAlgorithm,
  onProgress?: (frac: number) => void,
): Promise<PitchSeriesResult> {
  const w = ensureWorker();
  if (w) return requestPitch(w, pcm, algo, onProgress);
  return analyzePitchFrames(pcm, algo, onProgress);
}
