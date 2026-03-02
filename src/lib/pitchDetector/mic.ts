/**
 * 麦克风输入管理模块
 * 负责音频流的获取、处理和音高检测的触发
 */

import type { PitchResult, AnalysisData } from '@/types';
import { PitchAnalyzer } from './core';

/**
 * 麦克风音高检测器类
 * 管理音频输入并执行实时音高检测
 */
export class MicrophonePitchDetector {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private frequencyData: any = null;
  private isActive = false;
  private animationFrameId: number | null = null;
  private pitchResults: PitchResult[] = [];

  private onDetectionCallback: (result: PitchResult) => void;

  /**
   * 构造函数
   * @param onDetection 音高检测结果回调函数
   */
  constructor(onDetection: (result: PitchResult) => void) {
    this.onDetectionCallback = onDetection;
  }

  /**
   * 启动麦克风和音高检测
   */
  async start(): Promise<void> {
    try {
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // 关闭回音消除，保持原始音质
          noiseSuppression: false, // 关闭噪声抑制（算法自带滤波）
          autoGainControl: false, // 关闭自动增益
        },
      });

      // 创建音频源和分析器
      this.mediaStream = stream;
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 4096;
      this.analyserNode.smoothingTimeConstant = 0.0; // 无平滑，实时响应
      this.sourceNode.connect(this.analyserNode);

      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.isActive = true;
      this.pitchResults = [];

      this.startDetectionLoop();
      console.log('麦克风已启动，采样率:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('麦克风启动失败:', error);
      throw error;
    }
  }

  /**
   * 停止麦克风和音高检测
   */
  stop(): void {
    this.isActive = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) this.audioContext.close();
    this.audioContext = null;
    this.analyserNode = null;
    this.frequencyData = null;
  }

  /**
   * 获取分析节点（供可视化复用，避免重复开启麦克风）
   */
  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /**
   * 开始检测循环
   */
  private startDetectionLoop(): void {
    if (!this.isActive || !this.analyserNode || !this.frequencyData || !this.audioContext) return;

    // 获取频谱数据（0-255）
    this.analyserNode.getByteFrequencyData(this.frequencyData);

    // 执行音高检测
    const analysisResult = new PitchAnalyzer(this.frequencyData, this.audioContext.sampleRate);

    // 通过回调返回结果
    if (analysisResult.detectedNote) {
      const pitchResult: PitchResult = {
        note: analysisResult.detectedNote,
        freq: analysisResult.detectedFrequency,
        confidence: analysisResult.confidenceScore,
        timestamp: Date.now(),
      };
      this.pitchResults.push(pitchResult);
      this.onDetectionCallback(pitchResult);
    }

    // 使用 requestAnimationFrame 控制检测频率
    this.animationFrameId = requestAnimationFrame(() => this.startDetectionLoop());
  }

  /**
   * 获取分析数据
   * @returns 音高分析数据
   */
  getAnalysisData(): AnalysisData {
    const history = this.pitchResults;
    if (history.length === 0) {
      return {
        averageFreq: 0,
        medianFreq: 0,
        minFreq: 0,
        maxFreq: 0,
        low95: 0,
        high95: 0,
        malePercent: 0,
        femalePercent: 0,
        neutralPercent: 100,
        totalSamples: 0,
        volume: {
          environment: 0,
          average: 0,
          median: 0,
          high95: 0,
          low95: 0
        }
      };
    }

    const frequencies = history.map((h) => h.freq);
    const minFreq = Math.min(...frequencies);
    const maxFreq = Math.max(...frequencies);
    const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;

    // 计算中位数
    const sortedFrequencies = [...frequencies].sort((a, b) => a - b);
    const medianFreq = sortedFrequencies[Math.floor(sortedFrequencies.length / 2)];
    
    // 计算95th percentiles
    const low95 = sortedFrequencies[Math.floor(sortedFrequencies.length * 0.05)];
    const high95 = sortedFrequencies[Math.floor(sortedFrequencies.length * 0.95)];

    // 人声分类（基于频率范围）
    // 男声：85-180Hz，女声：165-255Hz
    let maleCount = 0,
      femaleCount = 0,
      neutralCount = 0;
    history.forEach((h) => {
      if (h.freq >= 85 && h.freq <= 180) maleCount++;
      else if (h.freq >= 165 && h.freq <= 255) femaleCount++;
      else neutralCount++;
    });
    const totalCount = history.length;

    return {
      averageFreq: avgFreq,
      medianFreq: medianFreq,
      minFreq,
      maxFreq,
      low95,
      high95,
      malePercent: Math.round((maleCount / totalCount) * 100),
      femalePercent: Math.round((femaleCount / totalCount) * 100),
      neutralPercent: Math.round((neutralCount / totalCount) * 100),
      totalSamples: totalCount,
      volume: {
        environment: 0,
        average: 0,
        median: 0,
        high95: 0,
        low95: 0
      }
    };
  }
}
