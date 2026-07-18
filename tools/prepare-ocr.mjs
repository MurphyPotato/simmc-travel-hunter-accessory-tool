import {
  createWriteStream,
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicOcr = join(root, "public", "ocr");
const coreDest = join(publicOcr, "core");
const langDest = join(publicOcr, "lang");
const cacheDir = join(root, "tools", "cache", "tessdata");

const filesToCopy = [
  {
    from: join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
    to: join(publicOcr, "worker.min.js"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core.wasm.js"),
    to: join(coreDest, "tesseract-core.wasm.js"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core.wasm"),
    to: join(coreDest, "tesseract-core.wasm"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-simd.wasm.js"),
    to: join(coreDest, "tesseract-core-simd.wasm.js"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-simd.wasm"),
    to: join(coreDest, "tesseract-core-simd.wasm"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    to: join(coreDest, "tesseract-core-lstm.wasm.js"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm"),
    to: join(coreDest, "tesseract-core-lstm.wasm"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    to: join(coreDest, "tesseract-core-simd-lstm.wasm.js"),
  },
  {
    from: join(root, "node_modules", "tesseract.js-core", "tesseract-core-simd-lstm.wasm"),
    to: join(coreDest, "tesseract-core-simd-lstm.wasm"),
  },
];

const languages = ["chi_sim", "eng"];

mkdirSync(publicOcr, { recursive: true });
mkdirSync(coreDest, { recursive: true });
mkdirSync(langDest, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

for (const file of filesToCopy) {
  mkdirSync(dirname(file.to), { recursive: true });
  copyIfNeeded(file.from, file.to);
}

sanitizeFile(join(publicOcr, "worker.min.js"));

for (const language of languages) {
  const name = `${language}.traineddata.gz`;
  const cached = join(cacheDir, name);
  const target = join(langDest, name);
  if (!existsSync(cached)) {
    await download(
      `https://tessdata.projectnaptha.com/4.0.0/${name}`,
      cached,
    );
  }
  copyIfNeeded(cached, target);
}

console.log("OCR assets prepared in public/ocr");

async function download(url, target) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  await pipeline(response.body, createWriteStream(target));
}

function sanitizeFile(file) {
  let text = readFileSync(file, "utf8");
  text = text
    .replaceAll("https://cdn.jsdelivr.net/npm/tesseract.js-core@v", "/ocr/core/local-tesseract-core-v")
    .replaceAll("https://cdn.jsdelivr.net/npm/@tesseract.js-data/", "/ocr/lang/local-tessdata/")
    .replaceAll("https://tessdata.projectnaptha.com/", "/ocr/lang/local-projectnaptha/");
  writeFileSync(file, text, "utf8");
}

function copyIfNeeded(from, to) {
  if (existsSync(to) && statSync(from).size === statSync(to).size) return;
  copyFileSync(from, to);
}
