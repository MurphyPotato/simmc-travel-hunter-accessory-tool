import { Accessory, AccessoryQuality, AccessorySlot, Affix, DisplayStat } from "./domain";

export interface AccessoryStoreFile {
  schema: "travel-hunter-accessory-tool:v3/accessories";
  version: 1;
  savedAt: string | null;
  accessories: Accessory[];
}

export interface StorageResult {
  ok: boolean;
  accessories?: Accessory[];
  error?: string;
}

const storageEndpoint = "/api/v3/accessories";
const schema = "travel-hunter-accessory-tool:v3/accessories";

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

export async function loadAccessoryPoolFromFile(): Promise<StorageResult> {
  try {
    const response = await fetch(storageEndpoint, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`读取失败 ${response.status}`);
    const payload = await response.json() as Partial<AccessoryStoreFile>;
    return {
      ok: true,
      accessories: sanitizeAccessories(Array.isArray(payload.accessories) ? payload.accessories : []),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法读取文件仓库",
      accessories: [],
    };
  }
}

export async function saveAccessoryPoolToFile(accessories: Accessory[]): Promise<StorageResult> {
  const payload: AccessoryStoreFile = {
    schema,
    version: 1,
    savedAt: new Date().toISOString(),
    accessories: sanitizeAccessories(accessories),
  };

  try {
    const response = await fetch(storageEndpoint, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`保存失败 ${response.status}`);
    return { ok: true, accessories: payload.accessories };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法保存文件仓库",
      accessories: payload.accessories,
    };
  }
}

export function sanitizeAccessories(accessories: Accessory[]): Accessory[] {
  return accessories
    .map(sanitizeAccessory)
    .filter((accessory): accessory is Accessory => Boolean(accessory));
}

function sanitizeAccessory(accessory: Accessory): Accessory | null {
  if (!validSlots.has(accessory.slot) || !validQualities.has(accessory.quality)) return null;
  return {
    id: typeof accessory.id === "string" && accessory.id ? accessory.id : cryptoSafeId(),
    name: typeof accessory.name === "string" ? accessory.name : undefined,
    slot: accessory.slot,
    quality: accessory.quality,
    level: Number.isFinite(accessory.level) ? accessory.level : 0,
    affixes: sanitizeAffixes(accessory.affixes),
    source: accessory.source === "manual" ? "manual" : "ocr",
    imageUrl: typeof accessory.imageUrl === "string" ? accessory.imageUrl : undefined,
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
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
