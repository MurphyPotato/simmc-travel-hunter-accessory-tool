import { DisplayStat } from "./domain";
import { V4BenchmarkCase } from "./ocrV4BenchmarkData";
import { OcrFieldResult, ParsedAccessoryV4 } from "./ocrV4Types";

export type BenchmarkFieldKind = "name" | "quality" | "slot" | "level" | "stat" | "value";

export interface V4BenchmarkFieldOutcome {
  kind: BenchmarkFieldKind;
  index?: number;
  expected: string | number;
  actual: string | number;
  state: OcrFieldResult<unknown>["state"];
  correct: boolean;
  silentError: boolean;
}

export interface V4BenchmarkOutcome {
  fileName: string;
  collection: V4BenchmarkCase["collection"];
  split: V4BenchmarkCase["split"];
  expectedAccessory: boolean;
  profileCorrect: boolean;
  falsePositive: boolean;
  fields: V4BenchmarkFieldOutcome[];
  parsed: ParsedAccessoryV4;
}

export interface V4BenchmarkMetrics {
  cases: number;
  accessoryCases: number;
  negativeCases: number;
  profileAccuracy: number;
  titleAccuracy: number;
  knownStatAccuracy: number;
  valueAccuracy: number;
  autoAcceptRate: number;
  reviewRate: number;
  silentErrorRate: number;
  falsePositiveCount: number;
  correctFields: number;
  reviewedFields: number;
  silentErrors: number;
  totalFields: number;
}

export function evaluateV4BenchmarkCase(
  benchmark: V4BenchmarkCase,
  parsed: ParsedAccessoryV4,
): V4BenchmarkOutcome {
  if (!benchmark.expected) {
    const coreFields = [parsed.fields.name, parsed.fields.quality, parsed.fields.slot, parsed.fields.level];
    const falsePositive = parsed.accessory.affixes.length > 0 || coreFields.every((field) => field.state === "accepted");
    return {
      fileName: benchmark.fileName,
      collection: benchmark.collection,
      split: benchmark.split,
      expectedAccessory: false,
      profileCorrect: parsed.profile === benchmark.profile,
      falsePositive,
      fields: [],
      parsed,
    };
  }

  const fields: V4BenchmarkFieldOutcome[] = [
    field("name", benchmark.expected.name, parsed.accessory.name ?? "", parsed.fields.name, sameTitle),
    field("quality", benchmark.expected.quality, parsed.accessory.quality, parsed.fields.quality),
    field("slot", benchmark.expected.slot, parsed.accessory.slot, parsed.fields.slot),
    field("level", benchmark.expected.level, parsed.accessory.level, parsed.fields.level),
  ];

  const expectedAffixes = benchmark.expected.affixes;
  const actualAffixes = parsed.accessory.affixes;
  const affixFields = parsed.fields.affixes;
  const count = Math.max(expectedAffixes.length, actualAffixes.length);
  for (let index = 0; index < count; index += 1) {
    const expected = expectedAffixes[index];
    const actual = actualAffixes[index];
    const reviews = affixFields[index];
    const missingReview = missingField();
    fields.push(field(
      "stat",
      expected?.stat ?? "<missing>",
      actual?.stat ?? "<missing>",
      reviews?.stat ?? missingReview,
      sameStat,
      index,
    ));
    fields.push(field(
      "value",
      expected?.value ?? Number.NaN,
      actual?.value ?? Number.NaN,
      reviews?.value ?? missingReview,
      sameNumber,
      index,
    ));
  }

  return {
    fileName: benchmark.fileName,
    collection: benchmark.collection,
    split: benchmark.split,
    expectedAccessory: true,
    profileCorrect: parsed.profile === benchmark.profile,
    falsePositive: false,
    fields,
    parsed,
  };
}

export function summarizeV4Benchmark(outcomes: V4BenchmarkOutcome[]): V4BenchmarkMetrics {
  const fields = outcomes.flatMap((outcome) => outcome.fields);
  const titleFields = fields.filter((field) => field.kind === "name" || field.kind === "quality" || field.kind === "slot" || field.kind === "level");
  const knownStats = fields.filter((field) => field.kind === "stat" && field.expected !== "vanilla");
  const values = fields.filter((field) => field.kind === "value");
  const accepted = fields.filter((field) => field.state === "accepted");
  const reviewed = fields.filter((field) => field.state === "needs-review");
  const silentErrors = accepted.filter((field) => !field.correct);
  const accessoryCases = outcomes.filter((outcome) => outcome.expectedAccessory).length;
  const negativeCases = outcomes.length - accessoryCases;
  return {
    cases: outcomes.length,
    accessoryCases,
    negativeCases,
    profileAccuracy: ratio(
      outcomes.filter((outcome) => outcome.expectedAccessory && outcome.profileCorrect).length,
      accessoryCases,
    ),
    titleAccuracy: accuracy(titleFields),
    knownStatAccuracy: accuracy(knownStats),
    valueAccuracy: accuracy(values),
    autoAcceptRate: ratio(accepted.length, fields.length),
    reviewRate: ratio(reviewed.length, fields.length),
    silentErrorRate: ratio(silentErrors.length, accepted.length),
    falsePositiveCount: outcomes.filter((outcome) => outcome.falsePositive).length,
    correctFields: fields.filter((field) => field.correct).length,
    reviewedFields: reviewed.length,
    silentErrors: silentErrors.length,
    totalFields: fields.length,
  };
}

function field<T>(
  kind: BenchmarkFieldKind,
  expected: T,
  actual: T,
  review: OcrFieldResult<T>,
  compare: (left: T, right: T) => boolean = Object.is,
  index?: number,
): V4BenchmarkFieldOutcome {
  const correct = compare(expected, actual);
  return {
    kind,
    index,
    expected: printable(expected),
    actual: printable(actual),
    state: review.state,
    correct,
    silentError: review.state === "accepted" && !correct,
  };
}

function missingField<T>(): OcrFieldResult<T> {
  return { value: undefined as T, state: "needs-review", confidence: 0, candidates: [], reasons: ["字段缺失"] };
}

function sameTitle(left: string, right: string): boolean {
  return normalizeTitle(left) === normalizeTitle(right);
}

function normalizeTitle(value: string): string {
  return value.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").replace(/护符/g, "护身符");
}

function sameStat(left: DisplayStat | "<missing>", right: DisplayStat | "<missing>"): boolean {
  return left === right;
}

function sameNumber(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.000001;
}

function printable(value: unknown): string | number {
  if (typeof value === "number") return Number.isFinite(value) ? value : "<missing>";
  return String(value);
}

function accuracy(fields: V4BenchmarkFieldOutcome[]): number {
  return ratio(fields.filter((field) => field.correct).length, fields.length);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
