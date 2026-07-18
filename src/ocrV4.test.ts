import { describe, expect, it } from "vitest";
import {
  resolveLevelV4,
  resolveNumericV4,
  resolveStatV4,
  weightedTextSimilarity,
} from "./ocrV4Decision";
import {
  matchMinecraftStatTemplates,
  recognizeMinecraftNumber,
  renderTextMask,
} from "./ocrV4Templates";
import { classifyProfileMetrics } from "./ocrV4";

describe("v4 OCR decisions", () => {
  it("uses sequence-sensitive matching for bow and sword labels", () => {
    const correct = weightedTextSimilarity("剑专精最终伤害", "剑专精最终伤害");
    const wrongWeapon = weightedTextSimilarity("剑专精最终伤害", "弓专精最终伤害");
    const wrongOrder = weightedTextSimilarity("剑最终专精伤害", "剑专精最终伤害");

    expect(correct).toBe(1);
    expect(wrongWeapon).toBeLessThan(correct - 0.15);
    expect(wrongOrder).toBeLessThan(correct);
  });

  it("does not force unknown vanilla text into a combat stat", () => {
    const result = resolveStatV4([
      { text: "『方块交互距离』 +0.36", confidence: 0.93, source: "tesseract" },
    ]);

    expect(result.value).toBe("vanilla");
    expect(result.state).toBe("accepted");
  });

  it("flags a damaged combat label instead of silently choosing", () => {
    const result = resolveStatV4([
      { text: "『专伤倍』 +0.02", confidence: 0.42, source: "tesseract" },
    ]);

    expect(result.state).toBe("needs-review");
  });

  it("keeps a strong pixel template candidate but requires review when text evidence conflicts", () => {
    const result = resolveStatV4([
      { text: "『削颧外佯害』 +6.23", confidence: 0.61, source: "tesseract" },
    ], [
      { value: "swordExtraDamage", source: "template", score: 1, rawText: "『剑额外伤害』" },
    ]);

    expect(result.value).toBe("swordExtraDamage");
    expect(result.state).toBe("needs-review");
    expect(result.reasons.join(" ")).toContain("未达成一致");
  });

  it("marks a bow or sword tie for review instead of accepting it as vanilla", () => {
    const result = resolveStatV4([
      { text: "[吉额外伤害] +6.68", confidence: 0.9, source: "tesseract" },
    ]);

    expect(result.value).toBe("bowExtraDamage");
    expect(result.state).toBe("needs-review");
    expect(result.candidates.slice(0, 2).map((candidate) => candidate.value)).toEqual([
      "bowExtraDamage",
      "swordExtraDamage",
    ]);
  });

  it("does not divide an out-of-range OCR value to make it fit", () => {
    const result = resolveNumericV4([
      { text: "+152", confidence: 0.91, source: "tesseract" },
    ], "bowFinalDamage");

    expect(result.value).toBe(152);
    expect(result.state).toBe("needs-review");
    expect(result.reasons.join(" ")).toContain("经验范围");
  });

  it("flags a numeric conflict between glyph and Tesseract evidence", () => {
    const result = resolveNumericV4([
      { text: "+0.31", confidence: 0.94, source: "tesseract" },
    ], "vanilla", [
      { value: 0.21, source: "template", score: 1, rawText: "+0.21" },
    ]);

    expect(result.value).toBe(0.21);
    expect(result.state).toBe("needs-review");
    expect(result.reasons.join(" ")).toContain("不一致");
  });

  it("accepts a high-confidence numeric template when Tesseract only supplies weak noise", () => {
    const result = resolveNumericV4([
      { text: "+60", confidence: 0.31, source: "tesseract" },
    ], "bowFinalDamage", [
      { value: 1.58, source: "template", score: 0.79, rawText: "+1.58" },
    ]);

    expect(result.value).toBe(1.58);
    expect(result.state).toBe("accepted");
  });

  it("keeps a low-confidence numeric template in review", () => {
    const result = resolveNumericV4([
      { text: "+0", confidence: 0.48, source: "tesseract" },
    ], "damageReduction", [
      { value: 0.93, source: "template", score: 0.67, rawText: "+0.93" },
    ]);

    expect(result.value).toBe(0.93);
    expect(result.state).toBe("needs-review");
  });

  it("uses affix count only as a reviewable minimum level", () => {
    const result = resolveLevelV4([], "divine", 4);

    expect(result.value).toBe(8);
    expect(result.state).toBe("needs-review");
    expect(result.reasons.join(" ")).toContain("标题末尾绿色等级");
  });

  it("shows the minimum level when title OCR conflicts, while keeping review state", () => {
    const result = resolveLevelV4([
      { text: "神铸护身符『主护符』 +5", confidence: 0.9, source: "tesseract" },
    ], "divine", 4);

    expect(result.value).toBe(8);
    expect(result.state).toBe("needs-review");
  });
});

describe("Minecraft 1.21.8 glyph templates", () => {
  it("recognizes all numeric value characters from the generated font", () => {
    const result = recognizeMinecraftNumber(renderTextMask("+8.50"));

    expect(result?.text).toBe("+8.50");
    expect(result?.score).toBeGreaterThan(0.9);
  });

  it("discards an unmatched trailing percent glyph without adding it to the value alphabet", () => {
    const result = recognizeMinecraftNumber(renderTextMask("+1.97%"));

    expect(result?.text).toBe("+1.97");
  });

  it("ranks the matching combat label first", () => {
    const results = matchMinecraftStatTemplates(renderTextMask("『剑专精最终伤害』"));

    expect(results[0].value).toBe("swordFinalDamage");
    expect(results[0].score).toBeGreaterThan(0.85);
  });
});

describe("v4 font profile routing", () => {
  it("detects a Minecraft purple tooltip profile", () => {
    const result = classifyProfileMetrics({
      purpleBackgroundRatio: 0.18,
      antialiasRatio: 0.08,
      coloredTextRatio: 0.42,
    });

    expect(result.profile).toBe("minecraft-1.21.8");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("detects an antialiased ModernUI profile", () => {
    const result = classifyProfileMetrics({
      purpleBackgroundRatio: 0.01,
      antialiasRatio: 0.58,
      coloredTextRatio: 0.22,
    });

    expect(result.profile).toBe("modernui-source-han");
  });

  it("routes ambiguous metrics to both profiles", () => {
    const result = classifyProfileMetrics({
      purpleBackgroundRatio: 0.03,
      antialiasRatio: 0.09,
      coloredTextRatio: 0.18,
    });

    expect(result.profile).toBe("unknown");
  });
});
