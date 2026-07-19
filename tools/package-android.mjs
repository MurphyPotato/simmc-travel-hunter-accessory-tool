import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDir = join(root, "release");
const platformDir = join(root, "android");
const apkSource = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const apkTarget = join(releaseDir, "travel-hunter-accessory-tool-v2-android-debug.apk");

if (existsSync(apkTarget)) {
  throw new Error(`Release output already exists: ${apkTarget}`);
}

run(process.execPath, [join(root, "tools", "build-version.mjs"), "android-v2"]);
run(process.execPath, [join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor"), "sync", "android"]);
const androidBuildEnv = await loadAndroidEnv();
runGradle(androidBuildEnv);

mkdirSync(releaseDir, { recursive: true });
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
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const gradlewPath = join(root, "android", gradlew);
  if (!existsSync(gradlewPath)) {
    throw new Error("Android project is missing Gradle wrapper. Run `npx cap add android` first.");
  }

  try {
    if (process.platform === "win32") {
      run(
        "cmd.exe",
        ["/d", "/s", "/c", "gradlew.bat", ":app:assembleDebug"],
        { ...androidBuildEnv, CAPACITOR_ANDROID_STUDIO_PATH: "" },
        platformDir,
      );
    } else {
      run(gradlewPath, [":app:assembleDebug"], { ...androidBuildEnv, CAPACITOR_ANDROID_STUDIO_PATH: "" }, platformDir);
    }
  } catch (error) {
    throw new Error(
      [
        "Android APK build failed.",
        "Install Android Studio with Android SDK, accept SDK licenses, and use JDK 21.",
        "Then rerun: npm run package:android:v2:debug",
        "",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
    );
  }
}
