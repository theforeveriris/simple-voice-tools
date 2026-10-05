/**
 * Token 用量分区（实验性 · 大模型配置下方）
 * 读取本机 kv（llm:usage:*）展示各功能的调用次数与 token 消耗，
 * 可填每百万 tokens 单价折算估算费用；纯读取型面板（参照 StorageUsage
 * 的挂载即算模式）+ 单价设置行；数据由 lib/llm.ts 落账。
 */

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import {
  clearLlmUsage, emptyTotals, LLM_FEATURES, readLlmUsage,
  type LlmFeature, type LlmUsageCount, type LlmUsageSnapshot,
} from '@/lib/llmUsage';
import { t } from '@/i18n';
import type { DictKey } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { SettingsSection, SettingRow } from './rows';

const FEATURE_KEY: Record<LlmFeature, DictKey> = {
  advice: 'settings.llmUsageFeatureAdvice',
  weekly: 'settings.llmUsageFeatureWeekly',
  translate: 'settings.llmUsageFeatureTranslate',
  test: 'settings.llmUsageFeatureTest',
  assistant: 'settings.llmUsageFeatureAssistant',
};

/** token 数紧凑格式：<1000 原样，否则 K（一位小数） */
function fmtTokens(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}K`;
}

/** 费用紧凑格式：小于 0.01 保留四位，其余两位小数 */
function fmtCost(n: number): string {
  return n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const numCls =
  'w-20 rounded-lg border border-black/10 bg-surface-hi px-2 py-1 text-right text-xs tabular-nums text-ink outline-none placeholder:text-ink-2/50 focus:border-accent';

export function LlmUsageSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  const [snap, setSnap] = useState<LlmUsageSnapshot | null>(null);
  // 清空按钮两步确认：第一次点击进入确认态，再次点击才真正清空
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let alive = true;
    void readLlmUsage()
      .then((s) => {
        if (alive) setSnap(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    void clearLlmUsage()
      .then(() => setSnap({ totals: emptyTotals(), log: [] }))
      .catch(() => {});
  };

  const priceIn = settings.llmPriceIn ?? 0;
  const priceOut = settings.llmPriceOut ?? 0;
  const showCost = priceIn > 0 || priceOut > 0;
  const cost = (c: LlmUsageCount) => (c.promptTokens / 1e6) * priceIn + (c.completionTokens / 1e6) * priceOut;

  const onPrice = (key: 'llmPriceIn' | 'llmPriceOut') => (v: string) => {
    update({ [key]: v === '' ? undefined : Math.max(0, Number(v) || 0) });
  };

  return (
    <SettingsSection icon={Gauge} title={t('settings.llmUsageTitle')}>
      {/* 单价设置（始终可见，无调用记录时也可先填） */}
      <SettingRow stacked label={t('settings.llmUsagePrice')} desc={t('settings.llmUsagePriceDesc')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-2">↑ {t('settings.llmUsagePrompt')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={settings.llmPriceIn ?? ''}
            onChange={(e) => onPrice('llmPriceIn')(e.target.value)}
            placeholder="0"
            className={numCls}
          />
          <span className="ml-2 text-[11px] text-ink-2">↓ {t('settings.llmUsageCompletion')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={settings.llmPriceOut ?? ''}
            onChange={(e) => onPrice('llmPriceOut')(e.target.value)}
            placeholder="0"
            className={numCls}
          />
        </div>
      </SettingRow>
      {!snap ? (
        <p className="py-2 text-xs text-ink-2">{t('settings.llmUsageCounting')}</p>
      ) : snap.totals.all.calls === 0 ? (
        <p className="py-2 text-xs leading-relaxed text-ink-2">{t('settings.llmUsageEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {LLM_FEATURES.filter((f) => snap.totals.byFeature[f].calls > 0).map((f) => {
            const c = snap.totals.byFeature[f];
            return (
              <SettingRow key={f} label={t(FEATURE_KEY[f])}>
                <span className="text-[11px] tabular-nums text-ink-2">
                  {c.calls} {t('settings.llmUsageCalls')}
                  <span className="ml-2">↑ {fmtTokens(c.promptTokens)}</span>
                  <span className="ml-1.5">↓ {fmtTokens(c.completionTokens)}</span>
                  {showCost && <span className="ml-1.5">≈ {fmtCost(cost(c))}</span>}
                </span>
              </SettingRow>
            );
          })}
          <SettingRow label={<span className="font-semibold">{t('settings.llmUsageTotal')}</span>}>
            <span className="text-[11px] font-semibold tabular-nums text-ink">
              {snap.totals.all.calls} {t('settings.llmUsageCalls')}
              <span className="ml-2">↑ {fmtTokens(snap.totals.all.promptTokens)}</span>
              <span className="ml-1.5">↓ {fmtTokens(snap.totals.all.completionTokens)}</span>
              {showCost && <span className="ml-1.5">≈ {fmtCost(cost(snap.totals.all))}</span>}
            </span>
          </SettingRow>
          {snap.totals.all.estCalls > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
              {t('settings.llmUsageEst', { count: snap.totals.all.estCalls })}
            </p>
          )}
          {snap.log.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-medium text-ink-2">{t('settings.llmUsageRecent')}</p>
              <ul className="flex flex-col gap-0.5">
                {snap.log.slice(0, 8).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-3 text-[10px] tabular-nums text-ink-2">
                    <span className="shrink-0">{fmtTime(e.at)}</span>
                    <span className="min-w-0 flex-1 truncate">{t(FEATURE_KEY[e.feature])} · {e.model}</span>
                    <span className="shrink-0">{e.est ? '~' : ''}{fmtTokens(e.promptTokens + e.completionTokens)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-snug text-ink-2">{t('settings.llmUsageDesc')}</p>
            <button
              onClick={onClear}
              className="shrink-0 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              {t(confirmClear ? 'settings.llmUsageClearConfirm' : 'settings.llmUsageClear')}
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
