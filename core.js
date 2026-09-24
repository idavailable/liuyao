/* ============================================================
 * 六爻排盘核心引擎 (core.js)
 * 纯逻辑，无 DOM 依赖。可在浏览器与 Node 中运行。
 * 范围：干支历、纳甲装卦、六亲、世应、六神、旬空、伏神、基础断语
 * ============================================================ */

// ---------- 基础常量 ----------
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZHI_WX = ['水','土','木','木','土','火','火','土','金','金','土','水'];
const GAN_WX = ['木','木','火','火','土','土','金','金','水','水'];
const SHENG = {木:'火', 火:'土', 土:'金', 金:'水', 水:'木'}; // x 生 SHENG[x]
const KE    = {木:'土', 土:'水', 水:'火', 火:'金', 金:'木'}; // x 克 KE[x]
const LINE_NAMES = ['初爻','二爻','三爻','四爻','五爻','上爻'];
const BEASTS = ['青龙','朱雀','勾陈','腾蛇','白虎','玄武'];

// 八卦：bits 自下而上 [初,中,上]，1=阳
const TRIG = {
  '乾': {bits:[1,1,1], wx:'金', najia:['子','寅','辰','午','申','戌'], gan:['甲','甲','甲','壬','壬','壬']},
  '坎': {bits:[0,1,0], wx:'水', najia:['寅','辰','午','申','戌','子'], gan:['戊','戊','戊','戊','戊','戊']},
  '艮': {bits:[0,0,1], wx:'土', najia:['辰','午','申','戌','子','寅'], gan:['丙','丙','丙','丙','丙','丙']},
  '震': {bits:[1,0,0], wx:'木', najia:['子','寅','辰','午','申','戌'], gan:['庚','庚','庚','庚','庚','庚']},
  '巽': {bits:[0,1,1], wx:'木', najia:['丑','亥','酉','未','巳','卯'], gan:['辛','辛','辛','辛','辛','辛']},
  '离': {bits:[1,0,1], wx:'火', najia:['卯','丑','亥','酉','未','巳'], gan:['己','己','己','己','己','己']},
  '坤': {bits:[0,0,0], wx:'土', najia:['未','巳','卯','丑','亥','酉'], gan:['乙','乙','乙','癸','癸','癸']},
  '兑': {bits:[1,1,0], wx:'金', najia:['巳','卯','丑','亥','酉','未'], gan:['丁','丁','丁','丁','丁','丁']}
};

// 64 卦名：key = 下卦名 + 上卦名
const HEXNAMES = {
  '乾乾':'乾为天','坤乾':'天地否','震乾':'天雷无妄','巽乾':'天风姤','坎乾':'天水讼','离乾':'天火同人','艮乾':'天山遁','兑乾':'天泽履',
  '乾坤':'地天泰','坤坤':'坤为地','震坤':'地雷复','巽坤':'地风升','坎坤':'地水师','离坤':'地火明夷','艮坤':'地山谦','兑坤':'地泽临',
  '乾震':'雷天大壮','坤震':'雷地豫','震震':'震为雷','巽震':'雷风恒','坎震':'雷水解','离震':'雷火丰','艮震':'雷山小过','兑震':'雷泽归妹',
  '乾巽':'风天小畜','坤巽':'风地观','震巽':'风雷益','巽巽':'巽为风','坎巽':'风水涣','离巽':'风火家人','艮巽':'风山渐','兑巽':'风泽中孚',
  '乾坎':'水天需','坤坎':'水地比','震坎':'水雷屯','巽坎':'水风井','坎坎':'坎为水','离坎':'水火既济','艮坎':'水山蹇','兑坎':'水泽节',
  '乾离':'火天大有','坤离':'火地晋','震离':'火雷噬嗑','巽离':'火风鼎','坎离':'火水未济','离离':'离为火','艮离':'火山旅','兑离':'火泽睽',
  '乾艮':'山天大畜','坤艮':'山地剥','震艮':'山雷颐','巽艮':'山风蛊','坎艮':'山水蒙','离艮':'火山贲','艮艮':'艮为山','兑艮':'山泽损',
  '乾兑':'泽天夬','坤兑':'泽地萃','震兑':'泽雷随','巽兑':'泽风大过','坎兑':'泽水困','离兑':'泽火革','艮兑':'泽山咸','兑兑':'兑为泽'
};

function trigOfBits(bits3) {
  for (const name of Object.keys(TRIG)) {
    if (TRIG[name].bits.join('') === bits3.join('')) return name;
  }
  return null;
}

function hexName(bits6) {
  return HEXNAMES[trigOfBits(bits6.slice(0,3)) + trigOfBits(bits6.slice(3))];
}

// ---------- 五行关系 ----------
function sheng(a, b) { return SHENG[a] === b; } // a 生 b
function ke(a, b)    { return KE[a] === b; }    // a 克 b

// 六亲：palaceWx 卦宫五行，lineWx 爻支五行
function liuqin(palaceWx, lineWx) {
  if (palaceWx === lineWx) return '兄弟';
  if (sheng(palaceWx, lineWx)) return '子孙'; // 我生
  if (sheng(lineWx, palaceWx)) return '父母'; // 生我
  if (ke(palaceWx, lineWx))    return '妻财'; // 我克
  if (ke(lineWx, palaceWx))    return '官鬼'; // 克我
  return '';
}

// ---------- 八宫卦（京房）算法生成 ----------
// 变爻次序：本宫(世5) → 一世(世0) → 二世(1) → 三世(2) → 四世(3) → 五世(4) → 游魂(世3) → 归魂(世2)
const PALACE = (function () {
  const map = {};
  const palaces = ['乾','坎','艮','震','巽','离','坤','兑'];
  const shiPos  = [5, 0, 1, 2, 3, 4, 3, 2];
  const variants = [[], [0], [0,1], [0,1,2], [0,1,2,3], [0,1,2,3,4], [0,1,2,4], [4]];
  palaces.forEach(function (p) {
    const pure = TRIG[p].bits.concat(TRIG[p].bits);
    variants.forEach(function (fl, i) {
      const bits = pure.slice();
      fl.forEach(function (k) { bits[k] ^= 1; });
      const key = bits.join('');
      map[key] = { palace: p, variant: i, shi: shiPos[i], ying: (shiPos[i] + 3) % 6 };
    });
  });
  return map;
})();

// ---------- 历法 ----------
// 儒略日数（格里历，取当地民用日期即可）
function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

// 日柱：以 1949-10-01 甲子日校准 → index = (JDN + 49) % 60
function dayGanZhiIndex(y, m, d) {
  return ((jdn(y, m, d) + 49) % 60 + 60) % 60;
}

// 二十四节气中十二节的大约日期（通用公式，21 世纪，临界日可能有 ±1 日误差）
function termDay(year, month) {
  const C = {1:5.4055, 2:3.87, 3:5.63, 4:4.81, 5:5.52, 6:5.678, 7:7.108, 8:7.5, 9:7.646, 10:8.318, 11:7.438, 12:7.18};
  const Y = year % 100;
  return Math.floor(Y * 0.2422 + C[month]) - Math.floor(Y / 4);
}

// 月支：过节后取本月支（1→丑 2→寅 ... 12→子），未过节取前一月支
function monthZhiIndex(y, m, d) {
  const after = d >= termDay(y, m);
  return after ? (m % 12) : ((m - 1) % 12);
}

// 年柱：以立春为界
function yearGanZhiIndex(y, m, d) {
  let yy = y;
  if (m < 2) yy--;
  else if (m === 2 && d < termDay(y, 2)) yy--;
  return ((yy - 4) % 60 + 60) % 60;
}

// 五虎遁：年干 → 寅月天干
const WUHU = {甲:2, 己:2, 乙:4, 庚:4, 丙:6, 辛:6, 丁:8, 壬:8, 戊:0, 癸:0};
// 五鼠遁：日干 → 子时天干
const WUSHU = {甲:0, 己:0, 乙:2, 庚:2, 丙:4, 辛:4, 丁:6, 壬:6, 戊:8, 癸:8};

function ganzhiOfIndex(idx) {
  return GAN[idx % 10] + ZHI[idx % 12];
}

// 完整四柱（月干依五虎遁，时干依五鼠遁）
function fourPillars(dt) {
  const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
  const h = dt.getHours();
  const yIdx = yearGanZhiIndex(y, m, d);
  const mz = monthZhiIndex(y, m, d);
  const monthsFromYin = (mz - 2 + 12) % 12;
  const mGan = (WUHU[GAN[yIdx % 10]] + monthsFromYin) % 10;
  const dIdx = dayGanZhiIndex(y, m, d);
  const hZhi = Math.floor((h + 1) / 2) % 12;
  const hGan = (WUSHU[GAN[dIdx % 10]] + hZhi) % 10;
  // 旬空
  const xunStart = dIdx - (dIdx % 10);
  const startBranch = xunStart % 12;
  const kong = [(startBranch + 10) % 12, (startBranch + 11) % 12];
  return {
    yearIdx: yIdx,  yearGZ:  ganzhiOfIndex(yIdx),
    monthGZ: GAN[mGan] + ZHI[mz], monthZhi: mz,
    dayIdx: dIdx,   dayGZ:  ganzhiOfIndex(dIdx), dayGan: dIdx % 10, dayZhi: dIdx % 12,
    hourGZ: GAN[hGan] + ZHI[hZhi],
    kong: kong, kongStr: ZHI[kong[0]] + ZHI[kong[1]]
  };
}

// 六神起法：甲乙青龙，丙丁朱雀，戊勾陈，己腾蛇，庚辛白虎，壬癸玄武
function beastStart(dayGanIdx) {
  const g = dayGanIdx % 10;
  if (g === 0 || g === 1) return 0;
  if (g === 2 || g === 3) return 1;
  if (g === 4) return 2;
  if (g === 5) return 3;
  if (g === 6 || g === 7) return 4;
  return 5;
}

// ---------- 冲合 ----------
function chong(a, b) { return ((a - b + 12) % 12) === 6; }
const LIUHE = {0:1, 1:0, 2:11, 3:10, 4:9, 5:8, 6:7, 7:6, 8:5, 9:4, 10:3, 11:2}; // 子丑 寅亥 卯戌 辰酉 巳申 午未
function liuhe(a, b) { return LIUHE[a] === b; }

// ---------- 排盘主函数 ----------
// tossVals: 自下而上 6 项；1=少阳(单) 0=少阴(拆) 9=老阳(重·动) 6=老阴(交·动)
function paipan(tossVals, dt) {
  const pil = fourPillars(dt);
  const ben = tossVals.map(function (v) { return (v === 1 || v === 9) ? 1 : 0; });
  const moving = tossVals.map(function (v) { return (v === 9 || v === 6); });
  const bian = ben.map(function (b, i) { return moving[i] ? 1 - b : b; });

  const hasBian = moving.some(Boolean);
  const benKey = ben.join(''), bianKey = bian.join('');
  const benInfo = PALACE[benKey], bianInfo = PALACE[bianKey];
  const benLower = trigOfBits(ben.slice(0, 3)), benUpper = trigOfBits(ben.slice(3));
  const palaceWx = TRIG[benInfo.palace].wx;
  const beastBase = beastStart(pil.dayGan);

  // 变卦爻（各自纳甲）
  const bianLower = hasBian ? trigOfBits(bian.slice(0, 3)) : null;
  const bianUpper = hasBian ? trigOfBits(bian.slice(3)) : null;

  // 首卦（本宫纯卦）用于伏神
  const pure = TRIG[benInfo.palace].bits.concat(TRIG[benInfo.palace].bits);
  const benLqSet = {};
  for (let i = 0; i < 6; i++) {
    const zi = TRIG[i < 3 ? benLower : benUpper].najia[(i < 3 ? 0 : 3) + (i % 3)];
    const zhiIdx = ZHI.indexOf(zi);
    benLqSet[liuqin(palaceWx, ZHI_WX[zhiIdx])] = true;
  }
  const ALL_LQ = ['父母','兄弟','子孙','妻财','官鬼'];
  const missing = ALL_LQ.filter(function (l) { return !benLqSet[l]; });

  const lines = [];
  for (let i = 0; i < 6; i++) {
    const bTrig = i < 3 ? benLower : benUpper;
    const bPos = (i < 3 ? 0 : 3) + (i % 3); // 内卦取纳甲表前三位，外卦取后三位
    const ganC = TRIG[bTrig].gan[bPos];
    const zhiC = TRIG[bTrig].najia[bPos];
    const zhiIdx = ZHI.indexOf(zhiC);
    const wx = ZHI_WX[zhiIdx];
    let fu = null;
    if (missing.length) {
      const pureZhiC = TRIG[benInfo.palace].najia[i];
      const pureWx = ZHI_WX[ZHI.indexOf(pureZhiC)];
      const pureLq = liuqin(palaceWx, pureWx);
      if (missing.indexOf(pureLq) >= 0) fu = { lq: pureLq, zhi: pureZhiC, wx: pureWx };
    }
    lines.push({
      pos: i, gan: ganC, zhi: zhiC, zhiIdx: zhiIdx, wx: wx,
      lq: liuqin(palaceWx, wx),
      yang: ben[i] === 1, moving: moving[i], old: tossVals[i],
      beast: BEASTS[(beastBase + i) % 6],
      shi: benInfo.shi === i, ying: benInfo.ying === i,
      fu: fu,
      bian: hasBian ? (function () {
        const xTrig = i < 3 ? bianLower : bianUpper;
        const xPos = (i < 3 ? 0 : 3) + (i % 3);
        const xGan = TRIG[xTrig].gan[xPos], xZhi = TRIG[xTrig].najia[xPos];
        const xWx = ZHI_WX[ZHI.indexOf(xZhi)];
        return { gan: xGan, zhi: xZhi, wx: xWx, lq: liuqin(palaceWx, xWx) };
      })() : null
    });
  }

  return {
    tossVals: tossVals, benBits: ben, bianBits: bian, moving: moving, hasBian: hasBian,
    benName: hexName(ben), bianName: hasBian ? hexName(bian) : null,
    benLower: benLower, benUpper: benUpper,
    bianLower: bianLower, bianUpper: bianUpper,
    palace: benInfo.palace, palaceWx: palaceWx,
    bianPalace: hasBian ? bianInfo.palace : null,
    shi: benInfo.shi, ying: benInfo.ying,
    lines: lines, pillars: pil, date: dt
  };
}

// ---------- 基础断语 ----------
function relationText(selfWx, otherWx) {
  if (selfWx === otherWx) return '比和';
  if (sheng(otherWx, selfWx)) return '生我';   // 他生我
  if (sheng(selfWx, otherWx)) return '泄气';   // 我生他
  if (ke(otherWx, selfWx))    return '克伤';   // 他克我
  if (ke(selfWx, otherWx))    return '受制';   // 我克他（泄力）
  return '';
}

// target: '妻财' | '官鬼' | '父母' | '子孙' | '兄弟' | 'shi'
function analyze(pan, target) {
  const bul = [];
  const pil = pan.pillars;
  let targetLines;
  if (target === 'shi') {
    targetLines = [pan.lines[pan.shi]];
    bul.push('所测为自身运势，以世爻为用。');
  } else {
    targetLines = pan.lines.filter(function (l) { return l.lq === target; });
    if (targetLines.length === 0) {
      const fuLine = pan.lines.find(function (l) { return l.fu && l.fu.lq === target; });
      if (fuLine) {
        bul.push('用神' + target + '不上卦，取伏神' + target + fuLine.fu.zhi +
          '（伏于' + LINE_NAMES[fuLine.pos] + '，飞神' + fuLine.lq + fuLine.zhi + '压之）。');
        targetLines = [Object.assign({}, fuLine, { zhi: fuLine.fu.zhi, wx: fuLine.fu.wx, zhiIdx: ZHI.indexOf(fuLine.fu.zhi), lq: target, isFu: true, pos: fuLine.pos, moving: false, bian: null })];
      } else {
        bul.push('卦中未找到用神' + target + '，宜另择用神或以世爻参断。');
        return { bullets: bul, verdict: '' };
      }
    } else if (targetLines.length > 1) {
      bul.push('用神两现，古法宜取发动者、临世应者或旺者为主，余为辅。');
    } else {
      bul.push('用神：' + target + targetLines[0].zhi + targetLines[0].wx + '（' + LINE_NAMES[targetLines[0].pos] + (targetLines[0].moving ? '，发动' : '，安静') + '）。');
    }
  }

  let score = 0;
  targetLines.forEach(function (L) {
    const name = (target === 'shi' ? '世爻' : target) + L.zhi + L.wx + '（' + LINE_NAMES[L.pos] + '）';
    // 月建
    const mzWx = ZHI_WX[pil.monthZhi];
    if (pil.monthZhi === L.zhiIdx) { bul.push(name + '：临月建，当令最旺。'); score += 2.5; }
    else {
      const r = relationText(L.wx, mzWx);
      if (r === '生我') { bul.push(name + '：月建' + ZHI[pil.monthZhi] + mzWx + '生扶，得令。'); score += 1.5; }
      else if (r === '克伤') { bul.push(name + '：月建' + ZHI[pil.monthZhi] + mzWx + '克之，受制于时令。'); score -= 2; }
      else if (r === '泄气') { bul.push(name + '：月建' + ZHI[pil.monthZhi] + mzWx + '泄气。'); score -= 0.5; }
      else if (r === '受制') { bul.push(name + '：虽克月建，亦耗力。'); score -= 0.5; }
    }
    if (chong(L.zhiIdx, pil.monthZhi)) { bul.push('⚠ ' + name + '：月破（与月建相冲），过旬或逢合之日可解。'); score -= 2; }
    // 日辰
    if (pil.dayZhi === L.zhiIdx) { bul.push(name + '：临日辰，得日主之助。'); score += 1.5; }
    else {
      const r2 = relationText(L.wx, ZHI_WX[pil.dayZhi]);
      if (r2 === '生我') { bul.push(name + '：日辰' + ZHI[pil.dayZhi] + ZHI_WX[pil.dayZhi] + '生扶。'); score += 1; }
      else if (r2 === '克伤') { bul.push(name + '：日辰' + ZHI[pil.dayZhi] + ZHI_WX[pil.dayZhi] + '克之。'); score -= 1.5; }
      else if (r2 === '泄气') { bul.push(name + '：日辰泄其气。'); score -= 0.5; }
    }
    if (chong(L.zhiIdx, pil.dayZhi)) {
      if (L.moving) bul.push(name + '：日辰冲之，动爻逢冲为冲散，事体有反复。');
      else bul.push('⚠ ' + name + '：静爻被日辰冲——旺相为暗动（事机萌动），休囚为日破。');
      score -= 0.5;
    }
    if (liuhe(L.zhiIdx, pil.dayZhi)) { bul.push(name + '：日辰合之，合则有绊，事多牵滞，逢冲之日应。'); score += 0.5; }
    // 旬空
    if (pil.kong.indexOf(L.zhiIdx) >= 0) { bul.push('⚠ ' + name + '：逢旬空（' + pil.kongStr + '空）。旺不惧空，衰则真空；出空、冲空之日可应。'); score -= 1.5; }
    // 动变
    if (L.moving && L.bian) {
      bul.push(name + '：发动，化出' + L.bian.lq + L.bian.zhi + L.bian.wx + '。');
      if (sheng(L.bian.wx, L.wx)) { bul.push('　化回头生，吉象，事有转机。'); score += 1; }
      else if (ke(L.bian.wx, L.wx)) { bul.push('　化回头克，凶象，恐生变故。'); score -= 1.5; }
      else if (L.bian.wx === L.wx) { bul.push('　化比和。'); }
      else if (sheng(L.wx, L.bian.wx)) { bul.push('　化泄气，力量外散。'); score -= 0.5; }
    }
    // 与世爻关系
    if (target !== 'shi') {
      const S = pan.lines[pan.shi];
      if (L.pos === pan.shi) bul.push('用神持世，事在己身，吉凶应之最切。');
      else {
        if (sheng(L.wx, S.wx)) bul.push('用神生世爻（' + S.lq + S.zhi + '），事来就我。');
        else if (ke(L.wx, S.wx)) bul.push('用神克世爻，事与己有碍，宜谨慎。');
        else if (sheng(S.wx, L.wx)) bul.push('世爻生用神，我求于事，须费力。');
        else if (ke(S.wx, L.wx)) bul.push('世爻克用神，我能制事，但亦有损耗。');
        else if (S.wx === L.wx) bul.push('用神与世爻比和。');
      }
    }
    if (L.isFu) bul.push('用神伏藏，事体隐而未显，待引拔之期（生扶之日）。');
  });

  const verdict = score >= 2 ? '用神偏旺，事体有利，可图。' :
                  score <= -2 ? '用神偏弱，时机未至，宜缓图或另择。' :
                  '用神旺衰中和，成败在动爻与应期之细审。';
  bul.push('【粗判】' + verdict + '（仅为旺衰粗略评估，非全卦结论）');
  return { bullets: bul, verdict: verdict, score: score };
}

// ---------- 导出 ----------
const EXPORTS = {
  GAN: GAN, ZHI: ZHI, TRIG: TRIG, PALACE: PALACE, HEXNAMES: HEXNAMES,
  trigOfBits: trigOfBits, hexName: hexName, liuqin: liuqin, jdn: jdn,
  dayGanZhiIndex: dayGanZhiIndex, termDay: termDay, monthZhiIndex: monthZhiIndex,
  yearGanZhiIndex: yearGanZhiIndex, fourPillars: fourPillars, beastStart: beastStart,
  paipan: paipan, analyze: analyze, chong: chong, liuhe: liuhe, relationText: relationText,
  BEASTS: BEASTS, LINE_NAMES: LINE_NAMES, ZHI_WX: ZHI_WX, GAN_WX: GAN_WX,
  sheng: sheng, ke: ke, SHENG: SHENG, KE: KE
};
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORTS;
if (typeof window !== 'undefined') window.LY = EXPORTS;
