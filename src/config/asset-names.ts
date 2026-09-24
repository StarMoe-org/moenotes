/** Resource identifiers from the release MasterCharacter / MasterBand tables.
 * These are asset names, not localized display names.
 */
export const characterIdByAssetName: Readonly<Record<string, number>> = {
  tomori: 1,
  anon: 2,
  rana: 3,
  soyo: 4,
  taki: 5,
  uika: 6,
  mutsumi: 7,
  umiri: 8,
  nyamu: 9,
  sakiko: 10,
  arale: 11,
  // Older Spine exports use this spelling for the same character.
  arare: 11,
  nonoka: 12,
  ritsu: 13,
  miyako: 14,
  yuno: 15,
  hotaru: 16,
  natsume: 17,
  nagi: 18,
  mahoro: 19,
  houka: 20,
  raika: 21,
  miku: 22,
  yomogi: 23,
  chieri: 24,
  shizuku: 25,
};

export const bandIdByAssetName: Readonly<Record<string, number>> = {
  mygo: 1,
  mujica: 2,
  yumemita: 3,
  millsage: 4,
  kadan: 5,
};
