-- 用声健康（示例脚本）
-- 面向嗓音保健视角：盯 Jitter / Shimmer / HNR / CPPS 与响度，不关心音高目标，
-- 适合变声期、用声过度或想监控嗓音状态的用户。阈值参考常见文献范围，非临床诊断。

function advise(stats)
  local tips = {}

  -- Jitter > 1.04%：声带振动周期不稳，可能与疲劳/紧张/脱水相关
  if stats.jitterPct and stats.jitterPct > 1.04 then
    table.insert(tips, { level = "warn",
      text = string.format("Jitter %.2f%% 偏高：今天声带可能偏疲劳，多喝水、少说话，明天再测对比", stats.jitterPct) })
  end

  -- Shimmer > 6%：振幅不稳
  if stats.shimmerPct and stats.shimmerPct > 6 then
    table.insert(tips, { level = "info",
      text = string.format("Shimmer %.1f%% 偏高：试着用更省力的音量发声，避免挤卡", stats.shimmerPct) })
  end

  -- HNR < 15 dB：谐噪比偏低
  if stats.hnrDb and stats.hnrDb < 15 then
    table.insert(tips, { level = "info",
      text = string.format("HNR %.1f dB 偏低：声音里气声偏多， closing 练习（气泡音→正常音）有帮助", stats.hnrDb) })
  end

  -- CPPS < 10 dB：连续语音的嗓音质量偏低
  if stats.cppsDb and stats.cppsDb < 10 then
    table.insert(tips, { level = "warn",
      text = string.format("CPPS %.1f dB 偏低：连续说话的嗓音质量下降，注意用声休息", stats.cppsDb) })
  end

  -- 峰值响度太接近 0 dBFS：录音可能削波，数据不可信
  if stats.peakDb and stats.peakDb > -3 then
    table.insert(tips, { level = "warn",
      text = "录音峰值接近满幅，可能削波了：离麦克风远一点重录，数据更可信" })
  end

  -- 全部健康时按用时给正反馈
  if #tips == 0 then
    table.insert(tips, { level = "info",
      text = string.format("本次 %.0f 秒录音的嗓音质量指标全部健康，用声状态不错！", stats.durationSec) })
  end
  return tips
end
