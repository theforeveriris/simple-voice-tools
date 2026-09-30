/**
 * 朗读引导文本库
 * 泰戈尔《飞鸟集》名句（郑振铎译，原作与译作均已进入公有领域），
 * 每次录音随机抽取一段，保证多次测试的语料可比性。
 */

export interface ReadingPassage {
  id: string;
  lines: string[];
}

export const READING_PASSAGES: ReadingPassage[] = [
  {
    id: 'birds-window',
    lines: [
      '夏天的飞鸟，飞到我的窗前唱歌，又飞去了。',
      '秋天的黄叶，它们没有什么可唱，只叹息一声，飞落在那里。',
      '世界上的一队小小的漂泊者呀，请留下你们的足印在我的文字里。',
    ],
  },
  {
    id: 'sun-tears',
    lines: [
      '如果你因失去了太阳而流泪，那么你也将失去群星了。',
      '你看不见你自己，你所看见的只是你的影子。',
      '群星不怕显得像萤火那样。',
    ],
  },
  {
    id: 'sea-sky',
    lines: [
      '「海水呀，你说的是什么？」「是永恒的疑问。」',
      '「天空呀，你回答的话是什么？」「是永恒的沉默。」',
      '静静地听，我的心呀，听那世界的低语，这是它对你求爱的表示呀。',
    ],
  },
  {
    id: 'creation-mist',
    lines: [
      '创造的神秘，有如夜间的黑暗——是伟大的。',
      '而知识的幻影却不过如晨间之雾。',
      '我们把世界看错了，反说它欺骗我们。',
    ],
  },
  {
    id: 'bird-cloud',
    lines: [
      '鸟儿愿为一朵云，云儿愿为一只鸟。',
      '思想掠过我的心上，如一群野鸭飞过天空，我听见它们鼓翼之声了。',
    ],
  },
  {
    id: 'summer-flower',
    lines: [
      '使生如夏花之绚烂，死如秋叶之静美。',
      '尘土受到损辱，却以她的花朵来报答。',
    ],
  },
  {
    id: 'pain-song',
    lines: [
      '世界以痛吻我，要我报之以歌。',
      '错误经不起失败，但是真理却不怕失败。',
      '只管走过去，不必逗留着采了花朵来保存，因为一路上花朵自会继续开放的。',
    ],
  },
  {
    id: 'grass-earth',
    lines: [
      '小草呀，你的足步虽小，但是你拥有你足下的土地。',
      '天空中没有留下鸟的痕迹，但我已经飞过。',
    ],
  },
];

/** 随机抽取一段（尽量避开上一次的段落） */
export function pickPassage(excludeId?: string): ReadingPassage {
  if (READING_PASSAGES.length === 0) {
    return { id: 'empty', lines: ['保持安静，感受此刻。'] };
  }
  let pool = READING_PASSAGES;
  if (excludeId && pool.length > 1) {
    pool = pool.filter((p) => p.id !== excludeId);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
