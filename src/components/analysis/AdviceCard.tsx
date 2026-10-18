/**
 * 璁粌寤鸿鍗★紙瀹為獙鎬э級
 * adviceMode = rules锛氭湰鍦拌鍒欏紩鎿庣敓鎴愶紙lib/advice.ts锛夛紱
 * adviceMode = lua：用户 Lua 脚本生成（lib/lua/advice.ts，脚本中心）；
 * adviceMode = llm锛氳皟鐢?璁剧疆 鈫?澶фā鍨?涓娇鐢ㄤ腑妗ｆ鐨勬帴鍙ｏ紙lib/llm.ts锛夈€?
 * 浼犲叆涓ゆ潯璁板綍鏃讹紙瀵规瘮椤碉級鎸?A / B 鍒嗙粍缁欒鍒欏缓璁紝
 * 澶фā鍨嬪垯鍚堝苟涓や唤缁熻鐢熸垚瀵规瘮鎬у缓璁€?
 */

import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { buildAdvice, type AdviceTarget } from '@/lib/advice';
import { buildLuaAdvice, type LuaAdviceItem } from '@/lib/lua/advice';
import {
  cachedLlmAdvice, fetchLlmAdvice, hasCachedLlmAdvice, llmAdviceKey,
  type LlmConfig, type LlmPromptOptions,
} from '@/lib/llm';
import { useActiveLlmConfig } from '@/lib/llmProfiles';
import { useLlmStream } from '@/hooks/useLlmStream';
import { fmtShortDateTime } from '@/lib/utils';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { LlmResultView, StreamPreview } from '@/components/analysis/LlmResultView';

/** 寤鸿鍗￠€氱敤楠ㄦ灦锛氭爣棰樿 + 鍐呭 + 搴曢儴鎻愮ず */
export function AdviceCard({ records }: { records: AnalysisRecord[] }) {
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  const activeProfileId = useStore((s) => s.settings.llmActiveProfileId);
  const cfg = useActiveLlmConfig(activeProfileId);
  const extraRules = useStore((s) => s.settings.llmExtraRules);
  const promptOverride = useStore((s) => s.settings.llmPromptOverride);
  const userGoal = useStore((s) => s.settings.userGoal);
  const ageGroup = useStore((s) => s.settings.ageGroup);
  const baselineId = useStore((s) => s.settings.baselineRecordId);
  const baselineRecord = useHistoryStore((s) =>
    baselineId ? s.records.find((r) => r.id === baselineId) ?? null : null,
  );
  if (adviceMode === 'none') return null;
  const target: AdviceTarget = { enabled: targetEnabled, min: targetMin, max: targetMax };
  // 鍩虹嚎 螖 鍙湪鍗曡褰曪紙鍒嗘瀽椤碉級涓旈潪鑷韩鏃堕檮甯?
  const baseline =
    records.length === 1 && baselineRecord && baselineRecord.id !== records[0].id
      ? baselineRecord
      : null;
  return (
    <div className="card-surface p-4">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Lightbulb size={13} className="text-accent" />
          {t('analysis.adviceTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>
      {adviceMode === 'llm'
        ? (
          <LlmAdvice
            records={records}
            target={target}
            cfg={cfg}
            baseline={baseline}
            prompt={{ extraRules, promptOverride, goal: userGoal, ageGroup }}
          />
        )
        : adviceMode === 'lua'
          ? <LuaAdvice records={records} target={target} />
          : <RuleAdvice records={records} target={target} />}
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-ink-2">
        {t(
          adviceMode === 'llm'
            ? 'analysis.adviceHintLlm'
            : adviceMode === 'lua'
              ? 'analysis.adviceHintLua'
              : 'analysis.adviceHint',
        )}
      </p>
    </div>
  );
}

/** 瑙勫垯鍒ゆ柇锛氭湰鍦伴€愭潯鐢熸垚锛涗袱鏉¤褰曟椂鎸?A / B 鍒嗙粍 */
function RuleAdvice({ records, target }: { records: AnalysisRecord[]; target: AdviceTarget }) {
  const paired = records.length > 1;
  return (
    <div className={paired ? 'flex flex-col gap-2.5' : undefined}>
      {records.map((rec, i) => (
        <div key={rec.id}>
          {paired && (
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={`grid size-5 place-items-center rounded-full text-[10px] font-bold text-white ${i === 0 ? 'bg-accent' : 'bg-accent2'}`}
              >
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="text-[10px] text-ink-2">{fmtShortDateTime(rec.createdAt)}</span>
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {buildAdvice(rec, target).map((tip) => (
              <li key={tip.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{t(tip.key, tip.params)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Lua 脚本判断：异步跑启用的脚本（脚本中心），错误折叠提示。
 *  鐢?records/target 娲剧敓 key + 璁℃暟鍣ㄥ湪娓叉煋鏈熺敓鎴愯姹傛爣璇嗭紙鏃?effect setState锛夛細
 *  state 瀛樸€屼笂娆″畬鎴愮殑缁撴灉 + 褰撴椂 key銆嶏紝key 涓嶅尮閰嶅嵆瑙嗕负鍔犺浇涓紝鏁版嵁鍒颁綅鍚?setState 钀藉畾銆?*/
function LuaAdvice({ records, target }: { records: AnalysisRecord[]; target: AdviceTarget }) {
  // 璁板綍缁勫悎鐨勭ǔ瀹氭爣璇嗭紙id 鎷兼帴 + 鐩爣鍊硷級锛岄┍鍔ㄩ噸鏂拌姹?
  const reqKey = `${records.map((r) => `${r.id}:${r.reanalyzedAt ?? 0}`).join('|')}#${target.enabled}:${target.min}:${target.max}`;
  const [done, setDone] = useState<{ key: string; tips: LuaAdviceItem[]; errors: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const merged: LuaAdviceItem[] = [];
      let errs = 0;
      for (const rec of records) {
        const res = await buildLuaAdvice(rec, target);
        if (!alive) return;
        merged.push(...res.tips);
        errs += res.errors.length;
      }
      if (alive) setDone({ key: reqKey, tips: merged.slice(0, 3), errors: errs });
    })();
    return () => { alive = false; };
  }, [reqKey, records, target]);
  if (done?.key !== reqKey) {
    return (
      <div className="flex items-center gap-2 px-0.5 text-xs text-ink-2">
        <Loader2 size={13} className="animate-spin text-accent" />
        {t('analysis.adviceLlmLoading')}
      </div>
    );
  }
  return (
    <div>
      {done.tips.length === 0
        ? (
          <p className="px-0.5 text-xs leading-relaxed text-ink-2">
            {t('analysis.adviceGood')}
          </p>
        )
        : (
          <ul className="flex flex-col gap-1.5">
            {done.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tip.level === 'warn' ? 'bg-[#D66E5B]' : 'bg-accent'}`} />
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        )}
      {done.errors > 0 && (
        <p className="mt-1.5 px-0.5 text-[10px] text-ink-2">
          {t('analysis.adviceLuaError', { n: done.errors })}
        </p>
      )}
    </div>
  );
}

/** 澶фā鍨嬪垽鏂細鐐瑰嚮瑙﹀彂鍚庡紓姝ョ敓鎴愶紙浼氳瘽鍐呯紦瀛橈紝澶辫触鍙噸璇曪級銆?
 *  浠樿垂璋冪敤浠呯敱鐢ㄦ埛鏄惧紡鍙戣捣锛堜笉涓婁紶闊抽锛屼粎缁熻鎸囨爣锛涘嵏杞戒笉涓柇锛岃窇瀹岀収甯歌繘缂撳瓨锛夛紱
 *  閿彉鍖栵紙閲嶇畻/鏀瑰娉級鍚庣殑鍏嶈垂閲嶅彇涓庢墜鍔ㄩ噸鍙栭棬鎺ц useLlmStream銆?*/
function LlmAdvice({
  records,
  target,
  cfg,
  baseline,
  prompt,
}: {
  records: AnalysisRecord[];
  target: AdviceTarget;
  cfg: LlmConfig | null;
  baseline: AnalysisRecord | null;
  prompt: LlmPromptOptions;
}) {
  const key = cfg ? llmAdviceKey(cfg, records, target, { baseline, prompt }) : null;
  // effect 鎸夌紦瀛橀敭锛堝€肩ǔ瀹氾級瑙﹀彂锛岃緭鍏ョ粡 ref 浼犻€掞細閿€间笉鍙樺垯涓嶉噸澶嶈姹?
  const latest = useRef({ records, target, cfg, baseline, prompt });
  useEffect(() => {
    latest.current = { records, target, cfg, baseline, prompt };
  });
  const llm = useLlmStream({
    key,
    run: (signal, onDelta) => {
      const cur = latest.current;
      const curKey = llmAdviceKey(cur.cfg!, cur.records, cur.target, { baseline: cur.baseline, prompt: cur.prompt });
      return cachedLlmAdvice(curKey, () => fetchLlmAdvice(cur.records, cur.target, cur.cfg!, {
        baseline: cur.baseline,
        prompt: cur.prompt,
        signal,
        onDelta,
      }));
    },
    checkCached: hasCachedLlmAdvice,
  });
  const { state, requestKey, stream, stale } = llm;

  if (!cfg) {
    return <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmNoConfig')}</p>;
  }
  if (!llm.enabled) {
    return (
      <button
        onClick={llm.start}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
      >
        <Sparkles size={13} />
        {t('analysis.adviceLlmRun')}
      </button>
    );
  }
  if (llm.loading) {
    return (
      <div className="flex flex-col px-0.5">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <Loader2 size={13} className="animate-spin text-accent" />
          {t('analysis.adviceLlmLoading')}
          <button
            onClick={llm.abort}
            className="ml-auto text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
        </div>
        {stream?.key === requestKey && <StreamPreview text={stream.text} />}
      </div>
    );
  }
  if (stale) {
    // 閿彉鍖栧悗鏈嚜鍔ㄩ噸鍙栵紙缂撳瓨鏈懡涓級锛氬睍绀烘棫缁撴灉骞剁粰鎵嬪姩閲嶅彇鍏ュ彛锛屼笉鑷姩娑堣€椾粯璐归搴?
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        {state.result && <LlmResultView result={state.result} />}
        <button
          onClick={llm.retry}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  if (state.error != null) {
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        <p className="text-xs leading-relaxed text-ink">
          <span className="font-medium">{t('analysis.adviceLlmError')}</span>
          <span className="ml-1 break-all text-ink-2">{state.error}</span>
        </p>
        <button
          onClick={llm.retry}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  if (state.cancelled) {
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        <p className="text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmCancelled')}</p>
        <button
          onClick={llm.retry}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  const result = state.result;
  if (!result) return null;
  return <LlmResultView result={result} />;
}
