import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const materialDir = join(root, "优化OCR用-素材", "现代化UI-思源黑体");
const explicitJar = process.argv[2] ? resolve(process.argv[2]) : null;
const jar = explicitJar ?? readdirSync(materialDir)
  .map((name) => join(materialDir, name))
  .find((path) => path.toLowerCase().endsWith(".jar") && statSync(path).isFile());

if (!jar || !existsSync(jar)) {
  throw new Error("ModernUI JAR not found. Pass its path as the first argument.");
}

const outputDir = join(root, "tools", "cache", "modernui-fonts");
const entries = {
  "source-han-sans-cn-medium.otf": "assets/modernui/font/source-han-sans-cn-medium.otf",
  "inter-frozen-medium.otf": "assets/modernui/font/inter-frozen-medium.otf",
  "inter-frozen-medium-italic.otf": "assets/modernui/font/inter-frozen-medium-italic.otf",
};

mkdirSync(outputDir, { recursive: true });
const manifest = {
  sourceJar: jar,
  extractedAt: new Date().toISOString(),
  files: {},
};

for (const [name, entry] of Object.entries(entries)) {
  const bytes = execFileSync("tar", ["-xOf", jar, entry], { maxBuffer: 64 * 1024 * 1024 });
  const path = join(outputDir, name);
  writeFileSync(path, bytes);
  manifest.files[name] = {
    jarEntry: entry,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`Extracted ${Object.keys(entries).length} ModernUI fonts to ${outputDir}`);
