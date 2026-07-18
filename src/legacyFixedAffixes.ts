import { Accessory, AccessorySlot, Affix, EvaluationOptions } from "./domain";

export const fixedMainAffixes: Record<AccessorySlot, Affix> = {
  mainRing: {
    id: "main-main-ring",
    stat: "hunterCritDamage",
    value: 0.18,
    label: "固定主词条",
  },
  subRing: {
    id: "main-sub-ring",
    stat: "hunterCritChance",
    value: 8.5,
    label: "固定主词条",
  },
  mainAmulet: {
    id: "main-main-amulet",
    stat: "hunterDamageMultiplier",
    value: 0.18,
    label: "固定主词条",
  },
  subAmulet: {
    id: "main-sub-amulet",
    stat: "damageReduction",
    value: 2.5,
    label: "固定主词条",
  },
};

export const legacyFixedAffixOptions: EvaluationOptions = {
  affixesForAccessory(accessory: Accessory): Affix[] {
    if (accessory.source === "blank") return accessory.affixes;
    return [fixedMainAffixes[accessory.slot], ...accessory.affixes];
  },
};
