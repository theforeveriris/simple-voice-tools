/**
 * 离线分析任务调度
 * 优先派发到 Worker（analysisWorker.ts）；Worker 不可用或单次请求失败时，
 * 回退到主线程执行同一纯函数管线，功能不缺失、只是可能短暂阻塞 UI。
 */

import { analyzePcmFrames, computeVqMetrics, type FrameAnalysisResult, type VqMetrics } from './analysisPipeline';
import type { AnalysisRequest } from './analysisWorker';

type WorkerResponse =
  | { type: 'frames'; id: number; result: FrameAnalysisResult }
  | { type: 'vq'; id: number; metrics: VqMetrics }
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
        entry.resolve(msg.type === 'frames' ? msg.result : msg.metrics);
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
    w.postMessage({ type: 'frames', id, pcm } satisfies AnalysisRequest);
  });
}

/** Worker 内跑嗓音质量四项 */
function requestVq(w: Worker, pcm: Float32Array, sampleRate: number): Promise<VqMetrics> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    w.postMessage({ type: 'vq', id, pcm, sampleRate } satisfies AnalysisRequest);
  });
}

/**
 * 逐帧分析（YIN / LPC / 语谱 / 嗓音质量）。
 * @param pcm 管线采样率（32kHz）单声道 PCM
 */
export async function runFrameAnalysis(
  pcm: Float32Array,
  onProgress?: (frac: number) => void,
): Promise<FrameAnalysisResult> {
  const w = ensureWorker();
  if (w) {
    try {
      return await requestFrames(w, pcm, onProgress);
    } catch (err) {
      console.warn('Worker 分析失败，回退主线程执行:', err);
    }
  }
  return analyzePcmFrames(pcm, onProgress);
}

/** 嗓音质量四项（Jitter/Shimmer/HNR/CPPS） */
export async function runVqMetrics(pcm: Float32Array, sampleRate: number): Promise<VqMetrics> {
  const w = ensureWorker();
  if (w) {
    try {
      return await requestVq(w, pcm, sampleRate);
    } catch (err) {
      console.warn('Worker 嗓音质量计算失败，回退主线程执行:', err);
    }
  }
  return computeVqMetrics(pcm, sampleRate);
}
