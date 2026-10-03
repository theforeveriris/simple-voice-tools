/**
 * 外观（设置的子页面，入口为主视图单行卡片）
 * - 主题：深浅模式、预设配色卡片（莫奈取色 / 骄傲旗，带色板预览）、
 *   莫奈三滑条（主题色相 / 强调色相 / 深色色相，强调与深色默认跟随主题色相）、
 *   骄傲旗卡片选择 + 渐变与毛玻璃参数
 * - 氛围彩蛋：声音染色（莫奈 / pride 均可用）、音量呼吸（pride 渐变专属）
 * - 图表辅助选项：网格辅助线、时间轴联动、移动端迷你基频（各带 Info 说明浮窗）
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Image as ImageIcon, Palette, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { applyPrideParams, applyTheme, presetSpec } from '@/lib/theme/monet';
import {
  getBgImageUrl,
  loadBgImage,
  processImageFile,
  removeBgImage,
  saveBgImage,
} from '@/lib/theme/bgImage';
import { PRIDE_FLAGS } from '@/constants';
import { t } from '@/i18n';
import type { DictKey } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings, BgImageFocus, HuePreset, PrideFlag, ThemeMode } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

/** 主题卡片：上方色板预览 + 下方名称，选中描边（预设 / 旗帜选择共用） */
function ThemeCard({ active, onClick, label, children }: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col gap-1.5 rounded-2xl bg-card p-2 text-left shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-[0.97]',
        active && 'ring-2 ring-accent',
      )}
    >
      <span className="relative block h-10 w-full overflow-hidden rounded-xl border border-line/60">
        {children}
      </span>
      <span className="line-clamp-2 min-h-7 text-[10px] leading-snug font-medium text-ink">{label}</span>
    </button>
  );
}

/** 旗帜色板预览（条纹自上而下） */
function FlagSwatch({ stripes }: { stripes: readonly string[] }) {
  return (
    <span
      className="block h-full w-full"
      style={{ background: `linear-gradient(to bottom, ${stripes.join(',')})` }}
      aria-hidden
    />
  );
}

/** 莫奈色板预览：表面 → 强调 → 次强调（次强调 = hue+70，与 buildTokens 单色逻辑一致） */
function MonetSwatch({ hue }: { hue: number }) {
  return (
    <span
      className="block h-full w-full"
      style={{
        background: `linear-gradient(135deg, oklch(0.85 0.06 ${hue}), oklch(0.62 0.12 ${hue}), oklch(0.5 0.12 ${(hue + 70) % 360}))`,
      }}
      aria-hidden
    />
  );
}

/** 九宫焦点：展示顺序（左上 → 右下）与各方向词条 */
const BG_FOCUS_KEYS: BgImageFocus[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];
const BG_FOCUS_LABEL: Record<BgImageFocus, DictKey> = {
  'top-left': 'settings.bgPosTopLeft',
  'top': 'settings.bgPosTop',
  'top-right': 'settings.bgPosTopRight',
  'left': 'settings.bgPosLeft',
  'center': 'settings.bgPosCenter',
  'right': 'settings.bgPosRight',
  'bottom-left': 'settings.bgPosBottomLeft',
  'bottom': 'settings.bgPosBottom',
  'bottom-right': 'settings.bgPosBottomRight',
};

/** 毛玻璃强度行（pride 渐变与自定义背景图共用同一参数 prideGlassBlur） */
function GlassRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <SettingRow label={<InfoTip label={t('settings.prideGlass')} text={t('settings.prideGlassDesc')} />}>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={28}
          step={2}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
          aria-label={t('settings.prideGlass')}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">
          {value === 0 ? t('settings.prideGlassOff') : `${value}px`}
        </span>
      </div>
    </SettingRow>
  );
}

/** 骄傲旗参数滑条（与色相滑条同款拖块） */
function PrideSlider({
  label, min, max, step, value, onChange, format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
          aria-label={label}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">{format(value)}</span>
      </div>
    </SettingRow>
  );
}

export function AppearancePage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（appearanceOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();

  const dark = settings.theme === 'dark'
    || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const preset = settings.huePreset ?? 'monet';

  /** 按当前设置立即重放色板（预设/色相/旗帜变更共用） */
  const applyPreset = (next: Partial<AppSettings>) => {
    update(next);
    const merged = { ...settings, ...next };
    const p = presetSpec(merged.huePreset, merged.hue, merged.prideFlag, merged.accentHue, merged.darkHue);
    applyTheme(p.hue, dark, p.accentHue, p.spec, merged.prideFlag);
    // 骄傲旗参数可能随合并变化，同步一遍（非骄傲旗预设下写入也无副作用）
    applyPrideParams(merged.prideGlow, merged.prideSaturation, merged.prideGlassBlur, merged.prideDrift);
  };

  const setPreset = (p: HuePreset) => applyPreset({ huePreset: p });
  const setPrideFlag = (f: PrideFlag) => applyPreset({ prideFlag: f });
  const setHue = (hue: number) => {
    // 强调色相 / 深色色相默认跟随主题色相：尚未被独立调整（仍与旧 hue 相等）时一并更新；
    // 拖动过强调 / 深色滑条即分离，形成双色调或独立深色铺底
    const patch: Partial<AppSettings> = { hue };
    if (settings.accentHue === settings.hue) patch.accentHue = hue;
    if (settings.darkHue === settings.hue) patch.darkHue = hue;
    applyPreset(patch);
  };

  /* ---- 自定义背景图：当前图片 objectURL 与选择/移除 ---- */
  const [bgUrl, setBgUrl] = useState<string | null>(getBgImageUrl());
  const bgFileRef = useRef<HTMLInputElement>(null);
  // 启动预加载（main.tsx 已发起）完成后刷新缩略图；loadBgImage 幂等，不重复加载
  useEffect(() => {
    let alive = true;
    void loadBgImage().then(() => {
      if (alive) setBgUrl(getBgImageUrl());
    });
    return () => {
      alive = false;
    };
  }, []);
  const pickBgImage = async (file: File) => {
    try {
      await saveBgImage(await processImageFile(file));
      setBgUrl(getBgImageUrl());
    } catch {
      toast.error(t('toast.bgImageFail'));
    }
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
          <p className="text-base font-semibold text-ink">{t('settings.appearance')}</p>
        </div>

        {/* 主题（深浅模式 + 预设配色 + 主题色，原两区块合并） */}
        <SettingsSection icon={Palette} title={t('settings.theme')}>
          <SettingRow label={t('settings.theme')}>
            <Select
              value={settings.theme}
              onValueChange={(v) => update({ theme: v as ThemeMode })}
            >
              <SelectTrigger className="w-32 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
                <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          {/* 预设配色卡片：色板实时预览（莫奈跟随当前色相，骄傲旗跟随当前旗帜） */}
          <SettingRow label={t('settings.huePreset')} stacked>
            <div className="grid grid-cols-2 gap-2.5">
              <ThemeCard
                active={preset === 'monet'}
                onClick={() => setPreset('monet')}
                label={t('settings.presetMonet')}
              >
                <MonetSwatch hue={settings.hue} />
              </ThemeCard>
              <ThemeCard
                active={preset === 'pride'}
                onClick={() => setPreset('pride')}
                label={t('settings.presetPride')}
              >
                <FlagSwatch stripes={PRIDE_FLAGS.find((f) => f.id === settings.prideFlag)?.stripes ?? []} />
              </ThemeCard>
            </div>
          </SettingRow>
          {preset === 'monet' && (
            <>
              {/* 主题色相：莫奈取色种子色相（骄傲旗预设的色板由旗帜决定） */}
              <SettingRow label={t('settings.hue')}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={settings.hue}
                    onChange={(e) => setHue(Number(e.target.value))}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-violet-500 accent-accent"
                    aria-label={t('settings.hue')}
                  />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.hue}°</span>
                </div>
              </SettingRow>
              {/* 双色调：强调色相（按钮 / 选中态 / 图表主曲线），默认跟随主题色相 */}
              <SettingRow
                label={<InfoTip label={t('settings.accentHue')} text={t('settings.accentHueDesc')} />}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={settings.accentHue}
                    onChange={(e) => applyPreset({ accentHue: Number(e.target.value) })}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
                    aria-label={t('settings.accentHue')}
                  />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.accentHue}°</span>
                </div>
              </SettingRow>
              {/* 独立深色铺底：深色模式的表面色相，默认跟随主题色相 */}
              <SettingRow
                label={<InfoTip label={t('settings.darkHue')} text={t('settings.darkHueDesc')} />}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={settings.darkHue}
                    onChange={(e) => applyPreset({ darkHue: Number(e.target.value) })}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
                    aria-label={t('settings.darkHue')}
                  />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.darkHue}°</span>
                </div>
              </SettingRow>
            </>
          )}
          {preset === 'pride' && (
            <>
              {/* 旗帜卡片（条纹预览，点选即换） */}
              <SettingRow label={t('settings.prideFlag')} stacked>
                <div className="grid grid-cols-3 gap-2.5">
                  {PRIDE_FLAGS.map((f) => (
                    <ThemeCard
                      key={f.id}
                      active={settings.prideFlag === f.id}
                      onClick={() => setPrideFlag(f.id)}
                      label={t(f.labelKey as Parameters<typeof t>[0])}
                    >
                      <FlagSwatch stripes={f.stripes} />
                    </ThemeCard>
                  ))}
                </div>
              </SettingRow>
              {/* 渐变与毛玻璃参数 */}
              <PrideSlider
                label={t('settings.prideGlow')}
                min={0.2}
                max={1.6}
                step={0.05}
                value={settings.prideGlow}
                onChange={(v) => applyPreset({ prideGlow: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <PrideSlider
                label={t('settings.prideSaturation')}
                min={0.3}
                max={2}
                step={0.05}
                value={settings.prideSaturation}
                onChange={(v) => applyPreset({ prideSaturation: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              {/* 毛玻璃强度（与自定义背景图共用） */}
              <GlassRow value={settings.prideGlassBlur} onChange={(v) => applyPreset({ prideGlassBlur: v })} />
              <SettingRow label={t('settings.prideDrift')}>
                <Switch
                  checked={settings.prideDrift}
                  onCheckedChange={(v) => applyPreset({ prideDrift: v })}
                />
              </SettingRow>
              {/* 音量呼吸：渐变浓度随麦克风响度起伏（pride 渐变专属彩蛋） */}
              <SettingRow
                label={<InfoTip label={t('settings.volumeBreath')} text={t('settings.volumeBreathDesc')} />}
              >
                <Switch
                  checked={settings.volumeBreath}
                  onCheckedChange={(v) => update({ volumeBreath: v })}
                />
              </SettingRow>
            </>
          )}

          {/* 声音染色：界面色相随实时音高流动（莫奈 / pride 预设均可用） */}
          <SettingRow
            label={<InfoTip label={t('settings.voiceTint')} text={t('settings.voiceTintDesc')} />}
          >
            <Switch
              checked={settings.voiceTint}
              onCheckedChange={(v) => update({ voiceTint: v })}
            />
          </SettingRow>
        </SettingsSection>

        {/* 自定义背景：开启后背景层被图片接管（替换 pride 渐变 / 极光 / 纯色），
            组件经毛玻璃透出图片；图片降采样后仅存本机 IndexedDB */}
        <SettingsSection icon={ImageIcon} title={t('settings.bgImage')}>
          <SettingRow
            label={<InfoTip label={t('settings.bgImage')} text={t('settings.bgImageDesc')} />}
          >
            <Switch
              checked={settings.bgImageEnabled}
              onCheckedChange={(v) => update({ bgImageEnabled: v })}
            />
          </SettingRow>
          {settings.bgImageEnabled && (
            <>
              {/* 选图 / 缩略图 / 移除 */}
              <SettingRow label={t('settings.bgImagePick')} stacked>
                <div className="flex items-center gap-2.5">
                  {bgUrl && (
                    <img
                      src={bgUrl}
                      alt=""
                      className="h-10 w-16 rounded-lg border border-line/60 object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => bgFileRef.current?.click()}
                    className="rounded-full bg-accent-soft px-3.5 py-1.5 text-xs font-semibold text-on-accent-soft transition-transform active:scale-95"
                  >
                    {t('settings.bgImagePick')}
                  </button>
                  {bgUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        void removeBgImage().then(() => setBgUrl(getBgImageUrl()));
                      }}
                      className="rounded-full bg-surface-hi px-3.5 py-1.5 text-xs font-semibold text-ink-2 transition-transform active:scale-95"
                    >
                      {t('settings.bgImageRemove')}
                    </button>
                  )}
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = ''; // 允许重复选择同一文件
                      if (f) void pickBgImage(f);
                    }}
                  />
                </div>
              </SettingRow>
              {/* 九宫焦点：cover 裁切的锚点 */}
              <SettingRow label={t('settings.bgImageFocus')} stacked>
                <div className="grid w-24 grid-cols-3 gap-1" role="group" aria-label={t('settings.bgImageFocus')}>
                  {BG_FOCUS_KEYS.map((k) => {
                    const active = settings.bgImageFocus === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => update({ bgImageFocus: k })}
                        aria-pressed={active}
                        aria-label={t(BG_FOCUS_LABEL[k])}
                        className={cn(
                          'grid h-7 place-items-center rounded-lg bg-surface-hi transition-all active:scale-90',
                          active && 'ring-1 ring-accent',
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', active ? 'bg-accent' : 'bg-ink-2/40')} />
                      </button>
                    );
                  })}
                </div>
              </SettingRow>
              <PrideSlider
                label={t('settings.bgImageBlur')}
                min={0}
                max={60}
                step={2}
                value={settings.bgImageBlur}
                onChange={(v) => update({ bgImageBlur: v })}
                format={(v) => `${v}px`}
              />
              {/* 压暗：深色模式在 CSS 内自动加深 1.5 倍 */}
              <SettingRow
                label={<InfoTip label={t('settings.bgImageDim')} text={t('settings.bgImageDimDesc')} />}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={settings.bgImageDim}
                    onChange={(e) => update({ bgImageDim: Number(e.target.value) })}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
                    aria-label={t('settings.bgImageDim')}
                  />
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">
                    {Math.round(settings.bgImageDim * 100)}%
                  </span>
                </div>
              </SettingRow>
              <PrideSlider
                label={t('settings.bgImageSat')}
                min={0.3}
                max={2}
                step={0.05}
                value={settings.bgImageSaturation}
                onChange={(v) => update({ bgImageSaturation: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <PrideSlider
                label={t('settings.bgImageAlpha')}
                min={0}
                max={1}
                step={0.05}
                value={settings.bgImageOpacity}
                onChange={(v) => update({ bgImageOpacity: v })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <SettingRow label={t('settings.bgImageDrift')}>
                <Switch
                  checked={settings.bgImageDrift}
                  onCheckedChange={(v) => update({ bgImageDrift: v })}
                />
              </SettingRow>
              {/* 莫奈 + 自定义背景时毛玻璃强度的去处（pride 预设下已在上方主题区） */}
              {preset !== 'pride' && (
                <GlassRow value={settings.prideGlassBlur} onChange={(v) => applyPreset({ prideGlassBlur: v })} />
              )}
            </>
          )}
        </SettingsSection>

        {/* 图表辅助选项 */}
        <SettingsSection icon={SlidersHorizontal} title={t('settings.chartAids')}>
          <SettingRow label={<InfoTip label={t('settings.showGrid')} text={t('settings.showGridDesc')} />}>
            <Switch
              checked={settings.showGrid}
              onCheckedChange={(v) => update({ showGrid: v })}
            />
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.syncRange')} text={t('settings.syncRangeDesc')} />}>
            <Switch
              checked={settings.syncChartRange}
              onCheckedChange={(v) => update({ syncChartRange: v })}
            />
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.mobileSpark')} text={t('settings.mobileSparkDesc')} />}>
            <Switch
              checked={settings.mobileSpark}
              onCheckedChange={(v) => update({ mobileSpark: v })}
            />
          </SettingRow>
        </SettingsSection>
      </motion.div>
    </div>
  );
}
