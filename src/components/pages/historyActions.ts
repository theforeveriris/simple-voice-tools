/**
 * 历史记录操作（与列表项组件分开：组件文件只导出组件）
 * 删除并支持 5 秒内撤销：预取音频 Blob 留在内存，撤销时原样恢复。
 */

import { toast } from 'sonner';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

export async function removeWithUndo(
  list: AnalysisRecord[],
  store: {
    removeRecord: (id: string) => void;
    addRecord: (record: AnalysisRecord, audioBlob?: Blob) => void;
    getAudio: (id: string) => Promise<Blob | null>;
  },
): Promise<void> {
  // 音频预取：数量多时可能占用大量内存，仅少量记录保留音频，多量只恢复记录本身
  const audio = new Map<string, Blob>();
  if (list.length <= 20) {
    for (const r of list) {
      const blob = await store.getAudio(r.id);
      if (blob) audio.set(r.id, blob);
    }
  }
  for (const r of list) store.removeRecord(r.id);
  toast.success(list.length > 1 ? t('toast.deletedMany', { n: list.length }) : t('toast.deletedOne'), {
    duration: 6000,
    action: {
      label: t('common.undo'),
      onClick: () => {
        for (const r of list) store.addRecord(r, audio.get(r.id));
        toast.success(t('toast.undoDone'));
      },
    },
  });
}
