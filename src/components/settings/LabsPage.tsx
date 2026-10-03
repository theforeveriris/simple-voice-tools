/**
 * 实验性功能（设置的子页面）
 * - 功能开关（语谱图 / 实时频谱 / 训练建议三态 + 对比页建议）
 * - 大模型配置（训练建议「基于大模型判断」的接口参数 + 提示词子页面）
 * - 自定义音区边界（实验性）
 * - 算法参数（实验性）：YIN 阈值 / 音高搜索范围 / 预加重 / F1·F2 搜索窗 / 发声门限
 * - 实时功能：实时元音落点 / F0 基频曲线 / 声谱图 / 声域图（VRP）
 *   + 实时音高算法选择（yin / pyin / mpm）
 * - 导入音频离线分析
 * - GitHub 云备份（Device Flow）
 * （本地自动备份已移至 数据管理 子页面）
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, SlidersHorizontal, Ruler, RotateCcw, LocateFixed, FileAudio,
  Radar, AudioWaveform, Waves, LayoutGrid, Cog,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { DEFAULT_BAND_BOUNDS } from '@/constants';
import { analyzeAudioFile, importErrorKey } from '@/lib/audio/importAudio';
import { ALGO_PARAM_DEFAULTS } from '@/lib/audio/algoParams';
import { maybeAutoBackup } from '@/lib/backup/local';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AdviceMode, AppSettings, PitchAlgorithm } from '@/types';
import { VowelLiveSheet } from '@/components/pages/VowelLiveSheet';
import { F0LiveSheet } from '@/components/pages/F0LiveSheet';
import { SpecLiveSheet } from '@/components/pages/SpecLiveSheet';
import { VrpLiveSheet } from '@/components/pages/VrpLiveSheet';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';
import { GithubBackupSection } from './GithubBackupSection';
import { LlmConfigSection } from './LlmConfigSection';
import { PromptPage } from './PromptPage';
import { InfoTip } from './InfoTip';
import { registerBackClose } from '@/lib/backNav';

/** 算法参数的档位下拉（数字值 ↔ 字符串键；当前值不在档位内时补入，防导入的任意值显示为空） */
function AlgoSelect({ value, options, onChange, format, className = 'w-40' }: {
  value: number;
  options: readonly number[];
  onChange: (v: number) => void;
  format: (v: number) => string;
  className?: string;
}) {
  const opts = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className={cn(className, 'border-0 bg-transparent px-0 text-sm shadow-none')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
        {opts.map((v) => (
          <SelectItem key={v} value={String(v)}>{format(v)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LabsPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（labsOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  // 实时功能子页面（一次一个）
  const [vowelLiveOpen, setVowelLiveOpen] = useState(false);
  const [f0LiveOpen, setF0LiveOpen] = useState(false);
  const [specLiveOpen, setSpecLiveOpen] = useState(false);
  const [vrpLiveOpen, setVrpLiveOpen] = useState(false);
  // 自定义提示词（大模型配置的二级子页面）
  const [promptOpen, setPromptOpen] = useState(false);
  // 导入音频离线分析
  const [importBusy, setImportBusy] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importDragOver, setImportDragOver] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // 二级子页面（提示词）的返回手势：在语言子页之上再压一层 history
  useEffect(() => {
    if (!promptOpen) return;
    return registerBackClose(() => setPromptOpen(false));
  }, [promptOpen]);

  // 二级子页面（提示词）独占整个视图；hooks 已全部调用，可安全提前返回
  if (promptOpen) {
    return (
      <PromptPage settings={settings} update={update} onBack={() => window.history.back()} />
    );
  }

  /* ------------------------------ 自定义音区边界（实验性） ------------------------------ */

  const bandBounds = settings.bandBounds ?? DEFAULT_BAND_BOUNDS;

  /** 修改单个边界：与相邻边界互相挤开（最小间距 10Hz），越界时放弃本次修改 */
  const setBandBound = (idx: 0 | 1 | 2 | 3, raw: string) => {
    const v = Math.max(60, Math.min(500, Math.round(Number(raw) || 0)));
    const next = [...bandBounds] as [number, number, number, number];
    next[idx] = v;
    for (let i = idx - 1; i >= 0; i--) if (next[i] >= next[i + 1]) next[i] = next[i + 1] - 10;
    for (let i = idx + 1; i < 4; i++) if (next[i] <= next[i - 1]) next[i] = next[i - 1] + 10;
    if (next[0] < 60 || next[3] > 500) return;
    if (!(next[0] < next[1] && next[1] < next[2] && next[2] < next[3])) return;
    update({ bandBounds: next });
  };

  const resetBandBounds = () => {
    if (!settings.bandBounds) return;
    update({ bandBounds: undefined });
    toast.success(t('toast.bandResetDone'));
  };

  /* ------------------------------ 导入音频离线分析（实验性） ------------------------------ */

  const runAudioImport = (file: File) => {
    if (importBusy) return;
    setImportBusy(true);
    setImportPct(0);
    void (async () => {
      try {
        const { record, audio, truncated } = await analyzeAudioFile(file, {
          targetRange: settings.targetEnabled ? [settings.targetF0Min, settings.targetF0Max] : null,
          saveAudio: settings.audioSave,
          onProgress: setImportPct,
        });
        useHistoryStore.getState().addRecord(record, audio ?? undefined);
        setCurrentAnalysis(record);
        setTab('analysis');
        void maybeAutoBackup('record');
        toast.success(truncated ? t('toast.importAudioTruncated') : t('toast.importAudioDone'));
      } catch (err) {
        toast.error(t(importErrorKey(err)));
      } finally {
        setImportBusy(false);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
        className="flex flex-col gap-3.5"
      >
        {/* 子页面头：返回 + 标题 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={t('common.back')}
            className="grid size-10 place-items-center rounded-full bg-card text-ink shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-90"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-base font-semibold text-ink">{t('settings.labs')}</p>
        </div>

        {/* 功能开关 */}
        <SettingsSection icon={SlidersHorizontal} title={t('settings.labsToggles')}>
          <SettingRow label={t('settings.showSpec')}>
            <Switch
              checked={settings.showSpectrogram}
              onCheckedChange={(v) => update({ showSpectrogram: v })}
            />
          </SettingRow>
          <SettingRow label={t('settings.liveSpectrum')}>
            <Switch
              checked={settings.liveSpectrum}
              onCheckedChange={(v) => update({ liveSpectrum: v })}
            />
          </SettingRow>
          <SettingRow label={t('settings.adviceMode')}>
            <Select
              value={settings.adviceMode}
              onValueChange={(v) => update({ adviceMode: v as AdviceMode })}
            >
              <SelectTrigger className="w-40 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="none">{t('settings.adviceModeNone')}</SelectItem>
                <SelectItem value="rules">{t('settings.adviceModeRules')}</SelectItem>
                <SelectItem value="llm">{t('settings.adviceModeLlm')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t('settings.adviceOnCompare')} desc={t('settings.adviceOnCompareDesc')}>
            <Switch
              checked={settings.adviceOnCompare}
              onCheckedChange={(v) => update({ adviceOnCompare: v })}
            />
          </SettingRow>
          <SettingRow label={<InfoTip label={t('labs.pitchCompare')} text={t('labs.pitchCompareDesc')} />}>
            <Switch
              checked={settings.pitchCompareEnabled}
              onCheckedChange={(v) => update({ pitchCompareEnabled: v })}
            />
          </SettingRow>
        </SettingsSection>

        {/* 大模型配置（训练建议选「基于大模型判断」时使用） */}
        <LlmConfigSection settings={settings} update={update} onOpenPrompt={() => setPromptOpen(true)} />

        {/* 自定义音区边界 */}
        <SettingsSection icon={Ruler} title={t('settings.bandCustom')}>
          <SettingRow stacked label={<InfoTip label={t('settings.bandBounds')} text={t('settings.bandCustomDesc')} />}>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              {([0, 1, 2, 3] as const).map((idx) => (
                <label key={idx} className="flex flex-col gap-1">
                  <span className="text-[10px] text-ink-2">{t(`settings.bandBound${idx}`)}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={60}
                      max={500}
                      value={bandBounds[idx]}
                      onChange={(e) => setBandBound(idx, e.target.value)}
                      className="w-20 rounded-xl border border-black/10 bg-surface-hi px-2.5 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
                      aria-label={t(`settings.bandBound${idx}`)}
                    />
                    <span className="text-[10px] text-ink-2">Hz</span>
                  </span>
                </label>
              ))}
            </div>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.bandReset')} text={t('settings.bandResetDesc')} />}>
            <button
              onClick={resetBandBounds}
              disabled={!settings.bandBounds}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                settings.bandBounds ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
              )}
            >
              <RotateCcw size={14} />
              {t('settings.bandResetAction')}
            </button>
          </SettingRow>
        </SettingsSection>

        {/* 算法参数（实验性）：改动即时生效于实时曲线；下次录音/导入用新参数重算 */}
        <SettingsSection icon={Cog} title={t('settings.algoParams')}>
          <SettingRow
            label={<InfoTip label={t('settings.algoYinThreshold')} text={t('settings.algoYinThresholdDesc')} />}
          >
            <AlgoSelect
              value={settings.algoYinThreshold}
              options={[0.05, 0.08, 0.11, 0.14, 0.18, 0.24, 0.3, 0.38]}
              onChange={(v) => update({ algoYinThreshold: v })}
              format={(v) => v.toFixed(2)}
            />
          </SettingRow>
          <SettingRow
            label={<InfoTip label={t('settings.algoPitchRange')} text={t('settings.algoPitchRangeDesc')} />}
          >
            <div className="flex items-center gap-2">
              <AlgoSelect
                className="w-28"
                value={settings.algoPitchMinHz}
                options={[40, 50, 60, 75, 90, 110, 140, 170, 200]}
                onChange={(v) => update({
                  algoPitchMinHz: v,
                  // 下限抬高时同步抬升上限，保持至少 100 Hz 的搜索带宽
                  ...(v + 100 > settings.algoPitchMaxHz ? { algoPitchMaxHz: v + 100 } : {}),
                })}
                format={(v) => `≥ ${v} Hz`}
              />
              <AlgoSelect
                className="w-28"
                value={settings.algoPitchMaxHz}
                options={[300, 400, 500, 600, 750, 900, 1050, 1200]}
                onChange={(v) => update({ algoPitchMaxHz: Math.max(v, settings.algoPitchMinHz + 100) })}
                format={(v) => `≤ ${v} Hz`}
              />
            </div>
          </SettingRow>
          <SettingRow
            label={<InfoTip label={t('settings.algoPreEmphasis')} text={t('settings.algoPreEmphasisDesc')} />}
          >
            <AlgoSelect
              value={settings.algoPreEmphasis}
              options={[0, 0.9, 0.94, 0.96, 0.97, 0.98]}
              onChange={(v) => update({ algoPreEmphasis: v })}
              format={(v) => v.toFixed(2)}
            />
          </SettingRow>
          <SettingRow
            label={<InfoTip label={t('settings.algoF1Min')} text={t('settings.algoF1MinDesc')} />}
          >
            <AlgoSelect
              value={settings.algoF1MinHz}
              options={[100, 140, 180, 200, 240, 280, 320, 400]}
              onChange={(v) => update({ algoF1MinHz: v })}
              format={(v) => `${v} Hz`}
            />
          </SettingRow>
          <SettingRow
            label={<InfoTip label={t('settings.algoF2Max')} text={t('settings.algoF2MaxDesc')} />}
          >
            <AlgoSelect
              value={settings.algoF2MaxHz}
              options={[2000, 2400, 2800, 3400, 4000, 4600, 5000]}
              onChange={(v) => update({ algoF2MaxHz: v })}
              format={(v) => `${v} Hz`}
            />
          </SettingRow>
          <SettingRow
            label={<InfoTip label={t('settings.algoVoicedGate')} text={t('settings.algoVoicedGateDesc')} />}
          >
            <AlgoSelect
              value={settings.algoVoicedGateDb}
              options={[-70, -65, -60, -55, -50, -45, -40]}
              onChange={(v) => update({ algoVoicedGateDb: v })}
              format={(v) => `${v} dB`}
            />
          </SettingRow>
          <SettingRow label={t('settings.algoReset')}>
            <button
              onClick={() => {
                update({
                  algoYinThreshold: ALGO_PARAM_DEFAULTS.yinThreshold,
                  algoPitchMinHz: ALGO_PARAM_DEFAULTS.pitchMinHz,
                  algoPitchMaxHz: ALGO_PARAM_DEFAULTS.pitchMaxHz,
                  algoPreEmphasis: ALGO_PARAM_DEFAULTS.preEmphasis,
                  algoF1MinHz: ALGO_PARAM_DEFAULTS.f1MinHz,
                  algoF2MaxHz: ALGO_PARAM_DEFAULTS.f2MaxHz,
                  algoVoicedGateDb: ALGO_PARAM_DEFAULTS.voicedGateDb,
                });
                toast.success(t('toast.algoResetDone'));
              }}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <RotateCcw size={14} />
              {t('settings.bandResetAction')}
            </button>
          </SettingRow>
        </SettingsSection>

        {/* 实时功能：元音落点 / F0 曲线 / 声谱图 / 声域图 + 音高算法 */}
        <SettingsSection icon={Radar} title={t('labs.realtime')}>
          <SettingRow label={<InfoTip label={t('labs.rtVowel')} text={t('labs.rtVowelDesc')} />}>
            <button
              onClick={() => setVowelLiveOpen(true)}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <LocateFixed size={14} />
              {t('vowelLive.openAction')}
            </button>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('labs.rtF0')} text={t('labs.rtF0Desc')} />}>
            <button
              onClick={() => setF0LiveOpen(true)}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <AudioWaveform size={14} />
              {t('vowelLive.openAction')}
            </button>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('labs.rtSpec')} text={t('labs.rtSpecDesc')} />}>
            <button
              onClick={() => setSpecLiveOpen(true)}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <Waves size={14} />
              {t('vowelLive.openAction')}
            </button>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('labs.rtVrp')} text={t('labs.rtVrpDesc')} />}>
            <button
              onClick={() => setVrpLiveOpen(true)}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <LayoutGrid size={14} />
              {t('vowelLive.openAction')}
            </button>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('labs.pitchAlgo')} text={t('labs.pitchAlgoDesc')} />}>
            <Select
              value={settings.pitchAlgorithm}
              onValueChange={(v) => update({ pitchAlgorithm: v as PitchAlgorithm })}
            >
              <SelectTrigger className="w-40 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="yin">{t('labs.algoYin')}</SelectItem>
                <SelectItem value="pyin">{t('labs.algoPyin')}</SelectItem>
                <SelectItem value="mpm">{t('labs.algoMpm')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsSection>

        {/* 导入音频离线分析 */}
        <SettingsSection icon={FileAudio} title={t('settings.importAudio')}>
          <SettingRow stacked label={<InfoTip label={t('settings.importAudio')} text={t('settings.importAudioDesc')} />}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setImportDragOver(true);
              }}
              onDragLeave={() => setImportDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setImportDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) runAudioImport(file);
              }}
              className={cn(
                'flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                importDragOver ? 'border-accent bg-accent-soft/40' : 'border-black/10 bg-surface-hi/40',
              )}
            >
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={importBusy}
                className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {importBusy
                  ? `${t('importAudio.processing')} ${Math.round(importPct * 100)}%`
                  : t('settings.importAudioPick')}
              </button>
              <p className="text-[10px] text-ink-2">{t('settings.importAudioHint')}</p>
            </div>
          </SettingRow>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.amr,.3gp,.m4a,.aac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) runAudioImport(file);
              e.target.value = '';
            }}
          />
        </SettingsSection>

        {/* GitHub 云备份 */}
        <GithubBackupSection settings={settings} update={update} />
      </motion.div>

      {/* 实时功能子页面（全屏，从 Labs 或测试页打开；一次最多一个） */}
      {vowelLiveOpen && <VowelLiveSheet onClose={() => setVowelLiveOpen(false)} />}
      {f0LiveOpen && <F0LiveSheet onClose={() => setF0LiveOpen(false)} />}
      {specLiveOpen && <SpecLiveSheet onClose={() => setSpecLiveOpen(false)} />}
      {vrpLiveOpen && <VrpLiveSheet onClose={() => setVrpLiveOpen(false)} />}
    </div>
  );
}
