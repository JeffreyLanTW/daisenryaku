'use strict';
// ===== 劇情模式：任務資料、勝敗判定、分支 =====

// 地圖字元
const LEGEND = {
  '.': ['plain'], 'f': ['forest'], '^': ['hills'], 'M': ['mountain'], '~': ['sea'], '=': ['road'], '#': ['bridge'],
  'o': ['city', -1], 'b': ['city', 0], 'r': ['city', 1],
  'H': ['capital', 0], 'X': ['capital', 1],
  'F': ['factory', 0], 'G': ['factory', 1], 'g': ['factory', -1],
  'A': ['airport', 0], 'Z': ['airport', 1], 'a': ['airport', -1],
  'P': ['port', 0], 'Q': ['port', 1], 'p': ['port', -1],
};

const SPEAKERS = {
  '艾琳':   { title: '聯邦參謀', color: '#2f6fd0', icon: '艾' },
  '格雷文': { title: '帝國上將', color: '#c03030', icon: '格' },
  '夜鶯':   { title: '情報員',   color: '#7a4fc4', icon: '鶯' },
  '旁白':   { title: '',         color: '#55606c', icon: '◆' },
  '司令部': { title: '聯邦統帥部', color: '#1f4f8a', icon: '令' },
};

const CAMPAIGN_INTRO = [
  ['旁白', '共和曆 1987 年秋。北方的瓦爾德帝國撕毀互不侵犯條約，裝甲部隊越過了邊境。'],
  ['旁白', '亞斯特聯邦的防線措手不及。距離前線最近的，只有你指揮的第 3 機動旅。'],
  ['艾琳', '司令官，我是參謀艾琳。從今天起，聯邦的命運就交給我們了。'],
];

const MISSIONS = {
  // ---------------- 第一章 ----------------
  m1: {
    chapter: '第一章', title: '邊境急襲', place: '林德鎮',
    map: [
      '~~~~..ff....^^MM..',
      '~~~.o.ff.....^MM..',
      '~~..........=====.',
      '~~.F..=====.=..ff.',
      '~.=.H==...=.=..o..',
      '~..=.......=......',
      '~~.o..ff...==.....',
      '~~~..fff.^^.==..X.',
      '~~~......^^..=....',
      '~~~~..o.......=.o.',
      '~~~~~~...ff....=..',
      '~~~~~~~~.fff^^MM..',
    ],
    funds: [800, 200],
    units: [
      [0, 'inf', 5, 4], [0, 'inf', 3, 5], [0, 'inf', 5, 2], [0, 'tank', 6, 3], [0, 'tank', 6, 5],
      [0, 'arty', 3, 4], [0, 'recon', 4, 6],
      [1, 'tank', 13, 4], [1, 'tank', 14, 6], [1, 'inf', 12, 5], [1, 'inf', 11, 7], [1, 'arty', 15, 7],
      [1, 'recon', 12, 8], [1, 'inf', 15, 9],
    ],
    briefing: () => [
      ...CAMPAIGN_INTRO,
      ['艾琳', '帝國前鋒已在林德鎮東方建立前進指揮所。請擊退敵軍，或直接佔領那座指揮所。'],
      ['艾琳', '動作越快越好——如果能迅速取勝，統帥部就會批准反攻；拖得太久，帝國主力就會趕到。'],
    ],
    win: [
      { id: 'capture', type: 'capture', at: [16, 7], text: '佔領敵軍前進指揮所' },
      { id: 'destroy', type: 'destroyAll', text: '殲滅所有敵軍' },
    ],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    turnLimit: 15,
    hint: '9 回合內獲勝可進入反攻路線',
    events: [
      { turn: 3, lines: [['艾琳', '增援抵達！第 7 裝甲連已經到達首都附近。']], spawn: [[0, 'tank', 4, 5], [0, 'inf', 3, 3]] },
      { turn: 4, lines: [['格雷文', '聯邦的小部隊？派直升機去，碾碎他們。']], spawn: [[1, 'heli', 16, 4]] },
    ],
    next: r => r.turn <= 9
      ? { to: 'm2a', note: '迅速的勝利打亂了帝國的部署，統帥部批准立即反攻！' }
      : { to: 'm2b', note: '勝利來得太遲，帝國主力已經壓境。我們必須轉入防禦。' },
  },

  // ---------------- 第二章 A ----------------
  m2a: {
    chapter: '第二章', title: '反攻作戰', place: '艾斯河谷',
    map: [
      'MM^^..ff....^^..Z..~',
      'M^...ff..o...^...r.~',
      '^..==.......=====..~',
      '.F=.=..ff..=...^^.~~',
      '.=H.=.fff..=..o...~~',
      '..b..=.....=......~~',
      '..=..==..^^.=..G..~~',
      '..=....=.^^..=....~~',
      '.f.o....=.....=..r~~',
      '.ff......=.ff..==.Q~',
      '..f...^^..=fff...~~~',
      '~.....^MM..=.....~~~',
      '~~...^^MM....^^.~~~~',
    ],
    funds: [1500, 800],
    units: [
      [0, 'inf', 3, 4], [0, 'inf', 2, 5], [0, 'inf', 4, 6], [0, 'tank', 3, 3], [0, 'tank', 4, 5],
      [0, 'arty', 1, 5], [0, 'recon', 3, 7], [0, 'aa', 2, 6], [0, 'atinf', 1, 4],
      [1, 'tank', 12, 4], [1, 'inf', 11, 2], [1, 'inf', 14, 7], [1, 'arty', 15, 5], [1, 'aa', 16, 2],
      [1, 'fighter', 16, 0], [1, 'heli', 17, 8], [1, 'tank', 14, 9], [1, 'recon', 12, 7], [1, 'inf', 17, 1],
      [1, 'destroyer', 18, 10],
    ],
    briefing: () => [
      ['艾琳', '敵軍前鋒潰散了！統帥部批准反攻。'],
      ['艾琳', '東方的艾斯河谷有帝國的港口與機場，兩者都是補給樞紐。'],
      ['艾琳', '佔領其中之一，就能決定下一步的進攻路線：港口通往海峽，機場則能讓我們爭奪制空權。'],
      ['格雷文', '（攔截通訊）讓聯邦的老鼠來吧，艾斯河谷就是他們的墳場。'],
    ],
    win: [
      { id: 'port', type: 'capture', at: [18, 9], text: '佔領東南港口 → 海路' },
      { id: 'air', type: 'capture', at: [16, 0], text: '佔領北方機場 → 空路' },
    ],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    turnLimit: 18,
    hint: '你選擇佔領的據點將決定第三章的路線',
    events: [
      { turn: 5, lines: [['格雷文', '派預備隊上去！不能讓他們拿下補給線。']], spawn: [[1, 'tank', 15, 6], [1, 'inf', 13, 1]] },
    ],
    next: r => r.obj === 'port'
      ? { to: 'm3a', note: '港口落入我軍手中，艦隊可以由此出擊，直指海峽。' }
      : { to: 'm3b', note: '機場到手！我們將與帝國空軍爭奪天空。' },
  },

  // ---------------- 第二章 B ----------------
  m2b: {
    chapter: '第二章', title: '堅守河谷', place: '索恩河',
    map: [
      'MMM^...f..~..ff..^MM',
      'MM^..o..f.~...f...MM',
      'M^.....==.#==.....^M',
      '^..F.==...~..==.G..^',
      '..=H=.....~....=....',
      '..b...ff..~.ff..=.r.',
      '..=..fff.b#==....==.',
      '..=.....f.~.....G...',
      '.b..==....~..ff..r..',
      '...=..=..=#=====....',
      '^..=...==.~...ff..^^',
      'M^.......f~..f...^MM',
      'MMM^^....~~.....^MMM',
    ],
    funds: [1000, 1500],
    units: [
      [0, 'inf', 9, 6], [0, 'tank', 8, 5], [0, 'tank', 8, 7], [0, 'arty', 6, 4], [0, 'inf', 8, 2],
      [0, 'inf', 9, 9], [0, 'aa', 5, 6], [0, 'recon', 4, 8], [0, 'atinf', 9, 3],
      [1, 'tank', 12, 3], [1, 'tank', 13, 6], [1, 'tank', 12, 9], [1, 'inf', 12, 2], [1, 'inf', 13, 8],
      [1, 'arty', 15, 4], [1, 'arty', 15, 8], [1, 'rocket', 17, 6], [1, 'recon', 12, 7], [1, 'heli', 16, 1],
      [1, 'atinf', 14, 9], [1, 'tank', 14, 4],
    ],
    briefing: () => [
      ['艾琳', '帝國主力抵達索恩河對岸，兵力是我們的兩倍以上。'],
      ['司令部', '第 3 機動旅務必堅守河谷 10 回合，援軍正在途中。'],
      ['艾琳', '三座橋是敵軍唯一的渡河點。另外，橋頭那座城市若在作戰結束時仍在我們手中……'],
      ['夜鶯', '（加密通訊）……我就能從那裡潛入敵後。守住它，司令官。'],
    ],
    win: [
      { id: 'hold', type: 'survive', turn: 10, text: '堅守至第 10 回合結束' },
      { id: 'hold', type: 'destroyAll', text: '或殲滅所有敵軍' },
    ],
    bonus: [{ type: 'hold', at: [9, 6], flag: 'bridge', text: '作戰結束時控制河畔城市（夜鶯行動獲得增援）' }],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    hint: '首都失守將直接導致敗北結局',
    events: [
      { turn: 5, lines: [['艾琳', '援軍先頭部隊抵達！']], spawn: [[0, 'tank', 2, 6], [0, 'arty', 3, 5]] },
      { turn: 6, lines: [['格雷文', '第二梯隊，全線渡河！']], spawn: [[1, 'tank', 18, 4], [1, 'inf', 18, 8], [1, 'attacker', 19, 6]] },
    ],
    next: () => ({ to: 'm3c', note: '防線守住了！夜鶯傳來消息：她已取得帝國首都的防禦圖。' }),
    onLose: () => ({ to: 'E4', note: '河谷防線崩潰，帝國大軍長驅直入……' }),
  },

  // ---------------- 第三章 A ----------------
  m3a: {
    chapter: '第三章', title: '海峽突破', place: '加隆海峽',
    map: [
      '....f..~~~~~~~~..ff.',
      '.o..ff.~~~~~~~~~.r..',
      '..==...~~~~~~~~~~=..',
      '.F.=..P~~~~~~~~~~Q..',
      '.=H=...~~~~~~~~~~=..',
      '..=.ff..~~~~~~~~..G.',
      '..==.....#####....=.',
      '.b..f...~~~~~~~~..=.',
      '...ff..~~~~~~~~~..r.',
      '..A...~~~~~~~~~~~...',
      '.....~~~~~~~~~~~~^^.',
      '..^^~~~~~~~~~~~~~^M.',
      '.^^M~~~~~~~~~~~~~~MM',
    ],
    funds: [1500, 700],
    units: [
      [0, 'destroyer', 7, 4], [0, 'destroyer', 7, 2], [0, 'tank', 4, 6], [0, 'tank', 5, 6], [0, 'inf', 3, 5],
      [0, 'arty', 6, 6], [0, 'inf', 7, 6], [0, 'aa', 3, 7], [0, 'attacker', 2, 9],
      [1, 'destroyer', 12, 4, { tag: 'fleet' }], [1, 'destroyer', 13, 8, { tag: 'fleet' }], [1, 'destroyer', 11, 1, { tag: 'fleet' }],
      [1, 'tank', 15, 6], [1, 'inf', 16, 6], [1, 'arty', 17, 5], [1, 'aa', 17, 4], [1, 'inf', 17, 1], [1, 'tank', 18, 7],
    ],
    briefing: () => [
      ['艾琳', '帝國艦隊集結在加隆海峽，威脅著我們的補給線。'],
      ['艾琳', '擊沉敵方主力艦隊（準星標記的驅逐艦），或越過長橋佔領對岸的帝國港口。'],
      ['艾琳', '攻擊機對艦艇特別有效，善加利用。'],
    ],
    win: [
      { id: 'fleet', type: 'destroyTag', tag: 'fleet', text: '擊沉帝國主力艦隊' },
      { id: 'port', type: 'capture', at: [17, 3], text: '佔領對岸帝國港口' },
    ],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    turnLimit: 16,
    next: () => ({ to: 'm4', flags: { navy: true }, note: '海峽已在我軍控制之下，艦隊將支援最終決戰。' }),
  },

  // ---------------- 第三章 B ----------------
  m3b: {
    chapter: '第三章', title: '制空作戰', place: '北境高原',
    map: [
      'MM^^...ff....^^MMMMM',
      'M^..o...f..^^..Z..MM',
      '^....==.....^...r..M',
      '.A.==..=.........=.^',
      '.=H.....=..ff...=...',
      '..=.ff...=fff..=..G.',
      '.b=.fff...=...==..r.',
      '..=...^^...===......',
      '...=.^MM^.......ff..',
      '..F.=^MM^..o....f.r.',
      '....=.^^...==.......',
      '~.....==.==..^^..^MM',
      '~~~.......^^^MMMMMMM',
    ],
    funds: [1500, 900],
    units: [
      [0, 'fighter', 1, 3], [0, 'fighter', 3, 3], [0, 'aa', 4, 4], [0, 'sam', 3, 5], [0, 'tank', 5, 4],
      [0, 'tank', 4, 6], [0, 'inf', 3, 6], [0, 'inf', 2, 7], [0, 'arty', 3, 8],
      [1, 'fighter', 15, 1, { tag: 'wing' }], [1, 'fighter', 14, 2, { tag: 'wing' }], [1, 'attacker', 16, 3, { tag: 'wing' }],
      [1, 'heli', 13, 4, { tag: 'wing' }], [1, 'tank', 15, 5], [1, 'aa', 16, 2], [1, 'inf', 18, 6], [1, 'arty', 17, 7],
      [1, 'tank', 12, 6],
    ],
    briefing: () => [
      ['艾琳', '帝國空軍精銳「黑鷲聯隊」駐紮在北境高原的空軍基地。'],
      ['艾琳', '摧毀黑鷲聯隊（準星標記的單位），或佔領他們的空軍基地。'],
      ['艾琳', '防空車與防空飛彈是對付飛機的利器。注意戰機燃料，記得回機場補給。'],
    ],
    win: [
      { id: 'wing', type: 'destroyTag', tag: 'wing', text: '殲滅黑鷲聯隊' },
      { id: 'base', type: 'capture', at: [15, 1], text: '佔領帝國空軍基地' },
    ],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    turnLimit: 16,
    next: () => ({ to: 'm4', flags: { air: true }, note: '黑鷲聯隊覆滅，天空屬於聯邦了。' }),
  },

  // ---------------- 第三章 C ----------------
  m3c: {
    chapter: '第三章', title: '夜鶯行動', place: '灰岩山脈',
    map: [
      'MMMMM^^...ff.^^MM...',
      'MMM^^..f..fff.^MM.o.',
      'MM^...fff...M^^..=..',
      'M^..f..^^..MMM..=..M',
      '^..ff.^MM^...^.=..MM',
      '..fff.^MM^..f.=.^MMM',
      '..f....^^...ff=.^MMM',
      '.......=====.=..^^MM',
      '.ff..==..f..=..G..MM',
      '.fff=...fff.=..r..^M',
      '..=...^^..f.=......M',
      '.=..^^MM^.......^^MM',
      'b=..^MMMMM^^..^^MMMM',
    ],
    funds: [0, 500],
    units: [
      [0, 'inf', 1, 11, { vip: true }], [0, 'inf', 2, 10], [0, 'tank', 3, 11], [0, 'recon', 0, 10], [0, 'aa', 2, 12],
      [1, 'inf', 7, 7], [1, 'tank', 9, 8], [1, 'tank', 13, 4], [1, 'inf', 12, 2], [1, 'recon', 14, 6],
      [1, 'arty', 15, 9], [1, 'atinf', 16, 3], [1, 'aa', 17, 2], [1, 'heli', 15, 8],
    ],
    extra: f => f.bridge ? [[0, 'tank', 1, 12], [0, 'arty', 0, 11], [0, 'heli', 2, 9]] : [],
    briefing: f => [
      ['夜鶯', '司令官……我被困在灰岩山脈南端，帝國追兵就在身後。'],
      ['艾琳', '夜鶯掌握著帝國首都的防禦配置。護送她（金星標記的步兵）抵達東北方的接應城市。'],
      ...(f.bridge ? [['艾琳', '多虧守住了河畔城市，我們能多派一支部隊接應。']] : []),
      ['艾琳', '這次沒有工廠可以補充兵力。就算任務失敗，戰爭也會繼續——只是會艱難得多。'],
    ],
    win: [{ id: 'intel', type: 'reach', at: [18, 1], text: '護送夜鶯抵達接應城市' }],
    lose: [{ type: 'vip', text: '夜鶯陣亡' }],
    turnLimit: 14,
    hint: '失敗也能繼續，但終章會更艱難',
    next: () => ({ to: 'm4', flags: { intel: true }, note: '夜鶯平安脫出，帶回了帝國首都的防禦圖！' }),
    onLose: () => ({ to: 'm4', flags: { intel: false }, note: '夜鶯的訊號中斷了……我們只能在沒有情報的情況下進攻。' }),
  },

  // ---------------- 終章 ----------------
  m4: {
    chapter: '終章', title: '首都決戰', place: '瓦爾德堡',
    map: [
      '~~~...ff...^^MM..r..~~',
      '~~..o..f..^MM...=.==~~',
      '~..=.....^^M..==.G.X.~',
      '~.F.==.......=..=....~',
      '~.=H..=..ff.=....Z.r.~',
      '~.b.=..=.fff=.^^....~~',
      '~~.=....==.=..^M..=.~~',
      '~P.=..ff..==...^..G.~~',
      '~~..=.fff....o..==..~~',
      '~~.A.=.....^^..=..r.Q~',
      '~~~...==..^MM.=......~',
      '~~~.o...==.^^=..ff..~~',
      '~~~~.....==..=.fff~~~~',
      '~~~~~~.......~~~~~~~~~',
    ],
    funds: f => [2000 + (f.intel ? 1500 : 0), 2000],
    units: [
      [0, 'inf', 4, 5], [0, 'inf', 5, 3], [0, 'inf', 3, 6], [0, 'tank', 5, 4], [0, 'tank', 6, 6],
      [0, 'arty', 4, 3], [0, 'rocket', 2, 5], [0, 'aa', 5, 7], [0, 'recon', 6, 8],
      [1, 'tank', 16, 3], [1, 'tank', 14, 6, { tag: 'garrison' }], [1, 'tank', 16, 8], [1, 'inf', 18, 2],
      [1, 'inf', 17, 5, { tag: 'garrison' }], [1, 'arty', 18, 4], [1, 'rocket', 19, 3, { tag: 'garrison' }],
      [1, 'aa', 17, 6], [1, 'sam', 20, 4], [1, 'fighter', 17, 4, { tag: 'wing' }], [1, 'heli', 15, 7, { tag: 'wing' }],
      [1, 'destroyer', 21, 10, { tag: 'fleet' }], [1, 'destroyer', 20, 12, { tag: 'fleet' }],
      [1, 'tank', 13, 9], [1, 'atinf', 12, 4],
    ],
    remove: f => [f.navy && 'fleet', f.air && 'wing', f.intel && 'garrison'].filter(Boolean),
    extra: f => [
      ...(f.navy ? [[0, 'destroyer', 0, 6], [0, 'destroyer', 0, 8]] : []),
      ...(f.air ? [[0, 'fighter', 3, 9], [0, 'attacker', 4, 9]] : []),
      ...(f.intel === false ? [[1, 'tank', 15, 2], [1, 'rocket', 18, 5], [1, 'tank', 16, 6]] : []),
    ],
    briefing: f => [
      ['艾琳', '決戰的時刻到了。瓦爾德堡——帝國首都就在眼前。'],
      ...(f.navy ? [['艾琳', '我軍艦隊已控制海峽，兩艘驅逐艦前來支援，帝國艦隊不復存在。']] : []),
      ...(f.air ? [['艾琳', '制空權在我們手中，戰機中隊隨時待命，帝國空軍已無力升空。']] : []),
      ...(f.intel === true ? [['夜鶯', '東側防線的部隊已經被調走了——我把缺口標出來了。統帥部也撥了額外經費。']] : []),
      ...(f.intel === false ? [['艾琳', '沒有夜鶯的情報，帝國的防禦比預期更堅固。我們只能硬碰硬。']] : []),
      ['格雷文', '帝國的榮耀不會在此終結！全軍死守瓦爾德堡！'],
      ['艾琳', '佔領帝國首都，結束這場戰爭吧。越快越好，每多一天，就多一分犧牲。'],
    ],
    win: [{ id: 'capital', type: 'capture', at: [19, 2], text: '佔領帝國首都瓦爾德堡' }],
    lose: [{ type: 'hq', text: '我軍首都失守' }],
    turnLimit: 24,
    hint: '15 回合內獲勝才能迎來最好的結局',
    events: [
      { turn: 8, lines: [['格雷文', '近衛軍，出擊！']], spawn: [[1, 'tank', 19, 1], [1, 'atinf', 20, 3]] },
    ],
    next: r => r.turn <= 15
      ? { to: 'E1', note: '瓦爾德堡的帝國旗幟緩緩降下。' }
      : { to: 'E2', note: '在漫長的巷戰之後，首都終於陷落。' },
    onLose: r => r.obj === 'time'
      ? { to: 'E3', note: '攻勢在城下陷入僵局。' }
      : { to: 'E4', note: '聯邦的最後一支機動部隊瓦解了。' },
  },
};

const ENDINGS = {
  E1: { title: '黎明的凱歌', rank: '完全勝利', color: '#e0b54a',
    text: '帝國首都陷落，格雷文上將在晨光中遞交了降書。聯邦以最小的代價結束了戰爭，第 3 機動旅的名字被寫進了教科書。艾琳站在你身旁，第一次露出了笑容。' },
  E2: { title: '灰燼中的和平', rank: '慘勝', color: '#c9a36a',
    text: '首都終於攻下，但漫長的戰鬥讓兩國都滿目瘡痍。勝利的鐘聲響起，卻沒有人歡呼。重建的路，比戰爭更長。' },
  E3: { title: '冰封的前線', rank: '停戰', color: '#7fa4c4',
    text: '攻勢在瓦爾德堡城下陷入僵局。在國際調停下，雙方簽署了停戰協定。戰爭結束了——至少暫時如此。前線的士兵們望著彼此的戰壕，等待著不知何時到來的和平。' },
  E4: { title: '流亡政府', rank: '敗北', color: '#a05050',
    text: '聯邦防線崩潰，政府撤往海外。但在某處的山林與街巷之中，抵抗的火種仍在燃燒……故事，還沒有結束。' },
};
const MISSION_TREE = [
  ['第一章', ['m1']], ['第二章', ['m2a', 'm2b']], ['第三章', ['m3a', 'm3b', 'm3c']], ['終章', ['m4']], ['結局', ['E1', 'E2', 'E3', 'E4']],
];

// 劇情登錄表（其他劇情檔案會再加入）
const CAMPAIGNS = {
  fed: {
    title: '聯邦戰記', sub: '亞斯特聯邦篇', player: 0, start: 'm1', key: 'daisenryaku_campaign_v1', tree: MISSION_TREE,
    desc: '帝國大軍越境入侵。指揮聯邦第 3 機動旅，從邊境一路反攻到瓦爾德堡。',
  },
};
const campOf = M => M.camp || 'fed';
const winOf = (M, flags) => typeof M.win === 'function' ? M.win(flags || {}) : M.win;

// ----- 戰役進度（localStorage，每套劇情分開） -----
let CAMP = null, CAMP_ID = 'fed';
function loadCamp(cid = CAMP_ID) {
  CAMP_ID = cid;
  try { CAMP = JSON.parse(localStorage.getItem(CAMPAIGNS[cid].key)); } catch (e) { CAMP = null; }
  if (!CAMP) CAMP = { current: null, flags: {}, visited: [], endings: [] };
  return CAMP;
}
function saveCamp() { try { localStorage.setItem(CAMPAIGNS[CAMP_ID].key, JSON.stringify(CAMP)); } catch (e) { /* 忽略 */ } }

// ----- 地圖解析 -----
function parseMission(M, flags, player = 0) {
  const rows = M.map, h = rows.length, w = rows[0].length, N = w * h;
  const terrain = new Array(N), owner = new Array(N).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [t, o] = LEGEND[rows[y][x]];
    terrain[y * w + x] = t;
    if (o !== undefined) owner[y * w + x] = o;
  }
  // 道路：相鄰的道路/橋/據點自動相連（據點之間不連）
  const roads = [], isRoad = t => t === 'road' || t === 'bridge';
  for (let i = 0; i < N; i++) {
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of neighbors(x, y, w, h)) {
      const j = ny * w + nx;
      if (j <= i) continue;
      const a = terrain[i], b = terrain[j];
      if ((isRoad(a) && (isRoad(b) || TERRAIN[b].prop)) || (isRoad(b) && TERRAIN[a].prop)) roads.push([i, j]);
    }
  }
  const removed = M.remove ? M.remove(flags) : [];
  const list = [...M.units, ...(M.extra ? M.extra(flags) : [])].filter(u => !(u[4] && removed.includes(u[4].tag)));
  const taken = new Set(), start = [];
  for (const [side, type, x, y, extra] of list) {
    const i = placeFree(terrain, w, h, x, y, UNITS[ftype(type, side)].mt, taken);
    if (i < 0) continue;
    taken.add(i);
    start.push([type, i, side, extra]);
  }
  const caps = [0, 1].map(s => {
    const c = terrain.findIndex((t, i) => t === 'capital' && owner[i] === s);
    if (c >= 0) return c;
    const u = start.find(e => e[2] === s);
    return u ? u[1] : 0;
  });
  const hq = terrain.map((t, i) => t === 'capital' && owner[i] === player ? i : -1).filter(i => i >= 0);
  return { w, h, terrain, owner, roads, start, caps, hq };
}
// 找最近一格可站立的空地
function placeFree(terrain, w, h, x, y, mt, taken) {
  const ok = i => moveCost(terrain[i], mt) !== Infinity && !taken.has(i);
  const s = y * w + x;
  if (ok(s)) return s;
  const seen = new Set([s]), q = [s];
  while (q.length) {
    const c = q.shift();
    for (const [nx, ny] of neighbors(c % w, (c / w) | 0, w, h)) {
      const n = ny * w + nx;
      if (seen.has(n)) continue;
      seen.add(n);
      if (ok(n)) return n;
      q.push(n);
    }
  }
  return -1;
}

// ----- 勝敗判定 -----
function setResult(win, obj, reason) {
  if (G.winner != null) return;
  const P = G.pside || 0;
  G.winner = win ? P : 1 - P;
  G.result = { win, obj, reason, turn: G.turn };
  G.winReason = reason;
  addLog(win ? `作戰成功：${reason}` : `作戰失敗：${reason}`, G.winner);
}
function evalMission() {
  const M = MISSIONS[G.missionId], P = G.pside || 0;
  if (!G.units.some(u => u.side === P)) return setResult(false, 'annihilated', '我軍全軍覆沒');
  for (const c of M.lose || []) {
    if (c.type === 'hq' && G.hq.some(i => G.owner[i] !== P)) return setResult(false, 'hq', c.text);
    if (c.type === 'vip' && !G.units.some(u => u.vip && u.side === P)) return setResult(false, 'vip', c.text);
    if (c.type === 'loseCount' && c.tiles.filter(([x, y]) => G.owner[idxOf(x, y)] !== P).length >= c.max) return setResult(false, 'line', c.text);
  }
  for (const o of winOf(M, G.campFlags)) {
    if (o.type === 'destroyAll' && !G.units.some(u => u.side !== P)) return setResult(true, o.id, o.text);
    if (o.type === 'capture' && G.owner[idxOf(o.at[0], o.at[1])] === P) return setResult(true, o.id, o.text);
    if (o.type === 'captureAll' && o.tiles.every(([x, y]) => G.owner[idxOf(x, y)] === P)) return setResult(true, o.id, o.text);
    if (o.type === 'reach' && G.units.some(u => u.vip && u.side === P && u.x === o.at[0] && u.y === o.at[1])) return setResult(true, o.id, o.text);
    if (o.type === 'destroyTag' && !G.units.some(u => u.tag === o.tag)) return setResult(true, o.id, o.text);
  }
}
// AI 用：任務目標轉成移動目標 [idx, 偏移]（越小越優先）
function missionAIGoals(u) {
  if (!G || !G.missionId) return [];
  const M = MISSIONS[G.missionId], P = G.pside || 0, d = UNITS[u.type], out = [];
  for (const o of winOf(M, G.campFlags)) {
    const tiles = o.type === 'capture' ? [o.at] : o.type === 'captureAll' ? o.tiles : [];
    for (const [x, y] of tiles) {
      const i = idxOf(x, y);
      if (u.side === P && G.owner[i] !== P) out.push([i, d.capture ? -8 : -1 - 4 * (aiAggression(P) - 1)]);
      if (u.side !== P && G.owner[i] !== P && !d.capture) out.push([i, 2]);
    }
    if (o.type === 'destroyTag' && u.side === P) {
      for (const e of G.units) if (e.tag === o.tag && canHit(u.type, e)) out.push([idxOf(e.x, e.y), -4]);
    }
    if (o.type === 'reach' && u.side === P && u.vip) out.push([idxOf(o.at[0], o.at[1]), -12]);
  }
  for (const c of M.lose || []) {
    if (c.type !== 'loseCount') continue;
    for (const [x, y] of c.tiles) {
      const i = idxOf(x, y);
      if (u.side !== P && G.owner[i] === P) out.push([i, d.capture ? -8 : -1]);
      if (u.side === P && !d.capture) out.push([i, G.owner[i] === P ? 1 : -3]);
    }
  }
  return out;
}
// 守方站在護送目標格上的加分（擋住特使）
function missionHoldBonus(u, i) {
  if (!G || !G.missionId || u.side === (G.pside || 0)) return 0;
  const [x, y] = ixy(i);
  let b = 0;
  for (const o of winOf(MISSIONS[G.missionId], G.campFlags)) {
    if (o.type === 'reach' && o.at[0] === x && o.at[1] === y) b += 600;
  }
  return b;
}
// 作戰急迫度：任務中負責進攻的一方隨時限逼近而更積極（1 = 一般）
function aiAggression(side) {
  if (!G || !G.missionId) return 1;
  const M = MISSIONS[G.missionId], P = G.pside || 0, wins = winOf(M, G.campFlags);
  const surv = wins.find(o => o.type === 'survive');
  if (side === P && !surv && M.turnLimit) return 1.2 + 1.3 * Math.min(1, G.turn / M.turnLimit);
  if (side !== P && surv) return 1.2 + 1.3 * Math.min(1, G.turn / surv.turn);
  return 1;
}
function missionCaptureBonus(u, i) {
  if (!G || !G.missionId) return 0;
  const [x, y] = ixy(i), M = MISSIONS[G.missionId];
  if (u.side !== (G.pside || 0)) {
    return (M.lose || []).some(c => c.type === 'loseCount' && c.tiles.some(t => t[0] === x && t[1] === y)) ? 2500 : 0;
  }
  return winOf(MISSIONS[G.missionId], G.campFlags).some(o =>
    (o.type === 'capture' && o.at[0] === x && o.at[1] === y) ||
    (o.type === 'captureAll' && o.tiles.some(t => t[0] === x && t[1] === y))) ? 2500 : 0;
}
// 每回合開始時：存活目標、時間限制、劇情事件
function missionTurnStart() {
  const M = MISSIONS[G.missionId];
  if (G.cur !== (G.pside || 0)) return;
  for (const o of winOf(M, G.campFlags)) {
    if (o.type === 'survive' && G.turn > o.turn) return setResult(true, o.id, o.text);
  }
  if (M.turnLimit && G.turn > M.turnLimit) return setResult(false, 'time', `超過 ${M.turnLimit} 回合時限`);
  for (const [k, ev] of (M.events || []).entries()) {
    if (ev.turn !== G.turn || G.firedEvents.includes(k)) continue;
    G.firedEvents.push(k);
    const taken = new Set(G.units.map(u => idxOf(u.x, u.y)));
    for (const [side, type, x, y, extra] of ev.spawn || []) {
      const i = placeFree(G.terrain, G.w, G.h, x, y, UNITS[ftype(type, side)].mt, taken);
      if (i < 0) continue;
      taken.add(i);
      const [px, py] = ixy(i);
      G.units.push(makeUnit(type, side, px, py, extra));
      addLog(`${SIDES[side].name}${UNITS[ftype(type, side)].name}抵達戰場`, side);
    }
    if (ev.lines) G.pendingDialogs.push(ev.lines);
  }
}
function bonusMet(b) {
  if (b.type === 'hold') return G.owner[idxOf(b.at[0], b.at[1])] === (G.pside || 0);
  return false;
}
function missionTargets() {
  if (!G || !G.missionId) return null;
  const M = MISSIONS[G.missionId], tiles = [], tags = [];
  for (const o of [...winOf(M, G.campFlags), ...(M.bonus || [])]) {
    if (o.at) tiles.push({ i: idxOf(o.at[0], o.at[1]), bonus: !!o.flag });
    if (o.tiles) for (const [x, y] of o.tiles) tiles.push({ i: idxOf(x, y), bonus: false });
    if (o.tag) tags.push(o.tag);
  }
  for (const c of M.lose || []) if (c.tiles) for (const [x, y] of c.tiles) tiles.push({ i: idxOf(x, y), bonus: false });
  return { tiles, tags };
}
function objectivesHTML() {
  const M = MISSIONS[G.missionId];
  const left = M.turnLimit ? `<span class="${M.turnLimit - G.turn <= 2 ? 'warn' : ''}">第 ${G.turn} / ${M.turnLimit} 回合</span>` : `<span>第 ${G.turn} 回合</span>`;
  const tagLeft = t => G.units.filter(u => u.tag === t).length;
  const win = winOf(M, G.campFlags).map(o => `<li>🎯 ${o.text}${o.type === 'destroyTag' ? `（剩 ${tagLeft(o.tag)}）` : ''}${o.type === 'survive' ? `（剩 ${Math.max(0, o.turn - G.turn + 1)} 回合）` : ''}</li>`).join('');
  const bonus = (M.bonus || []).map(b => `<li class="bonus">${bonusMet(b) ? '✅' : '⭐'} ${b.text}</li>`).join('');
  const lose = (M.lose || []).map(c => `<li class="lose">✖ ${c.text}</li>`).join('');
  return `<h3>${M.chapter}・${M.title}</h3><div class="stats small">${left}<span>${M.place}</span></div>
    <ul class="obj">${win}${bonus}${lose}<li class="lose">✖ 我軍全軍覆沒</li></ul>${M.hint ? `<div class="desc">💡 ${M.hint}</div>` : ''}`;
}

// ----- 流程 -----
function startMission(id) {
  const M = MISSIONS[id];
  if (CAMP_ID !== campOf(M) || !CAMP) loadCamp(campOf(M));
  CAMP.current = id;
  if (!CAMP.visited.includes(id)) CAMP.visited.push(id);
  saveCamp();
  playDialog(M.briefing(CAMP.flags), `${M.chapter}・${M.title}`).then(() => {
    openModal(`<div class="mtitle"><div class="chap">${M.chapter}</div><h2>${M.title}</h2><div class="sub">📍 ${M.place}</div></div>
      <ul class="obj big">${winOf(M, CAMP.flags).map(o => `<li>🎯 ${o.text}</li>`).join('')}
      ${(M.bonus || []).map(b => `<li class="bonus">⭐ ${b.text}</li>`).join('')}
      ${(M.lose || []).map(c => `<li class="lose">✖ ${c.text}</li>`).join('')}
      ${M.turnLimit ? `<li class="lose">⏱ 時限 ${M.turnLimit} 回合</li>` : ''}</ul>
      ${M.hint ? `<div class="desc">💡 ${M.hint}</div>` : ''}
      <div class="row"><button class="close">返回</button><button class="primary" id="goMission">開始作戰</button></div>`, box => {
      box.querySelector('.close').onclick = () => openCampaignMenu(CAMP_ID);
      box.querySelector('#goMission').onclick = () => { closeModal(); launchMission(id); };
    });
  });
}
// 建立任務遊戲狀態（不含畫面）；aiBoth 用於自動平衡測試
function setupMission(id, flags, aiBoth = false) {
  const M = MISSIONS[id], P = CAMPAIGNS[campOf(M)].player;
  const m = parseMission(M, flags, P);
  const funds = typeof M.funds === 'function' ? M.funds(flags) : [...M.funds];
  initState(m, { players: [0, 1].map(s => ({ ai: aiBoth || s !== P })), funds, missionId: id, seed: 0 });
  G.hq = m.hq;
  G.pside = P;
  G.campFlags = Object.assign({}, flags);
  addLog(`${M.chapter}「${M.title}」作戰開始`);
  startTurn();
}
function launchMission(id) {
  clearSel(); setInspect(null); FX.length = 0;
  setupMission(id, CAMP.flags);
  buildTerrain(); resize(); fitView();
  const [cx, cy] = idxCenter(G.caps[G.pside]); centerOn(cx, cy);
  turnIntro();
}

function showDebrief() {
  if (G.debriefShown) return;
  G.debriefShown = true;
  const M = MISSIONS[G.missionId], r = G.result, f = CAMP.flags;
  const gained = {};
  const bonusLines = [];
  if (r.win) for (const b of M.bonus || []) {
    const ok = bonusMet(b);
    if (ok) gained[b.flag] = true;
    bonusLines.push(`${ok ? '✅' : '❌'} ${b.text}`);
  }
  const br = r.win ? M.next(r, f) : M.onLose ? M.onLose(r, f) : null;
  if (br) br.flags = Object.assign({}, br.flags, gained);
  const dest = br ? (br.to[0] === 'E' ? `結局「${ENDINGS[br.to].title}」` : `${MISSIONS[br.to].chapter}「${MISSIONS[br.to].title}」`) : '';
  openModal(`<div class="debrief ${r.win ? 'win' : 'lose'}">
      <div class="big">${r.win ? '作戰成功' : '作戰失敗'}</div>
      <p>${r.reason}　·　第 ${r.turn} 回合</p>
      ${bonusLines.length ? `<div class="bonuslist">${bonusLines.join('<br>')}</div>` : ''}
      ${br ? `<div class="branch">${br.note}<br><b>→ ${dest}</b></div>` : '<div class="branch">這場戰役不能輸。重整部隊，再試一次吧。</div>'}
    </div>
    <div class="row">${!r.win ? '<button id="dRetry">重新挑戰</button>' : ''}
      <button id="dView">檢視戰場</button>
      ${br ? `<button class="primary" id="dNext">${r.win ? '繼續' : '接受結果'}</button>` : ''}</div>`, box => {
    box.querySelector('#dView').onclick = () => { closeModal(); G.debriefShown = false; };
    const retry = box.querySelector('#dRetry');
    if (retry) retry.onclick = () => { closeModal(); startMission(G.missionId); };
    const nx = box.querySelector('#dNext');
    if (nx) nx.onclick = () => applyBranch(br);
  });
}
function applyBranch(br) {
  Object.assign(CAMP.flags, br.flags || {});
  if (br.to[0] === 'E') {
    if (!CAMP.endings.includes(br.to)) CAMP.endings.push(br.to);
    if (!CAMP.visited.includes(br.to)) CAMP.visited.push(br.to);
    CAMP.current = null;
    saveCamp();
    return showEnding(br.to);
  }
  CAMP.current = br.to;
  saveCamp();
  startMission(br.to);
}
function showEnding(id) {
  const E = ENDINGS[id];
  openModal(`<div class="ending" style="--c:${E.color}"><div class="rank">${E.rank}</div><div class="big">${E.title}</div>
    <p>${E.text}</p><div class="desc">已收集結局 ${CAMP.endings.length} / ${CAMPAIGNS[CAMP_ID].tree.at(-1)[1].length}</div></div>
    <div class="row"><button class="primary" id="eMenu">回到戰役選單</button></div>`, box => {
    box.querySelector('#eMenu').onclick = () => openCampaignMenu(CAMP_ID);
  });
}

// 劇情選擇
function openCampaignMenu(cid) {
  if (!cid) {
    const ids = Object.keys(CAMPAIGNS);
    openModal(`<h2>劇情模式</h2><div class="sub">兩套劇情，各有不同的主角陣營、分支與結局。</div>
      <div class="campcards">${ids.map(id => {
        const C = CAMPAIGNS[id], st = (loadCamp(id), CAMP), total = C.tree.at(-1)[1].length;
        return `<button class="campcard" data-id="${id}" style="--c:${SIDES[C.player].color}">
          <div class="ctitle">${C.title}<small>${C.sub}</small></div><p>${C.desc}</p>
          <div class="cprog">結局 ${st.endings.length} / ${total}${st.current ? `　·　進行中：${MISSIONS[st.current].title}` : ''}</div></button>`;
      }).join('')}</div>
      <div class="row"><button class="close">關閉</button></div>`, box => {
      box.querySelector('.close').onclick = closeModal;
      box.querySelectorAll('.campcard').forEach(b => b.onclick = () => openCampaignMenu(b.dataset.id));
    }, true);
    return;
  }
  const C = CAMPAIGNS[cid];
  loadCamp(cid);
  const node = id => {
    const isEnd = id[0] === 'E';
    const name = isEnd ? ENDINGS[id].title : MISSIONS[id].title;
    const seen = isEnd ? CAMP.endings.includes(id) : CAMP.visited.includes(id);
    const cur = CAMP.current === id;
    return `<div class="node ${seen ? 'seen' : ''} ${cur ? 'cur' : ''} ${isEnd ? 'end' : ''}">${seen ? name : '？？？'}${cur ? ' ▶' : ''}</div>`;
  };
  openModal(`<h2>${C.title}・${C.sub}</h2>
    <div class="sub">你的選擇與戰果將改變戰爭的走向。共 ${C.tree.at(-1)[1].length} 種結局。</div>
    <div class="tree">${C.tree.map(([ch, ids]) => `<div class="tier"><span class="tlabel">${ch}</span><div class="tnodes">${ids.map(node).join('')}</div></div>`).join('')}</div>
    <div class="row"><button class="close">返回</button>
      ${CAMP.visited.length ? '<button id="cReset">從頭開始</button>' : ''}
      <button class="primary" id="cGo">${CAMP.current ? `繼續：${MISSIONS[CAMP.current].title}` : '開始戰役'}</button></div>`, box => {
    box.querySelector('.close').onclick = () => openCampaignMenu();
    const reset = box.querySelector('#cReset');
    if (reset) reset.onclick = () => {
      CAMP.current = C.start; CAMP.flags = {}; saveCamp();
      startMission(C.start);
    };
    box.querySelector('#cGo').onclick = () => {
      if (!CAMP.current) { CAMP.current = C.start; CAMP.flags = {}; }
      startMission(CAMP.current);
    };
  });
}

// 對話播放：逐句點擊
function playDialog(lines, heading) {
  return new Promise(resolve => {
    if (!lines || !lines.length) return resolve();
    let k = 0;
    const render = () => {
      const [who, text] = lines[k], S = SPEAKERS[who] || SPEAKERS['旁白'];
      openModal(`${heading ? `<div class="dhead">${heading}</div>` : ''}
        <div class="dialog"><div class="portrait" style="--c:${S.color}">${S.icon}</div>
        <div class="dbody"><div class="dname">${who}${S.title ? `<small>${S.title}</small>` : ''}</div><div class="dtext">${text}</div></div></div>
        <div class="row"><button id="dlSkip" class="muted">略過</button><button class="primary" id="dlNext">${k < lines.length - 1 ? '下一句 ▸' : '確定'}</button></div>`, box => {
        box.querySelector('#dlNext').onclick = () => { k++; if (k >= lines.length) { closeModal(); resolve(); } else render(); };
        box.querySelector('#dlSkip').onclick = () => { closeModal(); resolve(); };
      });
    };
    render();
  });
}
