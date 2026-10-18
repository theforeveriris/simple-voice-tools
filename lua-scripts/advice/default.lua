-- 内置建议规则（可停用或复制改写）
-- 输入 stats：avgF0/medianF0/minF0/maxF0/stdF0/p10F0/p90F0/
--   jitterPct/shimmerPct/hnrDb/cppsDb/f2f1GapHz/inTargetPct/
--   voicedSamples/totalSamples/mode，及 target = {enabled,min,max}
-- 输出：{ text = "...", level = "info"|"warn" } 数组（最多 3 条）

function advise(stats)
  local tips = {}

  -- 靶标偏离
  if stats.target.enabled and stats.avgF0 > 0 then
    if stats.avgF0 < stats.target.min then
      table.insert(tips, { level = "warn",
        text = string.format("平均基频比目标下限低 %d Hz，试着整体抬高音调",
          math.floor(stats.target.min - stats.avgF0)) })
    elseif stats.avgF0 > stats.target.max then
      table.insert(tips, { level = "warn",
        text = string.format("平均基频比目标上限高 %d Hz，可以放松一些",
          math.floor(stats.avgF0 - stats.target.max)) })
    end
  end

  -- Jitter 偏高（>1.04%）：声音可能偏紧
  if stats.jitterPct and stats.jitterPct > 1.04 then
    table.insert(tips, { level = "info",
      text = string.format("Jitter %.2f%% 偏高，声音可能偏紧，试试用声休息或降低喉位", stats.jitterPct) })
  end

  -- 基频波动（CV）偏大
  local ref = stats.medianF0 > 0 and stats.medianF0 or stats.avgF0
  if ref > 0 and stats.stdF0 / ref > 0.22 then
    table.insert(tips, { level = "info",
      text = string.format("基频波动偏大（σ ≈ %.0f Hz），长音练习有助于稳定", stats.stdF0) })
  end

  -- 有效发声占比过低
  if stats.totalSamples > 30 then
    local voiced = stats.voicedSamples / stats.totalSamples * 100
    if voiced < 35 then
      table.insert(tips, { level = "info",
        text = string.format("有效发声只占 %d%%，停顿偏多，找个安静环境重录更有代表性",
          math.floor(voiced)) })
    end
  end

  -- 共鸣间距（F2−F1）偏窄
  if stats.f2f1GapHz and stats.f2f1GapHz < 1000 then
    table.insert(tips, { level = "info",
      text = string.format("F2−F1 间距 %d Hz 偏窄，收一收前共鸣试试",
        math.floor(stats.f2f1GapHz)) })
  end

  if #tips == 0 then
    table.insert(tips, { level = "info", text = "各项指标都在常见参考范围内，保持！" })
  end
  return tips
end
