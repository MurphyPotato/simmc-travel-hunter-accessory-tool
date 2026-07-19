export type WeaponMode = "bow" | "sword";

export type AccessorySlot = "mainRing" | "subRing" | "mainAmulet" | "subAmulet";

export type AccessoryQuality = "dim" | "fine" | "divine";

export type DamageStat =
  | "hunterDamageMultiplier"
  | "hunterCritChance"
  | "hunterCritDamage"
  | "bowMasteryMultiplier"
  | "swordMasteryMultiplier"
  | "bowFinalDamage"
  | "swordFinalDamage"
  | "bowExtraDamage"
  | "swordExtraDamage";

export type DisplayStat = DamageStat | "damageReduction" | "sneakSpeed" | "vanilla";

export interface Affix {
  id: string;
  stat: DisplayStat;
  value: number;
  label?: string;
  confidence?: "high" | "low";
  warning?: string;
}

export interface Accessory {
  id: string;
  name?: string;
  slot: AccessorySlot;
  quality: AccessoryQuality;
  level: number;
  affixes: Affix[];
  source?: "manual" | "ocr" | "example" | "blank";
  imageUrl?: string;
  imageKind?: "tooltip-crop";
}

export interface DamageBreakdown {
  expected: number;
  nonCrit: number;
  crit: number;
  extraDamage: number;
  hunterMultiplier: number;
  masteryMultiplier: number;
  critChance: number;
  critDamage: number;
  finalDamage: number;
  ignoredAffixes: number;
  damageReduction: number;
  baseBeforeCrit: number;
}

export interface SetEvaluation {
  accessories: Record<AccessorySlot, Accessory>;
  breakdown: DamageBreakdown;
}

export interface EvaluationOptions {
  affixesForAccessory?: (accessory: Accessory) => Affix[];
}

export interface ReplacementResult {
  candidate: Accessory;
  replaced: Accessory;
  evaluation: SetEvaluation;
  delta: number;
  deltaPercent: number;
}

export interface BestSetFromPoolResult extends SetEvaluation {
  usedUploadedCount: number;
}

export const BASE_DAMAGE = 10;

export const slots: AccessorySlot[] = ["mainRing", "subRing", "mainAmulet", "subAmulet"];

export const slotLabels: Record<AccessorySlot, string> = {
  mainRing: "主戒指",
  subRing: "副戒指",
  mainAmulet: "主护符",
  subAmulet: "副护符",
};

export const qualityLabels: Record<AccessoryQuality, string> = {
  dim: "黯淡",
  fine: "精工",
  divine: "神铸",
};

export const weaponLabels: Record<WeaponMode, string> = {
  bow: "弓",
  sword: "剑",
};

export const statLabels: Record<DisplayStat, string> = {
  hunterDamageMultiplier: "旅猎伤害加成倍率",
  hunterCritChance: "旅猎暴击概率",
  hunterCritDamage: "旅猎暴击效果",
  bowMasteryMultiplier: "弓专精伤害倍率",
  swordMasteryMultiplier: "剑专精伤害倍率",
  bowFinalDamage: "弓专精最终伤害",
  swordFinalDamage: "剑专精最终伤害",
  bowExtraDamage: "弓额外伤害",
  swordExtraDamage: "剑额外伤害",
  damageReduction: "百分比伤害减免",
  sneakSpeed: "潜行速度",
  vanilla: "原版/其他词条",
};

export const selectableStats: DisplayStat[] = [
  "hunterDamageMultiplier",
  "hunterCritChance",
  "hunterCritDamage",
  "bowMasteryMultiplier",
  "swordMasteryMultiplier",
  "bowFinalDamage",
  "swordFinalDamage",
  "bowExtraDamage",
  "swordExtraDamage",
  "damageReduction",
  "sneakSpeed",
  "vanilla",
];

export const maxLevelByQuality: Record<AccessoryQuality, number> = {
  dim: 3,
  fine: 5,
  divine: 8,
};

export const materialCosts: Record<AccessoryQuality, number[]> = {
  dim: [5, 6, 7],
  fine: [5, 6, 7, 8, 10],
  divine: [5, 6, 7, 8, 8, 9, 10, 11],
};

export const coinCosts: Record<AccessoryQuality, number[]> = {
  dim: [200, 300, 500],
  fine: [500, 700, 900, 1200, 1500],
  divine: [1200, 1500, 1800, 2200, 2600, 3000, 3600, 4200],
};

export const salvageReturns: Record<AccessoryQuality, number[]> = {
  dim: [2, 5, 10, 15],
  fine: [3, 6, 11, 16, 22, 30],
  divine: [4, 7, 12, 17, 23, 29, 36, 43, 52],
};

export function unlockedAffixSlots(quality: AccessoryQuality, level: number): number {
  const clamped = Math.max(0, Math.min(level, maxLevelByQuality[quality]));
  if (quality === "dim") return clamped >= 3 ? 1 : 0;
  if (quality === "fine") return (clamped >= 3 ? 1 : 0) + (clamped >= 5 ? 1 : 0);
  return (clamped >= 3 ? 1 : 0) + (clamped >= 5 ? 1 : 0) + (clamped >= 8 ? 1 : 0);
}

export function totalAffixSlots(quality: AccessoryQuality, level: number): number {
  const clamped = Math.max(0, Math.min(level, maxLevelByQuality[quality]));
  if (quality === "dim") return clamped >= 3 ? 2 : 1;
  if (quality === "fine") return 1 + (clamped >= 3 ? 1 : 0) + (clamped >= 5 ? 1 : 0);
  return 1 + (clamped >= 3 ? 1 : 0) + (clamped >= 5 ? 1 : 0) + (clamped >= 8 ? 1 : 0);
}

export function createAccessory(
  slot: AccessorySlot,
  quality: AccessoryQuality,
  level: number,
  affixes: Affix[] = [],
  name?: string,
): Accessory {
  return {
    id: cryptoSafeId(),
    slot,
    quality,
    level,
    affixes,
    name,
    source: "manual",
  };
}

export function makeDefaultSet(): Record<AccessorySlot, Accessory> {
  return {
    mainRing: createAccessory("mainRing", "fine", 5, [], "当前主戒指"),
    subRing: createAccessory("subRing", "fine", 5, [], "当前副戒指"),
    mainAmulet: createAccessory("mainAmulet", "fine", 5, [], "当前主护符"),
    subAmulet: createAccessory("subAmulet", "fine", 5, [], "当前副护符"),
  };
}

export function makeBlankAccessory(slot: AccessorySlot): Accessory {
  return {
    id: `blank-${slot}`,
    slot,
    quality: "dim",
    level: 0,
    affixes: [],
    name: `空白${slotLabels[slot]}`,
    source: "blank",
  };
}

export function normalizeSet(accessories: Accessory[]): Record<AccessorySlot, Accessory> | null {
  const result = {} as Record<AccessorySlot, Accessory>;
  for (const slot of slots) {
    const matching = accessories.filter((item) => item.slot === slot);
    if (matching.length !== 1) return null;
    result[slot] = matching[0];
  }
  return result;
}

export function allAffixes(accessory: Accessory, options: EvaluationOptions = {}): Affix[] {
  return options.affixesForAccessory?.(accessory) ?? accessory.affixes;
}

export function evaluateSet(
  accessories: Record<AccessorySlot, Accessory>,
  weapon: WeaponMode,
  options: EvaluationOptions = {},
): SetEvaluation {
  const sums = sumAffixes(Object.values(accessories).flatMap((accessory) => allAffixes(accessory, options)));
  const extraDamage = weapon === "bow" ? sums.bowExtraDamage : sums.swordExtraDamage;
  const masteryMultiplier =
    weapon === "bow" ? sums.bowMasteryMultiplier : sums.swordMasteryMultiplier;
  const finalDamage = weapon === "bow" ? sums.bowFinalDamage : sums.swordFinalDamage;
  const critChance = Math.min(sums.hunterCritChance / 100, 1);
  const critDamage = sums.hunterCritDamage;
  const baseBeforeCrit = ((BASE_DAMAGE + extraDamage) + BASE_DAMAGE * sums.hunterDamageMultiplier) *
    (1 + masteryMultiplier);
  const nonCrit = baseBeforeCrit + finalDamage;
  const crit = baseBeforeCrit * (1 + critDamage) + finalDamage;
  const expected = baseBeforeCrit * (1 + critChance * critDamage) + finalDamage;

  return {
    accessories,
    breakdown: {
      expected,
      nonCrit,
      crit,
      extraDamage,
      hunterMultiplier: sums.hunterDamageMultiplier,
      masteryMultiplier,
      critChance,
      critDamage,
      finalDamage,
      ignoredAffixes: sums.ignoredAffixes,
      damageReduction: sums.damageReduction,
      baseBeforeCrit,
    },
  };
}

export function evaluateReplacement(
  currentSet: Record<AccessorySlot, Accessory>,
  candidate: Accessory,
  weapon: WeaponMode,
  options: EvaluationOptions = {},
): ReplacementResult {
  const before = evaluateSet(currentSet, weapon, options).breakdown.expected;
  const replaced = currentSet[candidate.slot];
  const nextSet = { ...currentSet, [candidate.slot]: candidate };
  const evaluation = evaluateSet(nextSet, weapon, options);
  const delta = evaluation.breakdown.expected - before;

  return {
    candidate,
    replaced,
    evaluation,
    delta,
    deltaPercent: before === 0 ? 0 : delta / before,
  };
}

export function findBestSet(
  currentSet: Record<AccessorySlot, Accessory>,
  candidates: Accessory[],
  weapon: WeaponMode,
  options: EvaluationOptions = {},
): SetEvaluation {
  const choicesBySlot = Object.fromEntries(
    slots.map((slot) => [
      slot,
      [currentSet[slot], ...candidates.filter((item) => item.slot === slot)],
    ]),
  ) as Record<AccessorySlot, Accessory[]>;

  let best = evaluateSet(currentSet, weapon, options);

  for (const mainRing of choicesBySlot.mainRing) {
    for (const subRing of choicesBySlot.subRing) {
      for (const mainAmulet of choicesBySlot.mainAmulet) {
        for (const subAmulet of choicesBySlot.subAmulet) {
          const evaluation = evaluateSet({ mainRing, subRing, mainAmulet, subAmulet }, weapon, options);
          if (evaluation.breakdown.expected > best.breakdown.expected) {
            best = evaluation;
          }
        }
      }
    }
  }

  return best;
}

export function findBestSetFromPool(
  accessories: Accessory[],
  weapon: WeaponMode,
  options: EvaluationOptions = {},
): BestSetFromPoolResult {
  const choicesBySlot = Object.fromEntries(
    slots.map((slot) => [
      slot,
      [makeBlankAccessory(slot), ...accessories.filter((item) => item.slot === slot)],
    ]),
  ) as Record<AccessorySlot, Accessory[]>;

  let best = {
    ...evaluateSet(
    {
      mainRing: choicesBySlot.mainRing[0],
      subRing: choicesBySlot.subRing[0],
      mainAmulet: choicesBySlot.mainAmulet[0],
      subAmulet: choicesBySlot.subAmulet[0],
    },
    weapon,
    options,
    ),
    usedUploadedCount: 0,
  } as BestSetFromPoolResult;

  for (const mainRing of choicesBySlot.mainRing) {
    for (const subRing of choicesBySlot.subRing) {
      for (const mainAmulet of choicesBySlot.mainAmulet) {
        for (const subAmulet of choicesBySlot.subAmulet) {
          const evaluation = evaluateSet({ mainRing, subRing, mainAmulet, subAmulet }, weapon, options);
          const usedUploadedCount = Object.values(evaluation.accessories).filter((item) => item.source !== "blank").length;
          const betterDamage = evaluation.breakdown.expected > best.breakdown.expected + 0.000001;
          const equalDamageMoreItems =
            Math.abs(evaluation.breakdown.expected - best.breakdown.expected) <= 0.000001 &&
            usedUploadedCount > best.usedUploadedCount;
          if (betterDamage || equalDamageMoreItems) {
            best = {
              ...evaluation,
              usedUploadedCount,
            };
          }
        }
      }
    }
  }

  return best;
}

export function qualityFromText(text: string): AccessoryQuality {
  const normalized = text.replace(/\s/g, "");
  if (/神铸|神锻|神鑄/.test(normalized)) return "divine";
  if (/黯淡|暗淡/.test(normalized)) return "dim";
  return "fine";
}

export function slotFromText(text: string): AccessorySlot {
  const normalized = text.replace(/\s/g, "");
  const bracketMatch = normalized.match(/『([^』]+)』/);
  const target = bracketMatch?.[1] ?? normalized;
  const candidates: Array<[AccessorySlot, string[]]> = [
    ["mainRing", ["主戒指", "主戒", "主成指"]],
    ["subRing", ["副戒指", "副戒", "副移指", "副拷指", "副戏指"]],
    ["mainAmulet", ["主护符", "主护身符", "主护"]],
    ["subAmulet", ["副护符", "副护身符", "副护", "副护件", "剖护件", "副护休", "副护衔", "副护祥"]],
  ];
  let best: { slot: AccessorySlot; score: number } = { slot: "mainRing", score: 0 };
  for (const [slot, aliases] of candidates) {
    for (const alias of aliases) {
      if (target.includes(alias) || normalized.includes(alias)) return slot;
      const score = Math.max(textSimilarity(target, alias), textSimilarity(normalized, alias));
      if (score > best.score) best = { slot, score };
    }
  }
  return best.score >= 0.34 ? best.slot : "mainRing";
}

export function statFromLabel(label: string): DisplayStat {
  return statFromLabelWithConfidence(label).stat;
}

export function parseNumericValue(raw: string): number {
  const match = raw.replace(/[＋]/g, "+").match(/\+\s*(\d+(?:\.\d+)?)/);
  if (match) return Number(match[1]);
  const unsigned = raw.match(/\d+(?:\.\d+)?/);
  return unsigned ? Number(unsigned[0]) : 0;
}

export function statFromLabelWithConfidence(label: string): { stat: DisplayStat; score: number } {
  const normalized = normalizeChineseLabel(label);
  const aliasGroups: Record<DisplayStat, string[]> = {
    hunterDamageMultiplier: ["旅猎伤害加成倍率", "旅猎伤害倍率", "旅猎倍率", "旅猎伤害倍卒"],
    hunterCritChance: ["旅猎暴击概率", "旅猎暴击率", "暴击率", "旅猎暴击卒"],
    hunterCritDamage: ["旅猎暴击效果", "旅猎爆伤", "爆伤"],
    bowMasteryMultiplier: ["弓专精伤害倍率", "弓专精伤害倍率加成", "弓专精伤害倍卒"],
    swordMasteryMultiplier: ["剑专精伤害倍率", "剑专精伤害倍率加成", "前专精伤害倍率", "剑专精伤害倍卒"],
    bowFinalDamage: ["弓专精最终伤害", "弓专精最终伤害加成"],
    swordFinalDamage: ["剑专精最终伤害", "剑专精最终伤害加成", "前专精最终伤害"],
    bowExtraDamage: ["弓额外伤害", "弓额外伤害加成"],
    swordExtraDamage: ["剑额外伤害", "剑额外伤害加成"],
    damageReduction: ["百分比伤害减免", "伤害减免"],
    sneakSpeed: ["潜行速度"],
    vanilla: ["原版其他词条"],
  };

  let best: { stat: DisplayStat; score: number } = { stat: "vanilla", score: 0 };
  for (const stat of selectableStats) {
    if (stat === "vanilla") continue;
    for (const alias of aliasGroups[stat]) {
      const aliasNormalized = normalizeChineseLabel(alias);
      if (normalized.includes(aliasNormalized) || aliasNormalized.includes(normalized)) {
        return { stat, score: 1 };
      }
      const score = textSimilarity(normalized, aliasNormalized);
      if (score > best.score) best = { stat, score };
    }
  }
  return best.score >= 0.34 ? best : { stat: "vanilla", score: best.score };
}

export function validateAffixValue(stat: DisplayStat, value: number): string | undefined {
  if (!Number.isFinite(value)) return "数值无法识别";
  const range = affixValueRanges[stat];
  if (!range) return undefined;
  if (value < range.min || value > range.max) {
    return `数值超出经验范围 ${formatNumber(range.min, 2)}-${formatNumber(range.max, 2)}`;
  }
  return undefined;
}

const affixValueRanges: Partial<Record<DisplayStat, { min: number; max: number }>> = {
  hunterDamageMultiplier: { min: 0.02, max: 0.07 },
  hunterCritChance: { min: 1, max: 200 },
  hunterCritDamage: { min: 0.01, max: 1 },
  bowMasteryMultiplier: { min: 0.02, max: 0.07 },
  swordMasteryMultiplier: { min: 0.02, max: 0.07 },
  bowFinalDamage: { min: 0.05, max: 2 },
  swordFinalDamage: { min: 0.05, max: 2 },
  bowExtraDamage: { min: 1, max: 20 },
  swordExtraDamage: { min: 1, max: 20 },
};

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

export function formatSigned(value: number, digits = 3): string {
  const formatted = formatNumber(Math.abs(value), digits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return "0";
}

function sumAffixes(affixes: Affix[]): Record<DamageStat, number> & {
  ignoredAffixes: number;
  damageReduction: number;
} {
  const base: Record<DamageStat, number> & { ignoredAffixes: number; damageReduction: number } = {
    hunterDamageMultiplier: 0,
    hunterCritChance: 0,
    hunterCritDamage: 0,
    bowMasteryMultiplier: 0,
    swordMasteryMultiplier: 0,
    bowFinalDamage: 0,
    swordFinalDamage: 0,
    bowExtraDamage: 0,
    swordExtraDamage: 0,
    ignoredAffixes: 0,
    damageReduction: 0,
  };

  for (const affix of affixes) {
    if (affix.stat === "damageReduction") {
      base.damageReduction += affix.value;
    } else if (affix.stat === "sneakSpeed" || affix.stat === "vanilla") {
      base.ignoredAffixes += 1;
    } else {
      base[affix.stat] += affix.value;
    }
  }

  return base;
}

function normalizeChineseLabel(text: string): string {
  return text
    .replace(/[^\u4e00-\u9fa5A-Za-z]/g, "")
    .replace(/[割刽]/g, "剑")
    .replace(/[井开]/g, "弓")
    .replace(/前/g, "剑")
    .replace(/[卒牢宰]/g, "率")
    .replace(/[供信]/g, "倍")
    .replace(/绍/g, "终");
}

function textSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const leftChars = new Set([...left]);
  const rightChars = new Set([...right]);
  let shared = 0;
  for (const char of leftChars) {
    if (rightChars.has(char)) shared += 1;
  }
  return shared / Math.max(leftChars.size, rightChars.size);
}

function cryptoSafeId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
