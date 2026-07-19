import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseVersion = "v4";
const mode = process.argv[2] ?? "debug";
const platformDir = join(root, "android-capacitor-v4");
const releaseDir = join(root, "release");
const apkTarget = join(releaseDir, `travel-hunter-accessory-tool-${releaseVersion}-android-${mode}.apk`);
const capacitorCli = join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
const capacitorEnv = { TRAVEL_HUNTER_ANDROID_TARGET: "v4" };

if (mode !== "debug") {
  throw new Error("Only the debug APK is configured. Usage: node tools/package-android-v4.mjs debug");
}
if (existsSync(apkTarget)) {
  throw new Error(`Release output already exists: ${apkTarget}`);
}
if (!existsSync(platformDir)) {
  throw new Error(
    "Android v4 project is missing. Run with TRAVEL_HUNTER_ANDROID_TARGET=v4: npx cap add android",
  );
}

run(process.execPath, [join(root, "tools", "build-version.mjs"), "android-v4"]);
run(process.execPath, [capacitorCli, "sync", "android"], capacitorEnv);
const androidBuildEnv = await loadAndroidEnv();
runGradle(androidBuildEnv);

mkdirSync(releaseDir, { recursive: true });
const apkSource = join(platformDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(apkSource)) {
  throw new Error(`Android build finished but APK was not found at ${apkSource}`);
}
copyFileSync(apkSource, apkTarget);
console.log(`Android APK created: ${apkTarget}`);

function run(command, args, env = {}, cwd = root) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

async function loadAndroidEnv() {
  const setupModule = await import(pathToFileURL(join(root, "tools", "android-env-v4.mjs")).href);
  return setupModule.ensureAndroidEnv(platformDir);
}

function runGradle(androidBuildEnv) {
  run(
    "cmd.exe",
    ["/d", "/s", "/c", "gradlew.bat", ":app:assembleDebug"],
    { ...androidBuildEnv, CAPACITOR_ANDROID_STUDIO_PATH: "" },
    platformDir,
  );
}
