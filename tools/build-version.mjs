import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];

if (!["v1", "v2", "v3-old", "v3", "v4", "android-v2"].includes(version)) {
  throw new Error("Usage: node tools/build-version.mjs v1|v2|v3-old|v3|v4|android-v2");
}

run(process.execPath, [join(root, "tools", "prepare-ocr.mjs")]);
run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc")]);
const outDir = join(root, "dist", version);
rmSync(outDir, { recursive: true, force: true });
const viteArgs = ["build", "--outDir", `dist/${version}`];
if (version === "android-v2") {
  viteArgs.push("--base", "./");
}
run(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), ...viteArgs], {
  VITE_APP_VERSION: version,
});
sanitizeDirectory(outDir);
assertNoRemoteOcr(outDir);

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function sanitizeDirectory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sanitizeDirectory(path);
    } else if (/\.(js|mjs|html|css)$/.test(entry.name)) {
      sanitizeFile(path);
    }
  }
}

function sanitizeFile(file) {
  let text = readFileSync(file, "utf8");
  text = text
    .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js@v", `${ocrAssetPrefix()}local-tesseract-v`)
    .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js-core@v", `${ocrAssetPrefix()}core/local-tesseract-core-v`)
    .replaceAll("https://cdn.jsdelivr.net/npm/@tesseract.js-data/", `${ocrAssetPrefix()}lang/local-tessdata/`)
    .replaceAll("https://tessdata.projectnaptha.com/", `${ocrAssetPrefix()}lang/local-projectnaptha/`);
  writeFileSync(file, text, "utf8");
}

function ocrAssetPrefix() {
  return version === "android-v2" ? "./ocr/" : "/ocr/";
}

function assertNoRemoteOcr(dir) {
  const patterns = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "@tesseract.js-data"];
  const hits = [];
  collectHits(dir, patterns, hits);
  if (hits.length > 0) {
    throw new Error(`Remote OCR URLs remain:\n${hits.join("\n")}`);
  }
}

function collectHits(dir, patterns, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHits(path, patterns, hits);
    } else {
      const text = readFileSync(path, "utf8");
      for (const pattern of patterns) {
        if (text.includes(pattern)) hits.push(`${path}: ${pattern}`);
      }
    }
  }
}
