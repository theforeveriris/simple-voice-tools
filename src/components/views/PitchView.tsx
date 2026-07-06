/**
 * 音高显示组件
 * 用于实时显示当前检测到的音高、频率和置信度
 */
import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { getNoteColor } from '@/lib/pitchDetector';
import { cn } from '@/lib/utils';
import gsap from 'gsap';

/**
 * 音高显示组件
 * @returns React.ReactNode - 音高显示组件
 */
export function PitchView() {
  const currentPitch = useStore((state) => state.currentPitch);
  const [, setVolume] = useState(0);
  
  /**
   * 更新音量可视化
   * 根据当前音高的置信度更新音量状态
   */
  useEffect(() => {
    if (currentPitch) {
      setVolume(currentPitch.confidence * 100);
    }
  }, [currentPitch]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pitchDisplayRef = useRef<HTMLDivElement>(null);
  const freqDisplayRef = useRef<HTMLDivElement>(null);

  /**
   * 音高变化动画
   * 当检测到的音高变化时，添加平滑的缩放和透明度动画
   */
  useEffect(() => {
    if (currentPitch && pitchDisplayRef.current) {
      gsap.fromTo(
        pitchDisplayRef.current,
        { scale: 0.95, opacity: 0.8 },
        { scale: 1, opacity: 1, duration: 0.15, ease: 'power2.out' }
      );
    }
  }, [currentPitch?.note]);

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

  /**
   * 阻止鼠标滚轮事件
   * 防止在组件上滚动时影响页面
   */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  const noteColor = currentPitch ? getNoteColor(currentPitch.note) : '#333';

  return (
    <div ref={containerRef} className="h-full flex flex-col">


      {/* Main display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {/* Pitch circle */}
        <div
          ref={pitchDisplayRef}
          className={cn(
            'relative w-48 md:w-64 h-48 md:h-64 rounded-full',
            'flex flex-col items-center justify-center',
            'glass-card transition-all duration-300 overflow-hidden'
          )}
          style={{
            boxShadow: currentPitch ? `0 0 60px ${noteColor}30` : undefined,
          }}
        >
          {/* Water level inside the circle */}
          <div 
            className="absolute bottom-0 left-0 right-0 transition-all duration-300 ease-out z-0"
            style={{
              height: `${(currentPitch?.confidence || 0) * 100}%`,
              background: `linear-gradient(to top, ${noteColor}40, ${noteColor}80)`,
              boxShadow: `0 0 15px ${noteColor}50`
            }}
          />
          {/* Water ripple effect */}
          {currentPitch && (
            <div 
              className="absolute bottom-0 left-0 right-0 h-1 bg-white/30 rounded-full animate-pulse z-0"
              style={{ bottom: `${(currentPitch?.confidence || 0) * 100}%` }}
            />
          )}
          
          {/* Circular progress */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 z-10">
            <circle
              cx="96"
              cy="96"
              r="90"
              fill="none"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth="4"
            />
            <circle
              cx="96"
              cy="96"
              r="90"
              fill="none"
              stroke={noteColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(currentPitch?.confidence || 0) * 565} 565`}
              className="transition-all duration-300"
            />
          </svg>

          {/* Pitch info */}
          <div className="text-center z-20">
            <div
              className="text-5xl md:text-7xl font-bold tracking-tighter transition-colors duration-300"
              style={{ color: noteColor }}
            >
              {currentPitch?.note || '--'}
            </div>
            <div ref={freqDisplayRef} className="text-xl md:text-2xl text-muted-foreground mt-2 mono">
              {currentPitch ? `${currentPitch.freq.toFixed(1)} Hz` : '0.0 Hz'}
            </div>
            {/* Confidence percentage */}
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              <span>{Math.round((currentPitch?.confidence || 0) * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
