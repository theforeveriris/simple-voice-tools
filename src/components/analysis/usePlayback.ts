/**
 * 录音回放引擎（页面级 hook）
 * 音频元素挂在页面层：audioProps 展开到 <audio> 上；
 * 播放头位置由 rAF 循环同步，驱动全部分析图表；
 * 支持区间限定播放——选中时间区间时在其末尾自动停住；
 * 回放倍速跟随设置（settings.playbackRate）。
 */

import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/**
 * 回放引擎：加载当前记录的音频、驱动播放头、提供播放 / 进度控制。
 * @param record     当前分析记录（可能为空）
 * @param pitchRange 音高曲线当前区间，区间限定播放的终点依据
 */
export function usePlayback(record: AnalysisRecord | null, pitchRange: [number, number]) {
  const getAudio = useHistoryStore((s) => s.getAudio);
  const playbackRate = useStore((s) => s.settings.playbackRate);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioFor, setAudioFor] = useState<{ id: string; url: string } | null>(null);
  const [audioDur, setAudioDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState<number | null>(null);

  // 切换记录时清掉回放位置（渲染期派生重置，避免 effect 级联渲染）
  const [loadedRecordId, setLoadedRecordId] = useState<string | null>(record?.id ?? null);
  if (record && record.id !== loadedRecordId) {
    setLoadedRecordId(record.id);
    setPlayTime(null);
  }

  // 加载当前记录的音频；切换记录时停掉上一条回放（onPause 事件同步状态）
  useEffect(() => {
    if (!record) return;
    let alive = true;
    let created: string | null = null;
    audioRef.current?.pause();
    getAudio(record.id).then((blob) => {
      if (!alive || !blob) return;
      created = URL.createObjectURL(blob);
      setAudioFor({ id: record.id, url: created });
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [record?.id, getAudio]); // eslint-disable-line react-hooks/exhaustive-deps
  const audioUrl = audioFor && record && audioFor.id === record.id ? audioFor.url : null;

  // 回放倍速：设置变化或换源后同步到音频元素（元素跨源复用，显式重设以确保新源生效）
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  // 播放终点：选中区间时在其末尾停住，全段交给 ended 事件。
  // 渲染期同步到 ref（有意为之）：rAF 循环每帧读取最新值，
  // 播放中拖动时间区间也无需重启循环
  const playEndRef = useRef<number>(Infinity);
  if (record) {
    const [t0, t1] = pitchRange;
    // eslint-disable-next-line react-hooks/refs -- 渲染期派生：与原页面实现一致，仅被 rAF 循环消费
    playEndRef.current = t0 > 0.01 || t1 < record.durationSec - 0.01 ? t1 : Infinity;
  }

  // 回放中：rAF 驱动播放头，到达区间末尾自动停止
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const audio = audioRef.current;
      if (audio) {
        const time = audio.currentTime;
        if (playEndRef.current !== Infinity && time >= playEndRef.current - 0.02) {
          audio.pause();
          setPlayTime(playEndRef.current);
          return;
        }
        setPlayTime(time);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!record || !audio || !audioUrl) return;
    if (playing) {
      audio.pause();
      return;
    }
    // 媒体尚未开始加载时等一下（正常情况 src 为 blob URL，几乎瞬时就绪）
    if (audio.readyState === 0) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        audio.addEventListener('loadedmetadata', done, { once: true });
        audio.addEventListener('error', done, { once: true });
        setTimeout(done, 2000);
      });
      if (audio.readyState === 0) {
        toast.error(t('toast.playFail'));
        return;
      }
    }
    // 注意：MediaRecorder 录制的流式 webm 其 duration 常为 Infinity，
    // 浏览器播到末尾后才会修正，因此时长未知时不能据此拒绝播放
    const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : record.durationSec;
    const [t0, t1] = pitchRange;
    const partial = t0 > 0.01 || t1 < record.durationSec - 0.01;
    const end = partial ? t1 : dur;
    const start = partial ? t0 : 0;
    // 播放头已在末尾（含音频自然播完的 ended 状态）或区间之外时，回到起点重新播放
    const atAudioEnd = audio.ended || (isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.05);
    if (atAudioEnd || audio.currentTime >= end - 0.05 || audio.currentTime < start - 0.05) {
      audio.currentTime = start;
    }
    setPlayTime(audio.currentTime);
    void audio.play().catch(() => toast.error(t('toast.playFail')));
  };

  const seekPlay = (frac: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const time = Math.max(0, Math.min(1, frac)) * audio.duration;
    audio.currentTime = time;
    setPlayTime(time);
  };

  // 展开到页面层 <audio> 上的属性（音频事件 → 引擎状态）
  const audioProps: ComponentProps<'audio'> = {
    ref: audioRef,
    src: audioUrl ?? undefined,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      setPlayTime(null);
    },
    onLoadedMetadata: (e) => {
      const d = e.currentTarget.duration;
      if (isFinite(d) && d > 0) setAudioDur(d);
    },
    className: 'hidden',
  };

  return { audioUrl, playing, playTime, audioDur, togglePlay, seekPlay, audioProps };
}
