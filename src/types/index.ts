/**
 * 应用公共类型定义
 */

/**
 * 页面类型
 * 底部导航栏的四个页面
 */
export type ViewType = 'test' | 'analysis' | 'history' | 'settings';

/**
 * 界面语言
 * zh-CN 为原始文案；zh-TW/en/ja 为翻译（en/ja 为机器翻译）
 */
export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja';

/**
 * 主题模式
 * system 跟随系统深浅色偏好
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * 测试模式
 * 短按录音圆球使用当前模式（默认朗读，记住上次选择），
 * 长按圆球弹出扇形选择器切换。
 */
export type TestMode = 'reading' | 'sustained' | 'glide';

/**
 * 音高区间类型
 * 用于曲线分段着色与统计
 */
export type PitchBand = 'low' | 'male' | 'transition' | 'female' | 'high';

/**
 * 录制数据序列
 * 均匀采样（约30Hz），null 表示该帧未检出（无声/哑音）
 */
export interface RecordSeries {
  /** 时间轴，单位秒，从录音开始计 */
  t: number[];
  /** 基频 Hz，null = 未检出 */
  f0: (number | null)[];
  /** 音量电平 dB（负值，-90 ~ 0） */
  rmsDb: number[];
  /** 第一共振峰 F1 Hz，null = 未检出 */
  f1: (number | null)[];
  /** 第二共振峰 F2 Hz，null = 未检出 */
  f2: (number | null)[];
}

/**
 * 录音统计信息
 * 由数据序列聚合计算得出
 */
export interface VoiceStats {
  /** 录音时长（秒） */
  durationSec: number;
  /** 序列采样率（Hz，每秒样本数） */
  sampleHz: number;
  /** 总帧数 */
  totalSamples: number;
  /** 有声帧数 */
  voicedSamples: number;
  /** 平均基频 Hz */
  avgF0: number;
  /** 基频中位数 Hz */
  medianF0: number;
  /** 最低基频 Hz */
  minF0: number;
  /** 最高基频 Hz */
  maxF0: number;
  /** 10% 分位基频 Hz（音域下沿） */
  p10F0: number;
  /** 90% 分位基频 Hz（音域上沿） */
  p90F0: number;
  /** 基频标准差 Hz */
  stdF0: number;
  /** 男声区间占比 % */
  malePct: number;
  /** 女声区间占比 % */
  femalePct: number;
  /** 过渡区间占比 % */
  transitionPct: number;
  /** 平均第一共振峰 Hz */
  avgF1: number | null;
  /** 平均第二共振峰 Hz */
  avgF2: number | null;
  /** F1 波动范围 [min, max] */
  f1Range: [number, number] | null;
  /** F2 波动范围 [min, max] */
  f2Range: [number, number] | null;
  /** 平均响度 dB */
  avgDb: number;
  /** 峰值响度 dB */
  peakDb: number;
  /** 基频微扰 Jitter(local)，相邻周期长度波动率的帧间平均（%），需录音音频，无音频时为 null */
  jitterPct?: number | null;
  /** 振幅微扰 Shimmer(local)，相邻周期幅度波动率的帧间平均（%），需录音音频，无音频时为 null */
  shimmerPct?: number | null;
  /** 谐噪比 HNR 估计（dB），由 YIN 周期性置信度换算，需录音音频，无音频时为 null */
  hnrDb?: number | null;
  /** 平滑倒谱峰突出度 CPPS（dB），对连续语音稳健的嗓音质量指标，需录音音频，旧记录为 undefined */
  cppsDb?: number | null;
  /** 训练靶标达成率：落在目标音高区间内的有声帧占比（%），未启用靶标时为 undefined */
  inTargetPct?: number | null;
}

/**
 * 语谱图量化数据
 * 录音时由 FFT 逐帧映射到对数频带并量化为 Uint8，行优先存储（每行 bands 个字节），
 * base64 序列化后随记录保存。
 */
export interface RecordSpec {
  /** 频带数（每行字节数） */
  bands: number;
  /** 行 × 频带的量化振幅（0-255），base64 */
  data: string;
}

/**
 * 一条完整的测试/分析记录
 */
export interface AnalysisRecord {
  id: string;
  /** 创建时间（epoch 毫秒） */
  createdAt: number;
  /** 录音时长（秒） */
  durationSec: number;
  /** 序列采样率 */
  sampleHz: number;
  series: RecordSeries;
  stats: VoiceStats;
  /** 录音时使用的测试模式（旧记录无此字段） */
  mode?: TestMode;
  /** 用户备注（如「晨起嗓音」） */
  note?: string;
  /** 语谱图量化数据（可选，旧记录/无音频记录可能缺失） */
  spec?: RecordSpec;
}

/**
 * 应用设置
 */
export interface AppSettings {
  /** 莫奈主题种子色相（0-360） */
  hue: number;
  /** 主题深浅模式，system 跟随系统 */
  theme: ThemeMode;
  /** 界面语言 */
  language: Locale;
  /** 是否显示图表网格辅助线 */
  showGrid: boolean;
  /** 单次录音最长时长（秒），0 = 不限制 */
  maxDurationSec: number;
  /** 录音结束后是否自动进入分析页 */
  autoEnterAnalysis: boolean;
  /** 麦克风设备 ID，空串 = 系统默认 */
  micDeviceId: string;
  /** 是否保存录音音频（用于回放与嗓音质量分析），存于 IndexedDB */
  audioSave: boolean;
  /** 当前测试模式（短按圆球所用，长按可切换） */
  testMode: TestMode;
  /** 四个图表是否共用同一时间轴区间（关闭后可独立缩放，统计跟随音高曲线） */
  syncChartRange: boolean;
  /** GitHub 云备份：用户自己的 OAuth App / GitHub App Client ID（仅存本地） */
  githubClientId?: string;
  /** GitHub 云备份：目标私有仓库名 */
  githubRepo?: string;
  /** 训练靶标：是否启用目标音高区间（测试页叠加目标带 + 达成率统计） */
  targetEnabled: boolean;
  /** 训练靶标：目标区间下限（Hz） */
  targetF0Min: number;
  /** 训练靶标：目标区间上限（Hz） */
  targetF0Max: number;
  /** 基线记录 id：分析页自动对比新记录与基线的 Δ 指标 */
  baselineRecordId?: string;
  /* ---------- 实验性功能（设置 → 实验性功能 子页面） ---------- */
  /** 自定义音区边界（Hz，自低到高四个分界点），undefined = 默认 85/165/180/255 */
  bandBounds?: [number, number, number, number];
  /** 分析页是否显示语谱图卡片 */
  showSpectrogram: boolean;
  /** 测试页是否追加第四张实时频谱图（额外 Canvas，耗电/掉帧风险自负） */
  liveSpectrum: boolean;
  /** 分析页是否显示本地规则生成的训练建议 */
  adviceEnabled: boolean;
}
