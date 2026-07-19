import { Accessory, AccessoryQuality, AccessorySlot, Affix, DisplayStat } from "./domain";
import { Capacitor } from "@capacitor/core";

export interface AccessoryStoreFile {
  schema: "travel-hunter-accessory-tool:v4/accessories";
  version: 1;
  savedAt: string | null;
  accessories: Accessory[];
}

export interface StorageResult {
  ok: boolean;
  accessories?: Accessory[];
  error?: string;
}

const storageEndpoint = "/api/v4/accessories";
const schema = "travel-hunter-accessory-tool:v4/accessories";
const nativeStoragePath = "accessories-v4.json";

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
  if (Capacitor.isNativePlatform()) {
    return loadAccessoryPoolFromNativeFile();
  }

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

  if (Capacitor.isNativePlatform()) {
    return saveAccessoryPoolToNativeFile(payload);
  }

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

export function accessoryStorageLocation(): string {
  return Capacitor.isNativePlatform()
    ? "手机应用数据目录 accessories-v4.json"
    : "工具目录 data/accessories-v4.json";
}

async function loadAccessoryPoolFromNativeFile(): Promise<StorageResult> {
  try {
    const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: nativeStoragePath,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    const text = typeof result.data === "string" ? result.data : await result.data.text();
    const payload = JSON.parse(text) as Partial<AccessoryStoreFile>;
    return {
      ok: true,
      accessories: sanitizeAccessories(Array.isArray(payload.accessories) ? payload.accessories : []),
    };
  } catch (error) {
    if (isMissingNativeFile(error)) {
      return { ok: true, accessories: [] };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法读取手机饰品库",
      accessories: [],
    };
  }
}

async function saveAccessoryPoolToNativeFile(payload: AccessoryStoreFile): Promise<StorageResult> {
  try {
    const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: nativeStoragePath,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(payload),
    });
    return { ok: true, accessories: payload.accessories };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法保存手机饰品库",
      accessories: payload.accessories,
    };
  }
}

function isMissingNativeFile(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "OS-PLUG-FILE-0008" || /not found|does not exist|不存在/i.test(message);
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
