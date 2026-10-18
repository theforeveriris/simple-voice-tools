# 参考文献

本项目的参数参考区间与算法实现所依据的公开文献与资料。按主题分组，
正文文档（参数说明书 / 算法文档）中的口径出处统一引用本页。

> 所有参考区间均为常见文献的近似值，**未经临床验证**，仅供自我追踪定向，
> 不构成医学诊断。个体差异很大，请以自身纵向趋势为准。

## 音高检测（YIN / pYIN / MPM）

| 文献 | 用于 |
| --- | --- |
| de Cheveigné, A. & Kawahara, H. (2002). *YIN, a fundamental frequency estimator for speech and music*. J. Acoust. Soc. Am. 111(4), 1917–1930. | YIN 差分函数、累积均值归一化（CMND）、阈值与抛物线插值（[ALGORITHM-YIN.md](ALGORITHM-YIN.md)） |
| Mauch, M. & Dixon, S. (2014). *pYIN: a fundamental frequency estimator using probabilistic threshold distributions*. ICASSP 2014. | pYIN 多阈值概率化投票（简化实现，[pitchAlt.ts](../src/lib/audio/pitchAlt.ts)） |
| McLeod, P. & Wyvill, G. (2005). *A smarter way to find pitch*. ICMC 2005. | MPM 归一化平方差函数（NSDF）与关键极大值选取（[pitchAlt.ts](../src/lib/audio/pitchAlt.ts)） |

## 共振峰提取（LPC）

| 文献 | 用于 |
| --- | --- |
| Markel, J. D. & Gray, A. H. (1976). *Linear Prediction of Speech*. Springer-Verlag. | LPC 全极点模型、Levinson-Durbin 递推（[ALGORITHM-FORMANT-LPC.md](ALGORITHM-FORMANT-LPC.md)） |
| Durand, L. (1860). 解决代数方程的 Durand-Kerner 方法（后由 Kerner 1950、Durand 1960 完善表述） | 多项式求根（F1/F2 由 LPC 根的共振条件解出） |
| Klatt, D. H. (1980). *Software for a cascade/parallel formant synthesizer*. J. Acoust. Soc. Am. 67(3). | 共振峰根筛选的频率/带宽合理性判据（工业惯例，本实现沿用） |

## 元音空间与共振峰参考位

| 文献 | 用于 |
| --- | --- |
| Peterson, G. E. & Barney, H. L. (1952). *Control methods used in a study of the vowels*. J. Acoust. Soc. Am. 24(2), 175–184. | i / a / u 参考元音 F1/F2 位置的原始依据（VOWEL_REFS，[PARAMETERS-GUIDE.md](PARAMETERS-GUIDE.md) 第五节） |
| Hillenbrand, J. et al. (1995). *Acoustic characteristics of American English vowels*. J. Acoust. Soc. Am. 97(5), 3093–3111. | 成人男女元音共振峰分布的性别差异（「i 是共鸣试金石」等论述） |

## 嗓音质量（Jitter / Shimmer / HNR / CPPS）

| 文献 | 用于 |
| --- | --- |
| Baken, R. J. & Orlikoff, R. F. (2000). *Clinical Measurement of Speech and Voice* (2nd ed.). Singular. | Jitter / Shimmer 的经典定义与健康成人参考区间（<1% / >20 dB 量级，[PARAMETERS-GUIDE.md](PARAMETERS-GUIDE.md) 第六节） |
| Titze, I. R. (1994). *Principles of Voice Production*. Prentice Hall. | 基频微扰与声带振动质量的生理关联 |
| Hillenbrand, J., Cleveland, R. A. & Erickson, R. L. (1994). *Acoustic correlates of breathy vocal quality*. J. Speech Hear. Res. 37(4), 769–778. | CPP/CPPS 的经典口径（本实现逐帧 CPP 的窗长与 quefrency 搜索范围，[ALGORITHM-CPPS.md](ALGORITHM-CPPS.md)） |
| Heman-Ackah, Y. D. et al. (2003). *Cepstral peak prominence: a more reliable approach than voice quality index*. Laryngoscope 113. | CPPS 相对 J/S 在连续语音中的稳健性论述 |

## 能量与发声检测（VAD）

| 文献 | 用于 |
| --- | --- |
| Sangwan, A. et al. (2002). *Analysis of energy-based fast computation of energy thresholds for voice activity detection*. | 多门限（绝对门限 + 活动门限）分级 VAD 的通行做法（[ALGORITHM-ENERGY.md](ALGORITHM-ENERGY.md)） |

## 音域图（VRP / phonetogram）

| 文献 | 用于 |
| --- | --- |
| Schutte, H. K. & Seidner, W. (1983). *Recommendation by the Union of European Phoniatricians (UEP): standardizing voice area measurement/phonetography*. Folia Phoniatr. 35, 286–288. | 半音 × 响度矩阵的 phonetogram 惯例（VRP 视图布局，[PARAMETERS-GUIDE.md](PARAMETERS-GUIDE.md) VRP 节） |

## 其他实现参考

| 资料 | 用于 |
| --- | --- |
| Praat（Boersma & Weenink, University of Amsterdam） | PitchTier / Formant 互操作文件的格式与跨验证口径（[export/praat.ts](../src/lib/export/praat.ts)） |
| MDN Web Audio API 文档 | AnalyserNode / AudioContext 行为基准 |

---

*维护约定：正文文档新引用文献时，先在本页登记（按主题分组），正文处只写
「见 REFERENCES.md · 分组」或简短作者-年份，不粘贴完整条目。*
