import { spawn } from "node:child_process";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const packageDir = resolve(process.argv[2] ?? "release/travel-hunter-accessory-tool-v5-win-rc1");
const nodeExe = join(packageDir, "runtime", "node.exe");
const child = spawn(nodeExe, [join(packageDir, "server.mjs")], {
  cwd: packageDir,
  env: { ...process.env, TRAVEL_HUNTER_NO_OPEN: "1" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let errorOutput = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { errorOutput += chunk; });

try {
  const baseUrl = await waitForServerUrl();
  const parsedUrl = new URL(baseUrl);
  const origin = parsedUrl.origin;

  const page = await fetch(baseUrl);
  assert(page.status === 200, `root status ${page.status}`);
  assert((page.headers.get("content-security-policy") ?? "").includes("connect-src 'self'"), "missing CSP connect-src");
  assert(page.headers.get("x-content-type-options") === "nosniff", "missing nosniff");
  assert(page.headers.get("referrer-policy") === "no-referrer", "missing no-referrer");
  assert(Boolean(page.headers.get("permissions-policy")), "missing Permissions-Policy");
  assert(page.headers.get("access-control-allow-origin") === null, "unexpected CORS header");

  const languageData = await fetch(`${origin}/ocr/lang/chi_sim.traineddata.gz`);
  assert(languageData.status === 200, `OCR language data status ${languageData.status}`);
  assert(languageData.headers.get("cache-control") === "no-store", "OCR runtime must bypass browser disk cache");

  const empty = await fetch(`${origin}/api/v5/accessories`);
  assert(empty.status === 200, `initial store status ${empty.status}`);
  assert((await empty.json()).accessories.length === 0, "v5 candidate must start empty");

  const hostileOrigin = await fetch(`${origin}/api/v5/accessories`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify(emptyStore()),
  });
  assert(hostileOrigin.status === 403, `cross-origin write status ${hostileOrigin.status}`);

  const hostileHostStatus = await rawRequest(parsedUrl, { Host: "evil.example" });
  assert(hostileHostStatus === 421, `host validation status ${hostileHostStatus}`);

  const unsafePayload = emptyStore();
  unsafePayload.accessories.push({
    id: "unsafe",
    slot: "mainRing",
    quality: "fine",
    level: 5,
    affixes: [],
    source: "ocr",
    imageKind: "tooltip-crop",
    imageUrl: "https://example.com/private.png",
  });
  const unsafeResponse = await sameOriginPut(origin, unsafePayload);
  assert(unsafeResponse.status === 400, `unsafe image status ${unsafeResponse.status}`);

  const safePayload = emptyStore();
  safePayload.accessories.push({
    id: "safe",
    slot: "mainRing",
    quality: "fine",
    level: 5,
    affixes: [],
    source: "ocr",
    imageKind: "tooltip-crop",
    imageUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  const safeResponse = await sameOriginPut(origin, safePayload);
  assert(safeResponse.status === 200, `safe tooltip status ${safeResponse.status}`);

  const clearResponse = await sameOriginPut(origin, emptyStore());
  assert(clearResponse.status === 200, `clear status ${clearResponse.status}`);
  const persisted = JSON.parse(readFileSync(join(packageDir, "data", "accessories-v5.json"), "utf8"));
  assert(persisted.schema === "travel-hunter-accessory-tool:v5/accessories", "wrong persisted schema");
  assert(Array.isArray(persisted.accessories) && persisted.accessories.length === 0, "clear did not persist empty pool");

  console.log(JSON.stringify({
    ok: true,
    url: baseUrl,
    checks: [
      "security headers",
      "no CORS",
      "OCR cache bypass",
      "Host validation",
      "same-origin write validation",
      "external image rejection",
      "PNG tooltip acceptance",
      "immediate empty-store write",
    ],
  }, null, 2));
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000)),
  ]);
}

function emptyStore() {
  return {
    schema: "travel-hunter-accessory-tool:v5/accessories",
    version: 1,
    savedAt: null,
    accessories: [],
  };
}

async function sameOriginPut(origin, payload) {
  return fetch(`${origin}/api/v5/accessories`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(payload),
  });
}

function rawRequest(url, headers) {
  return new Promise((resolveStatus, rejectStatus) => {
    const req = request({
      hostname: "127.0.0.1",
      port: Number(url.port),
      path: "/",
      method: "GET",
      headers,
    }, (response) => {
      response.resume();
      response.on("end", () => resolveStatus(response.statusCode ?? 0));
    });
    req.on("error", rejectStatus);
    req.end();
  });
}

async function waitForServerUrl() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const match = output.match(/Tool URL:\s*(http:\/\/127\.0\.0\.1:\d+\/)/);
    if (match) return match[1];
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}: ${errorOutput}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`server start timed out: ${output}\n${errorOutput}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
