// ゲーム全体で共有する定義（エンディング、使えるID）
(function (root) {
  'use strict';

  const ENDINGS = [
    { id: 'E01', title: 'そして僕は帰った', type: 'BAD', route: '共通' },
    { id: 'E02', title: '人狼は僕でした', type: 'BAD', route: '共通' },
    { id: 'E03', title: '全方位外交', type: 'BAD', route: 'モテ期編' },
    { id: 'E04', title: '炎上', type: 'BAD', route: 'モテ期編' },
    { id: 'E05', title: '婚活道場', type: 'NORMAL', route: 'モテ期編' },
    { id: 'E06', title: '籠城', type: 'BAD', route: '殺人予告編' },
    { id: 'E07', title: '斧を持つ男', type: 'BAD', route: '殺人予告編' },
    { id: 'E08', title: '共犯者', type: 'GOOD', route: '殺人予告編' },
    { id: 'E09', title: '冤罪', type: 'BAD', route: '詐欺師編' },
    { id: 'E10', title: 'もう一度、プロポーズを', type: 'GOOD', route: '詐欺師編' },
    { id: 'E11', title: '俺たちの夜', type: 'GOOD', route: '詐欺師編' },
    { id: 'E12', title: '雪の抱擁', type: 'BAD', route: '雪女編' },
    { id: 'E13', title: '月下美人', type: 'GOOD', route: '雪女編' },
    { id: 'E14', title: '迷探偵', type: 'BAD', route: 'ミステリー編' },
    { id: 'E15', title: '名探偵DT', type: 'NORMAL', route: 'ミステリー編' },
    { id: 'E16', title: '山田さんの春', type: 'GOOD', route: 'ミステリー編' },
    { id: 'E17', title: '言えなかった言葉', type: 'BAD', route: '真相編' },
    { id: 'E18', title: '黄色い傘', type: 'TRUE', route: '真相編' }
  ];

  const IDS = {
    bg: ['black', 'white', 'bus', 'snowroad', 'pension', 'snowfield', 'lounge', 'dining', 'corridor', 'room',
      'entrance', 'stairs', 'kitchen', 'greenhouse', 'bloom', 'blizzard', 'attic', 'morning', 'bath', 'memory'],
    chara: ['tsuyoshi', 'mao', 'saeko', 'anzu', 'shizuka', 'saionji', 'yamada', 'reiko', 'otaka', 'yuuki',
      'yuki', 'ghost', 'girl', 'mother'],
    bgm: ['title', 'calm', 'comedy', 'romance', 'suspense', 'horror', 'sad', 'mystery', 'tension', 'ending', 'snow', 'stop'],
    se: ['door', 'knock', 'scream', 'shock', 'heartbeat', 'wind', 'footsteps', 'glass', 'breaker', 'phone',
      'meow', 'bell', 'pen', 'splash', 'thud', 'chime', 'paper'],
    fx: ['shake', 'flash', 'red', 'blue', 'normal', 'snow', 'nosnow']
  };

  const START = 'pr_01';

  const api = { ENDINGS: ENDINGS, IDS: IDS, START: START };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GAMEDATA = api;
})(this);
