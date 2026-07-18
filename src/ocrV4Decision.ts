import {
  AccessoryQuality,
  AccessorySlot,
  DisplayStat,
  maxLevelByQuality,
  qualityLabels,
  slotLabels,
  validateAffixValue,
} from "./domain";
import { OcrCandidate, OcrFieldResult } from "./ocrV4Types";

export interface TextObservation {
  text: string;
  confidence: number;
  source: "tesseract" | "template";
}

export const V4_STAT_ALIASES: Record<DisplayStat, string[]> = {
  hunterDamageMultiplier: ["旅猎伤害加成倍率", "旅猎伤害倍率", "旅猎倍率"],
  hunterCritChance: ["旅猎暴击概率", "旅猎暴击率", "暴击率"],
  hunterCritDamage: ["旅猎暴击效果", "旅猎爆伤", "爆伤"],
  bowMasteryMultiplier: ["弓专精伤害倍率加成", "弓专精伤害倍率"],
  swordMasteryMultiplier: ["剑专精伤害倍率加成", "剑专精伤害倍率"],
  bowFinalDamage: ["弓专精最终伤害加成", "弓专精最终伤害"],
  swordFinalDamage: ["剑专精最终伤害加成", "剑专精最终伤害"],
  bowExtraDamage: ["弓额外伤害加成", "弓额外伤害"],
  swordExtraDamage: ["剑额外伤害加成", "剑额外伤害"],
  damageReduction: ["百分比伤害减免", "伤害减免"],
  sneakSpeed: ["潜行速度"],
  vanilla: ["原版其他词条"],
};

const qualityAliases: Record<AccessoryQuality, string[]> = {
  dim: ["黯淡", "暗淡"],
  fine: ["精工"],
  divine: ["神铸", "神锻", "神鑄"],
};

const slotAliases: Record<AccessorySlot, string[]> = {
  mainRing: ["主戒指", "主戒"],
  subRing: ["副戒指", "副戒"],
  mainAmulet: ["主护符", "主护身符", "主护"],
  subAmulet: ["副护符", "副护身符", "副护"],
};

const combatAnchors = /旅|猎|暴|击|伤|害|专|精|倍|率|最终|额外|减免/;
const numericConfusions: Array<[RegExp, string]> = [
  [/[Zz]/g, "2"],
  [/[Oo。日旦百出]/g, "0"],
  [/[IiLl小]/g, "1"],
  [/[己巳已二]/g, "2"],
  [/[吉古]/g, "8"],
  [/[匕口]/g, "6"],
];

export function resolveStatV4(
  observations: TextObservation[],
  templateCandidates: OcrCandidate<DisplayStat>[] = [],
): OcrFieldResult<DisplayStat> {
  const dictionaryCandidates: OcrCandidate<DisplayStat>[] = [];
  let normalizedRaw = "";
  for (const observation of observations) {
    const raw = extractLabelV4(observation.text);
    normalizedRaw ||= normalizeLabelV4(raw);
    for (const [stat, aliases] of Object.entries(V4_STAT_ALIASES) as Array<[DisplayStat, string[]]>) {
      if (stat === "vanilla") continue;
      const similarity = Math.max(...aliases.map((alias) => weightedTextSimilarity(raw, alias)));
      dictionaryCandidates.push({
        value: stat,
        source: "dictionary",
        score: clamp(similarity * 0.78 + observation.confidence * 0.22),
        rawText: observation.text,
      });
    }
  }

  const merged = mergeIndependentCandidates([...templateCandidates, ...dictionaryCandidates]);
  const best = merged[0];
  const second = merged.find((candidate) => candidate.value !== best?.value);
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  const looksCombatRelated = combatAnchors.test(normalizedRaw);
  const hasTemplateSupport = templateCandidates.some(
    (candidate) => candidate.value === best?.value && candidate.score >= 0.78,
  );
  const hasDictionarySupport = dictionaryCandidates.some(
    (candidate) => candidate.value === best?.value && candidate.score >= 0.67,
  );
  const accepted = Boolean(
    best &&
    best.score >= (hasTemplateSupport ? 0.78 : 0.84) &&
    margin >= (hasTemplateSupport ? 0.06 : 0.1) &&
    (!hasTemplateSupport || (hasDictionarySupport && looksCombatRelated)),
  );

  if (accepted && best) {
    return fieldResult(best.value, "accepted", best.score, merged, []);
  }

  const recognizableCombat = /(?:旅猎.*(?:伤害|暴击)|(?:弓|剑).*(?:专精|额外)|百分比伤害减免|潜行速度|专.*伤.*倍)/.test(normalizedRaw);
  const damagedKnownLabel = looksCombatRelated && (best?.score ?? 0) >= 0.7;
  const shouldKeepReviewableCandidate = recognizableCombat || damagedKnownLabel || hasTemplateSupport;
  if (best && shouldKeepReviewableCandidate && best.score >= 0.5) {
    const evidenceConflict = hasTemplateSupport && !hasDictionarySupport;
    return fieldResult(best.value, "needs-review", best.score, merged, [
      evidenceConflict
        ? "像素字模候选与 Tesseract/词典证据未达成一致"
        : `词条候选分差不足（${formatScore(margin)}）`,
      "保留最高候选但要求人工复核",
    ]);
  }
  const fallbackState = recognizableCombat ? "needs-review" : "accepted";
  const reasons = fallbackState === "needs-review"
    ? [
        !best ? "没有可用的词条候选" : `词条候选分差不足（${formatScore(margin)}）`,
        "未强制映射为战斗词条，请核对",
      ]
    : ["未命中战斗词条，按原版/其他词条保留"];
  return fieldResult("vanilla", fallbackState, best?.score ?? 0, merged, reasons);
}

export function resolveQualityV4(observations: TextObservation[]): OcrFieldResult<AccessoryQuality> {
  return resolveClosedTextField(observations, qualityAliases, "fine", "品质");
}

export function resolveSlotV4(observations: TextObservation[]): OcrFieldResult<AccessorySlot> {
  return resolveClosedTextField(observations, slotAliases, "mainRing", "部位");
}

export function resolveNameV4(
  observations: TextObservation[],
  quality?: OcrFieldResult<AccessoryQuality>,
  slot?: OcrFieldResult<AccessorySlot>,
): OcrFieldResult<string> {
  const ranked = [...observations]
    .map((observation) => {
      const value = cleanupTitleV4(observation.text) || "OCR 饰品";
      const score = clamp(
        observation.confidence * 0.72
        + (/宝石|护身符|护符|戒指|指环/.test(value) ? 0.16 : 0)
        + (/黯淡|暗淡|精工|神铸|神锻/.test(value) ? 0.07 : 0)
        + (/主|副/.test(value) ? 0.05 : 0),
      );
      return {
        value,
        source: observation.source,
        score,
        rawText: observation.text,
      } satisfies OcrCandidate<string>;
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const canonical = quality && slot
    ? `${qualityLabels[quality.value]}${itemNameForSlot(slot.value)}『${slotLabels[slot.value]}』`
    : "";
  const hasTitleNoun = ranked.some((candidate) => /宝石|护身符|护符|戒指|指环/.test(candidate.value));
  const canonicalConfidence = quality && slot && best
    ? clamp(Math.min(quality.confidence, slot.confidence) * 0.68 + best.score * 0.32)
    : 0;
  if (canonical && quality?.state === "accepted" && slot?.state === "accepted" && hasTitleNoun && canonicalConfidence >= 0.76) {
    const candidates: OcrCandidate<string>[] = [
      { value: canonical, source: "constraint", score: canonicalConfidence, rawText: best?.rawText },
      ...ranked.filter((candidate) => candidate.value !== canonical),
    ];
    return fieldResult(canonical, "accepted", canonicalConfidence, candidates, []);
  }
  const hasQualityEvidence = ranked.some((candidate) => /黯淡|暗淡|精工|神铸|神锻/.test(candidate.value));
  if (canonical && (hasTitleNoun || hasQualityEvidence || quality?.state === "accepted")) {
    const candidates: OcrCandidate<string>[] = [
      { value: canonical, source: "constraint", score: canonicalConfidence, rawText: best?.rawText },
      ...ranked.filter((candidate) => candidate.value !== canonical),
    ];
    return fieldResult(canonical, "needs-review", canonicalConfidence, candidates, ["品质或部位仍需复核，名称暂按结构规范化"]);
  }
  const accepted = Boolean(best && best.value !== "OCR 饰品" && best.score >= 0.82 && hasTitleNoun);
  return fieldResult(
    best?.value ?? "OCR 饰品",
    accepted ? "accepted" : "needs-review",
    best?.score ?? 0,
    ranked,
    accepted ? [] : ["标题文字识别置信度不足"],
  );
}

export function resolveLevelV4(
  observations: TextObservation[],
  quality: AccessoryQuality,
  affixCount: number,
  templateCandidates: OcrCandidate<number>[] = [],
): OcrFieldResult<number> {
  const parsedCandidates: OcrCandidate<number>[] = [];
  for (const observation of observations) {
    const match = normalizeOcrTextV4(observation.text).match(/\+\s*([0-9]+)\s*$/);
    if (!match) continue;
    const value = Math.max(0, Math.min(Number(match[1]), maxLevelByQuality[quality]));
    parsedCandidates.push({
      value,
      source: observation.source,
      score: observation.confidence,
      rawText: observation.text,
    });
  }
  const minimum = minimumLevelForAffixCount(quality, affixCount);
  const constraintCandidate: OcrCandidate<number> = {
    value: minimum,
    source: "constraint",
    score: minimum > 0 ? 0.42 : 0.2,
    rawText: `${affixCount} 条词条只能推导最低强化 +${minimum}`,
  };
  const merged = mergeIndependentCandidates([...templateCandidates, ...parsedCandidates, constraintCandidate]);
  const rankedBest = merged[0] ?? constraintCandidate;
  const best = rankedBest.value < minimum ? constraintCandidate : rankedBest;
  const second = merged.find((candidate) => candidate.value !== best.value);
  const margin = best.score - (second?.score ?? 0);
  const conflictsMinimum = rankedBest.value < minimum;
  const hasDirectEvidence = [...templateCandidates, ...parsedCandidates]
    .some((candidate) => candidate.value === best.value && candidate.score >= 0.72);
  const accepted = hasDirectEvidence && margin >= 0.08 && !conflictsMinimum;
  const reasons: string[] = [];
  if (!hasDirectEvidence) reasons.push("没有可靠的标题末尾绿色等级证据");
  if (margin < 0.08) reasons.push("强化等级候选分差不足");
  if (conflictsMinimum) reasons.push(`词条数量要求最低强化 +${minimum}`);
  return fieldResult(best.value, accepted ? "accepted" : "needs-review", best.score, merged, reasons);
}

export function resolveNumericV4(
  observations: TextObservation[],
  stat: DisplayStat,
  templateCandidates: OcrCandidate<number>[] = [],
): OcrFieldResult<number> {
  const tesseractCandidates: OcrCandidate<number>[] = [];
  for (const observation of observations) {
    for (const text of cleanNumericTexts(observation.text)) {
      const value = Number(text.slice(1));
      if (!Number.isFinite(value)) continue;
      tesseractCandidates.push({
        value,
        source: observation.source,
        score: observation.confidence,
        rawText: observation.text,
      });
    }
  }
  const merged = mergeIndependentCandidates([...templateCandidates, ...tesseractCandidates])
    .map((candidate) => ({
      ...candidate,
      score: clamp(candidate.score + (validateAffixValue(stat, candidate.value) ? -0.16 : 0.04)),
    }))
    .sort((left, right) => right.score - left.score);
  const best = merged[0];
  const second = merged.find((candidate) => !sameNumber(candidate.value, best?.value));
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  const valid = Boolean(best && !validateAffixValue(stat, best.value));
  const templateSupport = templateCandidates.some(
    (candidate) => sameNumber(candidate.value, best?.value) && candidate.score >= 0.68,
  );
  const hasTemplateEvidence = templateCandidates.length > 0;
  const credibleTesseractConflict = tesseractCandidates.some(
    (candidate) => !sameNumber(candidate.value, best?.value) && candidate.score >= 0.76,
  );
  const accepted = Boolean(
    best && valid && margin >= 0.08 && (
      hasTemplateEvidence
        ? templateSupport && !credibleTesseractConflict
        : best.score >= 0.9
    ),
  );
  const reasons: string[] = [];
  if (!best) reasons.push("没有识别到合法数值字符");
  if (best && !valid) reasons.push(validateAffixValue(stat, best.value) ?? "数值超出经验范围");
  if (best && margin < 0.08) reasons.push("数值候选分差不足");
  if (best && hasTemplateEvidence && (!templateSupport || credibleTesseractConflict)) {
    reasons.push("字模与 Tesseract 数值证据不一致");
  } else if (best && !hasTemplateEvidence && best.score < 0.9) {
    reasons.push("数值缺少独立识别证据支持");
  }
  return fieldResult(best?.value ?? 0, accepted ? "accepted" : "needs-review", best?.score ?? 0, merged, reasons);
}

export function weightedTextSimilarity(left: string, right: string): number {
  const a = [...normalizeLabelV4(left)];
  const b = [...normalizeLabelV4(right)];
  if (a.length === 0 || b.length === 0) return 0;
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : confusionCost(a[i - 1], b[j - 1]);
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + substitution,
      );
    }
  }
  let score = 1 - rows[a.length][b.length] / Math.max(a.length, b.length);
  const leftPrefix = semanticPrefix(a.join(""));
  const rightPrefix = semanticPrefix(b.join(""));
  if (leftPrefix && rightPrefix && leftPrefix !== rightPrefix) score -= 0.2;
  return clamp(score);
}

export function normalizeLabelV4(text: string): string {
  return normalizeOcrTextV4(text)
    .replace(/[^\u4e00-\u9fa5A-Za-z]/g, "")
    .replace(/[割刽剩剌刻]/g, "剑")
    .replace(/[井开马二]/g, "弓")
    .replace(/前/g, "剑")
    .replace(/[朋砂东旁丽](?=猎)/g, "旅")
    .replace(/[睦裸裳淅](?=行速度)/g, "潜")
    .replace(/^白分比/g, "百分比")
    .replace(/暧击/g, "暴击")
    .replace(/[烨热]果/g, "效果")
    .replace(/任害/g, "伤害")
    .replace(/佯害/g, "伤害")
    .replace(/(?:健儿|裕免|褐克)/g, "减免")
    .replace(/[卒牢宰]/g, "率")
    .replace(/[供信俘]/g, "倍")
    .replace(/[颜额]/g, "额")
    .replace(/绍/g, "终")
    .replace(/兖/g, "免");
}

export function normalizeOcrTextV4(text: string): string {
  return text
    .replace(/[|]/g, "")
    .replace(/[。．·]/g, ".")
    .replace(/[＋十]/g, "+")
    .replace(/[［【「『]/g, "『")
    .replace(/[］】」』]/g, "』")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLabelV4(text: string): string {
  const normalized = normalizeOcrTextV4(text);
  const bracket = normalized.match(/『([^』]+)』/);
  if (bracket) return bracket[1].trim();
  return normalized.replace(/\+\s*\d+(?:\.\d+)?/, "").replace(/[『』]/g, "").trim();
}

export function cleanupTitleV4(text: string): string {
  return normalizeOcrTextV4(text)
    .split(/属性|屡性|属生/, 1)[0]
    .replace(/\s*\+\s*[0-9A-Za-z.]+.*$/, "")
    .replace(/^[^\u4e00-\u9fa5]+/, "")
    .trim();
}

function itemNameForSlot(slot: AccessorySlot): string {
  if (slot === "mainRing") return "戒指";
  if (slot === "subRing") return "指环";
  if (slot === "mainAmulet") return "护身符";
  return "宝石";
}

function resolveClosedTextField<T extends string>(
  observations: TextObservation[],
  aliases: Record<T, string[]>,
  fallback: T,
  label: string,
): OcrFieldResult<T> {
  const candidates: OcrCandidate<T>[] = [];
  for (const observation of observations) {
    const normalizedObservation = normalizeLabelV4(observation.text);
    for (const [value, names] of Object.entries(aliases) as Array<[T, string[]]>) {
      const similarity = Math.max(...names.map((name) => {
        const normalizedName = normalizeLabelV4(name);
        return normalizedObservation.includes(normalizedName)
          ? 1
          : weightedTextSimilarity(observation.text, name);
      }));
      candidates.push({
        value,
        source: "dictionary",
        score: clamp(similarity * 0.78 + observation.confidence * 0.22),
        rawText: observation.text,
      });
    }
  }
  const merged = mergeIndependentCandidates(candidates);
  const best = merged[0];
  const second = merged.find((candidate) => candidate.value !== best?.value);
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  const accepted = Boolean(best && best.score >= 0.78 && margin >= 0.08);
  return fieldResult(
    best?.value ?? fallback,
    accepted ? "accepted" : "needs-review",
    best?.score ?? 0,
    merged,
    accepted ? [] : [`${label}识别分数或候选分差不足`],
  );
}

function cleanNumericTexts(text: string): string[] {
  let normalized = normalizeOcrTextV4(text);
  for (const [pattern, replacement] of numericConfusions) normalized = normalized.replace(pattern, replacement);
  normalized = normalized
    .replace(/[^+0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\+{2,}/g, "+")
    .replace(/^\+\./, "+0.");
  const values = new Set<string>();
  for (const match of normalized.matchAll(/\+\d+(?:\.\d+)?/g)) values.add(match[0]);
  if (values.size === 0) {
    const unsigned = normalized.match(/\d+(?:\.\d+)?/);
    if (unsigned) values.add(`+${unsigned[0]}`);
  }
  return [...values];
}

function mergeIndependentCandidates<T>(candidates: OcrCandidate<T>[]): OcrCandidate<T>[] {
  const groups = new Map<string, OcrCandidate<T>[]>();
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.value);
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }
  return [...groups.values()]
    .map((group) => {
      const strongestBySource = new Map<string, OcrCandidate<T>>();
      for (const candidate of group) {
        const previous = strongestBySource.get(candidate.source);
        if (!previous || candidate.score > previous.score) strongestBySource.set(candidate.source, candidate);
      }
      const evidence = [...strongestBySource.values()].sort((left, right) => right.score - left.score);
      const strongest = evidence[0];
      const support = evidence.slice(1).reduce((sum, candidate) => sum + candidate.score * 0.14, 0);
      return { ...strongest, score: clamp(strongest.score + support) };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function fieldResult<T>(
  value: T,
  state: OcrFieldResult<T>["state"],
  confidence: number,
  candidates: OcrCandidate<T>[],
  reasons: string[],
): OcrFieldResult<T> {
  return {
    value,
    state,
    confidence: clamp(confidence),
    candidates: candidates.slice(0, 2),
    reasons: [...new Set(reasons.filter(Boolean))],
  };
}

function minimumLevelForAffixCount(quality: AccessoryQuality, count: number): number {
  if (quality === "divine" && count >= 4) return 8;
  if ((quality === "divine" || quality === "fine") && count >= 3) return 5;
  if (count >= 2) return 3;
  return 0;
}

function semanticPrefix(text: string): string {
  if (text.startsWith("弓")) return "弓";
  if (text.startsWith("剑")) return "剑";
  if (text.startsWith("旅猎")) return "旅猎";
  if (text.startsWith("百分比")) return "百分比";
  if (text.startsWith("潜行")) return "潜行";
  return "";
}

function confusionCost(left: string, right: string): number {
  const pair = `${left}${right}`;
  if (/^(前剑|剑前|井弓|弓井|开弓|弓开|卒率|率卒|倍供|供倍)$/.test(pair)) return 0.22;
  return 1;
}

function sameNumber(left: number | undefined, right: number | undefined): boolean {
  return left !== undefined && right !== undefined && Math.abs(left - right) < 0.000001;
}

function formatScore(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
