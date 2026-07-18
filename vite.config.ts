import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function localizeTesseractDefaults() {
  return {
    name: "localize-tesseract-defaults",
    renderChunk(code: string) {
      return code
        .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js@v", "/ocr/local-tesseract-v")
        .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js-core@v", "/ocr/core/local-tesseract-core-v")
        .replaceAll("https://cdn.jsdelivr.net/npm/@tesseract.js-data/", "/ocr/lang/local-tessdata/")
        .replaceAll("https://tessdata.projectnaptha.com/", "/ocr/lang/local-projectnaptha/");
    },
  };
}

function accessoryStoreApi(version: "v3" | "v4") {
  const storePath = join(process.cwd(), "data", `accessories-${version}.json`);
  const schema = `travel-hunter-accessory-tool:${version}/accessories`;
  return {
    name: `${version}-accessory-store-api`,
    configureServer(server) {
      server.middlewares.use(`/api/${version}/accessories`, (request, response) => {
        if (request.method === "GET") {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(readAccessoryStore(storePath, schema));
          return;
        }

        if (request.method === "PUT") {
          readRequestBody(request, 80 * 1024 * 1024)
            .then((body) => {
              JSON.parse(body);
              mkdirSync(dirname(storePath), { recursive: true });
              writeFileSync(storePath, body, "utf8");
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ ok: true }));
            })
            .catch((error) => {
              response.statusCode = 400;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Bad request" }));
            });
          return;
        }

        response.statusCode = 405;
        response.setHeader("Allow", "GET, PUT");
        response.end("Method Not Allowed");
      });
    },
  };
}

function v4DevelopmentFontAssets() {
  const fontDirectory = join(process.cwd(), "tools", "cache", "modernui-fonts");
  const fontFiles = new Set([
    "source-han-sans-cn-medium.otf",
    "inter-frozen-medium.otf",
    "inter-frozen-medium-italic.otf",
  ]);
  return {
    name: "v4-development-font-assets",
    configureServer(server) {
      server.middlewares.use("/__v4-dev-fonts/", (request, response) => {
        const fileName = decodeURIComponent((request.url ?? "").split(/[?#]/, 1)[0]).replace(/^\/+/, "");
        if (!fontFiles.has(fileName)) {
          response.statusCode = 404;
          response.end("Not Found");
          return;
        }
        const filePath = join(fontDirectory, fileName);
        if (!existsSync(filePath)) {
          response.statusCode = 404;
          response.end("Run node tools/extract-v4-modernui-fonts.mjs first");
          return;
        }
        response.setHeader("Content-Type", "font/otf");
        response.setHeader("Cache-Control", "no-store");
        response.end(readFileSync(filePath));
      });
    },
  };
}

function readAccessoryStore(storePath: string, schema: string) {
  if (!existsSync(storePath)) {
    return JSON.stringify({
      schema,
      version: 1,
      savedAt: null,
      accessories: [],
    });
  }
  return readFileSync(storePath, "utf8");
}

function readRequestBody(request: NodeJS.ReadableStream, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("保存数据过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export default defineConfig({
  plugins: [
    react(),
    localizeTesseractDefaults(),
    accessoryStoreApi("v3"),
    accessoryStoreApi("v4"),
    v4DevelopmentFontAssets(),
  ],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION ?? "v1"),
  },
});
