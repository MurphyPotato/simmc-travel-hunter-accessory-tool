import { AccessoryQuality, AccessorySlot, DisplayStat } from "./domain";
import { V4BenchmarkAccessory, V4BenchmarkCase } from "./ocrV4BenchmarkData";
import { BinaryMask, renderTextMask } from "./ocrV4Templates";

export interface V4SyntheticBenchmarkCase {
  id: string;
  label: string;
  benchmark: V4BenchmarkCase;
  file: File;
}

interface SyntheticAffix {
  stat: DisplayStat;
  label: string;
  value: number;
  renderedValue: string;
}

interface SyntheticAccessory {
  name: string;
  quality: AccessoryQuality;
  qualityText: string;
  itemText: string;
  slot: AccessorySlot;
  slotText: string;
  level: number;
  affixes: SyntheticAffix[];
}

interface RasterVariant {
  id: string;
  label: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  cropLeft?: number;
  cropTop?: number;
  format: "image/png" | "image/jpeg";
  quality?: number;
  palette: number;
}

const minecraftAccessory: SyntheticAccessory = {
  name: "神铸护身符『主护符』",
  quality: "divine",
  qualityText: "神铸",
  itemText: "护身符",
  slot: "mainAmulet",
  slotText: "主护符",
  level: 8,
  affixes: [
    stat("swordMasteryMultiplier", "剑专精伤害倍率", 0.04, "+0.04"),
    stat("hunterCritChance", "旅猎暴击概率", 8.5, "+8.50"),
    stat("bowFinalDamage", "弓专精最终伤害", 1.79, "+1.79"),
    stat("swordExtraDamage", "剑额外伤害", 6.23, "+6.23"),
  ],
};

const modernAccessory: SyntheticAccessory = {
  name: "精工指环『副戒指』",
  quality: "fine",
  qualityText: "精工",
  itemText: "指环",
  slot: "subRing",
  slotText: "副戒指",
  level: 5,
  affixes: [
    stat("hunterCritChance", "旅猎暴击概率", 5.5, "+5.50"),
    stat("bowExtraDamage", "弓额外伤害", 6.68, "+6.68"),
    stat("swordFinalDamage", "剑专精最终伤害", 1.89, "+1.89"),
  ],
};

const minecraftVariants: RasterVariant[] = [
  { id: "mc-base", label: "原版色彩 / GUI 1x", scale: 1, offsetX: 0, offsetY: 0, format: "image/png", palette: 0 },
  { id: "mc-scale-2", label: "原版色彩 / GUI 2x", scale: 2, offsetX: 0, offsetY: 0, format: "image/png", palette: 0 },
  { id: "mc-offset", label: "替代色彩 / 裁剪偏移", scale: 1, offsetX: 11, offsetY: 7, cropLeft: 3, cropTop: 2, format: "image/png", palette: 1 },
  { id: "mc-jpeg", label: "替代色彩 / JPEG 轻压缩", scale: 1, offsetX: 0, offsetY: 0, format: "image/jpeg", quality: 0.88, palette: 1 },
];

const modernVariants: RasterVariant[] = [
  { id: "modern-base", label: "思源黑体 / 原始尺寸", scale: 1, offsetX: 0, offsetY: 0, format: "image/png", palette: 0 },
  { id: "modern-scale", label: "思源黑体 / 1.2x 缩放", scale: 1.2, offsetX: 0, offsetY: 0, format: "image/png", palette: 0 },
  { id: "modern-offset", label: "思源黑体 / 裁剪偏移", scale: 1, offsetX: 9, offsetY: 5, cropLeft: 2, cropTop: 1, format: "image/png", palette: 1 },
  { id: "modern-jpeg", label: "思源黑体 / JPEG 轻压缩", scale: 1, offsetX: 0, offsetY: 0, format: "image/jpeg", quality: 0.9, palette: 1 },
];

export async function createV4SyntheticBenchmarkCases(): Promise<V4SyntheticBenchmarkCase[]> {
  await loadModernUiFonts();
  const cases: V4SyntheticBenchmarkCase[] = [];
  const minecraftBase = renderMinecraftTooltip(minecraftAccessory);
  const modernBase = renderModernTooltip(modernAccessory);
  for (const variant of minecraftVariants) {
    cases.push(await createCase("minecraft-1.21.8", minecraftAccessory, minecraftBase, variant));
  }
  for (const variant of modernVariants) {
    cases.push(await createCase("modernui-source-han", modernAccessory, modernBase, variant));
  }
  return cases;
}

async function createCase(
  profile: V4BenchmarkCase["profile"],
  accessory: SyntheticAccessory,
  base: HTMLCanvasElement,
  variant: RasterVariant,
): Promise<V4SyntheticBenchmarkCase> {
  const canvas = transformCanvas(base, variant, profile === "modernui-source-han");
  const extension = variant.format === "image/png" ? "png" : "jpg";
  const fileName = `synthetic-${variant.id}.${extension}`;
  return {
    id: variant.id,
    label: variant.label,
    benchmark: {
      fileName,
      collection: profile === "minecraft-1.21.8" ? "minecraft-original" : "modernui",
      split: "development",
      profile,
      expected: benchmarkAccessory(accessory),
    },
    file: await canvasFile(canvas, fileName, variant.format, variant.quality),
  };
}

function benchmarkAccessory(accessory: SyntheticAccessory): V4BenchmarkAccessory {
  return {
    name: accessory.name,
    quality: accessory.quality,
    slot: accessory.slot,
    level: accessory.level,
    affixes: accessory.affixes.map(({ stat: statName, value, label }) => ({ stat: statName, value, label })),
  };
}

function renderMinecraftTooltip(accessory: SyntheticAccessory): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建原版字体合成画布");
  context.fillStyle = "rgb(16, 2, 18)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgb(70, 8, 92)";
  context.lineWidth = 2;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  let cursor = 12;
  cursor = drawMinecraftText(context, `${accessory.qualityText}${accessory.itemText}`, cursor, 10, "#fff15b") + 8;
  cursor = drawMinecraftText(context, `『${accessory.slotText}』`, cursor, 10, "#ffff22") + 12;
  drawMinecraftText(context, `+${accessory.level}`, cursor, 10, "#20ff28");
  drawMinecraftText(context, "属性：", 12, 39, "#20ff28");

  const colors = ["#22dbff", "#7dff31", "#ff48b8", "#f0ff3d"];
  accessory.affixes.forEach((affix, index) => {
    const y = 68 + index * 29;
    drawMinecraftText(context, `『${affix.label}』`, 22, y, colors[index % colors.length]);
    drawMinecraftText(context, affix.renderedValue, 356, y, "#fff63c");
  });
  return canvas;
}

function drawMinecraftText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): number {
  const mask = renderTextMask(text);
  paintMask(context, mask, x + 2, y + 2, shadowColor(color));
  paintMask(context, mask, x, y, color);
  return x + mask.width;
}

function paintMask(
  context: CanvasRenderingContext2D,
  mask: BinaryMask,
  x: number,
  y: number,
  color: string,
) {
  context.fillStyle = color;
  for (let row = 0; row < mask.height; row += 1) {
    for (let column = 0; column < mask.width; column += 1) {
      if (mask.data[row * mask.width + column]) context.fillRect(x + column, y + row, 1, 1);
    }
  }
}

function shadowColor(color: string): string {
  const value = Number.parseInt(color.slice(1), 16);
  const r = Math.floor(((value >> 16) & 255) * 0.22);
  const g = Math.floor(((value >> 8) & 255) * 0.22);
  const b = Math.floor((value & 255) * 0.22);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderModernTooltip(accessory: SyntheticAccessory): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 440;
  canvas.height = 194;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建 ModernUI 合成画布");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "top";

  const titleFont = '26px "V4 Source Han Sans"';
  const valueFont = '25px "V4 Inter"';
  let cursor = 8;
  cursor = drawModernText(context, `${accessory.qualityText}${accessory.itemText}`, cursor, 4, "#fffbe8", titleFont) + 7;
  cursor = drawModernText(context, `『${accessory.slotText}』`, cursor, 4, "#ffff24", titleFont) + 10;
  drawModernText(context, `+${accessory.level}`, cursor, 4, "#24ff36", valueFont);
  context.fillStyle = "#bfc1c2";
  context.fillRect(0, 36, canvas.width, 2);
  drawModernText(context, "属性：", 8, 42, "#24ff36", titleFont);

  const colors = ["#ff4c7e", "#19c9ff", "#ff45bd"];
  accessory.affixes.forEach((affix, index) => {
    const y = 73 + index * 36;
    drawModernText(context, `『${affix.label}』`, 22, y, colors[index % colors.length], titleFont);
    drawModernText(context, affix.renderedValue, 318, y, "#fff63a", valueFont);
  });
  return canvas;
}

function drawModernText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
): number {
  context.font = font;
  context.fillStyle = color;
  context.fillText(text, x, y);
  return x + context.measureText(text).width;
}

function transformCanvas(base: HTMLCanvasElement, variant: RasterVariant, smooth: boolean): HTMLCanvasElement {
  const cropLeft = variant.cropLeft ?? 0;
  const cropTop = variant.cropTop ?? 0;
  const sourceWidth = base.width - cropLeft;
  const sourceHeight = base.height - cropTop;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(sourceWidth * variant.scale + variant.offsetX * 2);
  canvas.height = Math.ceil(sourceHeight * variant.scale + variant.offsetY * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建合成变体画布");
  context.fillStyle = smooth ? "#000" : "#16121a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    base,
    cropLeft,
    cropTop,
    sourceWidth,
    sourceHeight,
    variant.offsetX,
    variant.offsetY,
    sourceWidth * variant.scale,
    sourceHeight * variant.scale,
  );
  if (variant.palette > 0) applyPaletteNudge(context, canvas.width, canvas.height, smooth);
  return canvas;
}

function applyPaletteNudge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  smooth: boolean,
) {
  const image = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const brightness = (r + g + b) / 3;
    if (brightness < 65) continue;
    image.data[offset] = Math.min(255, r + (smooth ? 2 : 5));
    image.data[offset + 1] = Math.min(255, g + 3);
    image.data[offset + 2] = Math.max(0, b - (smooth ? 1 : 3));
  }
  context.putImageData(image, 0, 0);
}

async function loadModernUiFonts() {
  const sourceHan = new FontFace(
    "V4 Source Han Sans",
    "url('/__v4-dev-fonts/source-han-sans-cn-medium.otf') format('opentype')",
    { weight: "500" },
  );
  const inter = new FontFace(
    "V4 Inter",
    "url('/__v4-dev-fonts/inter-frozen-medium.otf') format('opentype')",
    { weight: "500" },
  );
  try {
    const loaded = await Promise.all([sourceHan.load(), inter.load()]);
    loaded.forEach((font) => document.fonts.add(font));
    await document.fonts.ready;
  } catch (error) {
    throw new Error(`ModernUI 开发字体不可用：${error instanceof Error ? error.message : String(error)}`);
  }
}

function canvasFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  type: "image/png" | "image/jpeg",
  quality = 0.92,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`无法生成 ${fileName}`));
        return;
      }
      resolve(new File([blob], fileName, { type, lastModified: Date.now() }));
    }, type, quality);
  });
}

function stat(statName: DisplayStat, label: string, value: number, text: string): SyntheticAffix {
  return { stat: statName, label, value, renderedValue: text };
}
