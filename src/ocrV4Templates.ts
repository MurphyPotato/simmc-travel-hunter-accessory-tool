import { DisplayStat } from "./domain";
import { MINECRAFT_GLYPHS, MinecraftGlyphTemplate } from "./generated/minecraftFontV4";
import { OcrCandidate } from "./ocrV4Types";
import { V4_STAT_ALIASES } from "./ocrV4Decision";

export interface BinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

const numericChars = [..."+0123456789."];
const normalizedGlyphHeight = 16;

export function matchMinecraftStatTemplates(mask: BinaryMask): OcrCandidate<DisplayStat>[] {
  const results: OcrCandidate<DisplayStat>[] = [];
  for (const [stat, aliases] of Object.entries(V4_STAT_ALIASES) as Array<[DisplayStat, string[]]>) {
    if (stat === "vanilla") continue;
    let bestScore = 0;
    let bestAlias = "";
    for (const alias of aliases) {
      for (const rendered of [`『${alias}』`, alias]) {
        const score = compareObservedWithText(mask, rendered);
        if (score > bestScore) {
          bestScore = score;
          bestAlias = rendered;
        }
      }
    }
    results.push({ value: stat, source: "template", score: bestScore, rawText: bestAlias });
  }
  return results.sort((left, right) => right.score - left.score).slice(0, 3);
}

export function recognizeMinecraftNumber(mask: BinaryMask): { text: string; score: number } | null {
  const observed = trimMask(mask);
  if (observed.width === 0 || observed.height === 0) return null;
  let best: { text: string; score: number } | null = null;
  const approximateScale = Math.max(1, Math.round(observed.height / normalizedGlyphHeight));
  for (const scale of uniquePositive([approximateScale - 1, approximateScale, approximateScale + 1])) {
    const base = trimMask(downsampleMask(observed, scale));
    const segments = splitColumns(base);
    if (segments.length === 0 || segments.length > 12) continue;
    const matches = segments.map((segment) => bestGlyphMatch(segment, numericChars));
    let usable = matches;
    const invalidIndexes = matches
      .map((match, index) => !match || match.score < 0.54 ? index : -1)
      .filter((index) => index >= 0);
    // Vanilla attributes can end with a percent glyph. It is outside the allowed
    // value alphabet, so discard it only when it is the sole unmatched tail.
    if (invalidIndexes.length === 1 && invalidIndexes[0] === matches.length - 1) {
      usable = matches.slice(0, -1);
    }
    if (usable.length === 0 || usable.some((match) => !match || match.score < 0.54)) continue;
    let text = usable.map((match) => match!.char).join("");
    const score = usable.reduce((sum, match) => sum + match!.score, 0);
    if (!/^\+?\d+(?:\.\d+)?$/.test(text)) continue;
    if (!text.startsWith("+")) text = `+${text}`;
    const normalizedScore = score / usable.length;
    if (!best || normalizedScore > best.score) best = { text, score: normalizedScore };
  }
  return best;
}

export function compareObservedWithText(mask: BinaryMask, text: string): number {
  const observed = trimMask(mask);
  const template = trimMask(renderTextMask(text));
  if (observed.width === 0 || template.width === 0) return 0;
  const approximateScale = Math.max(1, Math.round(observed.height / Math.max(template.height, 1)));
  let best = 0;
  for (const scale of uniquePositive([approximateScale - 1, approximateScale, approximateScale + 1])) {
    const base = trimMask(downsampleMask(observed, scale));
    best = Math.max(best, compareMasks(base, template));
  }
  return best;
}

export function renderTextMask(text: string): BinaryMask {
  const glyphs = [...text].map((char) => glyphMask(MINECRAFT_GLYPHS[char])).filter(Boolean) as BinaryMask[];
  if (glyphs.length === 0) return { width: 0, height: 0, data: new Uint8Array() };
  const height = normalizedGlyphHeight;
  const width = glyphs.reduce((sum, glyph, index) => sum + glyph.width + (index > 0 ? 2 : 0), 0);
  const output: BinaryMask = { width, height, data: new Uint8Array(width * height) };
  let cursor = 0;
  glyphs.forEach((glyph, index) => {
    if (index > 0) cursor += 2;
    const yOffset = height - glyph.height;
    for (let y = 0; y < glyph.height; y += 1) {
      for (let x = 0; x < glyph.width; x += 1) {
        if (glyph.data[y * glyph.width + x]) output.data[(y + yOffset) * width + cursor + x] = 1;
      }
    }
    cursor += glyph.width;
  });
  return output;
}

export function trimMask(mask: BinaryMask): BinaryMask {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { width: 0, height: 0, data: new Uint8Array() };
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask.data[(y + minY) * mask.width + x + minX];
    }
  }
  return { width, height, data };
}

function glyphMask(glyph: MinecraftGlyphTemplate | undefined): BinaryMask | null {
  if (!glyph) return null;
  const source = rowsToMask(glyph);
  if (glyph.height === normalizedGlyphHeight) return source;
  if (glyph.height === 8) return upscaleMask(source, 2);
  return resizeNearest(source, Math.max(1, Math.round(normalizedGlyphHeight / glyph.height)));
}

function rowsToMask(glyph: MinecraftGlyphTemplate): BinaryMask {
  const data = new Uint8Array(glyph.width * glyph.height);
  glyph.rows.forEach((row, y) => {
    const bits = BigInt(`0x${row || "0"}`);
    for (let x = 0; x < glyph.width; x += 1) {
      const shift = BigInt(glyph.width - x - 1);
      data[y * glyph.width + x] = Number((bits >> shift) & 1n);
    }
  });
  return trimMask({ width: glyph.width, height: glyph.height, data });
}

function downsampleMask(mask: BinaryMask, scale: number): BinaryMask {
  if (scale <= 1) return mask;
  const width = Math.max(1, Math.round(mask.width / scale));
  const height = Math.max(1, Math.round(mask.height / scale));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      let samples = 0;
      for (let sy = y * scale; sy < Math.min(mask.height, (y + 1) * scale); sy += 1) {
        for (let sx = x * scale; sx < Math.min(mask.width, (x + 1) * scale); sx += 1) {
          hits += mask.data[sy * mask.width + sx];
          samples += 1;
        }
      }
      data[y * width + x] = hits / Math.max(samples, 1) >= 0.35 ? 1 : 0;
    }
  }
  return { width, height, data };
}

function upscaleMask(mask: BinaryMask, scale: number): BinaryMask {
  const width = mask.width * scale;
  const height = mask.height * scale;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask.data[Math.floor(y / scale) * mask.width + Math.floor(x / scale)];
    }
  }
  return { width, height, data };
}

function resizeNearest(mask: BinaryMask, scale: number): BinaryMask {
  return scale > 1 ? upscaleMask(mask, scale) : mask;
}

function splitColumns(mask: BinaryMask): BinaryMask[] {
  const segments: BinaryMask[] = [];
  let start = -1;
  for (let x = 0; x <= mask.width; x += 1) {
    const occupied = x < mask.width && columnHasInk(mask, x);
    if (occupied && start < 0) start = x;
    if (!occupied && start >= 0) {
      segments.push(trimMask(sliceMask(mask, start, x)));
      start = -1;
    }
  }
  return segments.filter((segment) => segment.width > 0);
}

function bestGlyphMatch(mask: BinaryMask, chars: string[]): { char: string; score: number } | null {
  let best: { char: string; score: number } | null = null;
  for (const char of chars) {
    const template = glyphMask(MINECRAFT_GLYPHS[char]);
    if (!template) continue;
    const score = compareMasks(mask, template);
    if (!best || score > best.score) best = { char, score };
  }
  return best;
}

function compareMasks(left: BinaryMask, right: BinaryMask): number {
  if (left.width === 0 || right.width === 0) return 0;
  let best = 0;
  for (let shiftY = -1; shiftY <= 1; shiftY += 1) {
    for (let shiftX = -1; shiftX <= 1; shiftX += 1) {
      const width = Math.max(left.width, right.width + Math.abs(shiftX));
      const height = Math.max(left.height, right.height + Math.abs(shiftY));
      let mismatches = 0;
      let union = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const a = sample(left, x, y);
          const b = sample(right, x - shiftX, y - shiftY);
          if (a || b) union += 1;
          if (a !== b) mismatches += 1;
        }
      }
      const shape = union > 0 ? 1 - mismatches / union : 0;
      const aspectPenalty = Math.abs(left.width - right.width) / Math.max(left.width, right.width) * 0.35;
      best = Math.max(best, Math.max(0, shape - aspectPenalty));
    }
  }
  return best;
}

function sliceMask(mask: BinaryMask, startX: number, endX: number): BinaryMask {
  const width = endX - startX;
  const data = new Uint8Array(width * mask.height);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = mask.data[y * mask.width + startX + x];
    }
  }
  return { width, height: mask.height, data };
}

function columnHasInk(mask: BinaryMask, x: number): boolean {
  for (let y = 0; y < mask.height; y += 1) {
    if (mask.data[y * mask.width + x]) return true;
  }
  return false;
}

function sample(mask: BinaryMask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;
  return mask.data[y * mask.width + x];
}

function uniquePositive(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
