/**
 * 实时声域图 VRP（实验性 · 实时功能）
 * 滑唱时实时累积「半音 × 响度」驻留热力矩阵，复用分析页声域图画笔
 * （paintChart('vrp')，响度轴自适应 5–95 分位）。监听模式即开即看，
 * 缓冲保留最近约 2 分钟（与录音引擎监听上限一致）。
 */

import { recorder } from '@/lib/audio/recorder';
import { paintChart } from '@/components/charts/chartPainters';
import { freqToNote } from '@/constants';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LiveSheetFrame } from './LiveSheetFrame';
import { useLiveSheetLoop } from '@/hooks/useLiveSheetLoop';

interface Readout {
  hz: number;
  note: string;
  db: number;
}

export function VrpLiveSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  const showGrid = useStore((s) => s.settings.showGrid);

  // 绘制 + 读数循环：整个监听期累积（0 → 当前）
  const { attachCanvas, readout } = useLiveSheetLoop<Readout>({
    paint: (ctx, w, h) => {
      const snap = recorder.getLive();
      const t1 = Math.max(snap.elapsedSec, 1);
      paintChart('vrp', ctx, w, h, snap, 0, t1, showGrid, true, true);
    },
    sampleReadout: () => {
      const snap = recorder.getLive();
      let hz: number | null = null;
      let db = -90;
      for (let i = snap.f0.length - 1; i >= 0; i--) {
        if (isFinite(snap.f0[i]) && snap.f0[i] > 0) {
          hz = snap.f0[i];
          db = snap.rmsDb[i];
          break;
        }
      }
      return hz != null ? { hz, note: freqToNote(hz).name, db } : (null as unknown as Readout);
    },
  });

  return (
    <LiveSheetFrame
      title={t('vrpLive.title')}
      idleHint={t('vrpLive.hintIdle')}
      startLabel={t('vrpLive.start')}
      onClose={onClose}
    >
      <div className="mt-4 card-surface p-4">
        <canvas
          ref={attachCanvas}
          className="block h-[58vh] min-h-[340px] w-full"
          aria-label={t('vrpLive.title')}
        />
        <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-2">{t('vrpLive.hint')}</p>
      </div>

      {/* 实时读数：当前音高与响度 */}
      <div className="mt-3.5 flex items-center justify-center gap-x-10 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <div className="text-center">
          <p className="text-[10px] font-medium tracking-wide text-ink-2">F0</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {readout ? readout.hz.toFixed(1) : '—'}
            <span className="ml-0.5 text-[10px] font-normal text-ink-2">Hz</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium tracking-wide text-ink-2">{readout ? readout.note : '—'}</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {readout ? readout.db.toFixed(0) : '—'}
            <span className="ml-0.5 text-[10px] font-normal text-ink-2">dB</span>
          </p>
        </div>
      </div>
      {!readout && (
        <p className="mt-2 text-center text-xs text-ink-2">{t('vrpLive.noSignal')}</p>
      )}
    </LiveSheetFrame>
  );
}
