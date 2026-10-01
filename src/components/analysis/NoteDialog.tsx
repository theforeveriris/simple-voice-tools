/**
 * 备注编辑对话框
 * 保存后同步更新历史记录与当前分析记录
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/* --------------------------------- 备注编辑 --------------------------------- */

export function NoteDialog({
  record,
  open,
  onOpenChange,
}: {
  record: AnalysisRecord;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const updateRecord = useHistoryStore((s) => s.updateRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const [text, setText] = useState(record.note ?? '');
  // 渲染期派生：每次打开对话框时同步为当前记录的备注
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText(record.note ?? '');
  }

  const save = () => {
    const updated: AnalysisRecord = { ...record, note: text.trim() || undefined };
    updateRecord(updated);
    setCurrentAnalysis(updated);
    onOpenChange(false);
    toast.success(text.trim() ? t('toast.noteSaved') : t('toast.noteCleared'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink">{t('analysis.noteTitle')}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('analysis.notePlaceholder')}
          className="min-h-24 rounded-2xl border-black/10 bg-surface-hi text-sm text-ink"
          maxLength={60}
        />
        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
