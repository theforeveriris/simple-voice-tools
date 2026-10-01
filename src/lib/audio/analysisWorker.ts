/**
 * 离线分析 Worker：逐帧 DSP（YIN/LPC/FFT 语谱）与嗓音质量指标在子线程执行，
 * 长音频导入与录音收尾不再阻塞 UI（主线程只做解码与重采样）。
 * 协议见 analysisClient.ts；任何错误都以 { type: 'error' } 回报，由调用方降级。
 */

import { analyzePcmFrames, computeVqMetrics, type VqMetrics } from './analysisPipeline';

export interface FramesRequest {
  type: 'frames';
  id: number;
  /** 管线采样率（32kHz）单声道 PCM */
  pcm: Float32Array;
}

export interface VqRequest {
  type: 'vq';
  id: number;
  /** 原始采样率单声道 PCM（录音收尾的嗓音质量计算） */
  pcm: Float32Array;
  sampleRate: number;
}

export type AnalysisRequest = FramesRequest | VqRequest;

// 手动收敛 self 类型：tsconfig 的 lib 为 DOM，这里只需 DedicatedWorker 的两个方法
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'frames') {
      const result = analyzePcmFrames(msg.pcm, (frac) => {
        ctx.postMessage({ type: 'progress', id: msg.id, frac });
      });
      ctx.postMessage({ type: 'frames', id: msg.id, result }, [result.specFlat.buffer]);
    } else {
      const metrics: VqMetrics = computeVqMetrics(msg.pcm, msg.sampleRate);
      ctx.postMessage({ type: 'vq', id: msg.id, metrics });
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
