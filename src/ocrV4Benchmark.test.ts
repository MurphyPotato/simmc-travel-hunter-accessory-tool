import { describe, expect, it } from "vitest";
import { evaluateV4BenchmarkCase, summarizeV4Benchmark } from "./ocrV4Benchmark";
import { V4_BENCHMARK_CASES, V4BenchmarkCase } from "./ocrV4BenchmarkData";
import { OcrFieldResult, ParsedAccessoryV4 } from "./ocrV4Types";

describe("v4 OCR benchmark", () => {
  it("contains the complete isolated validation library", () => {
    expect(V4_BENCHMARK_CASES.filter((item) => item.collection === "minecraft-original")).toHaveLength(39);
    expect(V4_BENCHMARK_CASES.filter((item) => item.collection === "modernui")).toHaveLength(8);
    expect(V4_BENCHMARK_CASES.filter((item) => item.expected === null)).toHaveLength(3);
    expect(new Set(V4_BENCHMARK_CASES.map((item) => item.fileName)).size).toBe(47);
  });

  it("counts an accepted wrong value as a silent error", () => {
    const benchmark = simpleCase();
    const parsed = simpleParsed();
    parsed.accessory.affixes[0].value = 1.58;
    parsed.fields.affixes[0].value = accepted(1.58);
    const outcome = evaluateV4BenchmarkCase(benchmark, parsed);
    const metrics = summarizeV4Benchmark([outcome]);

    expect(metrics.silentErrors).toBe(1);
    expect(metrics.silentErrorRate).toBeGreaterThan(0);
  });

  it("does not count a reviewed wrong value as a silent error", () => {
    const benchmark = simpleCase();
    const parsed = simpleParsed();
    parsed.accessory.affixes[0].value = 1.58;
    parsed.fields.affixes[0].value = review(1.58);
    const outcome = evaluateV4BenchmarkCase(benchmark, parsed);
    const metrics = summarizeV4Benchmark([outcome]);

    expect(metrics.silentErrors).toBe(0);
    expect(metrics.reviewedFields).toBe(1);
  });

  it("flags non-tooltip content that looks fully accepted", () => {
    const benchmark: V4BenchmarkCase = {
      ...simpleCase(),
      expected: null,
    };
    const outcome = evaluateV4BenchmarkCase(benchmark, simpleParsed());

    expect(outcome.falsePositive).toBe(true);
  });
});

function simpleCase(): V4BenchmarkCase {
  return {
    fileName: "sample.png",
    collection: "minecraft-original",
    split: "development",
    profile: "minecraft-1.21.8",
    expected: {
      name: "精工宝石『副护符』",
      quality: "fine",
      slot: "subAmulet",
      level: 5,
      affixes: [{ stat: "bowFinalDamage", value: 1.52 }],
    },
  };
}

function simpleParsed(): ParsedAccessoryV4 {
  return {
    profile: "minecraft-1.21.8",
    profileConfidence: 1,
    profileReasons: [],
    diagnostics: [],
    rawText: "",
    warnings: [],
    accessory: {
      id: "sample",
      name: "精工宝石『 副护符 』",
      quality: "fine",
      slot: "subAmulet",
      level: 5,
      source: "ocr",
      affixes: [{ id: "affix", stat: "bowFinalDamage", value: 1.52 }],
    },
    fields: {
      name: accepted("精工宝石『 副护符 』"),
      quality: accepted("fine"),
      slot: accepted("subAmulet"),
      level: accepted(5),
      affixes: [{
        id: "affix",
        stat: accepted("bowFinalDamage"),
        value: accepted(1.52),
        rawLabel: "弓专精最终伤害",
        rawValue: "+1.52",
      }],
    },
  };
}

function accepted<T>(value: T): OcrFieldResult<T> {
  return { value, state: "accepted", confidence: 1, candidates: [], reasons: [] };
}

function review<T>(value: T): OcrFieldResult<T> {
  return { value, state: "needs-review", confidence: 0.5, candidates: [], reasons: ["test"] };
}
