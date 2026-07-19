import { createWorker, PSM, Worker } from "tesseract.js";
import {
  Accessory,
  AccessoryQuality,
  AccessorySlot,
  Affix,
  DisplayStat,
  formatNumber,
  maxLevelByQuality,
  parseNumericValue,
  qualityFromText,
  slotFromText,
  statFromLabelWithConfidence,
  validateAffixValue,
} from "./domain";
import { IS_ANDROID_APP } from "./appConfig";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface ParsedAccessory {
  accessory: Accessory;
  rawText: string;
  warnings: string[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OcrLine {
  kind: "title" | "affix" | "other";
  image: string;
  valueImage?: string;
  rawText: string[];
  valueText: string[];
  y: number;
}

interface PreparedTooltip {
  lines: Array<{ kind: OcrLine["kind"]; images: string[]; valueImages: string[]; y: number }>;
  fallbackImages: string[];
  fallbackText: string;
}

interface ValueCandidate {
  text: string;
  rawValue: number;
  value: number;
  source: "line" | "crop";
  sourceText: string;
  correctedText: boolean;
  normalizedByRange: boolean;
  score: number;
}

const OCR_VALUE_CHARS = "+0123456789.";

export async function recognizeAccessoryImage(
  image: File | string,
  onProgress?: (progress: OcrProgress) => void,
): Promise<ParsedAccessory> {
  const prepared = await prepareTooltipLines(image);
  const ocrBasePath = IS_ANDROID_APP ? "./ocr" : "/ocr";
  const worker = await createWorker("chi_sim+eng", 1, {
    workerPath: `${ocrBasePath}/worker.min.js`,
    corePath: `${ocrBasePath}/core`,
    langPath: `${ocrBasePath}/lang`,
    gzip: !IS_ANDROID_APP,
    cacheMethod: "none",
    logger: (message) => {
      onProgress?.({
        status: message.status ?? "识别中",
        progress: typeof message.progress === "number" ? message.progress : 0,
      });
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      preserve_interword_spaces: "1",
    });

    const lines: OcrLine[] = [];
    const progressTotal = Math.max(prepared.lines.length, 1);
    let completed = 0;

    for (const line of prepared.lines) {
      const textResults: string[] = [];
      for (const imageVariant of line.images) {
        const result = await worker.recognize(imageVariant);
        textResults.push(result.data.text);
      }

      let valueResults: string[] = [];
      if (line.valueImages.length > 0) {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: OCR_VALUE_CHARS,
        });
        valueResults = await recognizeValueImages(worker, line.valueImages);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          tessedit_char_whitelist: "",
          preserve_interword_spaces: "1",
        });
      }

      lines.push({
        kind: line.kind,
        image: line.images[0],
        valueImage: line.valueImages[0],
        rawText: textResults,
        valueText: valueResults,
        y: line.y,
      });

      completed += 1;
      onProgress?.({ status: "逐行识别", progress: completed / progressTotal });
    }

    const structured = parseStructuredLines(lines, prepared.fallbackText);
    if (structured.accessory.affixes.length > 0 && structured.accessory.name !== "OCR 饰品") {
      return structured;
    }

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: "",
      preserve_interword_spaces: "1",
    });
    const fallbackTexts: string[] = [];
    for (const fallbackImage of prepared.fallbackImages) {
      const result = await worker.recognize(fallbackImage);
      fallbackTexts.push(result.data.text);
    }
    const fallback = parseAccessoryText(mergeOcrTexts([...fallbackTexts, structured.rawText]));
    if (fallback.accessory.affixes.length > 0 || fallback.accessory.name !== "OCR 饰品") {
      return {
        ...fallback,
        warnings: [...new Set([...structured.warnings, ...fallback.warnings])],
      };
    }

    return structured;
  } finally {
    await worker.terminate();
  }
}

async function recognizeValueImages(worker: Worker, images: string[]): Promise<string[]> {
  const texts: string[] = [];
  for (const image of images) {
    const result = await worker.recognize(image);
    texts.push(result.data.text);
  }
  return texts;
}

export function parseAccessoryText(rawText: string): ParsedAccessory {
  const normalized = normalizeOcrText(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine = lines.find(isLikelyTitleLine) ?? lines[0] ?? "";
  const quality = qualityFromText(titleLine);
  const slot = slotFromText(titleLine);
  const level = parseTitleLevel(titleLine, quality);
  const affixes = parseTextAffixLines(lines, titleLine);
  const warnings: string[] = [];

  if (!titleLine) warnings.push("未识别到饰品标题，已使用默认部位和品质。");
  if (affixes.length === 0) warnings.push("未识别到词条，请手动补充。");

  return {
    rawText,
    warnings,
    accessory: {
      id: cryptoSafeId(),
      name: titleLine || "OCR 饰品",
      slot,
      quality,
      level,
      affixes,
      source: "ocr",
    },
  };
}

export function parseStructuredLines(lines: OcrLine[], fallbackText = ""): ParsedAccessory {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const rawText = sorted
    .map((line) => [...line.rawText, ...line.valueText].map(normalizeOcrText).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n") || fallbackText;

  const title = sorted.find((line) => line.kind === "title") ?? sorted[0];
  const titleLine = bestText(title?.rawText ?? []);
  const quality = qualityFromText(titleLine);
  const slot = slotFromText(titleLine);
  const affixes = sorted
    .filter((line) => line.kind === "affix")
    .map((line) => parseStructuredAffixLine(line))
    .filter((affix): affix is Affix => Boolean(affix));
  const level = inferLevelFromAffixCount(parseTitleLevel(titleLine, quality), quality, affixes.length);

  const warnings: string[] = [];
  if (!titleLine) warnings.push("未识别到饰品标题，已使用默认部位和品质。");
  if (!/\+\s*\d+\s*$/.test(normalizeOcrText(titleLine))) {
    warnings.push("强化等级识别置信度低，请核对标题右侧绿色 +等级。");
  }
  if (affixes.length === 0) warnings.push("未识别到词条，请手动补充。");
  for (const affix of affixes) {
    if (affix.warning) warnings.push(`${affix.label ?? "词条"}：${affix.warning}`);
  }

  return {
    rawText,
    warnings: [...new Set(warnings)],
    accessory: {
      id: cryptoSafeId(),
      name: cleanupTitle(titleLine) || "OCR 饰品",
      slot,
      quality,
      level,
      affixes,
      source: "ocr",
    },
  };
}

export function parseStructuredAffixLine(line: Pick<OcrLine, "rawText" | "valueText">): Affix | null {
  const labelText = bestText(line.rawText);
  const resolved = statFromLabelWithConfidence(extractLabel(labelText));
  const valueChoice = bestValueCandidate(line.rawText, line.valueText, resolved.stat);
  const valueText = valueChoice?.text ?? "";
  const rawValue = valueChoice?.rawValue ?? 0;
  const value = valueChoice?.value ?? 0;
  const warningParts: string[] = [];
  if (!isAllowedValueText(valueText) || (valueChoice?.source === "crop" && hasUnsupportedValueChars(valueChoice.sourceText))) {
    warningParts.push("数值识别置信度低");
  }
  if (valueChoice?.correctedText) {
    warningParts.push("数值字符已按 MC 字体误读修正");
  }
  if (valueChoice?.normalizedByRange) {
    warningParts.push(`数值已按经验范围从 ${formatNumber(rawValue, 3)} 修正为 ${formatNumber(value, 3)}`);
  }
  const rangeWarning = validateAffixValue(resolved.stat, value);
  if (rangeWarning) warningParts.push(rangeWarning);
  if (resolved.score < 0.5 && resolved.stat !== "vanilla") {
    warningParts.push("词条名识别置信度低");
  }

  if (!labelText && !valueText) return null;

  return {
    id: cryptoSafeId(),
    stat: resolved.stat,
    value,
    label: extractLabel(labelText) || labelText || undefined,
    confidence: warningParts.length ? "low" : "high",
    warning: warningParts.join("；") || undefined,
  };
}

function parseTextAffixLines(lines: string[], titleLine: string): Affix[] {
  const affixes: Affix[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line === titleLine) continue;
    if (/属性|minecraft|组件|flow_banner_pattern/i.test(line)) continue;
    if (!/[+＋]\s*\d/.test(line)) continue;

    const affix = parseStructuredAffixLine({ rawText: [line], valueText: [line] });
    if (!affix) continue;
    const lineKey = `${normalizeOcrText(line).replace(/\s/g, "")}:${affixes.length}`;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);
    affixes.push(affix);
  }
  return affixes;
}

function inferLevelFromAffixCount(level: number, quality: AccessoryQuality, affixCount: number): number {
  let inferred = level;
  if (affixCount >= 2) inferred = Math.max(inferred, 3);
  if (affixCount >= 3) inferred = Math.max(inferred, 5);
  if (quality === "divine" && affixCount >= 4) inferred = Math.max(inferred, 8);
  return Math.min(inferred, maxLevelByQuality[quality]);
}

function normalizeLikelyOcrValue(stat: DisplayStat, value: number): number {
  if (!Number.isFinite(value)) return value;
  if (stat === "vanilla" || stat === "damageReduction" || stat === "sneakSpeed") return value;

  const candidates = [value, value / 10, value / 100, value / 1000, value / 10000];
  const valid = candidates.find((candidate) => !validateAffixValue(stat, candidate));
  return valid ?? value;
}

function isLikelyTitleLine(line: string): boolean {
  const normalized = normalizeOcrText(line);
  if (/属性|伤害|暴击|专精|减免|距离|minecraft|组件/i.test(normalized)) return false;
  return /戒指|护符|护身符|宝石|指环/.test(normalized);
}

async function prepareTooltipLines(image: File | string): Promise<PreparedTooltip> {
  const bitmap = await loadBitmap(image);
  const crop = findTooltipCrop(bitmap);
  const working = renderWorkingCanvas(bitmap, crop, 3);
  const lineRects = findTextLineRects(working.canvas);
  const fullTextImage = renderProcessedLine(
    working.canvas,
    { x: 0, y: 0, width: working.canvas.width, height: working.canvas.height },
    "text",
  );
  const fullBinaryImage = renderProcessedLine(
    working.canvas,
    { x: 0, y: 0, width: working.canvas.width, height: working.canvas.height },
    "binary",
  );
  const fullLegacyImage = renderLegacyProcessedImage(working.canvas);
  const fallbackText = "";

  if (lineRects.length === 0) {
    return {
      fallbackText,
      fallbackImages: [fullTextImage, fullBinaryImage, fullLegacyImage],
      lines: [{
        kind: "title",
        images: [fullTextImage],
        valueImages: [],
        y: 0,
      }],
    };
  }

  return {
    fallbackText,
    fallbackImages: [fullTextImage, fullBinaryImage, fullLegacyImage],
    lines: lineRects.map((rect, index) => {
      const kind = classifyLine(index, rect, lineRects);
      const valueRect = kind === "affix" ? findValueRect(working.canvas, rect) : null;
      return {
        kind,
        images: [
          renderProcessedLine(working.canvas, rect, "text"),
          renderProcessedLine(working.canvas, rect, "binary"),
          ...(index === 0 ? [fullTextImage] : []),
        ],
        valueImages: valueRect ? [
          renderProcessedLine(working.canvas, valueRect, "value"),
          renderProcessedLine(working.canvas, valueRect, "binary"),
        ] : [],
        y: rect.y,
      };
    }),
  };
}

function classifyLine(index: number, rect: Rect, rects: Rect[]): OcrLine["kind"] {
  if (index === 0) return "title";
  if (index === 1 && rect.width < Math.max(220, rects[0].width * 0.55)) return "other";
  return "affix";
}

function renderWorkingCanvas(bitmap: ImageBitmap, crop: Rect, scale: number): { canvas: HTMLCanvasElement; scale: number } {
  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { canvas, scale };
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

function renderProcessedLine(
  source: HTMLCanvasElement,
  rect: Rect,
  mode: "text" | "binary" | "value",
): string {
  const padX = mode === "value" ? 8 : 14;
  const padY = 6;
  const x = Math.max(0, Math.floor(rect.x - padX));
  const y = Math.max(0, Math.floor(rect.y - padY));
  const width = Math.min(source.width - x, Math.ceil(rect.width + padX * 2));
  const height = Math.min(source.height - y, Math.ceil(rect.height + padY * 2));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  context.drawImage(source, x, y, width, height, 0, 0, width, height);

  const data = context.getImageData(0, 0, width, height);
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const text = isStrictTextPixel(r, g, b);
    if (mode === "text") {
      if (text) {
        data.data[i] = Math.min(255, r * 1.45 + 45);
        data.data[i + 1] = Math.min(255, g * 1.45 + 45);
        data.data[i + 2] = Math.min(255, b * 1.45 + 45);
      } else {
        data.data[i] = 0;
        data.data[i + 1] = 0;
        data.data[i + 2] = 0;
      }
    } else {
      const isValueText = mode === "value" ? isValuePixel(r, g, b) : text;
      const value = isValueText ? 255 : 0;
      data.data[i] = value;
      data.data[i + 1] = value;
      data.data[i + 2] = value;
    }
  }
  context.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

function renderLegacyProcessedImage(source: HTMLCanvasElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0);

  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const brightness = (r + g + b) / 3;
    const isColoredText =
      brightness > 115 ||
      (g > 140 && r > 80) ||
      (r > 170 && b > 120) ||
      (b > 130 && g > 100) ||
      (r > 150 && g > 80 && b < 120);
    if (isColoredText) {
      data.data[i] = Math.min(255, r * 1.35 + 35);
      data.data[i + 1] = Math.min(255, g * 1.35 + 35);
      data.data[i + 2] = Math.min(255, b * 1.35 + 35);
    } else {
      data.data[i] = 0;
      data.data[i + 1] = 0;
      data.data[i + 2] = 0;
    }
  }
  context.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

function findTooltipCrop(bitmap: ImageBitmap): Rect {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  const leftLimit = findTooltipLeftEdge(data.data, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = leftLimit; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const r = data.data[offset];
      const g = data.data[offset + 1];
      const b = data.data[offset + 2];
      const inTooltip = isTooltipBackground(r, g, b) || isStrictTextPixel(r, g, b);
      if (!inTooltip) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hits += 1;
    }
  }

  if (hits < 50 || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  }
  const pad = 4;
  const x = Math.max(0, minX + 1);
  const y = Math.max(0, minY - pad);
  return {
    x,
    y,
    width: Math.min(bitmap.width - x, maxX - x + pad),
    height: Math.min(bitmap.height - y, maxY - minY + pad * 2),
  };
}

function findTextLineRects(canvas: HTMLCanvasElement): Rect[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowHits = new Array(canvas.height).fill(0);
  for (let y = 0; y < canvas.height; y += 1) {
    let hits = 0;
    for (let x = 24; x < Math.max(24, canvas.width - 24); x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (isStrictTextPixel(data.data[offset], data.data[offset + 1], data.data[offset + 2])) hits += 1;
    }
    rowHits[y] = hits;
  }

  const bands: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let y = 0; y < rowHits.length; y += 1) {
    if (rowHits[y] > 8 && start < 0) start = y;
    if ((rowHits[y] <= 8 || y === rowHits.length - 1) && start >= 0) {
      const end = y === rowHits.length - 1 ? y : y - 1;
      if (end - start > 5) bands.push({ start, end });
      start = -1;
    }
  }

  return mergeCloseBands(bands).map((band) => {
    let minX = canvas.width;
    let maxX = 0;
    for (let y = band.start; y <= band.end; y += 1) {
      for (let x = 24; x < Math.max(24, canvas.width - 24); x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (!isStrictTextPixel(data.data[offset], data.data[offset + 1], data.data[offset + 2])) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    return {
      x: Math.max(0, minX - 2),
      y: Math.max(0, band.start - 2),
      width: Math.min(canvas.width - Math.max(0, minX - 2), maxX - minX + 5),
      height: Math.min(canvas.height - Math.max(0, band.start - 2), band.end - band.start + 5),
    };
  }).filter((rect) => rect.width > 24 && rect.height > 8);
}

function mergeCloseBands(bands: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  for (const band of bands) {
    const previous = result[result.length - 1];
    if (previous && band.start - previous.end <= 3) {
      previous.end = band.end;
    } else {
      result.push({ ...band });
    }
  }
  return result;
}

function findValueRect(canvas: HTMLCanvasElement, lineRect: Rect): Rect | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  const xStart = Math.floor(lineRect.x + lineRect.width * 0.48);
  const yStart = Math.max(0, Math.floor(lineRect.y - 3));
  const yEnd = Math.min(canvas.height - 1, Math.ceil(lineRect.y + lineRect.height + 3));
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const r = data.data[offset];
      const g = data.data[offset + 1];
      const b = data.data[offset + 2];
      if (!isValuePixel(r, g, b)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      hits += 1;
    }
  }
  if (hits < 8 || maxX <= minX || maxY <= minY) return null;
  return {
    x: Math.max(0, minX - 3),
    y: Math.max(0, minY - 3),
    width: Math.min(canvas.width - Math.max(0, minX - 3), maxX - minX + 7),
    height: Math.min(canvas.height - Math.max(0, minY - 3), maxY - minY + 7),
  };
}

function isTooltipBackground(r: number, g: number, b: number): boolean {
  return r > 8 && r < 55 && g < 38 && b > 10 && b < 78;
}

function isTextPixel(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;
  return (
    brightness > 118 ||
    (g > 120 && r > 40) ||
    (r > 150 && b > 90) ||
    (b > 120 && g > 80) ||
    (r > 145 && g > 75 && b < 120)
  );
}

function isStrictTextPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const brightness = (r + g + b) / 3;
  return (
    (brightness > 150 && saturation > 18) ||
    (g > 150 && saturation > 45) ||
    (r > 170 && b > 90 && saturation > 35) ||
    (b > 145 && g > 80 && saturation > 45) ||
    (r > 165 && g > 130 && b < 140)
  );
}

function isValuePixel(r: number, g: number, b: number): boolean {
  return r > 150 && g > 130 && b < 120;
}

function findTooltipLeftEdge(data: Uint8ClampedArray, width: number, height: number): number {
  const columnHits = new Array(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    let hits = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      if (isTooltipBackground(data[offset], data[offset + 1], data[offset + 2])) hits += 1;
    }
    columnHits[x] = hits;
  }

  const minHeight = Math.max(20, height * 0.25);
  for (let x = 0; x < width; x += 1) {
    if (columnHits[x] < minHeight) continue;
    let run = 0;
    for (let next = x; next < Math.min(width, x + 24); next += 1) {
      if (columnHits[next] >= minHeight) run += 1;
    }
    if (run >= 10) return Math.max(0, x - 4);
  }
  return 0;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[|]/g, "")
    .replace(/[。．·]/g, ".")
    .replace(/[＋十]/g, "+")
    .replace(/[［【「『]/g, "『")
    .replace(/[］】」』]/g, "』")
    .replace(/\s+/g, " ")
    .trim();
}

function bestText(texts: string[]): string {
  const normalized = texts.map(normalizeOcrText).filter(Boolean);
  if (normalized.length === 0) return "";
  return normalized.sort((a, b) => scoreText(b) - scoreText(a))[0];
}

function mergeOcrTexts(texts: string[]): string {
  const lines = new Map<string, string>();
  for (const text of texts) {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = normalizeOcrText(rawLine).trim();
      if (!line) continue;
      const key = line.replace(/\s/g, "");
      if (!lines.has(key) || line.length > (lines.get(key)?.length ?? 0)) {
        lines.set(key, line);
      }
    }
  }
  return Array.from(lines.values()).join("\n");
}

function bestValueCandidate(rawTexts: string[], valueTexts: string[], stat: DisplayStat): ValueCandidate | null {
  const candidates = [
    ...rawTexts.flatMap((text) => buildValueCandidates(text, "line", stat)),
    ...valueTexts.flatMap((text) => buildValueCandidates(text, "crop", stat)),
  ];
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function bestValueText(texts: string[]): string {
  const values = texts.flatMap((text) => cleanValueTexts(text));
  if (values.length === 0) return "";
  return values.sort((a, b) => scoreValueText(b.text) - scoreValueText(a.text))[0].text;
}

function buildValueCandidates(text: string, source: ValueCandidate["source"], stat: DisplayStat): ValueCandidate[] {
  return cleanValueTexts(text).map((cleaned, index) => {
    const rawValue = parseNumericValue(cleaned.text);
    const value = normalizeLikelyOcrValue(stat, rawValue);
    const rawValid = !validateAffixValue(stat, rawValue);
    const normalizedValid = !validateAffixValue(stat, value);
    const normalizedByRange = value !== rawValue;
    let score = 0;
    if (rawValid) score += 100;
    else if (normalizedValid) score += 60;
    if (source === "line") score += 25;
    if (/\.\d+/.test(cleaned.text)) score += 10;
    if (/\.\d*[1-9]\d*$/.test(cleaned.text)) score += 4;
    if (!normalizedByRange) score += 5;
    if (cleaned.corrected) score -= 2;
    score -= index;
    return {
      text: cleaned.text,
      rawValue,
      value,
      source,
      sourceText: text,
      correctedText: cleaned.corrected,
      normalizedByRange,
      score,
    };
  });
}

function cleanValueText(text: string): string {
  return cleanValueTexts(text)[0]?.text ?? "";
}

function cleanValueTexts(text: string): Array<{ text: string; corrected: boolean }> {
  const before = normalizeOcrText(text);
  const normalized = normalizeOcrText(text)
    .replace(/[Zz]/g, "2")
    .replace(/[Oo。]/g, "0")
    .replace(/[IiLl]/g, "1")
    .replace(/[己巳已]/g, "2")
    .replace(/[日旦百出]/g, "0")
    .replace(/[小]/g, "1")
    .replace(/[吉古]/g, "8")
    .replace(/[二]/g, "2")
    .replace(/[匕口]/g, "6")
    .replace(/[^\+0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/\+{2,}/g, "+")
    .replace(/\+\./g, "+0.");
  const corrected = normalized !== before;
  const values = new Map<string, boolean>();
  for (const match of normalized.matchAll(/\+\d+(?:\.\d+)?/g)) {
    addValueCandidateText(values, match[0], corrected);
  }
  if (values.size > 0) return Array.from(values, ([value, wasCorrected]) => ({ text: value, corrected: wasCorrected }));
  const unsigned = normalized.match(/\d+(?:\.\d+)?/);
  if (unsigned) {
    addValueCandidateText(values, `+${unsigned[0]}`, corrected);
  }
  return Array.from(values, ([value, wasCorrected]) => ({ text: value, corrected: wasCorrected }));
}

function addValueCandidateText(values: Map<string, boolean>, text: string, corrected: boolean) {
  const normalized = text.replace(/^\+\./, "+0.");
  values.set(normalized, (values.get(normalized) ?? false) || corrected);
  const decimalConfusion = normalized.match(/^\+0\.8([0-9])$/);
  if (decimalConfusion) {
    values.set(`+0.0${decimalConfusion[1]}`, true);
  }
}

function isAllowedValueText(text: string): boolean {
  const normalized = normalizeOcrText(text).trim();
  if (!normalized) return false;
  if (/[^+0-9.\s]/.test(normalized)) return false;
  return /^\+\s*\d+(?:\.\d+)?$/.test(normalized);
}

function hasUnsupportedValueChars(text: string): boolean {
  const normalized = normalizeOcrText(text).trim();
  return /[^+0-9.\s]/.test(normalized);
}

function scoreText(text: string): number {
  let score = text.length;
  if (/『.*』/.test(text)) score += 8;
  if (/戒指|护符|护身符|宝石/.test(text)) score += 8;
  if (/[旅猎弓剑百分比伤害暴击专精额外最终]/.test(text)) score += 8;
  if (/\+\d/.test(text)) score += 5;
  return score;
}

function scoreValueText(text: string): number {
  let score = 0;
  if (/^\+\d+\.\d+$/.test(text)) score += 20;
  if (/^\+\d+$/.test(text)) score += 10;
  if (/^\+\d+\.\d*[1-9]\d*$/.test(text)) score += 4;
  score += text.length;
  return score;
}

function extractLabel(line: string): string {
  const normalized = normalizeOcrText(line);
  const bracketMatch = normalized.match(/『([^』]+)』/);
  if (bracketMatch) return bracketMatch[1].trim();
  return normalized.replace(/\+\d+(?:\.\d+)?/, "").replace(/[『』]/g, "").trim();
}

function parseTitleLevel(titleLine: string, quality: AccessoryQuality): number {
  const normalized = normalizeOcrText(titleLine);
  const match = normalized.match(/\+\s*([0-9]+)\s*$/);
  const parsed = Number(match?.[1] ?? 0);
  return Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : 0, maxLevelByQuality[quality]));
}

function cleanupTitle(titleLine: string): string {
  return normalizeOcrText(titleLine).replace(/\s*\+\d+\s*$/, "").trim();
}

async function loadBitmap(image: File | string): Promise<ImageBitmap> {
  if (typeof image === "string") {
    const response = await fetch(image);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  return createImageBitmap(image);
}

function cryptoSafeId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
