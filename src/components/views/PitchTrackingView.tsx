/**
 * 音高跟踪组件
 * 用于实时显示音高变化的趋势图表
 */
import { useEffect, useRef, useState } from 'react';
import { useStore, colorSchemes } from '@/store/useStore';
import { getNoteColor } from '@/lib/pitchDetector';
import gsap from 'gsap';
import { PitchView } from './PitchView';

/**
 * 音高跟踪组件
 * @returns React.ReactNode - 音高跟踪组件
 */
export function PitchTrackingView() {
  const currentView = useStore((state) => state.currentView);
  const isDetecting = useStore((state) => state.isDetecting);
  const currentPitch = useStore((state) => state.currentPitch);
  const pitchTrackingHistory = useStore((state) => state.pitchTrackingHistory);
  const settings = useStore((state) => state.settings);
  const clearPitchTrackingHistory = useStore((state) => state.clearPitchTrackingHistory);
  const [, setVolume] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const trackingCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackingAnimationRef = useRef<number | null>(null);
  const historyRef = useRef(pitchTrackingHistory);
  const settingsRef = useRef(settings);
  
  // 检查是否启用禅模式
  const isZenMode = settings.zenMode;

  // 使用 ref 保存最新数据，避免因为依赖变化反复重建 RAF 循环
  useEffect(() => {
    historyRef.current = pitchTrackingHistory;
  }, [pitchTrackingHistory]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /**
   * 更新音量可视化
   * 根据当前音高的置信度更新音量状态
   */
  useEffect(() => {
    if (currentPitch) {
      setVolume(currentPitch.confidence * 100);
    }
  }, [currentPitch]);

  /**
   * 切换到该视图时重置
   * 当切换到该视图且未检测时，清空历史记录
   */
  useEffect(() => {
    if (currentView === 'pitch-tracking' && !isDetecting) {
      clearPitchTrackingHistory();
    }
  }, [currentView, isDetecting, clearPitchTrackingHistory]);

  /**
   * 绘制实时音高跟踪图表
   * 使用 Canvas API 绘制音高变化趋势
   */
  useEffect(() => {
    if (!isDetecting) {
      if (trackingAnimationRef.current !== null) {
        cancelAnimationFrame(trackingAnimationRef.current);
        trackingAnimationRef.current = null;
      }
      return;
    }

    const canvas = trackingCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    /**
     * 绘制函数
     * 每帧更新音高跟踪图表
     */
    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);

      const history = historyRef.current;
      if (history.length < 2) {
        trackingAnimationRef.current = requestAnimationFrame(draw);
        return;
      }

      // 使用固定的频率范围，不允许滚动调节
      const currentSettings = settingsRef.current;
      const minFreq = currentSettings.chart.minFreq;
      const maxFreq = currentSettings.chart.maxFreq;
      const xStep = rect.width / 300;

      // 检查最后一个音高是否在女声范围内
      const lastPitch = history[history.length - 1];
      const isFemaleRange = lastPitch && lastPitch.freq >= 165 && lastPitch.freq <= 255;
      
      // 计算女声范围的闪烁效果
      const time = Date.now() / 1000;
      const flickerIntensity = isFemaleRange ? (Math.sin(time * 2) + 1) / 2 : 1;
      
      // 使用选定的配色方案绘制音高线
      const colorScheme = colorSchemes[currentSettings.chart.colorScheme];
      const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
      
      // 对女声范围使用粉色渐变
      if (isFemaleRange) {
        const pinkOpacity = 0.7 + flickerIntensity * 0.3;
        gradient.addColorStop(0, `rgba(255, 105, 180, ${pinkOpacity})`);
        gradient.addColorStop(0.5, `rgba(255, 150, 200, ${pinkOpacity})`);
        gradient.addColorStop(1, `rgba(255, 200, 220, ${pinkOpacity})`);
      } else {
        gradient.addColorStop(0, colorScheme.gradient[0]);
        gradient.addColorStop(0.5, colorScheme.gradient[1]);
        gradient.addColorStop(1, colorScheme.gradient[2]);
      }

      // 为女声范围添加发光效果
      if (isFemaleRange) {
        const glowColor = `rgba(255, 105, 180, ${0.5 + flickerIntensity * 0.5})`;
        const glowBlur = 15 + flickerIntensity * 10;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowBlur;
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      history.forEach((pitch, i) => {
        const x = i * xStep;
        // 使用固定的频率范围进行归一化
        const normalizedFreq = (pitch.freq - minFreq) / (maxFreq - minFreq);
        const y = rect.height - normalizedFreq * rect.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      // 重置其他元素的阴影
      ctx.shadowBlur = 0;

      // 绘制当前点
      if (lastPitch) {
        const x = (history.length - 1) * xStep;
        // 使用固定的频率范围进行归一化
        const normalizedFreq = (lastPitch.freq - minFreq) / (maxFreq - minFreq);
        const y = rect.height - normalizedFreq * rect.height;

        // 根据范围设置颜色
        const baseColor = isFemaleRange 
          ? `rgba(255, 105, 180, ${0.7 + flickerIntensity * 0.3})` // 带闪烁的粉色
          : getNoteColor(lastPitch.note);

        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // 为女声范围添加带闪烁的发光效果
        const glowColor = isFemaleRange 
          ? `rgba(255, 105, 180, ${0.5 + flickerIntensity * 0.5})`
          : getNoteColor(lastPitch.note);
          
        const glowBlur = isFemaleRange ? 25 + flickerIntensity * 10 : 20;
        
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowBlur;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      trackingAnimationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (trackingAnimationRef.current) {
        cancelAnimationFrame(trackingAnimationRef.current);
      }
    };
  }, [isDetecting]);

  /**
   * 组件入场动画
   * 当组件挂载时，添加淡入和位移动画
   */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }
      );
    });

    return () => ctx.revert();
  }, []);

  const noteColor = currentPitch ? getNoteColor(currentPitch.note) : '#333';

  if (!isDetecting) {
    return (
      <div className="h-full flex items-center justify-center text-center">
        <p className="text-muted-foreground">点击开始按钮开始音高跟踪</p>
      </div>
    );
  }

  return (
    <>
      {/* Render PitchView when zen mode is enabled */}
      {isZenMode ? (
        <PitchView />
      ) : (
        <div ref={containerRef} className="h-full min-h-0 flex flex-col">




          {/* Real-time pitch tracking chart */}
          <div className="flex-1 min-h-0">
            <div className="glass-card p-3 h-full">
              <canvas
                ref={trackingCanvasRef}
                className="w-full h-full"
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>

          {/* Current pitch info */}
          {currentPitch && (
            <div className="mt-4 glass-card p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">当前音高</p>
                  <div className="flex items-baseline gap-2">
                    <p 
                      className="text-2xl font-bold" 
                      style={{ color: noteColor }}
                    >
                      {currentPitch.note}
                    </p>
                    <p className="text-lg text-muted-foreground">
                      {currentPitch.freq.toFixed(1)} Hz
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">置信度</p>
                  <p className="text-xl font-bold">
                    {Math.round(currentPitch.confidence * 100)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
