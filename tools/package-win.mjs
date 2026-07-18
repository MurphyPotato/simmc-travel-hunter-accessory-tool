import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = join(root, "release");
const nodeExe = findNodeExe();
const requestedVersion = process.argv[2];
const packageVersions = ["v1", "v2", "v3-old", "v3", "v4"];
const persistentVersions = new Set(["v3", "v4"]);
const versions = requestedVersion ? [requestedVersion] : packageVersions;

if (!versions.every((version) => packageVersions.includes(version))) {
  throw new Error("Usage: node tools/package-win.mjs [v1|v2|v3-old|v3|v4]");
}

mkdirSync(releaseRoot, { recursive: true });

for (const version of versions) {
  run(process.execPath, [join(root, "tools", "build-version.mjs"), version]);
}

for (const version of versions) {
  const packageName = `travel-hunter-accessory-tool-${version}-win`;
  const packageDir = join(releaseRoot, packageName);
  rmSync(packageDir, { recursive: true, force: true });
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(join(packageDir, "runtime"), { recursive: true });
  if (persistentVersions.has(version)) {
    mkdirSync(join(packageDir, "data"), { recursive: true });
  }

  cpSync(join(root, "dist", version), join(packageDir, "app"), { recursive: true });
  copyFileSync(nodeExe, join(packageDir, "runtime", "node.exe"));
  if (persistentVersions.has(version)) {
    writeFileSync(
      join(packageDir, "data", `accessories-${version}.json`),
      emptyAccessoryStoreSource(version),
      "utf8",
    );
  }
  writeFileSync(join(packageDir, "server.mjs"), serverSource(version), "utf8");
  writeFileSync(join(packageDir, "启动工具.bat"), launcherSource(version), "utf8");
  writeFileSync(join(packageDir, "使用说明.txt"), readmeSource(version), "utf8");

  assertNoRemoteOcr(packageDir);
  zipPackage(packageName);
}

console.log("Windows portable packages created in release/");

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function findNodeExe() {
  const path = execFileSync("where.exe", ["node"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith("node.exe"));
  if (!path) throw new Error("Cannot find node.exe");
  return path;
}

function zipPackage(packageName) {
  const zipPath = join(releaseRoot, `${packageName}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${packageName}' -DestinationPath '${packageName}.zip' -Force`,
    ],
    { cwd: releaseRoot, stdio: "inherit" },
  );
}

function assertNoRemoteOcr(packageDir) {
  const result = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$patterns='cdn.jsdelivr.net','tessdata.projectnaptha.com','@tesseract.js-data'; " +
        "$hits=Get-ChildItem -Recurse -File | Select-String -Pattern $patterns -SimpleMatch; " +
        "if ($hits) { $hits | Select-Object Path,LineNumber,Line; exit 9 }",
    ],
    { cwd: packageDir, encoding: "utf8" },
  );
  if (result.trim()) throw new Error(result);
}

function emptyAccessoryStoreSource(version) {
  return JSON.stringify(
    {
      schema: `travel-hunter-accessory-tool:${version}/accessories`,
      version: 1,
      savedAt: null,
      accessories: [],
    },
    null,
    2,
  );
}

function launcherSource(version) {
  return `@echo off
chcp 65001 >nul
setlocal
title Travel Hunter Accessory Tool ${version}
cd /d "%~dp0"
echo Travel Hunter Accessory Tool ${version}
echo.
echo Starting local tool...
echo Keep this window open while using the tool.
echo Close this window to stop the tool.
echo.
"%~dp0runtime\\node.exe" "%~dp0server.mjs"
echo.
echo Tool stopped. Press any key to close this window.
pause >nul
`;
}

function readmeSource(version) {
  const tutorialLine =
    version === "v2"
      ? "v2 首次打开会自动弹出教程，之后可点击右上角“教程”按钮重复观看。"
      : version === "v3-old"
        ? "v3-old 是仓库式旧版：上传或粘贴饰品截图，复核后入库，再点击“计算并替换”；关闭或刷新后不保存已确认饰品库。"
      : version === "v3"
        ? "v3 是仓库式新版：上传或粘贴饰品截图，复核后入库，再点击“计算并替换”。"
      : version === "v4"
        ? "v4 是双字体混合 OCR 版：自动识别原版像素字体与 ModernUI 思源黑体，冲突字段会标红复核。"
      : "v1 是基础版，不包含教程弹窗。";
  const storageLine =
    version === "v3"
      ? "- v3 已确认入库的饰品会保存在本工具目录 data/accessories-v3.json。\n"
      : version === "v4"
        ? "- v4 已确认入库的饰品会保存在本工具目录 data/accessories-v4.json。\n"
      : version === "v3-old"
        ? "- v3-old 不保存已确认饰品库，关闭或刷新后需要重新导入。\n"
        : "";
  return `旅行猎手饰品对比工具 ${version}

使用方法：
1. 解压整个文件夹。
2. 双击“启动工具.bat”。
3. 浏览器会自动打开工具页面。
4. 使用期间请保持黑色启动窗口打开。
5. 用完后关闭启动窗口即可停止工具。

${tutorialLine}

说明：
- 工具完全离线运行。
- OCR 识别资源已经包含在包内，不需要玩家安装 Node 或 npm。
${storageLine.trimEnd()}
- 如果浏览器没有自动打开，请看启动窗口里显示的 http://127.0.0.1:端口 地址，手动复制到浏览器打开。
`;
}

function serverSource(version) {
  const storeEnabled = persistentVersions.has(version);
  const storeVersion = storeEnabled ? version : "v3";
  return `import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const root = fileURLToPath(new URL("./app/", import.meta.url));
const accessoryStoreEnabled = ${storeEnabled ? "true" : "false"};
const storeVersion = "${storeVersion}";
const storePath = fileURLToPath(new URL(\`./data/accessories-\${storeVersion}.json\`, import.meta.url));
const storeSchema = \`travel-hunter-accessory-tool:\${storeVersion}/accessories\`;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
};

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (accessoryStoreEnabled && url.pathname === \`/api/\${storeVersion}/accessories\`) {
    handleAccessoryStore(request, response);
    return;
  }

  const decodedPath = decodeURIComponent(url.pathname);
  let filePath = normalize(join(root, decodedPath));
  if (!filePath.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }
  const ext = extname(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });
  createReadStream(filePath).pipe(response);
});

function handleAccessoryStore(request, response) {
  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(readAccessoryStore());
    return;
  }

  if (request.method === "PUT") {
    readRequestBody(request, 80 * 1024 * 1024)
      .then((body) => {
        JSON.parse(body);
        mkdirSync(dirname(storePath), { recursive: true });
        writeFileSync(storePath, body, "utf8");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      })
      .catch((error) => {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Bad request" }));
      });
    return;
  }

  response.writeHead(405, { Allow: "GET, PUT" });
  response.end("Method Not Allowed");
}

function readAccessoryStore() {
  if (!existsSync(storePath)) {
    return JSON.stringify({
      schema: storeSchema,
      version: 1,
      savedAt: null,
      accessories: [],
    });
  }
  return readFileSync(storePath, "utf8");
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
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

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const url = \`http://127.0.0.1:\${address.port}/\`;
  console.log("Travel Hunter Accessory Tool started.");
  console.log("Keep this window open while using the tool.");
  console.log(\`Tool URL: \${url}\`);
  if (process.env.TRAVEL_HUNTER_NO_OPEN !== "1") {
    execFile("cmd", ["/c", "start", "", url]);
  }
});
`;
}
