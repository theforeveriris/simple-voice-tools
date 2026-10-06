/**
 * 分享图样式选择底部弹层：四种样式（主题/暗色/浅色/极光）实时预览，
 * 主按钮走系统分享（可用时）或下载 PNG。渲染函数由调用方注入
 * （单条记录 / 两两对比共用同一弹层）。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { shareOrDownload, type ShareCardStyle } from '@/lib/export/shareCard';
import { cn } from '@/lib/utils';

const STYLE_OPTIONS: { id: ShareCardStyle; labelKey: 'share.styleThemed' | 'share.styleDark' | 'share.styleLight' | 'share.styleAurora' }[] = [
  { id: 'themed', labelKey: 'share.styleThemed' },
  { id: 'dark', labelKey: 'share.styleDark' },
  { id: 'light', labelKey: 'share.styleLight' },
  { id: 'aurora', labelKey: 'share.styleAurora' },
];

export function ShareCardSheet({
  open,
  onClose,
  render,
  filename,
}: {
  open: boolean;
  onClose: () => void;
  /** 按样式绘制分享卡（预览与导出共用同一渲染入口） */
  render: (style: ShareCardStyle) => HTMLCanvasElement;
  filename: string;
}) {
  useI18n();
  const [style, setStyle] = useState<ShareCardStyle>('themed');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 切换样式即重渲染预览；render 闭包随父组件更新（开销为一次 Canvas 绘制，可接受）
  useEffect(() => {
    if (!open) return;
    try {
      setPreview(render(style).toDataURL('image/png'));
    } catch {
      setPreview(null);
    }
  }, [open, style, render]);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await shareOrDownload(render(style), filename);
      if (outcome === 'downloaded') toast.success(t('toast.shareDownloaded'));
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(t('toast.shareFail'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160]">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl rounded-t-[28px] bg-surface p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-10px_40px_rgba(28,25,45,0.18)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">{t('share.pickStyle')}</p>
          <button
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="grid size-8 place-items-center rounded-full text-ink-2 transition-transform active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        {preview ? (
          <img
            src={preview}
            alt=""
            className="mx-auto max-h-[44dvh] rounded-2xl shadow-[0_4px_24px_rgba(28,25,45,0.14)]"
          />
        ) : (
          <div className="grid h-56 place-items-center rounded-2xl bg-card">
            <Loader2 size={18} className="animate-spin text-ink-2" />
          </div>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {STYLE_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors',
                style === s.id
                  ? 'bg-accent text-white'
                  : 'bg-card text-ink-2 shadow-[0_1px_4px_rgba(28,25,45,0.06)]',
              )}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <button
          onClick={onShare}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
          {t('share.shareAction')}
        </button>
      </motion.div>
    </div>
  );
}
