// 角色 emoji 头像映射 — 5 支乐队 × 5 名成员
// 复用在多个页面中, 集中管理便于更换风格

const EMOJI_MAP: Record<string, string> = {
  // MyGO!!!!!
  tomori: "🌙", anon: "💝", rana: "🎸", soyo: "🍀", taki: "🥁",
  // Ave Mujica
  uika: "🎭", mutsumi: "🌿", umiri: "🌊", nyamu: "✨", sakiko: "🎹",
  // MewType
  arale: "🌈", nonoka: "🎀", ritsu: "🎵", miyako: "🎼", yuno: "🎧",
  // millsage
  hotaru: "🌟", natsume: "🌸", nagi: "🍃", mahoro: "🌌", houka: "🔆",
  // 一家 Dumb Rock!
  raika: "🔥", miku: "👊", yomogi: "💪", chieri: "🥁", shizuku: "🌙",
};

export function memberEmoji(id: string): string {
  return EMOJI_MAP[id] || "🎤";
}
