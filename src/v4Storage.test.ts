import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeState = vi.hoisted(() => ({ enabled: true }));
const filesystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativeState.enabled,
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: filesystem,
}));

import {
  accessoryStorageLocation,
  loadAccessoryPoolFromFile,
  saveAccessoryPoolToFile,
} from "./v4Storage";

describe("v4 native accessory storage", () => {
  beforeEach(() => {
    nativeState.enabled = true;
    filesystem.readFile.mockReset();
    filesystem.writeFile.mockReset();
  });

  it("treats a missing first-run file as an empty accessory pool", async () => {
    filesystem.readFile.mockRejectedValue({ code: "OS-PLUG-FILE-0008", message: "File does not exist" });

    await expect(loadAccessoryPoolFromFile()).resolves.toEqual({ ok: true, accessories: [] });
    expect(accessoryStorageLocation()).toBe("手机应用数据目录 accessories-v4.json");
  });

  it("restores confirmed accessories from the app data directory", async () => {
    filesystem.readFile.mockResolvedValue({
      data: JSON.stringify({
        schema: "travel-hunter-accessory-tool:v4/accessories",
        version: 1,
        savedAt: null,
        accessories: [{
          id: "saved-1",
          name: "测试饰品",
          slot: "mainRing",
          quality: "divine",
          level: 8,
          affixes: [{ id: "affix-1", stat: "hunterCritDamage", value: 0.18 }],
          source: "ocr",
        }],
      }),
    });

    const result = await loadAccessoryPoolFromFile();

    expect(result.ok).toBe(true);
    expect(result.accessories).toHaveLength(1);
    expect(result.accessories?.[0].name).toBe("测试饰品");
  });

  it("writes confirmed accessories as UTF-8 JSON", async () => {
    filesystem.writeFile.mockResolvedValue({ uri: "file:///data/accessories-v4.json" });

    const result = await saveAccessoryPoolToFile([{
      id: "saved-2",
      slot: "subRing",
      quality: "fine",
      level: 5,
      affixes: [],
      source: "manual",
    }]);

    expect(result.ok).toBe(true);
    expect(filesystem.writeFile).toHaveBeenCalledOnce();
    expect(filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: "accessories-v4.json",
      directory: "DATA",
      encoding: "utf8",
    }));
    const payload = JSON.parse(filesystem.writeFile.mock.calls[0][0].data);
    expect(payload.schema).toBe("travel-hunter-accessory-tool:v4/accessories");
    expect(payload.accessories).toHaveLength(1);
  });
});
