/**
 * 局域网点对点同步（数据页区块）
 * 三步引导：创建邀请 / 加入 / 完成同步。信令（SDP 文本）由用户复制粘贴搬运——
 * 不需要任何服务器，数据只在两台设备之间流动。双向同步：两端各自对比
 * 对方清单拉取缺失记录（含音频）。
 */

import { useEffect, useRef, useState } from 'react';
import { Copy, Link2, QrCode, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LanSyncSession, type SyncProgress } from '@/lib/sync/lanSync';
import { getRecentPeers, rememberPeer, type LanPeer } from '@/lib/sync/lanPeers';
import { idbPutAudio } from '@/lib/storage/idb';
import { useHistoryStore } from '@/store/useHistoryStore';
import { SettingsSection } from './rows';
import { cn } from '@/lib/utils';

type Step = 'idle' | 'offer-created' | 'answer-created' | 'connected';

export function LanSyncSection() {
  useI18n();
  const [step, setStep] = useState<Step>('idle');
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const [sdpOut, setSdpOut] = useState('');
  const [sdpIn, setSdpIn] = useState('');
  const [progress, setProgress] = useState<SyncProgress>({ phase: 'idle', transferred: 0, total: 0 });
  const [peers, setPeers] = useState<LanPeer[]>(() => getRecentPeers());
  const sessionRef = useRef<LanSyncSession | null>(null);
  /** 本次握手识别到的对端设备名（done 时记入最近设备） */
  const peerNameRef = useRef('');

  useEffect(() => () => sessionRef.current?.close(), []);

  const makeSession = () => new LanSyncSession({
    deviceName: navigator.userAgent.includes('Android') ? 'Android' : navigator.platform || 'device',
    onProgress: (p) => {
      if (p.phase === 'handshake' && p.detail) peerNameRef.current = p.detail;
      if (p.phase === 'done') {
        rememberPeer(peerNameRef.current);
        setPeers(getRecentPeers());
      }
      setProgress(p);
    },
    getRecords: () => useHistoryStore.getState().getAllRecords(),
    getAudio: (id) => useHistoryStore.getState().getAudio(id),
    putRecord: (r) => Promise.resolve(useHistoryStore.getState().addRecord(r)),
    putAudio: (id, blob) => idbPutAudio(id, blob),
  });

  const startHost = async () => {
    const s = makeSession();
    sessionRef.current = s;
    setRole('host');
    try {
      const offer = await s.createOffer();
      setSdpOut(offer);
      setStep('offer-created');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const joinAsGuest = async () => {
    if (!sdpIn.trim()) return;
    const s = makeSession();
    sessionRef.current = s;
    setRole('guest');
    try {
      const answer = await s.acceptOffer(sdpIn.trim());
      setSdpOut(answer);
      setStep('answer-created');
    } catch {
      toast.error(t('lanSync.badSdp'));
    }
  };

  const hostAcceptAnswer = async () => {
    if (!sessionRef.current || !sdpIn.trim()) return;
    try {
      await sessionRef.current.acceptAnswer(sdpIn.trim());
      setStep('connected');
    } catch {
      toast.error(t('lanSync.badSdp'));
    }
  };

  const copyOut = () => {
    void navigator.clipboard.writeText(sdpOut).then(() => toast.success(t('lanSync.copied')));
  };

  const reset = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStep('idle');
    setRole(null);
    setSdpOut('');
    setSdpIn('');
    setProgress({ phase: 'idle', transferred: 0, total: 0 });
  };

  const busy = progress.phase === 'connecting' || progress.phase === 'handshake' || progress.phase === 'transferring';

  return (
    <SettingsSection icon={Wifi} title={t('lanSync.title')}>
      <p className="mb-2 px-0.5 text-[11px] leading-relaxed text-ink-2">{t('lanSync.desc')}</p>

      {step === 'idle' && (
        <div className="flex gap-2 px-0.5">
          <button
            onClick={() => void startHost()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-medium text-on-accent transition-transform active:scale-95"
          >
            <QrCode size={13} />
            {t('lanSync.host')}
          </button>
          <button
            onClick={() => { setRole('guest'); setStep('offer-created'); }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-surface-hi px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-accent"
          >
            <Link2 size={13} />
            {t('lanSync.guest')}
          </button>
        </div>
      )}

      {step === 'idle' && peers.length > 0 && (
        <div className="mt-2.5 px-0.5">
          <p className="text-[11px] font-medium text-ink-2">{t('lanSync.recent')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {peers.map((p) => (
              <button
                key={p.name}
                onClick={() => void startHost()}
                title={t('lanSync.recentHost', { name: p.name })}
                className="rounded-full border border-black/10 bg-surface-hi px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-accent"
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-2">{t('lanSync.recentHint')}</p>
        </div>
      )}

      {step === 'offer-created' && (
        <div className="flex flex-col gap-2 px-0.5">
          {role === 'host' && (
            <p className="text-[11px] leading-relaxed text-ink-2">{t('lanSync.hostStep1')}</p>
          )}
          {role === 'guest' && (
            <>
              <p className="text-[11px] leading-relaxed text-ink-2">{t('lanSync.guestStep1')}</p>
              <textarea
                value={sdpIn}
                onChange={(e) => setSdpIn(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder={t('lanSync.pasteHere')}
                className="w-full resize-y rounded-xl border border-black/10 bg-card p-2.5 font-mono text-[10px] leading-relaxed text-ink outline-none focus:border-accent"
              />
              <button
                onClick={() => void joinAsGuest()}
                disabled={!sdpIn.trim()}
                className="self-start rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-transform active:scale-95 disabled:opacity-40"
              >
                {t('lanSync.generateAnswer')}
              </button>
            </>
          )}
          {sdpOut && (
            <>
              <p className="text-[11px] leading-relaxed text-ink-2">
                {role === 'host' ? t('lanSync.copyOffer') : t('lanSync.copyAnswer')}
              </p>
              <textarea
                readOnly
                value={sdpOut}
                rows={4}
                spellCheck={false}
                className="w-full resize-y rounded-xl border border-black/10 bg-surface-hi p-2.5 font-mono text-[10px] leading-relaxed text-ink-2"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={copyOut}
                className="flex items-center gap-1.5 self-start rounded-full border border-black/10 bg-surface-hi px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent"
              >
                <Copy size={12} />
                {t('lanSync.copy')}
              </button>
            </>
          )}
          {role === 'host' && (
            <>
              <p className="text-[11px] leading-relaxed text-ink-2">{t('lanSync.hostStep2')}</p>
              <textarea
                value={sdpIn}
                onChange={(e) => setSdpIn(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder={t('lanSync.pasteHere')}
                className="w-full resize-y rounded-xl border border-black/10 bg-card p-2.5 font-mono text-[10px] leading-relaxed text-ink outline-none focus:border-accent"
              />
              <button
                onClick={() => void hostAcceptAnswer()}
                disabled={!sdpIn.trim() || busy}
                className="self-start rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-transform active:scale-95 disabled:opacity-40"
              >
                {t('lanSync.connect')}
              </button>
            </>
          )}
        </div>
      )}

      {step === 'answer-created' && role === 'guest' && (
        <p className="px-0.5 text-[11px] leading-relaxed text-ink-2">{t('lanSync.guestStep2')}</p>
      )}

      {(busy || progress.phase === 'done') && (
        <div className="mt-1 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <p className="text-xs font-medium text-ink">
            {progress.phase === 'done' ? t('lanSync.done') : t('lanSync.syncing')}
            {progress.detail && <span className="ml-1 text-ink-2">{progress.detail}</span>}
          </p>
          {progress.total > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, (progress.transferred / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {progress.phase === 'error' && (
        <p className="px-0.5 text-[11px] text-[#B0532F]">{t('lanSync.error')}{progress.detail ? `：${progress.detail}` : ''}</p>
      )}

      {step !== 'idle' && (
        <button
          onClick={reset}
          className={cn('self-start px-0.5 pt-1 text-xs font-medium text-ink-2 transition-opacity hover:opacity-70')}
        >
          {t('lanSync.reset')}
        </button>
      )}
    </SettingsSection>
  );
}
