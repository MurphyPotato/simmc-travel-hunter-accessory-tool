import { PSM, Worker } from "tesseract.js";
import { Capacitor } from "@capacitor/core";
import {
  Accessory,
  AccessoryQuality,
  AccessorySlot,
  Affix,
  DisplayStat,
  formatNumber,
  statLabels,
} from "./domain";
import {
  cleanupTitleV4,
  extractLabelV4,
  normalizeOcrTextV4,
  resolveLevelV4,
  resolveNameV4,
  resolveNumericV4,
  resolveQualityV4,
  resolveSlotV4,
  resolveStatV4,
  TextObservation,
} from "./ocrV4Decision";
import {
  BinaryMask,
  matchMinecraftStatTemplates,
  recognizeMinecraftNumber,
  trimMask,
} from "./ocrV4Templates";
import {
  OcrCandidate,
  OcrFieldResult,
  OcrProfile,
  ParsedAccessoryV4,
} from "./ocrV4Types";
import { V4_OCR_IDLE_TIMEOUT_MS, withV4OcrWorker } from "./ocrV4WorkerPool";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface ProfileMetrics {
  purpleBackgroundRatio: number;
  antialiasRatio: number;
  coloredTextRatio: number;
}

export interface V4RecognitionOptions {
  captureTooltipCrop?: boolean;
  manageWorkerLifecycle?: boolean;
}

export interface V4OcrDebugLine {
  index: number;
  y: number;
  kind: OcrLine["kind"];
  labelMask?: string;
  titleNumericMask?: string;
  affixNumericMask?: string;
  textImages: string[];
  titleNumericImages: string[];
  affixNumericImages: string[];
}

export async function debugPrepareAccessoryImageV4(
  image: File | string,
  profile: Exclude<OcrProfile, "unknown"> = "minecraft-1.21.8",
): Promise<V4OcrDebugLine[]> {
  const bitmap = await loadBitmap(image);
  try {
    const prepared = prepareTooltip(bitmap, profile);
    return prepared.lines.map((line, index) => ({
      index,
      y: line.y,
      kind: line.kind,
      labelMask: line.labelMask ? maskToDataUrl(line.labelMask) : undefined,
      titleNumericMask: line.titleNumericMask ? maskToDataUrl(line.titleNumericMask) : undefined,
      affixNumericMask: line.affixNumericMask ? maskToDataUrl(line.affixNumericMask) : undefined,
      textImages: line.textImages,
      titleNumericImages: line.titleNumericImages,
      affixNumericImages: line.affixNumericImages,
    }));
  } finally {
    bitmap.close?.();
  }
}

interface ProfileDetection {
  profile: OcrProfile;
  confidence: number;
  reasons: string[];
  metrics: ProfileMetrics;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropDetection {
  rect: Rect;
  detected: boolean;
  reason?: string;
}

interface OcrObservation {
  text: string;
  confidence: number;
}

interface OcrLine {
  kind: "title" | "affix" | "other";
  text: OcrObservation[];
  numeric: OcrObservation[];
  labelMask?: BinaryMask;
  numericMask?: BinaryMask;
  titleNumeric?: OcrObservation[];
  affixNumeric?: OcrObservation[];
  titleNumericMask?: BinaryMask;
  affixNumericMask?: BinaryMask;
  y: number;
}

interface PreparedLine {
  kind: OcrLine["kind"];
  textImages: string[];
  titleNumericImages: string[];
  affixNumericImages: string[];
  labelMask?: BinaryMask;
  titleNumericMask?: BinaryMask;
  affixNumericMask?: BinaryMask;
  y: number;
}

interface PreparedTooltip {
  profile: Exclude<OcrProfile, "unknown">;
  lines: PreparedLine[];
  fallbackImages: string[];
  captureTooltipCrop: boolean;
  tooltipImageUrl?: string;
  tooltipCropReason?: string;
}

const OCR_VALUE_CHARS = "+0123456789.";

export async function recognizeAccessoryImageV4(
  image: File | string,
  onProgress?: (progress: OcrProgress) => void,
  forcedProfile?: Exclude<OcrProfile, "unknown">,
  options: V4RecognitionOptions = {},
): Promise<ParsedAccessoryV4> {
  const bitmap = await loadBitmap(image);
  let detection: ProfileDetection;
  let prepared: PreparedTooltip[];
  try {
    detection = forcedProfile
      ? {
          profile: forcedProfile,
          confidence: 1,
          reasons: ["使用玩家手动指定的字体配置"],
          metrics: measureProfileMetrics(bitmap),
        }
      : detectOcrProfile(bitmap);
    const profiles: Array<Exclude<OcrProfile, "unknown">> = detection.profile === "unknown"
      ? ["minecraft-1.21.8", "modernui-source-han"]
      : [detection.profile];
    prepared = profiles.map((profile) => prepareTooltip(bitmap, profile, options.captureTooltipCrop === true));
  } finally {
    bitmap.close?.();
  }

  const isNativePlatform = Capacitor.isNativePlatform();
  const ocrBasePath = isNativePlatform ? "./ocr" : "/ocr";
  return withV4OcrWorker(
    {
      workerPath: `${ocrBasePath}/worker.min.js`,
      corePath: `${ocrBasePath}/core`,
      langPath: `${ocrBasePath}/lang`,
      gzip: !isNativePlatform,
    },
    onProgress,
    async (worker) => {
      const results: ParsedAccessoryV4[] = [];
      for (let index = 0; index < prepared.length; index += 1) {
        const profileProgressStart = index / prepared.length;
        const profileProgressSize = 1 / prepared.length;
        const result = await recognizePreparedTooltip(worker, prepared[index], (progress) => {
          onProgress?.({
            status: progress.status,
            progress: profileProgressStart + progress.progress * profileProgressSize,
          });
        });
        results.push(result);
      }
      return chooseProfileResult(results, detection);
    },
    options.manageWorkerLifecycle
      ? { discardOnError: true, idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS }
      : {},
  );
}

export function classifyProfileMetrics(metrics: ProfileMetrics): ProfileDetection {
  const reasons: string[] = [];
  if (metrics.purpleBackgroundRatio >= 0.075) {
    const confidence = clamp(0.72 + metrics.purpleBackgroundRatio * 1.8);
    reasons.push(`检测到原版 tooltip 紫色背景 ${formatPercent(metrics.purpleBackgroundRatio)}`);
    return { profile: "minecraft-1.21.8", confidence, reasons, metrics };
  }
  if (metrics.antialiasRatio >= 0.11 && metrics.purpleBackgroundRatio < 0.045) {
    const confidence = clamp(0.68 + metrics.antialiasRatio * 0.65);
    reasons.push(`检测到抗锯齿文字边缘 ${formatPercent(metrics.antialiasRatio)}`);
    return { profile: "modernui-source-han", confidence, reasons, metrics };
  }
  reasons.push("字体特征不明确，将同时运行原版字体和 ModernUI 配置");
  return { profile: "unknown", confidence: 0.45, reasons, metrics };
}

function detectOcrProfile(bitmap: ImageBitmap): ProfileDetection {
  return classifyProfileMetrics(measureProfileMetrics(bitmap));
}

function measureProfileMetrics(bitmap: ImageBitmap): ProfileMetrics {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { purpleBackgroundRatio: 0, antialiasRatio: 0, coloredTextRatio: 0 };
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sampled = 0;
  let purple = 0;
  let antialiased = 0;
  let colored = 0;
  let textLike = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const offset = (y * canvas.width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      sampled += 1;
      if (isTooltipBackground(r, g, b)) purple += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const brightness = (r + g + b) / 3;
      if (brightness >= 55 && brightness <= 245) {
        textLike += 1;
        if (saturation < 28) antialiased += 1;
        if (saturation > 45 && brightness > 105) colored += 1;
      }
    }
  }
  return {
    purpleBackgroundRatio: purple / Math.max(sampled, 1),
    antialiasRatio: antialiased / Math.max(textLike, 1),
    coloredTextRatio: colored / Math.max(textLike, 1),
  };
}

async function recognizePreparedTooltip(
  worker: Worker,
  prepared: PreparedTooltip,
  onProgress?: (progress: OcrProgress) => void,
): Promise<ParsedAccessoryV4> {
  const textPsm = prepared.profile === "modernui-source-han" ? PSM.RAW_LINE : PSM.SINGLE_LINE;
  await worker.setParameters({
    tessedit_pageseg_mode: textPsm,
    tessedit_char_whitelist: "",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  const lines: OcrLine[] = [];
  for (let lineIndex = 0; lineIndex < prepared.lines.length; lineIndex += 1) {
    const line = prepared.lines[lineIndex];
    const text = await recognizeVariants(worker, line.textImages);
    let titleNumeric: OcrObservation[] = [];
    let affixNumeric: OcrObservation[] = [];
    if (line.titleNumericImages.length > 0 || line.affixNumericImages.length > 0) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
        tessedit_char_whitelist: OCR_VALUE_CHARS,
        preserve_interword_spaces: "0",
      });
      titleNumeric = await recognizeVariants(worker, line.titleNumericImages);
      affixNumeric = await recognizeVariants(worker, line.affixNumericImages);
      await worker.setParameters({
        tessedit_pageseg_mode: textPsm,
        tessedit_char_whitelist: "",
        preserve_interword_spaces: "1",
      });
    }
    lines.push({
      kind: line.kind,
      text,
      numeric: [],
      labelMask: line.labelMask,
      titleNumeric,
      affixNumeric,
      titleNumericMask: line.titleNumericMask,
      affixNumericMask: line.affixNumericMask,
      y: line.y,
    });
    onProgress?.({ status: `${profileLabel(prepared.profile)}逐行识别`, progress: (lineIndex + 1) / Math.max(prepared.lines.length, 1) });
  }

  const semanticLines = reclassifyRecognizedLines(lines);
  let parsed = parseStructuredLinesV4(semanticLines, prepared.profile);
  if (parsed.accessory.affixes.length === 0 || parsed.fields.name.value === "OCR 饰品") {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: "",
      preserve_interword_spaces: "1",
    });
    const fallback = await recognizeVariants(worker, prepared.fallbackImages);
    const fallbackParsed = parseFallbackObservations(fallback, prepared.profile);
    const fallbackHasMoreStructure = fallbackParsed.accessory.affixes.length > parsed.accessory.affixes.length;
    const sameStructureAndBetter = fallbackParsed.accessory.affixes.length === parsed.accessory.affixes.length
      && qualityScore(fallbackParsed) > qualityScore(parsed);
    if (fallbackHasMoreStructure || sameStructureAndBetter) {
      fallbackParsed.diagnostics = ["整块 OCR 兜底被采用", ...parsed.diagnostics, ...fallbackParsed.diagnostics];
      parsed = fallbackParsed;
    }
  }
  parsed.tooltipImageUrl = prepared.tooltipImageUrl;
  parsed.tooltipCropReason = prepared.tooltipCropReason;
  if (prepared.captureTooltipCrop && !prepared.tooltipImageUrl) {
    parsed.warnings = [...new Set([
      ...parsed.warnings,
      prepared.tooltipCropReason ?? "未找到可靠的 tooltip 边界，完整截图不会被保存",
    ])];
  }
  return parsed;
}

async function recognizeVariants(worker: Worker, images: string[]): Promise<OcrObservation[]> {
  const observations: OcrObservation[] = [];
  for (const image of images.filter(Boolean)) {
    const result = await worker.recognize(image);
    const text = normalizeOcrTextV4(result.data.text);
    if (!text) continue;
    observations.push({ text, confidence: pageConfidence(result.data) });
  }
  return observations;
}

function pageConfidence(page: { confidence: number; blocks: any[] | null }): number {
  const pageScore = clamp((page.confidence ?? 0) / 100);
  const wordScores: number[] = [];
  const symbolScores: number[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          wordScores.push(clamp((word.confidence ?? 0) / 100));
          for (const symbol of word.symbols ?? []) symbolScores.push(clamp((symbol.confidence ?? 0) / 100));
        }
      }
    }
  }
  return clamp(pageScore * 0.55 + percentile(wordScores, 0.25, pageScore) * 0.3 + percentile(symbolScores, 0.2, pageScore) * 0.15);
}

function parseStructuredLinesV4(
  lines: OcrLine[],
  profile: Exclude<OcrProfile, "unknown">,
): ParsedAccessoryV4 {
  const sorted = [...lines].sort((left, right) => left.y - right.y);
  const title = sorted.find((line) => line.kind === "title") ?? sorted[0];
  const titleObservations = toTextObservations(title?.text ?? []);
  const quality = resolveQualityV4(titleObservations);
  const slot = resolveSlotV4(titleObservations);
  const name = resolveNameV4(titleObservations, quality, slot);
  const affixLines = sorted.filter((line) => line.kind === "affix");
  const affixResults = affixLines.map((line) => parseAffixLineV4(line, profile));
  const affixes = affixResults.map(({ affix }) => affix);

  const levelTemplate = profile === "minecraft-1.21.8" && title?.numericMask
    ? numericTemplateCandidate(title.numericMask)
    : [];
  const level = resolveLevelV4(titleObservations, quality.value, affixes.length, levelTemplate);
  const rawText = sorted
    .map((line) => [...line.text, ...line.numeric].map((item) => item.text).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
  const warnings = [
    ...fieldWarnings("名称", name),
    ...fieldWarnings("品质", quality),
    ...fieldWarnings("部位", slot),
    ...fieldWarnings("强化等级", level),
    ...affixResults.flatMap((result, index) => [
      ...fieldWarnings(`第 ${index + 1} 条词条`, result.fields.stat),
      ...fieldWarnings(`第 ${index + 1} 条数值`, result.fields.value),
    ]),
  ];

  return {
    profile,
    profileConfidence: 0.75,
    profileReasons: [],
    diagnostics: sorted.map((line, index) => (
      `line ${index} ${line.kind}: text=${line.text.map((item) => item.text).join(" || ")} numeric=${line.numeric.map((item) => item.text).join(" || ")}`
    )),
    rawText,
    warnings: [...new Set(warnings)],
    accessory: {
      id: cryptoSafeId(),
      name: name.value,
      quality: quality.value,
      slot: slot.value,
      level: level.value,
      affixes,
      source: "ocr",
    },
    fields: {
      name,
      quality,
      slot,
      level,
      affixes: affixResults.map((result) => result.fields),
    },
  };
}

function parseAffixLineV4(
  line: OcrLine,
  profile: Exclude<OcrProfile, "unknown">,
): { affix: Affix; fields: ParsedAccessoryV4["fields"]["affixes"][number] } {
  const textObservations = toTextObservations(line.text);
  const templateStats = profile === "minecraft-1.21.8" && line.labelMask
    ? matchMinecraftStatTemplates(line.labelMask)
    : [];
  const stat = resolveStatV4(textObservations, templateStats);
  const numericObservations = [
    ...toTextObservations(line.numeric),
    ...toTextObservations(line.text).map((observation) => ({
      ...observation,
      confidence: observation.confidence * 0.55,
    })),
  ];
  const templateValues = profile === "minecraft-1.21.8" && line.numericMask
    ? numericTemplateCandidate(line.numericMask)
    : [];
  const value = resolveNumericV4(numericObservations, stat.value, templateValues);
  const rawLabel = extractLabelV4(bestObservationText(line.text));
  const rawValue = bestObservationText(line.numeric);
  const reasons = [...stat.reasons, ...value.reasons];
  return {
    affix: {
      id: cryptoSafeId(),
      stat: stat.value,
      value: value.value,
      label: rawLabel || statLabels[stat.value],
      confidence: reasons.length ? "low" : "high",
      warning: reasons.join("；") || undefined,
    },
    fields: {
      id: cryptoSafeId(),
      stat,
      value,
      rawLabel,
      rawValue,
    },
  };
}

function numericTemplateCandidate(mask: BinaryMask): OcrCandidate<number>[] {
  const match = recognizeMinecraftNumber(mask);
  if (!match) return [];
  const value = Number(match.text.replace(/^\+/, ""));
  if (!Number.isFinite(value)) return [];
  return [{ value, source: "template", score: match.score, rawText: match.text }];
}

function parseFallbackObservations(
  observations: OcrObservation[],
  profile: Exclude<OcrProfile, "unknown">,
): ParsedAccessoryV4 {
  const best = [...observations].sort((left, right) => right.confidence - left.confidence)[0];
  const textLines = (best?.text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleIndex = textLines.findIndex(isLikelyTitleLine);
  const title = titleIndex >= 0 ? titleIndex : 0;
  const lines: OcrLine[] = textLines.map((text, index) => ({
    kind: index === title ? "title" : /\+\s*\d/.test(text) ? "affix" : "other",
    text: [{ text, confidence: best?.confidence ?? 0.35 }],
    numeric: /\+\s*\d/.test(text) ? [{ text, confidence: best?.confidence ?? 0.35 }] : [],
    y: index,
  }));
  return parseStructuredLinesV4(lines, profile);
}

function chooseProfileResult(results: ParsedAccessoryV4[], detection: ProfileDetection): ParsedAccessoryV4 {
  const ranked = [...results].sort((left, right) => qualityScore(right) - qualityScore(left));
  const chosen = ranked[0];
  const alternate = ranked[1];
  chosen.profileConfidence = detection.profile === "unknown"
    ? clamp(0.5 + Math.max(0, qualityScore(chosen) - qualityScore(alternate)) * 0.25)
    : detection.confidence;
  chosen.profileReasons = [...detection.reasons];
  if (alternate) markProfileConflicts(chosen, alternate);
  if (detection.profile === "unknown") {
    chosen.profileReasons.push(`双配置比较后采用${profileLabel(chosen.profile)}`);
  }
  return chosen;
}

function markProfileConflicts(chosen: ParsedAccessoryV4, alternate: ParsedAccessoryV4) {
  if (chosen.fields.quality.value !== alternate.fields.quality.value) {
    markNeedsReview(chosen.fields.quality, "原版字体与 ModernUI 的品质结果冲突");
  }
  if (chosen.fields.slot.value !== alternate.fields.slot.value) {
    markNeedsReview(chosen.fields.slot, "原版字体与 ModernUI 的部位结果冲突");
  }
  if (chosen.fields.level.value !== alternate.fields.level.value) {
    markNeedsReview(chosen.fields.level, "原版字体与 ModernUI 的强化等级结果冲突");
  }
  if (chosen.fields.affixes.length !== alternate.fields.affixes.length) {
    chosen.warnings.push("原版字体与 ModernUI 识别出的词条数量不同");
    chosen.fields.affixes.forEach((affix) => {
      markNeedsReview(affix.stat, "字体配置之间的词条数量冲突");
      markNeedsReview(affix.value, "字体配置之间的词条数量冲突");
    });
    return;
  }
  chosen.fields.affixes.forEach((affix, index) => {
    const other = alternate.fields.affixes[index];
    if (affix.stat.value !== other.stat.value) markNeedsReview(affix.stat, "字体配置之间的词条结果冲突");
    if (Math.abs(affix.value.value - other.value.value) > 0.000001) {
      markNeedsReview(affix.value, "字体配置之间的数值结果冲突");
    }
  });
  chosen.warnings = [...new Set([
    ...chosen.warnings,
    ...fieldWarnings("品质", chosen.fields.quality),
    ...fieldWarnings("部位", chosen.fields.slot),
    ...fieldWarnings("强化等级", chosen.fields.level),
  ])];
}

function markNeedsReview<T>(field: OcrFieldResult<T>, reason: string) {
  field.state = "needs-review";
  field.reasons = [...new Set([...field.reasons, reason])];
}

function qualityScore(parsed: ParsedAccessoryV4 | undefined): number {
  if (!parsed) return 0;
  const fields: Array<OcrFieldResult<unknown>> = [
    parsed.fields.name,
    parsed.fields.quality,
    parsed.fields.slot,
    parsed.fields.level,
    ...parsed.fields.affixes.flatMap((affix) => [affix.stat, affix.value]),
  ];
  const accepted = fields.filter((field) => field.state === "accepted").length;
  const confidence = fields.reduce((sum, field) => sum + field.confidence, 0) / Math.max(fields.length, 1);
  return accepted / Math.max(fields.length, 1) * 0.7 + confidence * 0.2 + Math.min(parsed.accessory.affixes.length, 4) * 0.025;
}

function prepareTooltip(
  bitmap: ImageBitmap,
  profile: Exclude<OcrProfile, "unknown">,
  captureTooltipCrop = false,
): PreparedTooltip {
  const cropDetection = profile === "minecraft-1.21.8"
    ? findMinecraftTooltipCrop(bitmap)
    : findModernContentCrop(bitmap);
  const crop = cropDetection.rect;
  const scale = profile === "minecraft-1.21.8" ? 3 : 2;
  const working = renderWorkingCanvas(bitmap, crop, scale, profile);
  const lineRects = findTextLineRects(working, profile);
  const persistentCrop = captureTooltipCrop && cropDetection.detected
    ? derivePersistentTooltipCrop(crop, working, lineRects, scale)
    : null;
  const cropValidation = persistentCrop
    ? validatePersistentTooltipCrop(bitmap, persistentCrop, profile)
    : { safe: false, reason: undefined };
  const tooltipImageUrl = persistentCrop && cropValidation.safe
    ? renderOriginalCropPng(bitmap, persistentCrop)
    : undefined;
  const tooltipCropReason = !captureTooltipCrop || tooltipImageUrl
    ? undefined
    : cropDetection.reason
      ?? cropValidation.reason
      ?? (lineRects.length === 0
        ? "未检测到 tooltip 文字行"
        : "未找到从饰品名称到最后一条词条的可靠边界");
  const fullRect = { x: 0, y: 0, width: working.width, height: working.height };
  const fallbackImages = renderVariants(working, fullRect, profile, "text");
  if (lineRects.length === 0) {
    return {
      profile,
      fallbackImages,
      captureTooltipCrop,
      tooltipImageUrl,
      tooltipCropReason,
      lines: [{ kind: "title", textImages: fallbackImages, titleNumericImages: [], affixNumericImages: [], y: 0 }],
    };
  }
  return {
    profile,
    fallbackImages,
    captureTooltipCrop,
    tooltipImageUrl,
    tooltipCropReason,
    lines: lineRects.map((rect, index) => {
      const kind = classifyLine(index, rect, lineRects);
      const titleNumericRect = index <= 2 ? findNumericRect(working, rect, true) : null;
      const affixNumericRect = findNumericRect(working, rect, false);
      const labelRect = affixNumericRect
        ? {
            x: rect.x,
            y: rect.y,
            width: Math.max(1, affixNumericRect.x - rect.x - 2),
            height: rect.height,
          }
        : rect;
      const labelVariants = renderVariants(working, labelRect, profile, "text");
      const fullLineVariants = labelRect === rect ? [] : renderVariants(working, rect, profile, "text");
      return {
        kind,
        textImages: [...labelVariants, ...fullLineVariants],
        titleNumericImages: titleNumericRect ? renderVariants(working, titleNumericRect, profile, "value") : [],
        affixNumericImages: affixNumericRect ? renderVariants(working, affixNumericRect, profile, "value") : [],
        labelMask: createMask(working, labelRect, profile, false),
        titleNumericMask: titleNumericRect ? createMask(working, titleNumericRect, profile, true, true) : undefined,
        affixNumericMask: affixNumericRect ? createMask(working, affixNumericRect, profile, true) : undefined,
        y: rect.y,
      };
    }),
  };
}

function validatePersistentTooltipCrop(
  bitmap: ImageBitmap,
  rect: Rect,
  profile: Exclude<OcrProfile, "unknown">,
): { safe: boolean; reason?: string } {
  if (rect.width > 900 || rect.height > 600) {
    return { safe: false, reason: "候选裁剪范围过大，可能包含背包、聊天或其他游戏画面" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { safe: false, reason: "浏览器无法验证 tooltip 裁剪内容" };
  context.drawImage(
    bitmap,
    Math.floor(rect.x),
    Math.floor(rect.y),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let sampled = 0;
  let background = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const offset = (y * canvas.width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      sampled += 1;
      if (profile === "minecraft-1.21.8"
        ? isTooltipBackground(r, g, b)
        : Math.max(r, g, b) <= 72) {
        background += 1;
      }
    }
  }
  const ratio = background / Math.max(sampled, 1);
  const minimum = profile === "minecraft-1.21.8" ? 0.42 : 0.5;
  if (ratio < minimum) {
    return {
      safe: false,
      reason: `候选区域的深色 tooltip 背景占比仅 ${formatPercent(ratio)}，不会保存完整截图`,
    };
  }
  return { safe: true };
}

function derivePersistentTooltipCrop(
  sourceCrop: Rect,
  working: HTMLCanvasElement,
  lineRects: Rect[],
  scale: number,
): Rect | null {
  if (lineRects.length < 2) return null;
  const title = lineRects[0];
  const affixLines = lineRects.slice(1).filter((line) => {
    if (!isPlausiblePersistentAffixGeometry(line.width, line.height)) return false;
    const numericRect = findNumericRect(working, line, false);
    return Boolean(
      numericRect
      && isRightSideNumericRect(working, line, numericRect)
      && hasColoredAffixPixels(working, line, numericRect.x),
    );
  });
  const lastAffix = affixLines[affixLines.length - 1];
  if (!lastAffix) return null;

  const topPadding = 3;
  const bottomPadding = 4;
  const relativeTop = Math.max(0, Math.floor(title.y / scale) - topPadding);
  const relativeBottom = Math.min(
    sourceCrop.height,
    Math.ceil((lastAffix.y + lastAffix.height) / scale) + bottomPadding,
  );
  if (relativeBottom <= relativeTop) return null;
  return {
    x: sourceCrop.x,
    y: sourceCrop.y + relativeTop,
    width: sourceCrop.width,
    height: relativeBottom - relativeTop,
  };
}

export function isPlausiblePersistentAffixGeometry(width: number, height: number): boolean {
  return width / Math.max(height, 1) <= 20;
}

function isRightSideNumericRect(canvas: HTMLCanvasElement, line: Rect, numericRect: Rect): boolean {
  const numericCenter = numericRect.x + numericRect.width / 2;
  const relativePosition = (numericCenter - line.x) / Math.max(line.width, 1);
  return relativePosition >= 0.48 && numericCenter >= canvas.width * 0.28;
}

function hasColoredAffixPixels(canvas: HTMLCanvasElement, line: Rect, rightBoundary: number): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const safeInset = Math.max(12, Math.round(canvas.width * 0.02));
  const x = Math.max(safeInset, Math.floor(line.x));
  const y = Math.max(0, Math.floor(line.y));
  const lineRight = Math.min(canvas.width, Math.ceil(line.x + line.width));
  const scanRight = Math.min(lineRight, Math.floor(rightBoundary));
  const width = Math.max(0, scanRight - x);
  if (width < 1) return false;
  const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(line.height)));
  const pixels = context.getImageData(x, y, width, height).data;
  let colored = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    if (maximum - minimum >= 45 && maximum >= 105) colored += 1;
  }
  return colored >= Math.max(8, Math.round(height * 0.35));
}

function renderOriginalCropPng(bitmap: ImageBitmap, rect: Rect): string | undefined {
  if (rect.width < 2 || rect.height < 2) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    bitmap,
    Math.floor(rect.x),
    Math.floor(rect.y),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const result = canvas.toDataURL("image/png");
  return result.startsWith("data:image/png;base64,") ? result : undefined;
}

function reclassifyRecognizedLines(lines: OcrLine[]): OcrLine[] {
  if (lines.length === 0) return lines;
  let titleIndex = 0;
  let titleScore = -1;
  lines.forEach((line, index) => {
    const text = combinedObservationText(line.text);
    let score = 0;
    if (/黯淡|暗淡|精工|神铸|神锻/.test(text)) score += 4;
    if (/宝石|戒指|指环|护符|护身符/.test(text)) score += 4;
    if (/『.*』/.test(text)) score += 2;
    if (/\+\s*\d+\s*$/.test(text)) score += 2;
    if (/属性|伤害|暴击|专精|减免/.test(text)) score -= 3;
    if (index > 3) score -= 1;
    if (score > titleScore) {
      titleScore = score;
      titleIndex = index;
    }
  });
  return lines.map((line, index) => {
    if (index === titleIndex) {
      return {
        ...line,
        kind: "title",
        numeric: line.titleNumeric ?? [],
        numericMask: line.titleNumericMask,
      };
    }
    const text = combinedObservationText(line.text);
    if (/属性|屡性|属生/.test(text)) return { ...line, kind: "other", numeric: [], numericMask: undefined };
    const affixNumeric = line.affixNumeric ?? [];
    const hasNumericEvidence = affixNumeric.length > 0
      || /\+\s*\d/.test(text)
      || Boolean(line.affixNumericMask && recognizeMinecraftNumber(line.affixNumericMask));
    const hasLabelEvidence = /『[^+]{2,}/.test(text)
      || /旅猎|暴击|伤害|专精|减免|速度|高度|距离|效率|力度|吸引|比率/.test(text)
      || maskLooksLikeTextLine(line.labelMask);
    if (hasNumericEvidence && hasLabelEvidence && index > titleIndex) {
      return { ...line, kind: "affix", numeric: affixNumeric, numericMask: line.affixNumericMask };
    }
    return { ...line, kind: "other", numeric: [], numericMask: undefined };
  });
}

function renderWorkingCanvas(
  bitmap: ImageBitmap,
  crop: Rect,
  scale: number,
  profile: Exclude<OcrProfile, "unknown">,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, crop.width * scale);
  canvas.height = Math.max(1, crop.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.imageSmoothingEnabled = profile === "modernui-source-han";
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function renderVariants(
  source: HTMLCanvasElement,
  rect: Rect,
  profile: Exclude<OcrProfile, "unknown">,
  mode: "text" | "value",
): string[] {
  const original = cropCanvas(source, rect, 8, 5);
  const enhanced = processCanvas(original, profile, mode, false);
  const binary = processCanvas(original, profile, mode, true);
  return profile === "modernui-source-han"
    ? [original.toDataURL("image/png"), enhanced.toDataURL("image/png"), binary.toDataURL("image/png")]
    : [enhanced.toDataURL("image/png"), binary.toDataURL("image/png")];
}

function cropCanvas(source: HTMLCanvasElement, rect: Rect, padX: number, padY: number): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(rect.x - padX));
  const y = Math.max(0, Math.floor(rect.y - padY));
  const width = Math.max(1, Math.min(source.width - x, Math.ceil(rect.width + padX * 2)));
  const height = Math.max(1, Math.min(source.height - y, Math.ceil(rect.height + padY * 2)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context?.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function processCanvas(
  source: HTMLCanvasElement,
  profile: Exclude<OcrProfile, "unknown">,
  mode: "text" | "value",
  binary: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(source, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    const r = data.data[offset];
    const g = data.data[offset + 1];
    const b = data.data[offset + 2];
    const text = mode === "value"
      ? isNumericPixel(r, g, b, false)
      : profile === "minecraft-1.21.8"
        ? isMinecraftTextPixel(r, g, b)
        : isModernTextPixel(r, g, b);
    if (!text) {
      data.data[offset] = 0;
      data.data[offset + 1] = 0;
      data.data[offset + 2] = 0;
      continue;
    }
    const brightness = (r + g + b) / 3;
    const value = binary ? 255 : profile === "modernui-source-han" ? Math.max(170, brightness) : 255;
    data.data[offset] = value;
    data.data[offset + 1] = value;
    data.data[offset + 2] = value;
  }
  context.putImageData(data, 0, 0);
  return canvas;
}

function createMask(
  source: HTMLCanvasElement,
  rect: Rect,
  profile: Exclude<OcrProfile, "unknown">,
  numeric: boolean,
  titleNumeric = false,
): BinaryMask {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.min(source.width - x, Math.ceil(rect.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.ceil(rect.height)));
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return { width: 0, height: 0, data: new Uint8Array() };
  const pixels = context.getImageData(x, y, width, height).data;
  const data = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[index] = numeric
      ? Number(isNumericPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], titleNumeric))
      : Number(profile === "minecraft-1.21.8"
          ? isMinecraftTextPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])
          : isModernTextPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2]));
  }
  return { width, height, data };
}

function maskToDataUrl(mask: BinaryMask): string {
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, mask.width * scale);
  canvas.height = Math.max(1, mask.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x]) context.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas.toDataURL("image/png");
}

function findTextLineRects(
  canvas: HTMLCanvasElement,
  profile: Exclude<OcrProfile, "unknown">,
): Rect[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowHits = new Array<number>(canvas.height).fill(0);
  for (let y = 0; y < canvas.height; y += 1) {
    let hits = 0;
    for (let x = 4; x < canvas.width - 4; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const isText = profile === "minecraft-1.21.8"
        ? isMinecraftTextPixel(image.data[offset], image.data[offset + 1], image.data[offset + 2])
        : isModernTextPixel(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
      if (isText) hits += 1;
    }
    rowHits[y] = hits;
  }
  const threshold = profile === "minecraft-1.21.8" ? 8 : 12;
  const bands: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let y = 0; y <= rowHits.length; y += 1) {
    const active = y < rowHits.length && rowHits[y] > threshold;
    if (active && start < 0) start = y;
    if (!active && start >= 0) {
      const end = y - 1;
      if (end - start >= 4) bands.push({ start, end });
      start = -1;
    }
  }
  return mergeCloseBands(bands, profile === "minecraft-1.21.8" ? 3 : 5)
    .map((band) => bandToRect(image.data, canvas.width, canvas.height, band, profile))
    .filter((rect) => (
      rect.width > 20 &&
      rect.height > 7 &&
      rect.height < canvas.height * 0.25 &&
      !(profile === "modernui-source-han" && rect.width / Math.max(rect.height, 1) > 22)
    ));
}

function bandToRect(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  band: { start: number; end: number },
  profile: Exclude<OcrProfile, "unknown">,
): Rect {
  let minX = width;
  let maxX = 0;
  for (let y = band.start; y <= band.end; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = profile === "minecraft-1.21.8"
        ? isMinecraftTextPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])
        : isModernTextPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      if (!text) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const x = Math.max(0, minX - 2);
  const y = Math.max(0, band.start - 2);
  return {
    x,
    y,
    width: Math.min(width - x, Math.max(1, maxX - minX + 5)),
    height: Math.min(height - y, band.end - band.start + 5),
  };
}

function findNumericRect(canvas: HTMLCanvasElement, line: Rect, title: boolean): Rect | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const startX = Math.max(0, Math.floor(line.x));
  const yStart = Math.max(0, Math.floor(line.y - 3));
  const yEnd = Math.min(canvas.height - 1, Math.ceil(line.y + line.height + 3));
  const occupied = new Array<boolean>(canvas.width - startX).fill(false);
  for (let x = startX; x < canvas.width; x += 1) {
    for (let y = yStart; y <= yEnd; y += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (!isNumericPixel(image.data[offset], image.data[offset + 1], image.data[offset + 2], title)) continue;
      occupied[x - startX] = true;
      break;
    }
  }
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let index = 0; index <= occupied.length; index += 1) {
    const active = index < occupied.length && occupied[index];
    if (active && runStart < 0) runStart = index + startX;
    if (!active && runStart >= 0) {
      runs.push({ start: runStart, end: index + startX - 1 });
      runStart = -1;
    }
  }
  if (runs.length === 0) return null;
  const maximumCharacterGap = Math.max(8, Math.round(line.height * 0.55));
  const clusters: Array<{ first: number; last: number }> = [];
  let clusterStart = 0;
  for (let index = 1; index <= runs.length; index += 1) {
    const gap = index < runs.length ? runs[index].start - runs[index - 1].end - 1 : Number.POSITIVE_INFINITY;
    if (gap <= maximumCharacterGap) continue;
    clusters.push({ first: clusterStart, last: index - 1 });
    clusterStart = index;
  }
  const recognizedClusters = clusters
    .map((cluster) => {
      const candidateRect: Rect = {
        x: runs[cluster.first].start,
        y: yStart,
        width: runs[cluster.last].end - runs[cluster.first].start + 1,
        height: yEnd - yStart + 1,
      };
      const match = recognizeMinecraftNumber(createMask(canvas, candidateRect, "minecraft-1.21.8", true, title));
      return { cluster, match };
    })
    .filter((candidate) => candidate.match)
    .sort((left, right) => (
      (right.match!.score - left.match!.score)
      || (runs[right.cluster.last].end - runs[left.cluster.last].end)
    ));
  const selected = recognizedClusters[0]?.cluster ?? clusters[clusters.length - 1];
  let minX = runs[selected.first].start;
  let maxX = runs[selected.last].end;
  let minY = canvas.height;
  let maxY = 0;
  let hits = 0;
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (!isNumericPixel(image.data[offset], image.data[offset + 1], image.data[offset + 2], title)) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      hits += 1;
    }
  }
  if (hits < 5 || maxX <= minX || maxY <= minY) return null;
  return {
    x: Math.max(0, minX - 3),
    y: Math.max(0, minY - 3),
    width: Math.min(canvas.width - Math.max(0, minX - 3), maxX - minX + 7),
    height: Math.min(canvas.height - Math.max(0, minY - 3), maxY - minY + 7),
  };
}

function findMinecraftTooltipCrop(bitmap: ImageBitmap): CropDetection {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { rect: fullBitmapRect(bitmap), detected: false, reason: "浏览器无法读取截图像素" };
  }
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const leftLimit = findTooltipLeftEdge(image.data, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = leftLimit; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      if (!isTooltipBackground(r, g, b)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hits += 1;
    }
  }
  if (hits < 50 || maxX <= minX || maxY <= minY) {
    return { rect: fullBitmapRect(bitmap), detected: false, reason: "未检测到原版深色 tooltip 信息框" };
  }
  const pad = 4;
  const x = Math.max(0, minX + 1);
  const y = Math.max(0, minY - pad);
  return {
    detected: true,
    rect: {
      x,
      y,
      width: Math.min(bitmap.width - x, maxX - x + pad),
      height: Math.min(bitmap.height - y, maxY - minY + pad * 2),
    },
  };
}

function findModernContentCrop(bitmap: ImageBitmap): CropDetection {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { rect: fullBitmapRect(bitmap), detected: false, reason: "浏览器无法读取截图像素" };
  }
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const fallback = fullBitmapRect(bitmap);
  const rect = boundingRectForPixels(image.data, canvas.width, canvas.height, isModernTextPixel, 30, fallback);
  const tightlyFramedInput = bitmap.width <= 900 && bitmap.height <= 600;
  const detected = !sameRect(rect, fallback) || tightlyFramedInput;
  return {
    rect,
    detected,
    reason: detected ? undefined : "未检测到 ModernUI tooltip 的完整文字区域",
  };
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function boundingRectForPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  predicate: (r: number, g: number, b: number) => boolean,
  minimumHits: number,
  fallback: Rect,
): Rect {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!predicate(pixels[offset], pixels[offset + 1], pixels[offset + 2])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hits += 1;
    }
  }
  if (hits < minimumHits || maxX <= minX || maxY <= minY) return fallback;
  const pad = 5;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return {
    x,
    y,
    width: Math.min(width - x, maxX - minX + pad * 2 + 1),
    height: Math.min(height - y, maxY - minY + pad * 2 + 1),
  };
}

function isMinecraftTextPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const brightness = (r + g + b) / 3;
  return (
    (brightness > 145 && saturation > 14) ||
    (g > 145 && saturation > 38) ||
    (r > 165 && b > 80 && saturation > 30) ||
    (b > 130 && g > 65 && saturation > 35) ||
    (r > 155 && g > 120 && b < 145)
  );
}

function isModernTextPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const brightness = (r + g + b) / 3;
  return brightness > 72 && (brightness > 125 || saturation > 32);
}

function isNumericPixel(r: number, g: number, b: number, title: boolean): boolean {
  if (title) return g > 110 && g > r * 1.18 && g > b * 1.12;
  return r > 125 && g > 110 && b < Math.min(r, g) * 0.93;
}

function isTooltipBackground(r: number, g: number, b: number): boolean {
  return r > 8 && r < 58 && g < 42 && b > 10 && b < 82;
}


function classifyLine(index: number, rect: Rect, rects: Rect[]): OcrLine["kind"] {
  if (index === 0) return "title";
  if (index <= 2 && rect.width < Math.max(220, rects[0].width * 0.58)) return "other";
  return "affix";
}

function findTooltipLeftEdge(data: Uint8ClampedArray, width: number, height: number): number {
  const columnHits = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    let hits = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      if (isTooltipBackground(data[offset], data[offset + 1], data[offset + 2])) hits += 1;
    }
    columnHits[x] = hits;
  }
  const minimumHeight = Math.max(20, height * 0.25);
  for (let x = 0; x < width; x += 1) {
    if (columnHits[x] < minimumHeight) continue;
    let run = 0;
    for (let next = x; next < Math.min(width, x + 24); next += 1) {
      if (columnHits[next] >= minimumHeight) run += 1;
    }
    if (run >= 10) return Math.max(0, x - 4);
  }
  return 0;
}

function mergeCloseBands(bands: Array<{ start: number; end: number }>, maximumGap: number) {
  const merged: Array<{ start: number; end: number }> = [];
  for (const band of bands) {
    const previous = merged[merged.length - 1];
    if (previous && band.start - previous.end <= maximumGap) previous.end = band.end;
    else merged.push({ ...band });
  }
  return merged;
}

function toTextObservations(observations: OcrObservation[]): TextObservation[] {
  return observations.map((observation) => ({ ...observation, source: "tesseract" }));
}

function bestObservationText(observations: OcrObservation[]): string {
  return [...observations].sort((left, right) => right.confidence - left.confidence)[0]?.text ?? "";
}

function combinedObservationText(observations: OcrObservation[]): string {
  return normalizeOcrTextV4(observations.map((observation) => observation.text).filter(Boolean).join(" "));
}

function maskLooksLikeTextLine(mask: BinaryMask | undefined): boolean {
  if (!mask) return false;
  const trimmed = trimMask(mask);
  if (trimmed.width < 24 || trimmed.height < 6) return false;
  const aspect = trimmed.width / Math.max(trimmed.height, 1);
  if (aspect < 1.35 || aspect > 18) return false;
  let ink = 0;
  for (const value of trimmed.data) ink += value;
  const density = ink / Math.max(trimmed.width * trimmed.height, 1);
  return density >= 0.04 && density <= 0.72;
}

function fieldWarnings<T>(label: string, field: OcrFieldResult<T>): string[] {
  if (field.state === "accepted") return [];
  return field.reasons.length > 0
    ? field.reasons.map((reason) => `${label}：${reason}`)
    : [`${label}需要人工复核`];
}

function isLikelyTitleLine(text: string): boolean {
  const normalized = normalizeOcrTextV4(text);
  return /戒指|护符|护身符|宝石|指环/.test(normalized) && !/伤害|暴击|专精|减免/.test(normalized);
}

function percentile(values: number[], quantile: number, fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function fullBitmapRect(bitmap: ImageBitmap): Rect {
  return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
}

function profileLabel(profile: OcrProfile): string {
  if (profile === "minecraft-1.21.8") return "原版字体";
  if (profile === "modernui-source-han") return "ModernUI";
  return "未知字体";
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function cryptoSafeId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

async function loadBitmap(image: File | string): Promise<ImageBitmap> {
  if (typeof image !== "string") return createImageBitmap(image);
  const response = await fetch(image);
  return createImageBitmap(await response.blob());
}
