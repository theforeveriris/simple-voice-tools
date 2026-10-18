-- 严格共鸣训练（示例脚本）
-- 比「默认建议规则」更严格地盯 F2−F1 间距：每 100 Hz 给一档反馈，
-- 适合 MtF 方向共鸣训练的中后期（默认规则只在 <1000Hz 时提示一次）。
-- 输入 stats 字段见 lua-scripts/README.md；输出 { text, level } 数组（最多 3 条）

function advise(stats)
  local tips = {}

  local gap = stats.f2f1GapHz
  if gap then
    if gap < 800 then
      table.insert(tips, { level = "warn",
        text = string.format("F2−F1 间距 %d Hz，共鸣明显偏后：小口型发「i」找高频共振，再滑到目标元音", math.floor(gap)) })
    elseif gap < 1000 then
      table.insert(tips, { level = "warn",
        text = string.format("F2−F1 间距 %d Hz，还差一步：试着把舌尖再前移一点，保持喉位稳定", math.floor(gap)) })
    elseif gap < 1200 then
      table.insert(tips, { level = "info",
        text = string.format("F2−F1 间距 %d Hz，进入前共鸣区了，保持这个口型多练长音巩固", math.floor(gap)) })
    else
      table.insert(tips, { level = "info",
        text = string.format("F2−F1 间距 %d Hz，非常棒的前共鸣，这个状态就是你的目标位", math.floor(gap)) })
    end
  end

  -- 大 Crane 分数（avgF0 低于靶标下限才提示，FtM 方向请自行反转）
  if stats.target.enabled and stats.avgF0 > 0 and stats.avgF0 < stats.target.min then
    table.insert(tips, { level = "warn",
      text = string.format("平均基频 %d Hz 低于目标下限：先用哼鸣找音高，再开口说话", math.floor(stats.avgF0)) })
  end

  -- 共鸣与音高同时达标时给「组合提示」
  if gap and gap >= 1200 and stats.target.enabled
     and stats.avgF0 >= stats.target.min and stats.avgF0 <= stats.target.max then
    table.insert(tips, { level = "info",
      text = "音高与共鸣同时达标——录一段自由朗读听听整体听感吧" })
  end

  if #tips == 0 then
    table.insert(tips, { level = "info", text = "本次没有触发严格共鸣规则的检查点，保持练习节奏" })
  end
  return tips
end
