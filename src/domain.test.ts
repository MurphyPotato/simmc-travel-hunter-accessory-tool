import { describe, expect, it } from "vitest";
import {
  Accessory,
  evaluateReplacement,
  evaluateSet,
  findBestSet,
  findBestSetFromPool,
  makeDefaultSet,
  parseNumericValue,
  totalAffixSlots,
  unlockedAffixSlots,
} from "./domain";
import { legacyFixedAffixOptions } from "./legacyFixedAffixes";
import { parseAccessoryText, parseStructuredAffixLine, parseStructuredLines } from "./ocr";

function item(partial: Partial<Accessory>): Accessory {
  return {
    id: partial.id ?? "id",
    slot: partial.slot ?? "mainRing",
    quality: partial.quality ?? "fine",
    level: partial.level ?? 5,
    affixes: partial.affixes ?? [],
    ...partial,
  };
}

describe("damage calculation", () => {
  it("does not inject fixed main affixes by default", () => {
    const set = makeDefaultSet();

    expect(evaluateSet(set, "bow").breakdown.expected).toBe(10);
  });

  it("can use legacy fixed main affixes when explicitly requested", () => {
    const set = makeDefaultSet();

    expect(evaluateSet(set, "bow", legacyFixedAffixOptions).breakdown.expected).toBeGreaterThan(10);
  });

  it("adds duplicated affixes", () => {
    const set = makeDefaultSet();
    set.subRing = item({
      slot: "subRing",
      affixes: [
        { id: "a", stat: "hunterCritChance", value: 5 },
        { id: "b", stat: "hunterCritChance", value: 10 },
      ],
    });

    expect(evaluateSet(set, "bow", legacyFixedAffixOptions).breakdown.critChance).toBeCloseTo(0.235);
  });

  it("ignores the other weapon stats", () => {
    const set = makeDefaultSet();
    set.mainRing = item({
      slot: "mainRing",
      affixes: [
        { id: "bow", stat: "bowExtraDamage", value: 10 },
        { id: "sword", stat: "swordExtraDamage", value: 20 },
      ],
    });

    expect(evaluateSet(set, "bow").breakdown.extraDamage).toBe(10);
    expect(evaluateSet(set, "sword").breakdown.extraDamage).toBe(20);
  });

  it("adds final damage after multipliers and crit expectation", () => {
    const set = makeDefaultSet();
    set.mainRing = item({
      slot: "mainRing",
      affixes: [{ id: "final", stat: "bowFinalDamage", value: 5 }],
    });

    const withoutFinal = makeDefaultSet();
    expect(evaluateSet(set, "bow").breakdown.expected).toBeCloseTo(
      evaluateSet(withoutFinal, "bow").breakdown.expected + 5,
    );
  });

  it("uses the v3 expected damage formula and exposes split damage", () => {
    const set = makeDefaultSet();
    set.mainRing = item({
      slot: "mainRing",
      affixes: [
        { id: "z", stat: "bowExtraDamage", value: 5 },
        { id: "x", stat: "hunterDamageMultiplier", value: 0.05 },
        { id: "y", stat: "bowMasteryMultiplier", value: 0.05 },
        { id: "p", stat: "hunterCritChance", value: 50 },
        { id: "l", stat: "hunterCritDamage", value: 0.5 },
        { id: "f", stat: "bowFinalDamage", value: 1 },
      ],
    });

    const result = evaluateSet(set, "bow").breakdown;

    expect(result.baseBeforeCrit).toBeCloseTo(16.275);
    expect(result.nonCrit).toBeCloseTo(17.275);
    expect(result.crit).toBeCloseTo(25.4125);
    expect(result.expected).toBeCloseTo(21.34375);
  });

  it("keeps damage reduction out of damage score", () => {
    const set = makeDefaultSet();
    const before = evaluateSet(set, "bow", legacyFixedAffixOptions).breakdown.expected;
    set.subAmulet = item({
      slot: "subAmulet",
      affixes: [{ id: "dr", stat: "damageReduction", value: 50 }],
    });

    expect(evaluateSet(set, "bow", legacyFixedAffixOptions).breakdown.expected).toBeCloseTo(before);
    expect(evaluateSet(set, "bow", legacyFixedAffixOptions).breakdown.damageReduction).toBe(52.5);
  });
});

describe("set constraints", () => {
  it("replaces only the same slot", () => {
    const set = makeDefaultSet();
    const candidate = item({
      slot: "subRing",
      affixes: [{ id: "crit", stat: "hunterCritChance", value: 20 }],
    });
    const result = evaluateReplacement(set, candidate, "bow", legacyFixedAffixOptions);

    expect(result.replaced.slot).toBe("subRing");
    expect(result.evaluation.accessories.subRing).toBe(candidate);
    expect(result.evaluation.accessories.mainRing).toBe(set.mainRing);
  });

  it("finds the best four-piece set by slot", () => {
    const set = makeDefaultSet();
    const weakMainRing = item({ id: "weak", slot: "mainRing" });
    const strongSubRing = item({
      id: "strong",
      slot: "subRing",
      affixes: [{ id: "crit", stat: "hunterCritChance", value: 80 }],
    });
    const best = findBestSet(set, [weakMainRing, strongSubRing], "bow", legacyFixedAffixOptions);

    expect(best.accessories.subRing.id).toBe("strong");
    expect(best.accessories.mainRing.id).toBe(set.mainRing.id);
  });

  it("keeps legacy sub-affix unlock rules for v1/v2", () => {
    expect(unlockedAffixSlots("dim", 3)).toBe(1);
    expect(unlockedAffixSlots("fine", 5)).toBe(2);
    expect(unlockedAffixSlots("divine", 8)).toBe(3);
  });

  it("uses v3 total affix slots for OCR review caps", () => {
    expect(totalAffixSlots("dim", 3)).toBe(2);
    expect(totalAffixSlots("fine", 3)).toBe(2);
    expect(totalAffixSlots("fine", 5)).toBe(3);
    expect(totalAffixSlots("divine", 5)).toBe(3);
    expect(totalAffixSlots("divine", 8)).toBe(4);
  });
});

describe("v3 pool planning", () => {
  it("allows fewer than four accessories by using blank placeholders", () => {
    const onlyRing = item({
      id: "ring",
      slot: "mainRing",
      affixes: [{ id: "extra", stat: "bowExtraDamage", value: 1 }],
    });
    const best = findBestSetFromPool([onlyRing], "bow");

    expect(best.accessories.mainRing.id).toBe("ring");
    expect(best.accessories.subRing.source).toBe("blank");
  });

  it("chooses the best item per slot from the pool", () => {
    const weak = item({ id: "weak", slot: "subRing", affixes: [{ id: "a", stat: "bowExtraDamage", value: 1 }] });
    const strong = item({ id: "strong", slot: "subRing", affixes: [{ id: "b", stat: "bowExtraDamage", value: 8 }] });
    const best = findBestSetFromPool([weak, strong], "bow");

    expect(best.accessories.subRing.id).toBe("strong");
  });

  it("scores sword and bow plans with their own weapon stats", () => {
    const bowItem = item({ id: "bow", slot: "mainRing", affixes: [{ id: "bow-stat", stat: "bowExtraDamage", value: 10 }] });
    const swordItem = item({ id: "sword", slot: "mainRing", affixes: [{ id: "sword-stat", stat: "swordExtraDamage", value: 20 }] });

    expect(findBestSetFromPool([bowItem, swordItem], "bow").accessories.mainRing.id).toBe("bow");
    expect(findBestSetFromPool([bowItem, swordItem], "sword").accessories.mainRing.id).toBe("sword");
  });
});

describe("ocr parsing", () => {
  it("parses positive plus-prefixed numeric values first", () => {
    expect(parseNumericValue("+8.50")).toBe(8.5);
    expect(parseNumericValue("旅猎暴击率 +1.89")).toBe(1.89);
  });

  it("marks value text containing unsupported percent characters as low confidence", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『旅猎暴击率』 +8.50%"],
      valueText: ["+8.50%"],
    });

    expect(affix?.value).toBe(8.5);
    expect(affix?.confidence).toBe("low");
    expect(affix?.warning).toContain("数值字符已按 MC 字体误读修正");
  });

  it("merges multiple OCR candidates from one image line into one affix", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『旅猎伤害倍率』 +0.07", "旅猎伤害倍卒 +0.07"],
      valueText: ["+0.07", "+0.0"],
    });

    expect(affix?.stat).toBe("hunterDamageMultiplier");
    expect(affix?.value).toBeCloseTo(0.07);
  });

  it("rescales obvious OCR decimal-loss values by stat range", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『弓专精最终伤害』 +152"],
      valueText: ["+152"],
    });

    expect(affix?.stat).toBe("bowFinalDamage");
    expect(affix?.value).toBeCloseTo(1.52);
    expect(affix?.confidence).toBe("low");
  });

  it("chooses corrected full-line numeric candidates over weaker value crops", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『 白分比伤害谅儿 』 +己.5日"],
      valueText: ["+2.00"],
    });

    expect(affix?.stat).toBe("damageReduction");
    expect(affix?.value).toBeCloseTo(2.5);
  });

  it("prefers MC-font decimal correction for mastery multipliers", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『剑专精伤害倍率』 +0.82"],
      valueText: ["+482"],
    });

    expect(affix?.stat).toBe("swordMasteryMultiplier");
    expect(affix?.value).toBeCloseTo(0.02);
  });

  it("prefers corrected line values over noisy crop values for crit chance", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『 旅猎暴击率 』 +8.5日"],
      valueText: ["2+58.08"],
    });

    expect(affix?.stat).toBe("hunterCritChance");
    expect(affix?.value).toBeCloseTo(8.5);
  });

  it("normalizes Chinese-shaped numeric OCR characters", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『方块交互距离』 +出.二匕"],
      valueText: ["+125"],
    });

    expect(affix?.stat).toBe("vanilla");
    expect(affix?.value).toBeCloseTo(0.26);
  });

  it("normalizes vanilla distance values from MC-font OCR", () => {
    const affix = parseStructuredAffixLine({
      rawText: ["『方块交互距离』 +出.小吉"],
      valueText: ["+4.15"],
    });

    expect(affix?.stat).toBe("vanilla");
    expect(affix?.value).toBeCloseTo(0.18);
  });

  it("keeps duplicate affixes from different image lines", () => {
    const parsed = parseStructuredLines([
      { kind: "title", image: "", rawText: ["神铸指环『副戏指』 +5"], valueText: [], y: 0 },
      { kind: "affix", image: "", rawText: ["『剑专精伤害倍率』 +0.00"], valueText: ["+0.00"], y: 20 },
      { kind: "affix", image: "", rawText: ["『剑专精伤害倍率』 +0.00"], valueText: ["+0.00"], y: 40 },
      { kind: "affix", image: "", rawText: ["『旅猎暴击率』 +8.50"], valueText: ["+8.50"], y: 60 },
      { kind: "affix", image: "", rawText: ["『方块交互距离』 +0.36"], valueText: ["+0.36"], y: 80 },
    ]);

    expect(parsed.accessory.quality).toBe("divine");
    expect(parsed.accessory.slot).toBe("subRing");
    expect(parsed.accessory.level).toBe(8);
    expect(parsed.accessory.affixes).toHaveLength(4);
    expect(parsed.accessory.affixes.filter((affix) => affix.stat === "swordMasteryMultiplier")).toHaveLength(2);
  });

  it("does not take the enhancement level from affix values in text fallback", () => {
    const parsed = parseAccessoryText([
      "精工宝石『副护符』",
      "『旅猎暴击率』 +1.89",
      "『百分比伤害减免』 +8.50",
    ].join("\n"));

    expect(parsed.accessory.level).toBe(0);
  });
});
