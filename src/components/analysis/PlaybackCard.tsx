/**
 * 录音回放条
 * 纯展示组件：音频元素由页面层持有（见 usePlayback.ts），播放头位置驱动全部图表
 */

import { motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { t } from '@/i18n';

/** 录音回放条（纯展示）：音频元素由页面层持有，播放头位置驱动全部图表 */
export function PlaybackCard({
  url,
  playing,
  position,
  duration,
  onToggle,
  onSeek,
}: {
  url: string | null;
  playing: boolean;
  position: number | null;
  duration: number;
  onToggle: () => void;
  onSeek: (frac: number) => void;
}) {
  if (!url) return null;
  const pos = position ?? 0;
  const frac = duration > 0 ? Math.max(0, Math.min(1, pos / duration)) : 0;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3.5 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]"
    >
      <button
        onClick={onToggle}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform active:scale-90"
        aria-label={playing ? t('analysis.pauseAria') : t('analysis.playAria')}
      >
        {playing ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(frac * 1000)}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
          aria-label={t('analysis.progressAria')}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-2">
        {fmt(pos)} / {fmt(duration)}
      </span>
    </motion.div>
  );
}
