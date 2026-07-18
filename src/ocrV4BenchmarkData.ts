import { AccessoryQuality, AccessorySlot, DisplayStat } from "./domain";
import { OcrProfile } from "./ocrV4Types";

export interface V4BenchmarkAffix {
  stat: DisplayStat;
  value: number;
  label?: string;
}

export interface V4BenchmarkAccessory {
  name: string;
  quality: AccessoryQuality;
  slot: AccessorySlot;
  level: number;
  affixes: V4BenchmarkAffix[];
}

export interface V4BenchmarkCase {
  fileName: string;
  collection: "minecraft-original" | "modernui";
  split: "development" | "holdout";
  profile: Exclude<OcrProfile, "unknown">;
  expected: V4BenchmarkAccessory | null;
}

const v = (value: number, label?: string): V4BenchmarkAffix => ({ stat: "vanilla", value, label });
const a = (stat: DisplayStat, value: number): V4BenchmarkAffix => ({ stat, value });

export const V4_BENCHMARK_CASES: V4BenchmarkCase[] = [
  mc("0cb9064ed554565402318a9038be9b8a.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("hunterCritChance", 1.29), a("bowFinalDamage", 1.52), a("damageReduction", 2.5),
  ]),
  mc("272d625c1a045cd448c6f53e5b79ef3b.png", "holdout", "精工指环『副戒指』", "fine", "subRing", 5, [
    a("hunterCritChance", 5.5), a("hunterCritChance", 2.4), a("hunterCritChance", 1.54),
  ]),
  mc("4bf5bdc94f2a09c8c9c026171422a91e.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("bowExtraDamage", 5), a("damageReduction", 0.68), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("ffab34d3514d24559e6eef09c0bc0053.png", "holdout", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("sneakSpeed", 0.01), a("bowExtraDamage", 8.85),
  ]),
  mc("154aa9bcb9959451cef68abbcf1ba2df.png", "development", "神铸指环『副戒指』", "divine", "subRing", 8, [
    a("swordMasteryMultiplier", 0.02), a("swordMasteryMultiplier", 0.02), a("hunterCritChance", 8.5), v(0.26, "方块交互距离"),
  ]),
  mc("20f09a8c4c40b36133a057de91ee2866.png", "holdout", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("hunterCritChance", 2.15), a("swordMasteryMultiplier", 0.02),
  ]),
  mc("6f93021dd3244deb01ccfa8ab3fd70a3.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("swordMasteryMultiplier", 0.02), a("hunterCritChance", 1.92), a("damageReduction", 2.5),
  ]),
  mc("cd058b06116e45dda5ca08fc77d899ab.png", "holdout", "神铸护身符『主护符』", "divine", "mainAmulet", 8, [
    a("swordMasteryMultiplier", 0.02), a("hunterCritChance", 1.58), a("damageReduction", 0.81), a("hunterDamageMultiplier", 0.1),
  ]),
  mc("8ec4fe61-0505-45df-8a0f-6bf4031d0c02.png", "development", "神铸指环『副戒指』", "divine", "subRing", 8, [
    a("hunterCritChance", 8.5), v(0.26, "方块交互距离"), a("swordMasteryMultiplier", 0.02), a("swordMasteryMultiplier", 0.02),
  ]),
  mc("d9c49c2e-0072-4a0e-9530-518b8dc3a54c.png", "holdout", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("hunterCritChance", 1.92), a("damageReduction", 2.5), a("swordMasteryMultiplier", 0.02),
  ]),
  mc("e092d7dd-4886-473c-aea7-82a73d2cc29d.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("bowExtraDamage", 8.85), a("sneakSpeed", 0.01),
  ]),
  mc("QQ_1782158490751.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("swordMasteryMultiplier", 0.02), v(0.18, "方块交互距离"), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158494240.png", "holdout", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterCritChance", 1.2), a("hunterDamageMultiplier", 0.07), a("hunterDamageMultiplier", 0.02),
  ]),
  mc("QQ_1782158496878.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("swordMasteryMultiplier", 0.02), a("bowFinalDamage", 1.35), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158516537.png", "development", "神铸戒指『主戒指』", "divine", "mainRing", 8, [
    a("hunterCritDamage", 0.28), v(0.3, "方块交互距离"), v(0.01, "横扫伤害比率"), v(0.01, "横扫伤害比率"),
  ]),
  mc("QQ_1782158521876.png", "holdout", "神铸护身符『主护符』", "divine", "mainAmulet", 8, [
    v(1.84, "水中移动效率"), a("bowFinalDamage", 1.9), v(0.06, "跳跃力度"), a("hunterDamageMultiplier", 0.1),
  ]),
  mc("QQ_1782158525818.png", "development", "神铸护身符『主护符』", "divine", "mainAmulet", 8, [
    a("hunterDamageMultiplier", 0.1), a("damageReduction", 0.85), a("hunterCritDamage", 0.07), v(1.97, "水中移动效率"),
  ]),
  mc("QQ_1782158528744.png", "development", "神铸护身符『主护符』", "divine", "mainAmulet", 8, [
    a("sneakSpeed", 0.02), a("bowMasteryMultiplier", 0.04), a("damageReduction", 0.98), a("hunterDamageMultiplier", 0.1),
  ]),
  mc("QQ_1782158531495.png", "holdout", "精工指环『副戒指』", "fine", "subRing", 5, [
    a("hunterCritChance", 5.5), v(1.27, "速度"), v(0.14, "最大行走高度"),
  ]),
  mc("QQ_1782158534900.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), v(0.32, "血肉矿物吸引"), v(0.24, "血肉矿物吸引"),
  ]),
  mc("QQ_1782158538221.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    v(0.05, "跳跃力度"), a("hunterCritDamage", 0.18), a("swordFinalDamage", 1.83),
  ]),
  mc("QQ_1782158541460.png", "holdout", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), v(1.58, "水中移动效率"), a("swordFinalDamage", 1.17),
  ]),
  mc("QQ_1782158544456.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("hunterCritDamage", 0.1), v(0.12, "最大行走高度"),
  ]),
  mc("QQ_1782158547165.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("hunterCritDamage", 0.09), v(1.45, "安全摔落高度"),
  ]),
  mc("QQ_1782158550076.png", "holdout", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), v(0.05, "跳跃力度"), a("bowFinalDamage", 1.68),
  ]),
  mc("QQ_1782158553868.png", "development", "精工戒指『主戒指』", "fine", "mainRing", 5, [
    a("hunterCritDamage", 0.18), a("bowMasteryMultiplier", 0.03), a("bowFinalDamage", 1.58),
  ]),
  mc("QQ_1782158556908.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    v(0.31, "血肉矿物吸引"), v(0.22, "血肉矿物吸引"), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158559492.png", "holdout", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    v(0.21, "血肉矿物吸引"), a("swordFinalDamage", 1.81), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158562634.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterDamageMultiplier", 0.07), a("hunterCritDamage", 0.1), v(0.9, "水中移动效率"),
  ]),
  mc("QQ_1782158565948.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("bowMasteryMultiplier", 0.03), a("hunterDamageMultiplier", 0.07), a("swordFinalDamage", 1.75),
  ]),
  mc("QQ_1782158569222.png", "holdout", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterCritChance", 1.69), a("swordMasteryMultiplier", 0.02), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158572199.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterCritDamage", 0.09), a("bowFinalDamage", 0.98), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158575500.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterCritDamage", 0.05), a("hunterCritChance", 2.01), a("hunterDamageMultiplier", 0.07),
  ]),
  mc("QQ_1782158578956.png", "holdout", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    v(1.21, "水中移动效率"), a("bowFinalDamage", 1.29), a("damageReduction", 2.5),
  ]),
  mc("QQ_1782158581802.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("swordFinalDamage", 1.38), v(0.21, "方块交互距离"), a("damageReduction", 2.5),
  ]),
  mc("QQ_1782158584311.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("sneakSpeed", 0.02), a("swordFinalDamage", 1.24), a("damageReduction", 2.5),
  ]),
  mc("QQ_1782158587278.png", "holdout", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("hunterCritDamage", 0.06), a("hunterDamageMultiplier", 0.04), a("damageReduction", 2.5),
  ]),
  mc("QQ_1782158590404.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    v(0.1, "最大行走高度"), a("damageReduction", 2.5), a("damageReduction", 1.16),
  ]),
  mc("QQ_1782158593254.png", "holdout", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("bowFinalDamage", 2), v(0.17, "方块交互距离"), a("damageReduction", 2.5),
  ]),

  modern("6058d233e5b240651844b8ba91b61827.png", "development", "精工护身符『主护符』", "fine", "mainAmulet", 5, [
    a("hunterCritDamage", 0.08), a("bowExtraDamage", 6.68), a("hunterDamageMultiplier", 0.07),
  ]),
  modern("64b8bf8e7e536b9413c6c9f4d36751a3.png", "holdout", "神铸戒指『主戒指』", "divine", "mainRing", 8, [
    a("hunterCritChance", 2.04), a("hunterCritDamage", 0.28), a("hunterCritDamage", 0.08), v(1.23, "安全摔落高度"),
  ]),
  modern("65cb2945694e57d62897822cf5aa9546.png", "development", "精工宝石『副护符』", "fine", "subAmulet", 5, [
    a("damageReduction", 2.5), a("bowExtraDamage", 8.71), a("bowExtraDamage", 5.21),
  ]),
  modern("6d88f756915fa0a6ce7f9ad4975ff039.png", "holdout", "神铸指环『副戒指』", "divine", "subRing", 8, [
    a("hunterCritChance", 8.5), a("hunterCritDamage", 0.11), a("hunterCritDamage", 0.06), a("bowMasteryMultiplier", 0.04),
  ]),
  negativeModern("7f3fe2e004518188484fbdbeaab07afd.png", "development"),
  negativeModern("9e0de29f8cd352b2fa114186d25bb4fb.png", "holdout"),
  negativeModern("ec01d566ef11fe8f1960ac4ef64f7e9f.png", "development"),
  modern("f8f06bd021378f919702bede5ea9a95a.png", "holdout", "精工指环『副戒指』", "fine", "subRing", 5, [
    a("hunterCritChance", 5.5), a("swordMasteryMultiplier", 0.01), a("swordExtraDamage", 6.5),
  ]),
];

function mc(
  fileName: string,
  split: V4BenchmarkCase["split"],
  name: string,
  quality: AccessoryQuality,
  slot: AccessorySlot,
  level: number,
  affixes: V4BenchmarkAffix[],
): V4BenchmarkCase {
  return { fileName, collection: "minecraft-original", split, profile: "minecraft-1.21.8", expected: { name, quality, slot, level, affixes } };
}

function modern(
  fileName: string,
  split: V4BenchmarkCase["split"],
  name: string,
  quality: AccessoryQuality,
  slot: AccessorySlot,
  level: number,
  affixes: V4BenchmarkAffix[],
): V4BenchmarkCase {
  return { fileName, collection: "modernui", split, profile: "modernui-source-han", expected: { name, quality, slot, level, affixes } };
}

function negativeModern(fileName: string, split: V4BenchmarkCase["split"]): V4BenchmarkCase {
  return { fileName, collection: "modernui", split, profile: "modernui-source-han", expected: null };
}
