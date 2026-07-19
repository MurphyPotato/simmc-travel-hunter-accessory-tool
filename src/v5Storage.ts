import { Accessory, AccessoryQuality, AccessorySlot, Affix, DisplayStat } from "./domain";

export interface AccessoryStoreFileV5 {
  schema: "travel-hunter-accessory-tool:v5/accessories";
  version: 1;
  savedAt: string | null;
  accessories: Accessory[];
}

export interface V5StorageResult {
  ok: boolean;
  accessories?: Accessory[];
  error?: string;
}

const storageEndpoint = "/api/v5/accessories";
const schema = "travel-hunter-accessory-tool:v5/accessories";
const pngDataUrlPattern = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const validSlots = new Set<AccessorySlot>(["mainRing", "subRing", "mainAmulet", "subAmulet"]);
const validQualities = new Set<AccessoryQuality>(["dim", "fine", "divine"]);
const validStats = new Set<DisplayStat>([
  "hunterDamageMultiplier",
  "hunterCritChance",
  "hunterCritDamage",
  "bowMasteryMultiplier",
  "swordMasteryMultiplier",
  "bowFinalDamage",
  "swordFinalDamage",
  "bowExtraDamage",
  "swordExtraDamage",
  "damageReduction",
  "sneakSpeed",
  "vanilla",
]);

export async function loadAccessoryPoolV5(): Promise<V5StorageResult> {
  try {
    const response = await fetch(storageEndpoint, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`读取失败 ${response.status}`);
    const payload = await response.json() as Partial<AccessoryStoreFileV5>;
    return {
      ok: true,
      accessories: sanitizeAccessoriesV5(Array.isArray(payload.accessories) ? payload.accessories : []),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法读取 v5 文件饰品库",
      accessories: [],
    };
  }
}

export async function saveAccessoryPoolV5(accessories: Accessory[]): Promise<V5StorageResult> {
  const sanitized = sanitizeAccessoriesV5(accessories);
  const payload: AccessoryStoreFileV5 = {
    schema,
    version: 1,
    savedAt: new Date().toISOString(),
    accessories: sanitized,
  };

  try {
    const response = await fetch(storageEndpoint, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`保存失败 ${response.status}`);
    return { ok: true, accessories: sanitized };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法保存 v5 文件饰品库",
      accessories: sanitized,
    };
  }
}

export function accessoryStorageLocationV5(): string {
  return "工具目录 data/accessories-v5.json";
}

export function isSafeTooltipPngDataUrl(value: unknown): value is string {
  return typeof value === "string" && pngDataUrlPattern.test(value);
}

export function sanitizeAccessoriesV5(accessories: Accessory[]): Accessory[] {
  return accessories
    .map(sanitizeAccessoryV5)
    .filter((accessory): accessory is Accessory => Boolean(accessory));
}

function sanitizeAccessoryV5(accessory: Accessory): Accessory | null {
  if (!validSlots.has(accessory.slot) || !validQualities.has(accessory.quality)) return null;
  const imageUrl = accessory.imageKind === "tooltip-crop" && isSafeTooltipPngDataUrl(accessory.imageUrl)
    ? accessory.imageUrl
    : undefined;
  return {
    id: typeof accessory.id === "string" && accessory.id ? accessory.id : cryptoSafeId(),
    name: typeof accessory.name === "string" ? accessory.name : undefined,
    slot: accessory.slot,
    quality: accessory.quality,
    level: Number.isFinite(accessory.level) ? accessory.level : 0,
    affixes: sanitizeAffixes(accessory.affixes),
    source: accessory.source === "manual" ? "manual" : "ocr",
    ...(imageUrl ? { imageUrl, imageKind: "tooltip-crop" as const } : {}),
  };
}

function sanitizeAffixes(affixes: Affix[] | undefined): Affix[] {
  if (!Array.isArray(affixes)) return [];
  return affixes
    .filter((affix) => validStats.has(affix.stat))
    .map((affix) => ({
      id: typeof affix.id === "string" && affix.id ? affix.id : cryptoSafeId(),
      stat: affix.stat,
      value: Number.isFinite(affix.value) ? affix.value : 0,
      label: typeof affix.label === "string" ? affix.label : undefined,
      confidence: affix.confidence === "low" ? "low" : affix.confidence === "high" ? "high" : undefined,
      warning: typeof affix.warning === "string" ? affix.warning : undefined,
    }));
}

function cryptoSafeId(): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
