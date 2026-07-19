import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envRoot = resolve(process.env.TRAVEL_HUNTER_ANDROID_ENV_ROOT ?? join(root, "tools", "android-env"));
const cacheRoot = resolve(process.env.TRAVEL_HUNTER_ANDROID_CACHE_ROOT ?? join(root, "tools", "cache", "android"));
const jdkRoot = join(envRoot, "jdk-21");
const sdkRoot = join(envRoot, "sdk");
const cmdlineLatest = join(sdkRoot, "cmdline-tools", "latest");

const jdkZip = join(cacheRoot, "temurin-jdk-21.zip");
const cmdlineZip = join(cacheRoot, "android-commandlinetools.zip");
const jdkUrl = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse";
const cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip";
const wrapperUrl = "https://raw.githubusercontent.com/gradle/gradle/v8.14.3/gradle/wrapper/gradle-wrapper.jar";
const wrapperSha256 = "7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172";

export async function ensureAndroidEnv(platformDir) {
  mkdirSync(envRoot, { recursive: true });
  mkdirSync(cacheRoot, { recursive: true });

  if (!existsSync(join(jdkRoot, "bin", "java.exe"))) {
    await ensureDownloaded(jdkUrl, jdkZip);
    extractZip(jdkZip, envRoot);
    const extracted = readdirSync(envRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .find((name) => name.startsWith("jdk-21") && name !== "jdk-21");
    if (!extracted) throw new Error("JDK archive extracted, but JDK directory was not found.");
    rmSync(jdkRoot, { recursive: true, force: true });
    renameSync(join(envRoot, extracted), jdkRoot);
  }

  if (!existsSync(join(cmdlineLatest, "bin", "sdkmanager.bat"))) {
    await ensureDownloaded(cmdlineUrl, cmdlineZip);
    const cmdlineToolsRoot = join(sdkRoot, "cmdline-tools");
    mkdirSync(cmdlineToolsRoot, { recursive: true });
    extractZip(cmdlineZip, cmdlineToolsRoot);
    const extracted = join(cmdlineToolsRoot, "cmdline-tools");
    if (!existsSync(extracted)) throw new Error("Android command line tools archive extracted incorrectly.");
    rmSync(cmdlineLatest, { recursive: true, force: true });
    renameSync(extracted, cmdlineLatest);
  }

  await ensureGradleWrapper(platformDir);
  const env = androidEnv();
  acceptLicenses(env);
  runSdkManager(["platform-tools", "platforms;android-36", "build-tools;36.0.0"], env);
  return env;
}

export function androidEnv() {
  const pathPrefix = [
    join(jdkRoot, "bin"),
    join(sdkRoot, "platform-tools"),
    join(cmdlineLatest, "bin"),
  ].join(";");
  return {
    JAVA_HOME: jdkRoot,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    PATH: `${pathPrefix};${process.env.PATH ?? ""}`,
  };
}

async function ensureGradleWrapper(platformDir) {
  const wrapperPath = join(platformDir, "gradle", "wrapper", "gradle-wrapper.jar");
  if (!existsSync(wrapperPath)) {
    mkdirSync(dirname(wrapperPath), { recursive: true });
    await ensureDownloaded(wrapperUrl, wrapperPath);
  }
  const actual = createHash("sha256").update(readFileSync(wrapperPath)).digest("hex");
  if (actual !== wrapperSha256) {
    throw new Error(`Gradle wrapper checksum mismatch: expected ${wrapperSha256}, got ${actual}`);
  }
}

async function ensureDownloaded(url, target) {
  if (existsSync(target) && statSync(target).size > 0) return;
  rmSync(target, { force: true });
  const partial = `${target}.part`;
  rmSync(partial, { force: true });
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(partial));
  renameSync(partial, target);
}

function extractZip(zipPath, destination) {
  const command = `Expand-Archive -LiteralPath '${escapePowerShell(zipPath)}' -DestinationPath '${escapePowerShell(destination)}' -Force`;
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: root,
    stdio: "inherit",
  });
}

function acceptLicenses(env) {
  execFileSync("cmd.exe", ["/d", "/s", "/c", "sdkmanager.bat", "--licenses"], {
    cwd: join(cmdlineLatest, "bin"),
    env: { ...process.env, ...env },
    input: "y\n".repeat(100),
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function runSdkManager(packages, env) {
  execFileSync("cmd.exe", ["/d", "/s", "/c", "sdkmanager.bat", ...packages], {
    cwd: join(cmdlineLatest, "bin"),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''");
}
