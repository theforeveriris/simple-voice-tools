/**
 * 频谱图组件
 * 用于实时显示音频频谱分析
 */
import { useEffect, useRef } from 'react';
import { useStore, colorSchemes } from '@/store/useStore';
import gsap from 'gsap';

/**
 * 频谱图组件
 * @returns React.ReactNode - 频谱图组件
 */
export function SpectrumView() {
  const isDetecting = useStore((state) => state.isDetecting);
  const settings = useStore((state) => state.settings);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  /**
   * 初始化频谱音频上下文
   * 当开始检测时创建音频上下文和分析器
   */
  useEffect(() => {
    if (!isDetecting) {
      // 不检测时清理音频上下文
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      return;
    }

    /**
     * 初始化音频
     * 创建音频上下文、获取麦克风权限并设置分析器
     */
    const initAudio = async () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          } 
        });
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);
        
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
        
        // 分析器初始化后开始绘制
        startDrawing();
      } catch (err) {
        console.error('Failed to initialize audio:', err);
      }
    };

    initAudio();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [isDetecting]);

  /**
   * 开始绘制频谱
   * 使用 Canvas API 绘制实时频谱图
   */
  const startDrawing = () => {
    if (!isDetecting || !analyserRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    /**
     * 绘制函数
     * 每帧更新频谱图
     */
    const draw = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = settings.theme === 'dark' ? '#0a0a0a' : '#fafafa';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // 绘制网格
      ctx.strokeStyle = settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      
      // 水平网格线
      for (let i = 0; i <= 5; i++) {
        const y = (rect.height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }

      // 垂直网格线（对数频率）
      const freqs = [100, 200, 500, 1000, 2000, 5000, 10000];
      freqs.forEach((freq) => {
        const x = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20)) * rect.width;
        if (x >= 0 && x <= rect.width) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, rect.height);
          ctx.stroke();
        }
      });

      // 绘制频率标签
      ctx.fillStyle = settings.theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
      ctx.font = '10px Inter Tight';
      ctx.textAlign = 'center';
      freqs.forEach((freq) => {
        const x = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20)) * rect.width;
        if (x >= 0 && x <= rect.width) {
          ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x, rect.height - 8);
        }
      });

      // 绘制频谱柱
      const barCount = Math.floor(bufferLength / 1);
      const barWidth = rect.width / barCount;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = percent * rect.height * 0.9;

        // 计算此频率 bin 的频率
        const sampleRate = audioCtxRef.current?.sampleRate || 44100;
        const freq = (i * sampleRate) / (bufferLength * 2);
        
        // 映射到 x 位置（对数刻度）
        const x = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20)) * rect.width;
        const barW = barWidth * 0.8;

        if (x >= 0 && x <= rect.width) {
          // 基于选定的配色方案创建渐变
          const colorScheme = colorSchemes[settings.chart.colorScheme];
          const gradient = ctx.createLinearGradient(0, rect.height, 0, rect.height - barHeight);
          gradient.addColorStop(0, colorScheme.gradient[0]);
          gradient.addColorStop(0.5, colorScheme.gradient[1]);
          gradient.addColorStop(1, colorScheme.gradient[2]);

          ctx.fillStyle = gradient;
          ctx.fillRect(x - barW / 2, rect.height - barHeight, barW, barHeight);
        }
      }

      // 使用选定的配色方案绘制峰值线
      const colorScheme = colorSchemes[settings.chart.colorScheme];
      ctx.strokeStyle = colorScheme.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = percent * rect.height * 0.9;
        
        const sampleRate = audioCtxRef.current?.sampleRate || 44100;
        const freq = (i * sampleRate) / (bufferLength * 2);
        const x = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20)) * rect.width;
        const y = rect.height - barHeight;

        if (x >= 0 && x <= rect.width) {
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  /**
   * 设置变化时重启绘制
   * 当主题或配色方案改变时，重新开始绘制
   */
  useEffect(() => {
    if (isDetecting && analyserRef.current) {
      // 取消现有的动画
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // 使用新设置重启绘制
      startDrawing();
    }
  }, [settings.theme, settings.chart.colorScheme, isDetecting]);

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

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Spectrum canvas */}
      <div className="flex-1 glass-card overflow-hidden">
        {!isDetecting ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">点击开始按钮查看频谱图</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>


    </div>
  );
}
