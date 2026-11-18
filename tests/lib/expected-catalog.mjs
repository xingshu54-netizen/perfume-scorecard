/**
 * 权威预期数据契约与未汉化英文白名单/违禁词表
 * 100% 源自 ORIGINAL_REQUEST.md 与 PROJECT.md（Opaque-box 独立定义）
 */

export const EXPECTED_STORAGE_KEY = 'perfume_scorecard_v1';

export const EXPECTED_VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
];

export const EXPECTED_INTENTS = ['必入正装', '再试几次', '一般般', '劝退拔草'];

export const EXPECTED_FILTERS = {
  all: /^全部(?:\s*[（(]?\d+[）)]?)?$/,
  untested: /^(?:待试|未试)(?:\s*[（(]?\d+[）)]?)?$/,
  tested: /^已试(?:香)?(?:\s*[（(]?\d+[）)]?)?$/,
  favorite: /^(?:必入正装|挚爱|心愿|高分心愿)(?:\s*[（(]?\d+[）)]?)?$/,
};

export const EXPECTED_SORTS = {
  original: /原单顺序|清单原序|默认顺序|原序/,
  scoreDesc: /评分从高到低|高分优先|评分降序|按评分/,
};

/**
 * 10 款不重复香水权威预期清单
 * 浓度边界：仅 #1(EDT)、#6(EDP)、#7(EDP)、#9(EDP)、#10(原版) 在订单中明确写出，设为必需
 */
export const EXPECTED_CATALOG = [
  {
    index: 1,
    suggestedId: 'hermes-terre',
    brandZh: '爱马仕',
    brandEn: ['Hermès', 'Hermes'],
    nameZh: '大地',
    nameAliases: ['大地'],
    brandMatchers: [/爱马仕/i, /Herm[eè]s/i],
    nameMatchers: [/大地/, /Terre\s+d['’]?Herm[eè]s/i],
    concentration: 'EDT',
    concentrationRequiredInOrder: true,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i, /\bEDT\b/i],
    orderSource: '截图1 第1条',
  },
  {
    index: 2,
    suggestedId: 'jo-malone-wild-bluebell',
    brandZh: '祖玛珑',
    brandEn: ['Jo Malone London', 'Jo Malone'],
    nameZh: '蓝风铃',
    nameAliases: ['蓝风铃'],
    brandMatchers: [/祖玛珑|祖·玛珑/i, /Jo\s+Malone/i],
    nameMatchers: [/蓝风铃/, /Wild\s+Bluebell/i],
    concentration: null,
    concentrationRequiredInOrder: false,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i],
    orderSource: '截图1 第2条',
  },
  {
    index: 3,
    suggestedId: 'prada-paradoxe',
    brandZh: '普拉达',
    brandEn: ['Prada'],
    nameZh: '我本莫测',
    nameAliases: ['我本莫测'],
    brandMatchers: [/普拉达/i, /\bPrada\b/i],
    nameMatchers: [/我本莫测/, /\bParadoxe\b/i],
    concentration: null,
    concentrationRequiredInOrder: false,
    isMerged: false,
    quantity: 1,
    quantityUncertain: false,
    expectedSpecPatterns: [/0\.5\s*ml/i, /(?:×|x|\*)\s*1/i],
    orderSource: '截图1 第3条',
  },
  {
    index: 4,
    suggestedId: 'armani-my-way',
    brandZh: '阿玛尼',
    brandEn: ['Giorgio Armani', 'Armani'],
    nameZh: '自我无界',
    nameAliases: ['自我无界'],
    brandMatchers: [/阿玛尼/i, /\bArmani\b/i],
    nameMatchers: [/自我无界/, /\bMy\s+Way\b/i],
    concentration: null,
    concentrationRequiredInOrder: false,
    isMerged: true,
    quantity: 3,
    quantityUncertain: false,
    expectedSpecPatterns: [
      /(?:0\.5\s*ml[\s\S]{0,16}(?:×|x|\*)\s*1|(?:×|x|\*)\s*1[\s\S]{0,16}0\.5\s*ml)/i,
      /(?<![\d.])1(?:\.0)?\s*ml[\s\S]{0,16}(?:×|x|\*)\s*2/i,
      /3\s*支/,
      /2\.5\s*ml/i,
    ],
    orderSource: '截图1 第4条 + 截图2 第4条 合并',
  },
  {
    index: 5,
    suggestedId: 'versace-bright-crystal',
    brandZh: '范思哲',
    brandEn: ['Versace'],
    nameZh: '粉耀晶钻',
    nameAliases: ['粉耀晶钻（粉钻）', '粉耀晶钻', '粉钻'],
    brandMatchers: [/范思哲/i, /\bVersace\b/i],
    nameMatchers: [/粉耀晶钻|粉钻/, /Bright\s+Crystal/i],
    concentration: null,
    concentrationRequiredInOrder: false,
    isMerged: false,
    quantity: null,
    quantityUncertain: true,
    expectedSpecPatterns: [/(?<![\d.])1(?:\.0)?\s*ml/i],
    uncertainPromptPattern: /待确认|遮挡|未明|疑似|需确认|确认数量|未确认/,
    orderSource: '截图1 第5条（数量被“反馈”浮标遮挡）',
  },
  {
    index: 6,
    suggestedId: 'ysl-mon-paris',
    brandZh: '圣罗兰',
    brandEn: ['YSL', 'Yves Saint Laurent', 'Saint Laurent'],
    nameZh: '反转巴黎',
    nameAliases: ['反转巴黎'],
    brandMatchers: [/圣罗兰|YSL/i, /Saint\s+Laurent/i],
    nameMatchers: [/反转巴黎/, /Mon\s+Paris/i],
    concentration: 'EDP',
    concentrationRequiredInOrder: true,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i, /\bEDP\b/i],
    orderSource: '截图2 第1条',
  },
  {
    index: 7,
    suggestedId: 'chanel-no5',
    brandZh: '香奈儿',
    brandEn: ['Chanel'],
    nameZh: '5号',
    nameAliases: ['5号', 'N°5', 'No.5', 'No 5'],
    brandMatchers: [/香奈儿/i, /\bChanel\b/i],
    nameMatchers: [/5\s*号|N°\s*5|No\.?\s*5/i],
    concentration: 'EDP',
    concentrationRequiredInOrder: true,
    isMerged: false,
    quantity: 1,
    quantityUncertain: false,
    expectedSpecPatterns: [/0\.5\s*ml/i, /(?:×|x|\*)\s*1/i, /\bEDP\b/i],
    orderSource: '截图2 第2条',
  },
  {
    index: 8,
    suggestedId: 'guerlain-mandarine-basilic',
    brandZh: '娇兰',
    brandEn: ['Guerlain'],
    nameZh: '柑橘罗勒',
    nameAliases: ['柑橘罗勒', '花草水语 柑橘罗勒'],
    brandMatchers: [/娇兰/i, /\bGuerlain\b/i],
    nameMatchers: [/柑橘罗勒/, /Mandarine\s+Basilic/i],
    concentration: null,
    concentrationRequiredInOrder: false,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i],
    orderSource: '截图2 第3条',
  },
  {
    index: 9,
    suggestedId: 'dior-jadore',
    brandZh: '迪奥',
    brandEn: ['Dior'],
    nameZh: '真我',
    nameAliases: ['真我'],
    brandMatchers: [/迪奥/i, /\bDior\b/i],
    nameMatchers: [/真我/, /J['’]?adore/i],
    concentration: 'EDP',
    concentrationRequiredInOrder: true,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i, /\bEDP\b/i],
    orderSource: '截图2 第5条',
  },
  {
    index: 10,
    suggestedId: 'bvlgari-pour-homme',
    brandZh: '宝格丽',
    brandEn: ['Bvlgari', 'Bulgari'],
    nameZh: '大吉岭原版',
    nameAliases: ['大吉岭原版', '大吉岭茶原版', '大吉岭'],
    brandMatchers: [/宝格丽/i, /\bB[vu]lgari\b/i],
    nameMatchers: [/大吉岭(?:茶)?原版|大吉岭/, /Pour\s+Homme/i],
    concentration: '原版',
    concentrationRequiredInOrder: true,
    isMerged: false,
    quantity: 2,
    quantityUncertain: false,
    expectedSpecPatterns: [/1\s*ml/i, /(?:×|x|\*)\s*2/i, /原版/],
    orderSource: '截图2 第6条',
  },
];

/**
 * 先行整体剔除的合法英文短语（避免如单独 "My" 被放行）
 */
export const ALLOWED_ENGLISH_PHRASES = [
  /\bJo\s+Malone\s+London\b/gi,
  /\bJo\s+Malone\b/gi,
  /\bWild\s+Bluebell\b/gi,
  /\bTerre\s+d['’]?Herm[eè]s\b/gi,
  /\bGiorgio\s+Armani\b/gi,
  /\bMy\s+Way\b/gi,
  /\bBright\s+Crystal\b/gi,
  /\bYves\s+Saint\s+Laurent\b/gi,
  /\bSaint\s+Laurent\b/gi,
  /\bMon\s+Paris\b/gi,
  /\bAqua\s+Allegoria\b/gi,
  /\bMandarine\s+Basilic\b/gi,
  /\bPour\s+Homme\b/gi,
  /\bTop\s*3\b/gi,
  /\bNo\.?\s*5\b/gi,
  /\bN°\s*5\b/gi,
  /\b3\s*-\s*6\s*h\b/gi,
  /\b6\s*h\s*\+/gi,
  /<\s*3\s*h\b/gi,
];

/**
 * 合法业务英语/缩写整词白名单（大小写不敏感）
 */
export const ALLOWED_ENGLISH_TOKENS = [
  'Hermès',
  'Hermes',
  'Terre',
  'Jo',
  'Malone',
  'London',
  'Wild',
  'Bluebell',
  'Prada',
  'Paradoxe',
  'Giorgio',
  'Armani',
  'Versace',
  'Bright',
  'Crystal',
  'YSL',
  'Yves',
  'Saint',
  'Laurent',
  'Mon',
  'Paris',
  'Chanel',
  'Guerlain',
  'Aqua',
  'Allegoria',
  'Mandarine',
  'Basilic',
  'Dior',
  "J'adore",
  'Jadore',
  'Bvlgari',
  'Bulgari',
  'Pour',
  'Homme',
  'ml',
  'EDT',
  'EDP',
  'EDC',
  'Parfum',
  'JSON',
  'PNG',
  'Top',
  'Top3',
  'Emoji',
  'OK',
  'L1',
  'L2',
];

/**
 * 强制拦截的未汉化模板/调试残留词（任意命中直接失败）
 */
export const FORBIDDEN_TEMPLATE_PATTERNS = [
  /\bLorem\s+ipsum\b/i,
  /\b(?:Placeholder|Submit|Scorecard\s+Template|Score|Click\s+here|Cancel|Confirm|Reset|Export|Import|Filter|Sort|All|Tested|Untested|Favorite|Notes?|Close|Save|Edit|Copy|Share|Delete|Back|Next|Loading|Success|Error|Sample\s+Item|TODO|TBD)\b/i,
  /\b(?:undefined|NaN|Infinity)\b|\[object Object\]/,
];

/**
 * 根据卡片文本匹配权威清单条目
 * @param {string} cardText
 */
export function matchExpectedCatalogItem(cardText) {
  const normalized = String(cardText || '');
  return EXPECTED_CATALOG.filter((item) => {
    const brandOk = item.brandMatchers.some((re) => re.test(normalized));
    const nameOk = item.nameMatchers.some((re) => re.test(normalized));
    return brandOk && nameOk;
  });
}

/**
 * 检查文本是否包含违禁模板词或可疑未汉化英文单词
 * @param {string} rawText
 */
export function scanUnlocalizedText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { forbiddenHits: [], suspiciousTokens: [] };
  }

  const forbiddenHits = [];
  for (const pat of FORBIDDEN_TEMPLATE_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      forbiddenHits.push({ pattern: pat.toString(), match: m[0], context: text.slice(0, 120) });
    }
  }

  let stripped = text;
  for (const phraseRe of ALLOWED_ENGLISH_PHRASES) {
    stripped = stripped.replace(phraseRe, ' ');
  }

  const allowSet = new Set(ALLOWED_ENGLISH_TOKENS.map((t) => t.toLowerCase()));
  const words = stripped.match(/\b[A-Za-z][A-Za-z'’-]{2,}\b/g) || [];
  const suspiciousTokens = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    // 跳过如 10ml / 2.5ml 拆出的 ml 词尾及单数字时长 3h
    if (allowSet.has(lower) || /^(?:ml|edp|edt|edc)$/i.test(lower)) {
      continue;
    }
    suspiciousTokens.push(w);
  }

  return { forbiddenHits, suspiciousTokens };
}
