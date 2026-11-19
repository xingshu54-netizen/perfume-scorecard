/**
 * 10 款沙龙与经典香水静态目录（按“由淡入浓、防嗅觉疲劳”三段十支顺序编排，只读数据源，兼容 file:// 与 http://）
 */
(function (global) {
  "use strict";

  var PERFUME_CATALOG = [
    {
      id: "jo-malone-wild-bluebell",
      index: 1,
      brandZh: "祖玛珑",
      brandEn: "Jo Malone London",
      nameZh: "蓝风铃",
      nameEn: "Wild Bluebell",
      concentration: "EDC",
      scentFamily: "绿叶水生花香调",
      palette: { primary: "#3E6B89", soft: "#EAF1F5" },
      reputationTags: ["冰镇西瓜水感", "五步散伪体香", "身体乳打底延香"],
      poetic: "露水浸着冰镇西瓜与绿叶，像穿白棉裙遇见的夏夜风",
      notes: {
        top: "风铃草 · 露珠 · 绿叶 · 公丁香",
        heart: "柿子 · 桃子",
        base: "麝香 · 脂粉味"
      },
      wearingGuide: {
        spray: "润肤乳打底后，裙摆或针织袖口喷4至5泵",
        outfit: "纯棉白衬衫配牛仔或亚麻连衣裙春夏穿",
        tip: "古龙水留香较短，勿刚喷凑近闻防化工感"
      }
    },
    {
      id: "guerlain-mandarine-basilic",
      index: 2,
      brandZh: "娇兰",
      brandEn: "Guerlain",
      nameZh: "柑橘罗勒（花草水语）",
      nameEn: "Aqua Allegoria Mandarine Basilic",
      concentration: "EDT",
      scentFamily: "柑橘馥奇调",
      palette: { primary: "#557A46", soft: "#ECF2E8" },
      reputationTags: ["现剥多汁大红橘", "罗勒茶感零压迫", "先试中调防香菜"],
      poetic: "刚剥开大红橘溅出清脆汁水，揉进微苦罗勒叶的初夏光感",
      notes: {
        top: "克里曼丁红橘 · 苦橙 · 茶叶",
        heart: "橘子 · 罗勒 · 洋甘菊 · 牡丹",
        base: "檀香木 · 琥珀"
      },
      wearingGuide: {
        spray: "可放心喷3至4泵，棉麻衬衫领口补香更稳",
        outfit: "纯白短袖配牛仔或浅绿棉麻衫春夏郊游穿",
        tip: "先试中调排查香菜感，认准经典淡香忌暴晒"
      }
    },
    {
      id: "bvlgari-pour-homme",
      index: 3,
      brandZh: "宝格丽",
      brandEn: "Bvlgari",
      nameZh: "大吉岭原版",
      nameEn: "Pour Homme",
      concentration: "EDT",
      scentFamily: "木质茶香麝香调",
      palette: { primary: "#4E6C64", soft: "#EAF0EE" },
      reputationTags: ["白衬衫男友香", "喷衣领破五步散", "前调偏醛少茶感"],
      poetic: "刚熨好的白衬衫裹着清冽木质，像靠在肩上的干净少年",
      notes: {
        top: "茶叶 · 睡莲",
        heart: "愈创木 · 小豆蔻",
        base: "麝香 · 琥珀"
      },
      wearingGuide: {
        spray: "2至3泵直喷纯棉白衬衫领口，或喷枕边侍寝",
        outfit: "纯棉白衬衫牛仔裤或浅灰卫衣四季百搭穿",
        tip: "皮肤散香极快且少纯茶味，防混极致夜幽版"
      }
    },
    {
      id: "versace-bright-crystal",
      index: 4,
      brandZh: "范思哲",
      brandEn: "Versace",
      nameZh: "粉耀晶钻（粉钻）",
      nameEn: "Bright Crystal",
      concentration: "EDT",
      scentFamily: "清新花果香调",
      palette: { primary: "#B85C72", soft: "#FAEEF1" },
      reputationTags: ["冰感石榴柚子", "早八校园零踩雷", "勿混深粉浓香版"],
      poetic: "冰镇石榴撞上柚子与浅粉牡丹，干净透亮的少女感花果香",
      notes: {
        top: "日本柚子 · 石榴 · 冰",
        heart: "牡丹 · 莲花 · 木兰",
        base: "麝香 · 桃花心木 · 琥珀"
      },
      wearingGuide: {
        spray: "耳后锁骨喷2泵或扫发尾，喷呢大衣锁香",
        outfit: "樱花粉雪纺连衣裙或浅色纯棉卫衣日常穿",
        tip: "先涂无香身体乳延香，认准浅粉原版淡香"
      }
    },
    {
      id: "hermes-terre",
      index: 5,
      brandZh: "爱马仕",
      brandEn: "Hermes",
      nameZh: "大地 EDT",
      nameEn: "Terre d'Hermès EDT",
      concentration: "EDT",
      scentFamily: "木质辛香调",
      palette: { primary: "#9C4A2F", soft: "#F6ECE6" },
      reputationTags: ["火石木质神作", "只喷一泵更耐闻", "过量易泛生姜味"],
      poetic: "苦橘散后透出火石与雪松暖意，像沉稳靠得住的冬日大衣",
      notes: {
        top: "橙子 · 葡萄柚",
        heart: "胡椒 · 天竺葵 · 火石",
        base: "香根草 · 雪松 · 广藿香 · 安息香"
      },
      wearingGuide: {
        spray: "隔夜限喷1泵于西装内衬或毛衣袖口",
        outfit: "羊毛西装或羊绒大衣配白衬衫秋冬通勤",
        tip: "等酒精散后再闻，认准原版且盛夏少喷"
      }
    },
    {
      id: "dior-jadore",
      index: 6,
      brandZh: "迪奥",
      brandEn: "Dior",
      nameZh: "真我 EDP",
      nameEn: "J'adore EDP",
      concentration: "EDP",
      scentFamily: "优雅花果香调",
      palette: { primary: "#B27E32", soft: "#F8F1E4" },
      reputationTags: ["发圈点涂通勤", "套装高跟鞋绝配", "经典妈妈香争议"],
      poetic: "瓜果托起鎏金繁花束，尾调化作洗净衣物的温柔体香",
      notes: {
        top: "梨 · 香瓜 · 木兰 · 桃子",
        heart: "茉莉 · 铃兰 · 晚香玉 · 玫瑰",
        base: "麝香 · 香草 · 黑莓 · 雪松"
      },
      wearingGuide: {
        spray: "工位点涂发圈1下，约会提前半小时穿香雾",
        outfit: "象牙白西装套或卡其风衣配羊绒衫职场穿",
        tip: "晕茉莉晚香玉先试半小时，勿直喷浅色真丝"
      }
    },
    {
      id: "chanel-no5",
      index: 7,
      brandZh: "香奈儿",
      brandEn: "Chanel",
      nameZh: "5号 EDP",
      nameEn: "N°5 EDP",
      concentration: "EDP",
      scentFamily: "经典乙醛花香调",
      palette: { primary: "#A37E38", soft: "#F7F2E6" },
      reputationTags: ["皂感脂粉慢热", "羊绒披肩侍寝香", "花露水皂感争议"],
      poetic: "冷冽醛感退场后，像羊绒披肩裹住温柔玫瑰与檀木余温",
      notes: {
        top: "醛 · 依兰 · 橙花油 · 香柠檬",
        heart: "鸢尾花 · 茉莉 · 玫瑰 · 铃兰",
        base: "檀香木 · 香草 · 橡木苔 · 香根草"
      },
      wearingGuide: {
        spray: "大衣内衬或羊绒披肩轻喷1泵，避开近鼻吸",
        outfit: "粗花呢套裙或驼色大衣配真丝衫秋冬穿",
        tip: "前调皂感需等半小时，避开盛夏出汗与卫衣"
      }
    },
    {
      id: "armani-my-way",
      index: 8,
      brandZh: "阿玛尼",
      brandEn: "Giorgio Armani",
      nameZh: "自我无界",
      nameEn: "My Way",
      concentration: "EDP",
      scentFamily: "明亮白花调",
      palette: { primary: "#B04E64", soft: "#F9ECEF" },
      reputationTags: ["多肉葡萄软糖", "一泵香透一整天", "晕晚香玉慎入"],
      poetic: "葡萄般清甜橙花裹着暖润晚香玉，明媚得像牵手去约会",
      notes: {
        top: "橙花 · 香柠檬",
        heart: "晚香玉 · 茉莉",
        base: "香草 · 麝香 · 雪松"
      },
      wearingGuide: {
        spray: "内衣内侧或腰踝藏喷1泵，严禁互搓手腕",
        outfit: "粗花呢短外套或法式碎花裙配暖白约会",
        tip: "晚香玉浓甜避盛夏高温，切忌直喷真丝首饰"
      }
    },
    {
      id: "prada-paradoxe",
      index: 9,
      brandZh: "普拉达",
      brandEn: "Prada",
      nameZh: "我本莫测",
      nameEn: "Paradoxe",
      concentration: "EDP",
      scentFamily: "琥珀白花调",
      palette: { primary: "#9E5640", soft: "#F7ECE8" },
      reputationTags: ["扩香炸裂少喷", "奶油香草橙花", "氧化变黄属正常"],
      poetic: "脆梨撞入奶润橙花与暖意香草，甜得亮眼又带点反差俏皮",
      notes: {
        top: "梨 · 蜜橘 · 香柠檬",
        heart: "橙花 · 橙花油 · 茉莉",
        base: "香草 · 琥珀 · 麝香 · 安息香脂"
      },
      wearingGuide: {
        spray: "走入1泵空中香雾或隔夜喷衣防熏晕",
        outfit: "软糯针织或皮衣配缎面裙秋冬约会通勤",
        tip: "扩香极强先试再入，液体氧化变黄正常"
      }
    },
    {
      id: "ysl-mon-paris",
      index: 10,
      brandZh: "圣罗兰",
      brandEn: "YSL",
      nameZh: "反转巴黎 EDP",
      nameEn: "Mon Paris EDP",
      concentration: "EDP",
      scentFamily: "西普果香花香调",
      palette: { primary: "#8F3B52", soft: "#F6E9ED" },
      reputationTags: ["草莓糖浆失魂果", "脚踝低位防呛鼻", "通勤地铁慎多喷"],
      poetic: "浓甜莓果跌进微凉广藿夜风，让人上头又自带热恋争议",
      notes: {
        top: "草莓 · 树莓 · 梨 · 西瓜酮",
        heart: "牡丹 · 茉莉 · 曼陀罗 · 橙花",
        base: "广藿香 · 麝香 · 香草 · 降龙涎香醚"
      },
      wearingGuide: {
        spray: "通勤仅脚踝轻点1泵，逛街喷梳齿轻梳发尾",
        outfit: "小黑裙或碎花裙配呢大衣约会夜间聚会穿",
        tip: "前调糖度极高勿盲入，认准黑丝带原版浓香"
      }
    }
  ];

  global.PERFUME_CATALOG = Object.freeze(PERFUME_CATALOG);
})(window);
