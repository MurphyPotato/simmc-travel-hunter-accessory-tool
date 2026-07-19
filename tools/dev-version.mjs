import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2] ?? "v3";
const extraArgs = process.argv.slice(3);

if (!["v1", "v2", "v3-old", "v3", "v4", "v5", "android-v2"].includes(version)) {
  throw new Error("Usage: node tools/dev-version.mjs [v1|v2|v3-old|v3|v4|v5|android-v2] [vite args...]");
}

execFileSync(
  process.execPath,
  [join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", ...extraArgs],
  {
    cwd: root,
    env: { ...process.env, VITE_APP_VERSION: version },
    stdio: "inherit",
  },
);
