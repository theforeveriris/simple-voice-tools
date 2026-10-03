/**
 * 离线分析 Worker：逐帧 DSP（YIN/LPC/FFT 语谱）与嗓音质量指标在子线程执行，
 * 长音频导入与录音收尾不再阻塞 UI（主线程只做解码与重采样）。
 * 协议见 analysisClient.ts；任何错误都以 { type: 'error' } 回报，由调用方降级。
 */

import { analyzePcmFrames, analyzePitchFrames, computeVqMetrics, type VqMetrics } from './analysisPipeline';
import { setAlgoParams } from './algoParams';
import type { AlgoParams, PitchAlgorithm } from '@/types';

export interface FramesRequest {
  type: 'frames';
  id: number;
  /** 管线采样率（32kHz）单声道 PCM */
  pcm: Float32Array;
  /** 发起方的算法参数快照（Worker 模块实例与主线程独立，处理前写入） */
  params?: AlgoParams;
}

export interface VqRequest {
  type: 'vq';
  id: number;
  /** 原始采样率单声道 PCM（录音收尾的嗓音质量计算） */
  pcm: Float32Array;
  sampleRate: number;
  /** 发起方的算法参数快照（当前 VQ/CPPS 不消费，随协议统一携带） */
  params?: AlgoParams;
}

export interface PitchRequest {
  type: 'pitch';
  id: number;
  /** 管线采样率（32kHz）单声道 PCM（音高算法对比的重算） */
  pcm: Float32Array;
  algo: PitchAlgorithm;
  /** 发起方的算法参数快照 */
  params?: AlgoParams;
}

export type AnalysisRequest = FramesRequest | VqRequest | PitchRequest;

// 手动收敛 self 类型：tsconfig 的 lib 为 DOM，这里只需 DedicatedWorker 的两个方法
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const msg = e.data;
  try {
    // Worker 的 algoParams 模块实例与主线程独立：请求携带的快照先行写入
    if (msg.params) setAlgoParams(msg.params);
    if (msg.type === 'frames') {
      const result = analyzePcmFrames(msg.pcm, (frac) => {
        ctx.postMessage({ type: 'progress', id: msg.id, frac });
      });
      ctx.postMessage({ type: 'frames', id: msg.id, result }, [result.specFlat.buffer]);
    } else if (msg.type === 'vq') {
      const metrics: VqMetrics = computeVqMetrics(msg.pcm, msg.sampleRate);
      ctx.postMessage({ type: 'vq', id: msg.id, metrics });
    } else {
      const series = analyzePitchFrames(msg.pcm, msg.algo, (frac) => {
        ctx.postMessage({ type: 'progress', id: msg.id, frac });
      });
      ctx.postMessage({ type: 'pitch', id: msg.id, series });
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
