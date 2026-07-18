import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = join(root, "tools", "cache", "minecraft-1.21.8");
const clientJar = join(cache, "client.jar");
const unifontZip = join(cache, "unifont.zip");
const output = join(root, "src", "generated", "minecraftFontV4.ts");

const phrases = [
  "旅猎伤害加成倍率",
  "旅猎伤害倍率",
  "旅猎倍率",
  "旅猎暴击概率",
  "旅猎暴击率",
  "旅猎暴击效果",
  "旅猎爆伤",
  "弓专精伤害倍率加成",
  "弓专精伤害倍率",
  "剑专精伤害倍率加成",
  "剑专精伤害倍率",
  "弓专精最终伤害加成",
  "弓专精最终伤害",
  "剑专精最终伤害加成",
  "剑专精最终伤害",
  "弓额外伤害加成",
  "弓额外伤害",
  "剑额外伤害加成",
  "剑额外伤害",
  "百分比伤害减免",
  "潜行速度",
  "主戒指副戒指主护符副护符黯淡精工神铸宝石护身符属性『』+0123456789.%",
];

const required = new Set([...phrases.join("")]);
const hexText = execFileSync(
  "tar",
  ["-xOf", unifontZip, "unifont_all_no_pua-16.0.03.hex"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
const asciiPng = execFileSync(
  "tar",
  ["-xOf", clientJar, "assets/minecraft/textures/font/ascii.png"],
  { maxBuffer: 4 * 1024 * 1024 },
);

const unicodeGlyphs = parseUnihex(hexText, required);
const asciiImage = decodePng(asciiPng);
const glyphs = {};

for (const char of [...required].sort((left, right) => left.codePointAt(0) - right.codePointAt(0))) {
  const codePoint = char.codePointAt(0);
  const glyph = codePoint < 128
    ? extractAsciiGlyph(asciiImage, codePoint)
    : unicodeGlyphs.get(codePoint);
  if (glyph) glyphs[char] = glyph;
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `// Generated from the official Minecraft 1.21.8 client font assets.\n` +
    `// Regenerate with: node tools/generate-v4-font-templates.mjs\n` +
    `export interface MinecraftGlyphTemplate { width: number; height: number; rows: string[] }\n\n` +
    `export const MINECRAFT_FONT_VERSION = "1.21.8";\n\n` +
    `export const MINECRAFT_GLYPHS: Record<string, MinecraftGlyphTemplate> = ${JSON.stringify(glyphs, null, 2)};\n`,
  "utf8",
);

console.log(`Generated ${Object.keys(glyphs).length} Minecraft glyph templates at ${output}`);

function parseUnihex(text, wanted) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const codePoint = Number.parseInt(line.slice(0, separator), 16);
    const char = String.fromCodePoint(codePoint);
    if (!wanted.has(char)) continue;
    const data = line.slice(separator + 1).trim();
    const height = 16;
    const rowDigits = data.length / height;
    if (!Number.isInteger(rowDigits) || rowDigits < 2 || rowDigits > 8) continue;
    result.set(codePoint, {
      width: rowDigits * 4,
      height,
      rows: Array.from({ length: height }, (_, index) => data.slice(index * rowDigits, (index + 1) * rowDigits)),
    });
  }
  return result;
}

function extractAsciiGlyph(image, codePoint) {
  const cellWidth = image.width / 16;
  const cellHeight = image.height / 16;
  const cellX = (codePoint % 16) * cellWidth;
  const cellY = Math.floor(codePoint / 16) * cellHeight;
  const rows = [];
  let minX = cellWidth;
  let maxX = -1;
  for (let y = 0; y < cellHeight; y += 1) {
    let bits = 0;
    for (let x = 0; x < cellWidth; x += 1) {
      const pixel = image.pixels[(cellY + y) * image.width + cellX + x];
      const visible = pixel.a > 32 && Math.max(pixel.r, pixel.g, pixel.b) > 32;
      if (visible) {
        bits |= 1 << (cellWidth - x - 1);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    rows.push(bits);
  }
  if (maxX < minX) return { width: 2, height: cellHeight, rows: rows.map(() => "00") };
  const width = maxX - minX + 1;
  const mask = (1 << width) - 1;
  return {
    width,
    height: cellHeight,
    rows: rows.map((bits) => ((bits >> (cellWidth - maxX - 1)) & mask).toString(16).padStart(Math.ceil(width / 4), "0")),
  };
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Invalid PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "PLTE") {
      palette = Array.from({ length: data.length / 3 }, (_, index) => ({
        r: data[index * 3],
        g: data[index * 3 + 1],
        b: data[index * 3 + 2],
      }));
    } else if (type === "tRNS") {
      transparency = [...data];
    } else if (type === "IEND") {
      break;
    }
  }
  const indexed = colorType === 3 && [1, 2, 4, 8].includes(bitDepth);
  if (!indexed && (bitDepth !== 8 || ![2, 6].includes(colorType))) {
    throw new Error(`Unsupported PNG type ${colorType}/${bitDepth}`);
  }
  if (indexed && !palette) throw new Error("Indexed PNG is missing PLTE");
  const channels = indexed ? 1 : colorType === 6 ? 4 : 3;
  const filterBytesPerPixel = indexed ? 1 : channels;
  const stride = indexed ? Math.ceil((width * bitDepth) / 8) : width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= filterBytesPerPixel ? raw[rowOffset + x - filterBytesPerPixel] : 0;
      const up = y > 0 ? raw[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= filterBytesPerPixel ? raw[rowOffset - stride + x - filterBytesPerPixel] : 0;
      raw[rowOffset + x] = unfilter(value, filter, left, up, upperLeft);
    }
    sourceOffset += stride;
  }
  const pixels = [];
  if (indexed) {
    const mask = (1 << bitDepth) - 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bitOffset = x * bitDepth;
        const byte = raw[y * stride + Math.floor(bitOffset / 8)];
        const shift = 8 - bitDepth - (bitOffset % 8);
        const paletteIndex = (byte >> shift) & mask;
        const color = palette[paletteIndex] ?? { r: 0, g: 0, b: 0 };
        pixels.push({ ...color, a: transparency?.[paletteIndex] ?? 255 });
      }
    }
    return { width, height, pixels };
  }
  for (let index = 0; index < raw.length; index += channels) {
    pixels.push({
      r: raw[index],
      g: raw[index + 1],
      b: raw[index + 2],
      a: channels === 4 ? raw[index + 3] : 255,
    });
  }
  return { width, height, pixels };
}

function unfilter(value, filter, left, up, upperLeft) {
  if (filter === 0) return value;
  if (filter === 1) return (value + left) & 255;
  if (filter === 2) return (value + up) & 255;
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 255;
  if (filter === 4) return (value + paeth(left, up, upperLeft)) & 255;
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  if (upDistance <= diagonalDistance) return up;
  return upperLeft;
}
