/**
 * 算法参数单例（实验性）
 * 音高检测（YIN）/ 共振峰提取（LPC）/ 发声门限的 DSP 细节参数，
 * 设置 → 实验性功能 → 算法参数 可调，useStore 的 syncModuleSettings 写入。
 *
 * 主线程（实时循环 recorder / 离线管线回退）与 Worker 各自持有本模块实例：
 * 主线程实例始终跟随设置；Worker 实例由 analysisClient 在每次分析请求里
 * 附带当前快照、analysisWorker 于处理前 setAlgoParams 写入，避免两份实例漂移。
 */

import type { AlgoParams } from '@/types';

/** 默认值：与各算法文档（documentation/ALGORITHM-*.md）记载的基准口径一致 */
export const ALGO_PARAM_DEFAULTS: AlgoParams = {
  yinThreshold: 0.14,
  pitchMinHz: 60,
  pitchMaxHz: 600,
  preEmphasis: 0.97,
  f1MinHz: 200,
  f2MaxHz: 3400,
  voicedGateDb: -55,
};

/** 单实例当前值 */
let current: AlgoParams = { ...ALGO_PARAM_DEFAULTS };

/** 约束：搜索上限至少比下限高 100 Hz（防呆，静默抬升上限） */
function normalize(p: AlgoParams): AlgoParams {
  return { ...p, pitchMaxHz: Math.max(p.pitchMaxHz, p.pitchMinHz + 100) };
}

/** 当前算法参数（只读快照；热路径每帧读取，勿在此做分配） */
export function getAlgoParams(): Readonly<AlgoParams> {
  return current;
}

/** 写入算法参数（设置同步 / Worker 收到请求快照时调用） */
export function setAlgoParams(p: AlgoParams): void {
  current = normalize(p);
}
