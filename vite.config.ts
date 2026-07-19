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

const v5ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");
const v5DevelopmentContentSecurityPolicy = v5ContentSecurityPolicy.replace(
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
);
const v5MetaContentSecurityPolicy = v5ContentSecurityPolicy.replace("; frame-ancestors 'none'", "");

function accessoryStoreApi(version: "v3" | "v4" | "v5") {
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
          if (version === "v5") {
            const host = request.headers.host ?? "";
            const sameOrigin = request.headers.origin === `http://${host}`
              || request.headers["sec-fetch-site"] === "same-origin";
            if (!sameOrigin) {
              response.statusCode = 403;
              response.end("Same-origin write required");
              return;
            }
          }
          readRequestBody(request, 80 * 1024 * 1024)
            .then((body) => {
              const payload = JSON.parse(body);
              if (version === "v5") validateV5StorePayload(payload, schema);
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

function validateV5StorePayload(payload: unknown, schema: string) {
  if (!payload || typeof payload !== "object") throw new Error("无效的 v5 饰品库");
  const store = payload as { schema?: unknown; version?: unknown; accessories?: unknown };
  if (store.schema !== schema || store.version !== 1 || !Array.isArray(store.accessories)) {
    throw new Error("v5 饰品库 schema 不匹配");
  }
  for (const accessory of store.accessories) {
    if (!accessory || typeof accessory !== "object") throw new Error("无效的饰品数据");
    const item = accessory as { imageUrl?: unknown; imageKind?: unknown };
    if (item.imageUrl === undefined && item.imageKind === undefined) continue;
    if (item.imageKind !== "tooltip-crop"
      || typeof item.imageUrl !== "string"
      || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.imageUrl)) {
      throw new Error("v5 只允许保存 PNG tooltip 裁剪");
    }
  }
}

function v5SecurityPolicy() {
  const enabled = process.env.VITE_APP_VERSION === "v5";
  return {
    name: "v5-local-security-policy",
    transformIndexHtml(html: string, context) {
      if (!enabled) return html;
      if (context.server) return html;
      return html.replace(
        "<meta charset=\"UTF-8\" />",
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${v5MetaContentSecurityPolicy}" />\n    <meta name="referrer" content="no-referrer" />`,
      );
    },
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((request, response, next) => {
        const host = request.headers.host ?? "";
        if (!/^127\.0\.0\.1:\d+$/.test(host)) {
          response.statusCode = 421;
          response.end("Local host required");
          return;
        }
        const expectedOrigin = `http://${host}`;
        const origin = request.headers.origin;
        const fetchSite = request.headers["sec-fetch-site"];
        if ((origin && origin !== expectedOrigin)
          || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
          response.statusCode = 403;
          response.end("Cross-origin request blocked");
          return;
        }
        response.setHeader("Content-Security-Policy", v5DevelopmentContentSecurityPolicy);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()");
        response.setHeader("X-Frame-Options", "DENY");
        next();
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
    v5SecurityPolicy(),
    accessoryStoreApi("v3"),
    accessoryStoreApi("v4"),
    accessoryStoreApi("v5"),
    v4DevelopmentFontAssets(),
  ],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION ?? "v1"),
  },
});
