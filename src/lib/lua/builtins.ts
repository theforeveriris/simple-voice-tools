/**
 * 内置 Lua 脚本（实验性「脚本中心」的示例与教程）
 * 脚本源码以 .lua 文件维护在仓库 lua-scripts/ 目录（Vite ?raw 导入），
 * 每条同时是可运行的默认行为和供用户改写的模板；新增内置脚本 =
 * 往 lua-scripts/<kind>/ 加文件 + 在此登记。接口约定见 lua-scripts/README.md。
 */

import defaultAdvice from '../../../lua-scripts/advice/default.lua?raw';
import strictResonance from '../../../lua-scripts/advice/strict-resonance.lua?raw';
import voiceRest from '../../../lua-scripts/advice/voice-rest.lua?raw';
import darkMinimalCard from '../../../lua-scripts/card/dark-minimal.lua?raw';
import praatBundle from '../../../lua-scripts/export/praat-bundle.lua?raw';

export interface BuiltinScriptMeta {
  id: string;
  name: string;
  code: string;
}

export const BUILTIN_SCRIPTS: BuiltinScriptMeta[] = [
  { id: 'builtin-advice-default', name: '默认建议规则', code: defaultAdvice },
  { id: 'builtin-advice-strict-resonance', name: '严格共鸣训练', code: strictResonance },
  { id: 'builtin-advice-voice-rest', name: '用声健康', code: voiceRest },
];

/** card 类内置脚本（kind = card，分享卡模板） */
export const BUILTIN_CARD_SCRIPTS: BuiltinScriptMeta[] = [
  { id: 'builtin-card-dark-minimal', name: '暗色极简卡', code: darkMinimalCard },
];

/** export 类内置脚本（kind = export，自定义数据格式导出桥） */
export const BUILTIN_EXPORT_SCRIPTS: BuiltinScriptMeta[] = [
  { id: 'builtin-export-praat-bundle', name: 'Praat 脚本打包', code: praatBundle },
];
