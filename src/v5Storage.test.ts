import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSafeTooltipPngDataUrl,
  loadAccessoryPoolV5,
  sanitizeAccessoriesV5,
  saveAccessoryPoolV5,
} from "./v5Storage";

const png = "data:image/png;base64,iVBORw0KGgo=";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v5 accessory storage", () => {
  it("accepts only base64 PNG tooltip crops", () => {
    expect(isSafeTooltipPngDataUrl(png)).toBe(true);
    expect(isSafeTooltipPngDataUrl("https://example.com/a.png")).toBe(false);
    expect(isSafeTooltipPngDataUrl("file:///C:/secret.png")).toBe(false);
    expect(isSafeTooltipPngDataUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeTooltipPngDataUrl("data:image/jpeg;base64,AAAA")).toBe(false);
  });

  it("strips full or external screenshots and preserves an explicit tooltip crop", () => {
    const base = {
      id: "item",
      slot: "mainRing" as const,
      quality: "divine" as const,
      level: 8,
      affixes: [],
      source: "ocr" as const,
    };
    const sanitized = sanitizeAccessoriesV5([
      { ...base, id: "crop", imageUrl: png, imageKind: "tooltip-crop" },
      { ...base, id: "legacy-full", imageUrl: png },
      { ...base, id: "remote", imageUrl: "https://example.com/a.png", imageKind: "tooltip-crop" },
    ]);

    expect(sanitized[0]).toMatchObject({ id: "crop", imageUrl: png, imageKind: "tooltip-crop" });
    expect(sanitized[1].imageUrl).toBeUndefined();
    expect(sanitized[1].imageKind).toBeUndefined();
    expect(sanitized[2].imageUrl).toBeUndefined();
  });

  it("loads through only the v5 API and sanitizes persisted data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schema: "travel-hunter-accessory-tool:v5/accessories",
        version: 1,
        accessories: [{
          id: "remote",
          slot: "subRing",
          quality: "fine",
          level: 5,
          affixes: [],
          source: "ocr",
          imageUrl: "https://example.com/private.png",
          imageKind: "tooltip-crop",
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAccessoryPoolV5();

    expect(fetchMock).toHaveBeenCalledWith("/api/v5/accessories", expect.any(Object));
    expect(result.accessories?.[0].imageUrl).toBeUndefined();
  });

  it("writes an empty v5 file immediately when asked to save an empty pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveAccessoryPoolV5([])).resolves.toMatchObject({ ok: true, accessories: [] });

    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("/api/v5/accessories");
    const body = JSON.parse(request[1].body);
    expect(body.schema).toBe("travel-hunter-accessory-tool:v5/accessories");
    expect(body.accessories).toEqual([]);
  });
});
