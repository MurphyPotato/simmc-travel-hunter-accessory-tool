import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const textExtensions = new Set([".html", ".js", ".mjs", ".css", ".json"]);
const inertNamespaceUrls = new Set([
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/XML/1998/namespace",
]);
const inertDiagnosticUrlPrefixes = [
  "https://capacitorjs.com/",
  "https://react.dev/errors/",
];
const analyticsPatterns = [
  /google-analytics/i,
  /googletagmanager/i,
  /plausible\.io/i,
  /sentry\.io/i,
  /mixpanel/i,
  /segment\.com/i,
  /amplitude\.com/i,
];

export function assertOfflineRuntime(targets) {
  const files = [];
  for (const target of Array.isArray(targets) ? targets : [targets]) collectTextFiles(target, files);
  const hits = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/https?:\/\/[^\s"'`<>\\)]+/gi)) {
      const url = match[0].replace(/[;,]+$/, "");
      if (isAllowedUrl(url)) continue;
      hits.push(`${file}: remote URL ${url}`);
    }
    for (const pattern of analyticsPatterns) {
      if (pattern.test(source)) hits.push(`${file}: forbidden runtime marker ${pattern.source}`);
    }
  }
  if (hits.length > 0) {
    throw new Error(`v5 runtime is not fully local:\n${[...new Set(hits)].join("\n")}`);
  }
}

function collectTextFiles(path, output) {
  const extension = extname(path).toLowerCase();
  if (extension) {
    if (textExtensions.has(extension)) output.push(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) collectTextFiles(child, output);
    else if (textExtensions.has(extname(entry.name).toLowerCase())) output.push(child);
  }
}

function isAllowedUrl(url) {
  if (inertNamespaceUrls.has(url)) return true;
  if (inertDiagnosticUrlPrefixes.some((prefix) => url.startsWith(prefix))) return true;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}
