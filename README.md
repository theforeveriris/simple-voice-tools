# Simple Voice Tools · 语音工坊

## 项目简介

一个基于 Web Audio API 的语音测试与分析工具。对着麦克风说几句话，即可获得
基频（音高）、共振峰（F1/F2）、能量电平的完整曲线与统计报告，并了解自己的
嗓音在男/女声音域区间中所处的位置。

## 功能特点

- **测试**：三个实时图表（F1/F2 共振峰、音频能量、音高曲线）随录音推进滚动更新，
  音高图按区间分段着色（淡紫=偏低/偏高、淡蓝=男声区、黑=过渡区、淡粉=女声区），
  右上角实时显示 Hz 与对应钢琴音高
- **悬浮底栏**：四个页签（测试/分析/历史/设置）胶囊滑移动效；测试页时底栏与
  录音圆球作为整体居中，录音中圆球带呼吸光晕
- **分析**：声纹概览卡（平均基频 + 音域标尺）、三组统计表格、三张图表均支持
  双滑块时间轴区间缩放
- **历史**：全部记录保存在浏览器 localStorage，按时间倒序，点击即可回看分析
- **设置**：莫奈取色主题（8 个预设 + 自定义色相）、数据导入/导出/清空、
  录音时长限制、麦克风设备选择
- **应用内文档**：设置 → 关于 中可离线阅读算法原理与开发者文档

## 文档

| 文档 | 内容 |
| --- | --- |
| [documentation/DEVELOPMENT.md](documentation/DEVELOPMENT.md) | 开发者文档：架构、数据流、主题系统、动效模型、性能设计 |
| [documentation/ALGORITHM-YIN.md](documentation/ALGORITHM-YIN.md) | 音高检测原理：YIN 差分函数、CMND、抛物线插值 |
| [documentation/ALGORITHM-FORMANT-LPC.md](documentation/ALGORITHM-FORMANT-LPC.md) | 共振峰提取原理：预加重、抽取、LPC、多项式求根 |
| [documentation/ALGORITHM-ENERGY.md](documentation/ALGORITHM-ENERGY.md) | 能量分析原理：RMS、分贝换算、VAD 门限体系 |

以上文档也可在应用内离线阅读：**设置 → 关于 → 文档**。

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS（莫奈动态色板基于 OKLCH 色彩空间生成）
- Zustand（状态管理，含持久化）
- Framer Motion（动效）
- Web Audio API + 原生 Canvas 2D（自绘图表，无图表库依赖）：
  - **YIN 算法**音高检测（差分函数 + CMND + 抛物线插值）
  - **LPC 线性预测**共振峰提取（Levinson-Durbin + Durand-Kerner 求根）
  - RMS 能量电平与 VAD 门限

## 开发说明

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

> 构建产物输出到 `docs/` 目录（GitHub Pages 约定）。注意 `docs/` 构建时会被清空，
> 源文档位于 `documentation/` 目录。

### 预览构建结果

```bash
npm run preview
```

### 体验示例数据

无需麦克风也可查看分析页效果：访问任意页面 URL 加 `?demo=1`，
或使用历史/分析/设置页中的「载入示例数据」按钮。

## 使用方法

1. 启动应用后默认进入测试页，点击底栏右侧的圆球按钮开始录音
2. 允许浏览器访问麦克风权限，用正常音量说话或朗读
3. 再次点击圆球（或到达最长录音时长）结束录音，自动进入分析页
4. 在历史页可回看所有测试记录，分析页图表下方的时间轴可缩放查看区间

## 注意事项

- 使用了 `getUserMedia`，需要在 HTTPS 或 localhost 环境下运行
- 麦克风权限需要用户手动授权
- 所有数据仅保存在本机浏览器中，不会上传到任何服务器
- 检测准确性可能受环境噪音影响，建议在安静环境中测试

## 浏览器兼容性

建议使用最新版本的 Chrome、Edge、Firefox 或 Safari。
