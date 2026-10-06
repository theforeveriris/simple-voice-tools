/**
 * 交互式 HTML 报告导出（实验性）
 * 把一条记录（曲线 + 统计 + 语谱图 + 可选录音音频）打包成单文件 HTML：
 * 内嵌 JSON 数据与零依赖的 Vanilla JS 渲染器，浏览器直接打开即可
 * 缩放 / 平移查看全部图表并回放录音；深浅色跟随系统，离线可用。
 * 数据 100% 来自本机，文件不包含任何外部引用。
 */

import { base64FromBytes } from '@/lib/audio/spectrogram';
import { downloadBlob } from '@/lib/file';
import { t } from '@/i18n';
import { localeTag } from '@/i18n';
import {
  BAND_COLORS, getBandBounds, getPitchAxis,
  SPEC_FMIN, SPEC_FMAX, VOWEL_AXIS_F1, VOWEL_AXIS_F2, VOWEL_REFS,
} from '@/constants';
import type { AnalysisRecord } from '@/types';

/** 报告曲线图的固定高度（px，运行时样式同步） */
const CH_H = { pitch: 250, energy: 140, formant: 200, spec: 220, vowel: 260 };

/** 秒 → m:ss（与 App 内 formatClock 同规则） */
function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Blob → base64（复用语谱图的分块编码器） */
async function blobToBase64(blob: Blob): Promise<string> {
  return base64FromBytes(new Uint8Array(await blob.arrayBuffer()));
}

/** 导出时预取的主题强调色（与分享卡同一取法；无 DOM 环境回退默认色） */
function accentColors(): { accent: string; accent2: string } {
  if (typeof document === 'undefined') return { accent: '#5B5BD6', accent2: '#8B5BD6' };
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue('--c-accent').trim() || '#5B5BD6',
    accent2: s.getPropertyValue('--c-accent2').trim() || '#8B5BD6',
  };
}

/** 当前语言的导出文案（写死进报告，运行时无 i18n） */
function reportLabels() {
  return {
    title: t('share.shareTitle'),
    footer: t('report.footer'),
    zoomHint: t('html.zoomHint'),
    duration: t('analysis.rowDuration'),
    avgF0: t('analysis.rowAvgF0'),
    modeReading: t('mode.reading'),
    modeSustained: t('mode.sustained'),
    modeGlide: t('mode.glide'),
    titlePitch: t('analysis.titlePitch'),
    titleFormant: t('analysis.titleFormant'),
    titleEnergy: t('analysis.titleEnergy'),
    titleSpec: t('analysis.titleSpec'),
    titleVowel: t('analysis.viewScatter'),
  };
}

/** 统计表：预格式化的 [标签, 值] 行（数值格式化在导出端完成，运行时零逻辑） */
function statRows(record: AnalysisRecord): [string, string][] {
  const s = record.stats;
  const n1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
  const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : `${Math.round(v)}%`);
  const rows: [string, string][] = [
    [t('analysis.rowDuration'), fmtClock(s.durationSec)],
    [t('analysis.rowAvgF0'), `${n1(s.avgF0)} Hz`],
    [t('analysis.rowMedianF0'), `${n1(s.medianF0)} Hz`],
    [t('analysis.rowMinMaxF0'), `${n1(s.minF0)} / ${n1(s.maxF0)} Hz`],
    [t('analysis.rowP10P90'), `${n1(s.p10F0)} / ${n1(s.p90F0)} Hz`],
    [t('analysis.rowStdF0'), `${s.stdF0.toFixed(2)} Hz`],
    [t('analysis.rowMalePct'), pct(s.malePct)],
    [t('analysis.rowFemalePct'), pct(s.femalePct)],
    [t('analysis.rowTransPct'), pct(s.transitionPct)],
    [t('analysis.rowAvgF1'), s.avgF1 != null ? `${Math.round(s.avgF1)} Hz` : '—'],
    [t('analysis.rowF1Range'), s.f1Range ? `${Math.round(s.f1Range[0])} / ${Math.round(s.f1Range[1])} Hz` : '—'],
    [t('analysis.rowAvgF2'), s.avgF2 != null ? `${Math.round(s.avgF2)} Hz` : '—'],
    [t('analysis.rowF2Range'), s.f2Range ? `${Math.round(s.f2Range[0])} / ${Math.round(s.f2Range[1])} Hz` : '—'],
    [t('analysis.rowVoicedPct'), pct(s.totalSamples > 0 ? (s.voicedSamples / s.totalSamples) * 100 : 0)],
    [t('analysis.rowAvgDb'), `${n1(s.avgDb)} dB`],
    [t('analysis.rowPeakDb'), `${n1(s.peakDb)} dB`],
    [t('analysis.rowJitter'), s.jitterPct != null ? `${s.jitterPct.toFixed(2)}%` : '—'],
    [t('analysis.rowShimmer'), s.shimmerPct != null ? `${s.shimmerPct.toFixed(2)}%` : '—'],
    [t('analysis.rowHnr'), s.hnrDb != null ? `${s.hnrDb.toFixed(1)} dB` : '—'],
    [t('analysis.rowCpps'), s.cppsDb != null ? `${s.cppsDb.toFixed(1)} dB` : '—'],
  ];
  if (s.inTargetPct != null) rows.push([t('analysis.rowTargetPct'), pct(s.inTargetPct)]);
  return rows;
}

/** 报告数据载荷（写入 <script type="application/json">，运行时 JSON.parse） */
function buildPayload(record: AnalysisRecord, audio: { mime: string; data: string } | null) {
  const modeLabel = record.mode
    ? { reading: t('mode.reading'), sustained: t('mode.sustained'), glide: t('mode.glide') }[record.mode]
    : '';
  return {
    v: 1,
    meta: {
      createdAt: record.createdAt,
      generatedAt: Date.now(),
      dateStr: new Date(record.createdAt).toLocaleString(localeTag()),
      durationSec: record.durationSec,
      sampleHz: record.sampleHz,
      modeLabel,
      note: record.note ?? '',
    },
    labels: reportLabels(),
    colors: { ...accentColors(), bands: BAND_COLORS },
    bandBounds: getBandBounds(),
    pitchAxis: getPitchAxis(),
    vowelAxis: { f1: VOWEL_AXIS_F1, f2: VOWEL_AXIS_F2 },
    vowelRefs: VOWEL_REFS.map((r) => ({ label: r.label, f1: r.f1, f2: r.f2 })),
    chartH: CH_H,
    series: record.series,
    stats: statRows(record),
    spec: record.spec ?? null,
    specRange: { fmin: SPEC_FMIN, fmax: SPEC_FMAX },
    audio,
  };
}

/** JSON 中的 < 转义，避免提前闭合 <script> 标签 */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ------------------------------ 运行时渲染器 ------------------------------ */
// 约束：不得使用反引号与 ${}（本文件以模板字符串承载）；字符串拼接代替。

const RUNTIME_JS = `
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('svt-data').textContent);
  var S = D.series;
  var C = D.colors;
  var L = D.labels;

  function isF(v) { return v != null && isFinite(v); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 主题（跟随系统深浅色，切换时重绘） ---------- */
  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  var pal = {};
  function theme() {
    pal = dark
      ? { grid: 'rgba(255,255,255,0.16)', text: '#A9A5B5', card: '#211F29', ink: '#ECEAF2' }
      : { grid: 'rgba(28,25,45,0.14)', text: '#6E6A78', card: '#FFFFFF', ink: '#26242E' };
  }
  theme();
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      dark = e.matches; theme(); drawAll();
    });
  }

  function bandOf(f) {
    var b = D.bandBounds;
    if (f < b[0]) return 'low';
    if (f < b[1]) return 'male';
    if (f < b[2]) return 'transition';
    if (f <= b[3]) return 'female';
    return 'high';
  }

  /* ---------- 语谱伪彩色（magma 固定色带） ---------- */
  var STOPS = [[0,[0,0,4]],[0.25,[81,18,124]],[0.5,[183,55,121]],[0.75,[252,137,97]],[1,[252,253,191]]];
  function magma(t) {
    t = clamp(t, 0, 1);
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i-1], b = STOPS[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        return [Math.round(a[1][0]+(b[1][0]-a[1][0])*k), Math.round(a[1][1]+(b[1][1]-a[1][1])*k), Math.round(a[1][2]+(b[1][2]-a[1][2])*k)];
      }
    }
    return STOPS[STOPS.length-1][1];
  }

  /* ---------- 曲线图表框架：缩放 / 平移 / 播放头 ---------- */
  var charts = [];
  var playhead = null;

  function Chart(id, kind) {
    this.kind = kind;
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d');
    this.t0 = 0;
    this.t1 = D.meta.durationSec;
    charts.push(this);
    this.bind();
  }

  Chart.prototype.each = function (fn) {
    for (var i = 0; i < S.t.length; i++) fn(i, S.t[i]);
  };

  Chart.prototype.bind = function () {
    var self = this;
    var cv = this.canvas;
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var dur = D.meta.durationSec;
      var span = self.t1 - self.t0;
      var factor = e.deltaY > 0 ? 1.25 : 0.8;
      var r = clamp(e.offsetX / cv.clientWidth, 0, 1);
      var mid = self.t0 + span * r;
      var ns = clamp(span * factor, 0.5, dur);
      self.t0 = clamp(mid - r * ns, 0, dur - ns);
      self.t1 = self.t0 + ns;
      self.draw();
    }, { passive: false });
    var dragX = null;
    cv.addEventListener('pointerdown', function (e) { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) {
      if (dragX == null) return;
      var dx = (e.clientX - dragX) / cv.clientWidth * (self.t1 - self.t0);
      dragX = e.clientX;
      var dur = D.meta.durationSec;
      var span = self.t1 - self.t0;
      self.t0 = clamp(self.t0 - dx, 0, dur - span);
      self.t1 = self.t0 + span;
      self.draw();
    });
    var endDrag = function () { dragX = null; };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('dblclick', function () {
      self.t0 = 0; self.t1 = D.meta.durationSec; self.draw();
    });
    new ResizeObserver(function () { self.size(); self.draw(); }).observe(cv);
    this.size();
  };

  Chart.prototype.size = function () {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Chart.prototype.xOf = function (t) { return ((t - this.t0) / (this.t1 - this.t0)) * this.w; };

  Chart.prototype.timeGrid = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    var span = this.t1 - this.t0;
    var step = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) { if (span / steps[i] <= 5) { step = steps[i]; break; } }
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.fillStyle = pal.text; ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    var start = Math.ceil((this.t0 + 0.01) / step) * step;
    for (var tt = start; tt <= this.t1 + 1e-6; tt += step) {
      var x = this.xOf(tt);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      var m = Math.floor(tt / 60), s = Math.round(tt - m * 60);
      if (x < w - 24) ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s, x, h - 3);
    }
    ctx.setLineDash([]);
  };

  Chart.prototype.hGrid = function (yFor, ticks) {
    var ctx = this.ctx, w = this.w;
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.fillStyle = pal.text; ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var i = 0; i < ticks.length; i++) {
      var y = yFor(ticks[i].v);
      if (y < 8 || y > this.h - 8) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillText(ticks[i].l, 5, y - 5);
    }
    ctx.setLineDash([]);
  };

  Chart.prototype.polyline = function (vals, color, width, yFor) {
    var ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    var open = false;
    this.each(function (i, tt) {
      if (tt < self_t0(this) - 0.05 || tt > self_t1(this) + 0.05) return;
      var v = vals[i];
      if (!isF(v)) { open = false; return; }
      var x = this.xOf(tt), y = yFor(v);
      if (open) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      open = true;
    }.bind(this));
    ctx.stroke();
  };
  function self_t0(c) { return c.t0; }
  function self_t1(c) { return c.t1; }

  Chart.prototype.playheadLine = function () {
    if (playhead == null || playhead < this.t0 || playhead > this.t1) return;
    var ctx = this.ctx;
    var x = this.xOf(playhead);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); ctx.stroke();
    ctx.globalAlpha = 1;
  };

  Chart.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    var axis = D.pitchAxis;
    var fMin = axis[0], fMax = axis[1];
    var yPitch = function (f) { return h - ((f - fMin) / (fMax - fMin)) * h; };
    var yDb = function (v) { return h - ((v + 90) / 90) * h; };
    var yF = function (f) { return h - (f / 3500) * h; };

    if (this.kind === 'pitch') {
      var ranges = { low: [50, D.bandBounds[0]], male: [D.bandBounds[0], D.bandBounds[1]], transition: [D.bandBounds[1], D.bandBounds[2]], female: [D.bandBounds[2], D.bandBounds[3]], high: [D.bandBounds[3], 520] };
      var names = ['low', 'male', 'transition', 'female', 'high'];
      for (var bi = 0; bi < names.length; bi++) {
        var rg = ranges[names[bi]];
        var yTop = Math.max(0, yPitch(Math.min(rg[1], fMax)));
        var yBot = Math.min(h, yPitch(Math.max(rg[0], fMin)));
        if (yBot <= yTop) continue;
        ctx.globalAlpha = names[bi] === 'transition' ? 0.07 : 0.13;
        ctx.fillStyle = C.bands[names[bi]];
        ctx.fillRect(0, yTop, w, yBot - yTop);
      }
      ctx.globalAlpha = 1;
      this.hGrid(yPitch, [{ v: 100, l: '100Hz' }, { v: 300, l: '300Hz' }, { v: 500, l: '500Hz' }]);
      this.timeGrid();
      // 音高曲线：逐段按音区着色
      var ctx2 = ctx;
      ctx2.lineJoin = 'round'; ctx2.lineCap = 'round'; ctx2.lineWidth = 2.2;
      var seg = null, open = false, lx = 0, ly = 0, had = false;
      this.each(function (i, tt) {
        if (tt < this.t0 - 0.05 || tt > this.t1 + 0.05) return;
        var f = S.f0[i];
        if (!isF(f)) { if (open) { ctx2.stroke(); open = false; } seg = null; had = false; return; }
        var x = this.xOf(tt), y = yPitch(f), b = bandOf(f);
        if (!open) { ctx2.strokeStyle = C.bands[b]; ctx2.beginPath(); ctx2.moveTo(x, y); open = true; if (had) { ctx2.moveTo(lx, ly); ctx2.lineTo(x, y); } }
        else if (b !== seg) { ctx2.stroke(); ctx2.strokeStyle = C.bands[b]; ctx2.beginPath(); ctx2.moveTo(lx, ly); ctx2.lineTo(x, y); }
        else { ctx2.lineTo(x, y); }
        seg = b; lx = x; ly = y; had = true;
      }.bind(this));
      if (open) ctx2.stroke();
    } else if (this.kind === 'energy') {
      this.hGrid(yDb, [{ v: 0, l: '0dB' }, { v: -30, l: '-30dB' }, { v: -60, l: '-60dB' }]);
      this.timeGrid();
      // 面积 + 线
      var ctx3 = ctx;
      var pts = [];
      this.each(function (i, tt) {
        if (tt < this.t0 - 0.05 || tt > this.t1 + 0.05) return;
        pts.push([this.xOf(tt), yDb(S.rmsDb[i])]);
      }.bind(this));
      if (pts.length >= 2) {
        var grad = ctx3.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, C.accent); grad.addColorStop(1, C.accent2);
        ctx3.globalAlpha = 0.16; ctx3.fillStyle = grad;
        ctx3.beginPath(); ctx3.moveTo(pts[0][0], h);
        for (var pi = 0; pi < pts.length; pi++) ctx3.lineTo(pts[pi][0], pts[pi][1]);
        ctx3.lineTo(pts[pts.length-1][0], h); ctx3.closePath(); ctx3.fill();
        ctx3.globalAlpha = 0.85; ctx3.strokeStyle = C.accent; ctx3.lineWidth = 1.8;
        ctx3.beginPath(); ctx3.moveTo(pts[0][0], pts[0][1]);
        for (var pj = 1; pj < pts.length; pj++) ctx3.lineTo(pts[pj][0], pts[pj][1]);
        ctx3.stroke(); ctx3.globalAlpha = 1;
      }
    } else if (this.kind === 'formant') {
      this.hGrid(yF, [{ v: 1000, l: '1000Hz' }, { v: 2000, l: '2000Hz' }, { v: 3000, l: '3000Hz' }]);
      this.timeGrid();
      this.polyline(S.f1, C.accent, 2, yF);
      this.polyline(S.f2, C.accent2, 2, yF);
    } else if (this.kind === 'spec') {
      drawSpec(this);
    } else if (this.kind === 'vowel') {
      drawVowel(this);
    }
    this.playheadLine();
  };

  function drawSpec(ch) {
    if (!D.spec) return;
    var ctx = ch.ctx, w = ch.w, h = ch.h;
    var rows = Math.floor(D.spec.data.length * 3 / 4 / D.spec.bands);
    if (rows < 2) return;
    var bin = atob(D.spec.data);
    var off = document.createElement('canvas');
    off.width = rows; off.height = D.spec.bands;
    var octx = off.getContext('2d');
    var img = octx.createImageData(rows, D.spec.bands);
    for (var r = 0; r < rows; r++) {
      for (var b = 0; b < D.spec.bands; b++) {
        var v = bin.charCodeAt(r * D.spec.bands + b);
        var rgb = magma(v / 255);
        var p = (r * D.spec.bands + b) * 4;
        img.data[p] = rgb[0]; img.data[p+1] = rgb[1]; img.data[p+2] = rgb[2]; img.data[p+3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(0, h); ctx.scale(1, -1);
    ctx.drawImage(off, 0, 0, rows, D.spec.bands, 0, 0, w, h);
    ctx.restore();
    // 频率刻度（对数位）
    var fmin = D.specRange.fmin, fmax = D.specRange.fmax;
    var yFor = function (f) { return h - (Math.log(f / fmin) / Math.log(fmax / fmin)) * h; };
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.fillStyle = '#fff'; ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var ticks = [250, 500, 1000, 2000, 4000];
    for (var i = 0; i < ticks.length; i++) {
      var y = yFor(ticks[i]);
      if (y < 6 || y > h - 6) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillText(ticks[i] >= 1000 ? (ticks[i] / 1000) + 'k' : '' + ticks[i], 4, y - 5);
    }
    ctx.setLineDash([]);
  }

  function drawVowel(ch) {
    var ctx = ch.ctx, w = ch.w, h = ch.h;
    var F1 = D.vowelAxis.f1, F2 = D.vowelAxis.f2;
    function logNorm(v, mm) { var c = clamp(v, mm[0], mm[1]); return (Math.log(c) - Math.log(mm[0])) / (Math.log(mm[1]) - Math.log(mm[0])); }
    function xy(f1, f2) { return [(1 - logNorm(f2, F2)) * w, logNorm(f1, F1) * h]; }
    // 网格
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    [250, 500, 1000].forEach(function (v) { var y = logNorm(v, F1) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); });
    [800, 1500, 2500].forEach(function (v) { var x = (1 - logNorm(v, F2)) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); });
    ctx.setLineDash([]);
    // 散点
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.22;
    for (var i = 0; i < S.t.length; i++) {
      if (!isF(S.f0[i]) || !isF(S.f1[i]) || !isF(S.f2[i])) continue;
      var p = xy(S.f1[i], S.f2[i]);
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 参考元音
    D.vowelRefs.forEach(function (ref) {
      var q = xy(ref.f1, ref.f2);
      ctx.strokeStyle = pal.text; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.text; ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(ref.label, q[0], q[1] - 7);
      ctx.globalAlpha = 1;
    });
  }

  function drawAll() { for (var i = 0; i < charts.length; i++) charts[i].draw(); }

  /* ---------- 静态数据渲染 ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderHeader() {
    var h = document.getElementById('head-meta');
    var chips = [D.meta.dateStr];
    if (D.meta.modeLabel) chips.push(D.meta.modeLabel);
    var m = Math.floor(D.meta.durationSec / 60), s = Math.round(D.meta.durationSec - m * 60);
    chips.push(L.duration + ' ' + m + ':' + (s < 10 ? '0' : '') + s);
    var f0s = S.f0.filter(function (v) { return isF(v); });
    if (f0s.length) {
      var mean = f0s.reduce(function (a, b) { return a + b; }, 0) / f0s.length;
      chips.push(L.avgF0 + ' ' + mean.toFixed(1) + ' Hz');
    }
    chips.forEach(function (txt) { h.appendChild(el('span', 'chip', txt)); });
    if (D.meta.note) {
      var note = document.getElementById('head-note');
      note.textContent = D.meta.note;
      note.style.display = '';
    }
  }

  function renderStats() {
    var grid = document.getElementById('stats');
    D.stats.forEach(function (row) {
      grid.appendChild(el('div', 'stat-label', row[0]));
      grid.appendChild(el('div', 'stat-value', row[1]));
    });
  }

  /* ---------- 回放与播放头 ---------- */
  function setupAudio() {
    var box = document.getElementById('audio-box');
    if (!D.audio) { box.style.display = 'none'; return; }
    var audio = document.getElementById('player');
    audio.src = 'data:' + D.audio.mime + ';base64,' + D.audio.data;
    var raf = 0;
    function tick() {
      playhead = audio.currentTime;
      drawAll();
      if (!audio.paused) raf = requestAnimationFrame(tick);
    }
    audio.addEventListener('play', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    audio.addEventListener('pause', function () { cancelAnimationFrame(raf); playhead = audio.currentTime; drawAll(); });
    audio.addEventListener('seeked', function () { playhead = audio.currentTime; drawAll(); });
  }

  /* ---------- 启动 ---------- */
  document.getElementById('head-title').textContent = L.title;
  document.getElementById('lb-pitch').textContent = L.titlePitch;
  document.getElementById('lb-energy').textContent = L.titleEnergy;
  document.getElementById('lb-formant').textContent = L.titleFormant;
  document.getElementById('lb-spec').textContent = L.titleSpec;
  document.getElementById('lb-vowel').textContent = L.titleVowel;
  document.getElementById('hint-zoom').textContent = L.zoomHint;
  document.getElementById('foot').textContent = L.footer;
  renderHeader();
  renderStats();
  new Chart('chart-pitch', 'pitch');
  new Chart('chart-energy', 'energy');
  new Chart('chart-formant', 'formant');
  new Chart('chart-spec', 'spec');
  new Chart('chart-vowel', 'vowel');
  setupAudio();
  drawAll();
})();
`;

/** 报告页样式与骨架（深浅色跟随系统） */
function shell(payloadJson: string, runtimeJs: string, title: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + title + '</title>',
    '<style>',
    ':root { color-scheme: light dark; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; padding: 24px 16px 48px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    '  background: #F6F5F8; color: #26242E; }',
    '@media (prefers-color-scheme: dark) { body { background: #131218; color: #ECEAF2; } }',
    'main { max-width: 920px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }',
    'h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }',
    '.card { background: #FFFFFF; border-radius: 18px; padding: 16px;',
    '  box-shadow: 0 2px 14px rgba(28,25,45,0.06); }',
    '@media (prefers-color-scheme: dark) { .card { background: #1D1B24; box-shadow: none; } }',
    '.chip { display: inline-block; background: rgba(127,124,140,0.12); border-radius: 999px;',
    '  padding: 3px 10px; font-size: 11px; margin: 0 6px 6px 0; }',
    '#head-note { display: none; font-size: 13px; opacity: 0.75; margin: 6px 0 0; }',
    'canvas { display: block; width: 100%; border-radius: 10px; touch-action: none; }',
    `#chart-pitch { height: ${CH_H.pitch}px; }`,
    `#chart-energy { height: ${CH_H.energy}px; }`,
    `#chart-formant { height: ${CH_H.formant}px; }`,
    `#chart-spec { height: ${CH_H.spec}px; }`,
    `#chart-vowel { height: ${CH_H.vowel}px; }`,
    '.chart-title { font-size: 12px; font-weight: 600; opacity: 0.7; margin: 0 0 8px; }',
    '.hint { font-size: 10px; opacity: 0.55; margin: 6px 0 0; text-align: center; }',
    '#stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }',
    '@media (min-width: 640px) { #stats { grid-template-columns: 1fr 1fr 1fr 1fr; } }',
    '.stat-label { font-size: 10px; opacity: 0.55; }',
    '.stat-value { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }',
    '#player { width: 100%; }',
    'footer { text-align: center; font-size: 10px; opacity: 0.5; margin-top: 8px; }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<div class="card">',
    '  <h1 id="head-title"></h1>',
    '  <div id="head-meta" style="margin-top:8px"></div>',
    '  <p id="head-note"></p>',
    '</div>',
    '<div class="card"><div id="stats"></div></div>',
    '<div class="card"><p class="chart-title" id="lb-pitch"></p><canvas id="chart-pitch"></canvas><p class="hint" id="hint-zoom"></p></div>',
    '<div class="card"><p class="chart-title" id="lb-energy"></p><canvas id="chart-energy"></canvas></div>',
    '<div class="card"><p class="chart-title" id="lb-formant"></p><canvas id="chart-formant"></canvas></div>',
    '<div class="card"><p class="chart-title" id="lb-spec"></p><canvas id="chart-spec"></canvas></div>',
    '<div class="card"><p class="chart-title" id="lb-vowel"></p><canvas id="chart-vowel"></canvas></div>',
    '<div class="card" id="audio-box"><audio id="player" controls preload="metadata"></audio></div>',
    '<footer id="foot"></footer>',
    '</main>',
    '<script type="application/json" id="svt-data">' + payloadJson + '</' + 'script>',
    '<script>' + runtimeJs + '</' + 'script>',
    '</body>',
    '</html>',
  ].join('\n');
}

export interface InteractiveHtmlOptions {
  /** 内嵌的录音音频（null = 不含音频，仅图表数据） */
  audio: Blob | null;
}

/**
 * 生成自包含 HTML 报告字符串（导出与测试共用）
 */
export async function buildInteractiveHtml(
  record: AnalysisRecord,
  opts: InteractiveHtmlOptions,
): Promise<string> {
  const audio = opts.audio
    ? { mime: opts.audio.type || 'audio/webm', data: await blobToBase64(opts.audio) }
    : null;
  const payload = buildPayload(record, audio);
  const title = `${payload.labels.title} · ${payload.meta.dateStr}`;
  return shell(safeJson(payload), RUNTIME_JS, title);
}

/**
 * 生成并下载交互式 HTML 报告
 */
export async function exportInteractiveHtml(
  record: AnalysisRecord,
  opts: InteractiveHtmlOptions,
): Promise<void> {
  const html = await buildInteractiveHtml(record, opts);
  downloadBlob(`voice-report-${record.id.slice(0, 8)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
}
