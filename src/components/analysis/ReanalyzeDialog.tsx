/**
 * 用当前参数重算对话框（分析页）
 * 取记录的录音音频 → 重跑当前算法参数的完整管线（带进度）→ 新旧统计对比 →
 * 用户确认后才覆盖落库。应用前不写任何存储；元数据（id/createdAt/mode/note）不变，
 * 应用后记录带 reanalyzedAt / paramsFp 标记。
 * 无录音音频的记录在入口处提示，不进本对话框。
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useStore } from '@/store/useStore';
import { reanalyzeRecord } from '@/lib/audio/reanalyze';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord, VoiceStats } from '@/types';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui';

interface DeltaRow {
  label: string;
  get: (s: VoiceStats) => string;
}

export function ReanalyzeDialog({
  record,
  open,
  onOpenChange,
}: {
  record: AnalysisRecord;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useI18n();
  const [running, setRunning] = useState(false);
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState<AnalysisRecord | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setPct(0);
      return;
    }
    let alive = true;
    setRunning(true);
    setResult(null);
    setPct(0);
    void (async () => {
      try {
        const audio = await useHistoryStore.getState().getAudio(record.id);
        if (!audio) {
          if (alive) {
            toast.info(t('analysis.reanalyzeNeedAudio'));
            onOpenChange(false);
          }
          return;
        }
        const s = useStore.getState().settings;
        const targetRange = s.targetEnabled ? [s.targetF0Min, s.targetF0Max] as [number, number] : null;
        const out = await reanalyzeRecord(record, audio, {
          targetRange,
          onProgress: (f) => {
            if (alive) setPct(f);
          },
        });
        if (!alive) return;
        setTruncated(out.truncated);
        setResult(out.record);
      } catch (err) {
        if (!alive) return;
        toast.error(
          err instanceof Error && err.message === 'tooShort'
            ? t('toast.importAudioTooShort')
            : t('toast.reanalyzeFail'),
        );
        onOpenChange(false);
      } finally {
        if (alive) setRunning(false);
      }
    })();
    return () => {
      alive = false;
    };
    // record 变化时对话框必然由父层重新打开（open 翻转），无需入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = () => {
    if (!result) return;
    useHistoryStore.getState().updateRecord(result);
    useStore.getState().setCurrentAnalysis(result);
    toast.success(t('toast.reanalyzeDone'));
    onOpenChange(false);
  };

  const rows: DeltaRow[] = [
    { label: t('analysis.rowAvgF0'), get: (s) => `${s.avgF0.toFixed(1)} Hz` },
    { label: t('analysis.rowMedianF0'), get: (s) => `${s.medianF0.toFixed(1)} Hz` },
    { label: t('analysis.rowP10P90'), get: (s) => `${s.p10F0.toFixed(0)} / ${s.p90F0.toFixed(0)} Hz` },
    { label: t('analysis.rowStdF0'), get: (s) => `${s.stdF0.toFixed(1)} Hz` },
    { label: t('analysis.rowAvgF1'), get: (s) => (s.avgF1 != null ? `${s.avgF1.toFixed(0)} Hz` : '—') },
    { label: t('analysis.rowAvgF2'), get: (s) => (s.avgF2 != null ? `${s.avgF2.toFixed(0)} Hz` : '—') },
    { label: t('analysis.rowAvgDb'), get: (s) => `${s.avgDb.toFixed(1)} dB` },
    { label: t('analysis.rowJitter'), get: (s) => (s.jitterPct != null ? `${s.jitterPct.toFixed(2)} %` : '—') },
    { label: t('analysis.rowShimmer'), get: (s) => (s.shimmerPct != null ? `${s.shimmerPct.toFixed(2)} %` : '—') },
    { label: t('analysis.rowHnr'), get: (s) => (s.hnrDb != null ? `${s.hnrDb.toFixed(1)} dB` : '—') },
    { label: t('analysis.rowCpps'), get: (s) => (s.cppsDb != null ? `${s.cppsDb.toFixed(1)} dB` : '—') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-ink">{t('analysis.reanalyzeTitle')}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-ink-2">
            {t('analysis.reanalyzeDesc')}
          </DialogDescription>
        </DialogHeader>
        {running ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-hi">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
            <p className="text-xs text-ink-2">{t('analysis.reanalyzeRunning', { pct: Math.round(pct * 100) })}</p>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-2">
            {truncated && (
              <p className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-600">
                {t('analysis.reanalyzeTruncated')}
              </p>
            )}
            <div className="overflow-hidden rounded-xl border border-black/[0.06]">
              <table className="w-full border-collapse text-left text-[11px] tabular-nums">
                <thead>
                  <tr className="bg-surface-hi/70">
                    <th className="px-2.5 py-1.5 font-medium text-ink-2">{t('analysis.rowMetric')}</th>
                    <th className="px-2.5 py-1.5 font-medium text-ink-2">{t('analysis.reanalyzeOld')}</th>
                    <th className="px-2.5 py-1.5 font-medium text-accent">{t('analysis.reanalyzeNew')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-black/[0.05]">
                      <td className="px-2.5 py-1.5 text-ink-2">{r.label}</td>
                      <td className="px-2.5 py-1.5 text-ink-2/80">{r.get(record.stats)}</td>
                      <td className="px-2.5 py-1.5 font-medium text-ink">{r.get(result.stats)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={apply}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                {t('analysis.reanalyzeApply')}
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
