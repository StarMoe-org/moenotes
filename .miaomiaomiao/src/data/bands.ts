// Moenotes — 全局数据
// 数据基于 bang-dream-on.bushimo.jp 公开信息整理

export type BandKey = "mygo" | "mujica" | "mewtype" | "millsage" | "ikka";

export interface Character {
  id: string;
  band: BandKey;
  nameJa: string;     // 日文
  nameRomaji: string; // 罗马音
  nameCn: string;     // 中文
  position: string;   // 担当
  cv: string;         // 声优
  color: string;      // 代表色
  bgGradient: string; // 背景渐变
  quote: string;      // 角色语录
  birthday: string;
  height?: string;
  tags: string[];
}

export interface Band {
  key: BandKey;
  name: string;        // 日文原名
  nameEn: string;      // 英文/罗马音
  nameCn: string;      // 中文常用
  slogan: string;      // 标语
  concept: string;     // 简介
  color: string;       // 代表色
  bgColor: string;     // 背景
  accent: string;      // 强调色
  song: string;        // 代表曲
  formed: string;      // 结成时间
  members: string[];   // 成员 id
}

export const bands: Band[] = [
  {
    key: "mygo",
    name: "MyGO!!!!!",
    nameEn: "MyGO!!!!!",
    nameCn: "迷子",
    slogan: "迷子でもいい、前へ進め。",
    concept: "五个少女因各自的伤痕相遇，在青春的迷茫中组成了这支乐队。前方是未知,但只要走下去就会看见光。",
    color: "#5A6B8C",
    bgColor: "#DDE3EC",
    accent: "#2A1B3D",
    song: "春日影 (Haruhikage)",
    formed: "2023.06",
    members: ["tomori", "anon", "rana", "soyo", "taki"],
  },
  {
    key: "mujica",
    name: "Ave Mujica",
    nameEn: "Ave Mujica",
    nameCn: "阿维缪吉卡",
    slogan: "ようこそ、Ave Mujicaのマスカレードへ。",
    concept: "华丽的哥特式戏剧,以面具遮蔽真心的少女们。当舞台落幕,被遮蔽的自我该何去何从?",
    color: "#2A1B3D",
    bgColor: "#E6DCE8",
    accent: "#6B2B5E",
    song: "顔",
    formed: "2023.06",
    members: ["uika", "mutsumi", "umiri", "nyamu", "sakiko"],
  },
  {
    key: "mewtype",
    name: "夢限大みゅーたいぷ",
    nameEn: "Mugendai Mewtype",
    nameCn: "梦限大 MewType",
    slogan: "夢は、限りなく大きく！",
    concept: "以「无限大」为名的梦之乐队。电子音色、流行旋律与热血青春的完美融合。",
    color: "#D63A8C",
    bgColor: "#FCE3EE",
    accent: "#FF6BA0",
    song: "無限大",
    formed: "2024.06",
    members: ["arale", "nonoka", "ritsu", "miyako", "yuno"],
  },
  {
    key: "millsage",
    name: "millsage",
    nameEn: "millsage",
    nameCn: "米露萨吉",
    slogan: "両手いっぱいの幸せを、あなたに。",
    concept: "温柔治愈的轻摇滚。用双手捧起满满幸福,献给每一个正在努力生活的你。",
    color: "#4A8FA8",
    bgColor: "#DBEEF2",
    accent: "#2C5F70",
    song: "しあわせのおと",
    formed: "2024.06",
    members: ["hotaru", "natsume", "nagi", "mahoro", "houka"],
  },
  {
    key: "ikka",
    name: "一家Dumb Rock!",
    nameEn: "Ikka Dumb Rock!",
    nameCn: "一家 Dumb Rock!",
    slogan: "始めようか、マイ・ファミリー！",
    concept: "吵闹的、不成熟的、却最真实的家庭摇滚。五个少女在 Livehouse 屋顶相遇,组成了她们的「家庭」。",
    color: "#B85042",
    bgColor: "#F4DDD7",
    accent: "#7A2E25",
    song: "家族讃歌",
    formed: "2024.06",
    members: ["raika", "miku", "yomogi", "chieri", "shizuku"],
  },
];

export const characters: Character[] = [
  // MyGO!!!!!
  { id: "tomori", band: "mygo", nameJa: "高松 燈", nameRomaji: "Takamatsu Tomori", nameCn: "高松 灯", position: "Vo.", cv: "羊宮 妃那", color: "#5A6B8C", bgGradient: "from-[#5A6B8C] to-[#2A1B3D]", quote: "我想表达…那些说不出口的东西。", birthday: "10.17", height: "156cm", tags: ["主唱", "文学少女", "敏感"] },
  { id: "anon", band: "mygo", nameJa: "千早 愛音", nameRomaji: "Chihaya Anon", nameCn: "千早 爱音", position: "Gt.", cv: "立石 凛", color: "#D63A8C", bgGradient: "from-[#D63A8C] to-[#A82B6B]", quote: "想被大家喜欢,想交到朋友。", birthday: "04.14", height: "158cm", tags: ["社交", "现充", "吉他"] },
  { id: "rana", band: "mygo", nameJa: "要 楽奈", nameRomaji: "Kaname Rāna", nameCn: "要 乐奈", position: "Gt.", cv: "青木 陽菜", color: "#F4C430", bgGradient: "from-[#F4C430] to-[#C8412B]", quote: "哈？无所谓啦。", birthday: "09.21", height: "172cm", tags: ["自由", "长发", "随性"] },
  { id: "soyo", band: "mygo", nameJa: "長崎 そよ", nameRomaji: "Nagasaki Soyo", nameCn: "长崎 爽世", position: "Ba.", cv: "小日向 美香", color: "#7FB069", bgGradient: "from-[#7FB069] to-[#4A8FA8]", quote: "为了让大家都笑出来。", birthday: "06.08", height: "160cm", tags: ["贝斯", "温柔", "天然"] },
  { id: "taki", band: "mygo", nameJa: "椎名 立希", nameRomaji: "Shiina Taki", nameCn: "椎名 立希", position: "Dr.", cv: "林 鼓子", color: "#E84D2E", bgGradient: "from-[#E84D2E] to-[#A8431E]", quote: "我还能打下去。", birthday: "11.27", height: "155cm", tags: ["鼓手", "努力", "正论"] },

  // Ave Mujica
  { id: "uika", band: "mujica", nameJa: "三角 初華", nameRomaji: "Misumi Uika", nameCn: "三角 初华", position: "Gt.&Vo. / Doloris", cv: "佐々木 李子", color: "#2A1B3D", bgGradient: "from-[#2A1B3D] to-[#6B2B5E]", quote: "这场戏,才刚刚开始。", birthday: "01.11", height: "163cm", tags: ["主唱", "戏剧", "神秘"] },
  { id: "mutsumi", band: "mujica", nameJa: "若葉 睦", nameRomaji: "Wakaba Mutsumi", nameCn: "若叶 睦", position: "Gt. / Mortis", cv: "渡瀬 結月", color: "#6B4423", bgGradient: "from-[#6B4423] to-[#A8431E]", quote: "……", birthday: "08.03", height: "159cm", tags: ["沉默", "观察", "吉他"] },
  { id: "umiri", band: "mujica", nameJa: "八幡 海鈴", nameRomaji: "Yahata Umiri", nameCn: "八幡 海铃", position: "Ba. / Timoris", cv: "岡田 夢以", color: "#4A8FA8", bgGradient: "from-[#4A8FA8] to-[#2A1B3D]", quote: "希望我们都能笑着走下舞台。", birthday: "03.30", height: "162cm", tags: ["贝斯", "温柔", "面具"] },
  { id: "nyamu", band: "mujica", nameJa: "祐天寺 にゃむ", nameRomaji: "Yūtenji Nyamu", nameCn: "祐天寺 喵姆", position: "Dr. / Amoris", cv: "米澤 茜", color: "#E89BA8", bgGradient: "from-[#E89BA8] to-[#D63A8C]", quote: "一起闪耀吧✨", birthday: "12.25", height: "157cm", tags: ["元气", "鼓手", "SNS"] },
  { id: "sakiko", band: "mujica", nameJa: "豊川 祥子", nameRomaji: "Togawa Sakiko", nameCn: "丰川 祥子", position: "Key. / Oblivionis", cv: "高尾 奏音", color: "#1A1410", bgGradient: "from-[#1A1410] to-[#6B4423]", quote: "为了实现我们的故事。", birthday: "07.07", height: "161cm", tags: ["键盘", "完美主义", "大小姐"] },

  // MewType
  { id: "arale", band: "mewtype", nameJa: "仲町 あられ", nameRomaji: "Nakamachi Arale", nameCn: "仲町 阿拉蕾", position: "Vo.", cv: "朝日奈 丸佳", color: "#D63A8C", bgGradient: "from-[#D63A8C] to-[#F4C430]", quote: "做个超大的梦吧！", birthday: "02.22", height: "155cm", tags: ["主唱", "活力", "电子"] },
  { id: "nonoka", band: "mewtype", nameJa: "宮永 ののか", nameRomaji: "Miyanaga Nonoka", nameCn: "宫永 野乃花", position: "Gt.", cv: "藤寺 美徳", color: "#FF6BA0", bgGradient: "from-[#FF6BA0] to-[#D63A8C]", quote: "想要做很厉害很厉害的歌！", birthday: "05.19", height: "159cm", tags: ["吉他", "认真", "创作"] },
  { id: "ritsu", band: "mewtype", nameJa: "峰月 律", nameRomaji: "Minetsuki Ritsu", nameCn: "峰月 律", position: "Gt.", cv: "陽高 真白", color: "#7FB069", bgGradient: "from-[#7FB069] to-[#2D4A2B]", quote: "节奏对了,一切就对了。", birthday: "09.09", height: "163cm", tags: ["节奏", "技术流", "冷静"] },
  { id: "miyako", band: "mewtype", nameJa: "藤 都子", nameRomaji: "Fuji Miyako", nameCn: "藤 都子", position: "Key.", cv: "五木 茉莉", color: "#4A8FA8", bgGradient: "from-[#4A8FA8] to-[#7FB069]", quote: "音乐是无国界的语言。", birthday: "11.11", height: "157cm", tags: ["键盘", "古典", "知性"] },
  { id: "yuno", band: "mewtype", nameJa: "千石 ユノ", nameRomaji: "Sengoku Yuno", nameCn: "千石 优诺", position: "DJ&Mp.", cv: "水篠 結月", color: "#F4C430", bgGradient: "from-[#F4C430] to-[#E84D2E]", quote: "今晚,让全场都跳起来。", birthday: "03.03", height: "160cm", tags: ["DJ", "表演", "热血"] },

  // millsage
  { id: "hotaru", band: "millsage", nameJa: "汐見 蛍", nameRomaji: "Shiomi Hotaru", nameCn: "汐见 萤", position: "Key.&Vo.", cv: "薬師寺 李有", color: "#F4A93C", bgGradient: "from-[#F4A93C] to-[#F4C430]", quote: "为你,唱一首温柔的歌。", birthday: "06.21", height: "158cm", tags: ["主唱", "温柔", "治愈"] },
  { id: "natsume", band: "millsage", nameJa: "伊沢 なつめ", nameRomaji: "Izawa Natsume", nameCn: "伊泽 夏目", position: "Gt.", cv: "千春", color: "#7FB069", bgGradient: "from-[#7FB069] to-[#4A8FA8]", quote: "今天也元气满满！", birthday: "08.08", height: "161cm", tags: ["吉他", "治愈", "姐姐"] },
  { id: "nagi", band: "millsage", nameJa: "琴平 凪", nameRomaji: "Kotohira Nagi", nameCn: "琴平 凪", position: "Gt.", cv: "結川 あさき", color: "#E89BA8", bgGradient: "from-[#E89BA8] to-[#F4A93C]", quote: "我会努力,变得更强。", birthday: "04.16", height: "156cm", tags: ["吉他", "腼腆", "努力"] },
  { id: "mahoro", band: "millsage", nameJa: "浜崎 まほろ", nameRomaji: "Hamasaki Mahoro", nameCn: "滨崎 真穗", position: "Ba.", cv: "伊駒 ゆりえ", color: "#4A8FA8", bgGradient: "from-[#4A8FA8] to-[#2A1B3D]", quote: "贝斯的振动,就是生命的节奏。", birthday: "10.30", height: "162cm", tags: ["贝斯", "酷", "可靠"] },
  { id: "houka", band: "millsage", nameJa: "和泉 朋花", nameRomaji: "Izumi Houka", nameCn: "和泉 朋花", position: "Dr.", cv: "咲川 ひなの", color: "#E84D2E", bgGradient: "from-[#E84D2E] to-[#F4A93C]", quote: "咚、咚、咚——心跳,就是这首歌。", birthday: "12.04", height: "159cm", tags: ["鼓手", "认真", "舞蹈"] },

  // 一家 Dumb Rock!
  { id: "raika", band: "ikka", nameJa: "須賀 蕾叶", nameRomaji: "Suga Raika", nameCn: "须贺 蕾叶", position: "Gt.&Vo.", cv: "橘 めい", color: "#B85042", bgGradient: "from-[#B85042] to-[#E84D2E]", quote: "今天也要大声唱到天亮！", birthday: "01.05", height: "160cm", tags: ["主唱", "热血", "笨蛋"] },
  { id: "miku", band: "ikka", nameJa: "馬橋 心玖", nameRomaji: "Mahashi Miku", nameCn: "马桥 心玖", position: "Gt.&Vo.", cv: "涼泉 桜花", color: "#F4A93C", bgGradient: "from-[#F4A93C] to-[#B85042]", quote: "姐妹们,冲啊！", birthday: "07.23", height: "157cm", tags: ["合唱", "家庭感", "吵闹"] },
  { id: "yomogi", band: "ikka", nameJa: "矢倉 蓬咲", nameRomaji: "Yakura Yomogi", nameCn: "矢仓 蓬咲", position: "Ba.", cv: "花宮 初奈", color: "#7FB069", bgGradient: "from-[#7FB069] to-[#B85042]", quote: "我是这个家最靠谱的！…大概。", birthday: "05.12", height: "163cm", tags: ["贝斯", "吐槽", "吐槽役"] },
  { id: "chieri", band: "ikka", nameJa: "梅里 ちえり", nameRomaji: "Umezato Chieri", nameCn: "梅里 千绘里", position: "Dr.", cv: "菱川 花菜", color: "#6B4423", bgGradient: "from-[#6B4423] to-[#1A1410]", quote: "鼓点会说话,听。", birthday: "11.02", height: "158cm", tags: ["鼓手", "沉默", "型格"] },
  { id: "shizuku", band: "ikka", nameJa: "四宮 寧月", nameRomaji: "Shinomiya Shizuku", nameCn: "四宫 宁月", position: "Key.", cv: "遠野 ひかる", color: "#E89BA8", bgGradient: "from-[#E89BA8] to-[#D63A8C]", quote: "我为这个家写一首安眠曲吧♪", birthday: "08.18", height: "155cm", tags: ["键盘", "少女", "梦幻"] },
];

export const getBand = (key: BandKey) => bands.find((b) => b.key === key)!;
export const getCharacter = (id: string) => characters.find((c) => c.id === id)!;
export const getBandMembers = (key: BandKey) => characters.filter((c) => c.band === key);

// === 假数据：活动 / 歌曲 / 卡牌 ===
export interface NewsItem {
  id: string;
  date: string;
  category: "活动" | "更新" | "公告" | "Live";
  band?: BandKey;
  title: string;
  excerpt: string;
  tag?: string;
}

export const news: NewsItem[] = [
  { id: "n1", date: "2025.06.18", category: "活动", band: "mujica", title: "「Ave Mujica 5th Live」追加公演决定", excerpt: "东京 · 日本武道馆 · 7/19 售票开启。", tag: "Live" },
  { id: "n2", date: "2025.06.15", category: "更新", title: "wiki v0.3 上线：新增「卡牌图鉴」栏目", excerpt: "25 名角色初始 5★ 卡牌数据已整理完成,持续更新中。", tag: "数据" },
  { id: "n3", date: "2025.06.12", category: "公告", band: "mygo", title: "MyGO!!!!! 新单曲《迷路の子羊》PV 公开", excerpt: "高松灯个人单曲,6/25 数字 / CD 同步发行。", tag: "音乐" },
  { id: "n4", date: "2025.06.08", category: "Live", band: "ikka", title: "「一家Dumb Rock! 初ワンマン」圆满结束", excerpt: "感谢到场 2,500 名粉丝,next is coming soon。", tag: "Rep" },
  { id: "n5", date: "2025.06.01", category: "活动", band: "millsage", title: "millsage 全国巡回粉丝见面会开启", excerpt: "大阪 → 名古屋 → 福冈 → 札幌,详情见站内。", tag: "Fan" },
  { id: "n6", date: "2025.05.28", category: "更新", band: "mewtype", title: "MewType 乐队资料补充完成", excerpt: "新乐队全档案上线,欢迎补充。", tag: "数据" },
];

export interface Song {
  id: string;
  band: BandKey;
  title: string;
  type: "原创" | "翻唱" | "印象曲" | "角色曲";
  duration: string;
  released: string;
  hasMV: boolean;
}

export const songs: Song[] = [
  { id: "s1", band: "mygo", title: "春日影", type: "原创", duration: "4:12", released: "2023.06.15", hasMV: true },
  { id: "s2", band: "mygo", title: "迷星届", type: "原创", duration: "3:58", released: "2023.06.15", hasMV: true },
  { id: "s3", band: "mujica", title: "顔", type: "原创", duration: "4:36", released: "2023.12.24", hasMV: true },
  { id: "s4", band: "mujica", title: "Masquerade Rhapsody", type: "原创", duration: "5:01", released: "2024.03.10", hasMV: true },
  { id: "s5", band: "mewtype", title: "無限大", type: "原创", duration: "3:42", released: "2024.06.12", hasMV: true },
  { id: "s6", band: "mewtype", title: "Dream Drive", type: "原创", duration: "3:55", released: "2024.07.20", hasMV: true },
  { id: "s7", band: "millsage", title: "しあわせのおと", type: "原创", duration: "4:08", released: "2024.06.12", hasMV: true },
  { id: "s8", band: "millsage", title: "灯ノ町", type: "原创", duration: "4:22", released: "2024.08.15", hasMV: false },
  { id: "s9", band: "ikka", title: "家族讃歌", type: "原创", duration: "3:36", released: "2024.06.12", hasMV: true },
  { id: "s10", band: "ikka", title: "屋上ライブ", type: "原创", duration: "3:50", released: "2024.09.01", hasMV: false },
  { id: "s11", band: "mygo", title: "壱雫空", type: "角色曲", duration: "4:45", released: "2024.01.15", hasMV: true },
  { id: "s12", band: "mujica", title: "白昼の夢", type: "印象曲", duration: "5:18", released: "2024.02.20", hasMV: true },
];

export interface CardItem {
  id: string;
  characterId: string;
  name: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  attribute: "Power" | "Cool" | "Pure" | "Happy" | "Dark";
  skill: string;
  releaseDate: string;
  gacha: string;
  art: string; // emoji 风格
}

export const cards: CardItem[] = [
  { id: "c1", characterId: "tomori", name: "迷茫者的共鸣", rarity: 5, attribute: "Dark", skill: "PERFECT 判定 +120% / 乐团 16% 强化", releaseDate: "2023.06.15", gacha: "永久卡池", art: "🌑" },
  { id: "c2", characterId: "anon", name: "想要朋友的真心", rarity: 4, attribute: "Happy", skill: "GREAT 判定 +90% / 体力 8% 恢复", releaseDate: "2023.06.15", gacha: "永久卡池", art: "💗" },
  { id: "c3", characterId: "rana", name: "自由即兴", rarity: 4, attribute: "Cool", skill: "音符 8% UP / 技能发动条件 10% 降低", releaseDate: "2023.07.10", gacha: "限定卡池", art: "🎸" },
  { id: "c4", characterId: "soyo", name: "温柔的阴谋", rarity: 4, attribute: "Pure", skill: "乐团得分 7.5% UP / 体力 6% 恢复", releaseDate: "2023.08.20", gacha: "永久卡池", art: "🍀" },
  { id: "c5", characterId: "taki", name: "不退让的鼓手", rarity: 5, attribute: "Power", skill: "PERFECT 判定 +150% / 连击 12% 强化", releaseDate: "2023.09.05", gacha: "限定卡池", art: "🔥" },
  { id: "c6", characterId: "uika", name: "Doloris 的咏叹", rarity: 5, attribute: "Dark", skill: "PERFECT 判定 +140% / 乐团 18% 强化", releaseDate: "2023.12.24", gacha: "永久卡池", art: "🎭" },
  { id: "c7", characterId: "sakiko", name: "Oblivionis 的夜曲", rarity: 5, attribute: "Cool", skill: "PERFECT 判定 +130% / 技能发动条件 15% 降低", releaseDate: "2024.01.15", gacha: "限定卡池", art: "🎹" },
  { id: "c8", characterId: "nyamu", name: "喵姆的闪耀", rarity: 4, attribute: "Happy", skill: "GREAT 判定 +95% / 乐团 9% 强化", releaseDate: "2023.12.24", gacha: "永久卡池", art: "✨" },
  { id: "c9", characterId: "arale", name: "无限大的声音", rarity: 5, attribute: "Power", skill: "PERFECT 判定 +135% / 体力 10% 恢复", releaseDate: "2024.06.12", gacha: "永久卡池", art: "🌈" },
  { id: "c10", characterId: "yuno", name: "DJ 时间", rarity: 4, attribute: "Cool", skill: "音符 9% UP / 技能发动条件 8% 降低", releaseDate: "2024.06.12", gacha: "永久卡池", art: "🎧" },
  { id: "c11", characterId: "hotaru", name: "幸福的音色", rarity: 5, attribute: "Pure", skill: "PERFECT 判定 +125% / 体力 12% 恢复", releaseDate: "2024.06.12", gacha: "永久卡池", art: "🌟" },
  { id: "c12", characterId: "mahoro", name: "节奏与低语", rarity: 4, attribute: "Cool", skill: "乐团得分 8.5% UP / 连击 7% 强化", releaseDate: "2024.07.15", gacha: "永久卡池", art: "🎵" },
  { id: "c13", characterId: "raika", name: "家庭摇滚！", rarity: 5, attribute: "Power", skill: "PERFECT 判定 +130% / 乐团 15% 强化", releaseDate: "2024.06.12", gacha: "永久卡池", art: "🎤" },
  { id: "c14", characterId: "chieri", name: "鼓点会说话", rarity: 4, attribute: "Dark", skill: "连击 11% UP / 音符 7% 强化", releaseDate: "2024.07.20", gacha: "限定卡池", art: "🥁" },
  { id: "c15", characterId: "shizuku", name: "宁月的小夜曲", rarity: 3, attribute: "Pure", skill: "体力 5% 恢复 / 音符 4% UP", releaseDate: "2024.06.12", gacha: "永久卡池", art: "🌙" },
];

export interface EventItem {
  id: string;
  title: string;
  type: "Live" | "Fan Meeting" | "新曲" | "PV" | "活动";
  date: string;
  location?: string;
  band?: BandKey;
  status: "upcoming" | "live" | "ended";
}

export const events: EventItem[] = [
  { id: "e1", title: "Ave Mujica 5th Live「Apres la pluie」", type: "Live", date: "2025.07.19", location: "日本武道馆 · 东京", band: "mujica", status: "upcoming" },
  { id: "e2", title: "millsage 巡回 Fan Meeting", type: "Fan Meeting", date: "2025.07.26", location: "大阪 · 名古屋 · 福冈 · 札幌", band: "millsage", status: "upcoming" },
  { id: "e3", title: "MewType 新单曲发售", type: "新曲", date: "2025.08.07", band: "mewtype", status: "upcoming" },
  { id: "e4", title: "MyGO!!!!! 2nd 単独 Live", type: "Live", date: "2025.09.13", location: "横滨 Arena", band: "mygo", status: "upcoming" },
  { id: "e5", title: "一家Dumb Rock! 1st 単独", type: "Live", date: "2025.06.01", location: "Spotify O-EAST", band: "ikka", status: "ended" },
  { id: "e6", title: "全 5 乐队合同フェス「OurNotes Fes.」", type: "活动", date: "2025.10.25", location: "幕张メッセ", status: "upcoming" },
];
