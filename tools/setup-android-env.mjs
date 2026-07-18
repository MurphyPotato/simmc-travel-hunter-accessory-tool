import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envRoot = join(root, "tools", "android-env");
const cacheRoot = join(root, "tools", "cache", "android");
const jdkRoot = join(envRoot, "jdk-17");
const sdkRoot = join(envRoot, "sdk");
const cmdlineLatest = join(sdkRoot, "cmdline-tools", "latest");

const jdkZip = join(cacheRoot, "temurin-jdk-17.zip");
const cmdlineZip = join(cacheRoot, "android-commandlinetools.zip");
const jdkUrl = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse";
const cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip";

mkdirSync(envRoot, { recursive: true });
mkdirSync(cacheRoot, { recursive: true });

if (!existsSync(join(jdkRoot, "bin", "java.exe"))) {
  await ensureDownloaded(jdkUrl, jdkZip);
  extractZip(jdkZip, envRoot);
  const extracted = readdirSync(envRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.startsWith("jdk-17") && name !== "jdk-17");
  if (!extracted) throw new Error("JDK archive extracted, but JDK directory was not found.");
  renameSync(join(envRoot, extracted), jdkRoot);
}

if (!existsSync(join(cmdlineLatest, "bin", "sdkmanager.bat"))) {
  await ensureDownloaded(cmdlineUrl, cmdlineZip);
  const cmdlineToolsRoot = join(sdkRoot, "cmdline-tools");
  mkdirSync(cmdlineToolsRoot, { recursive: true });
  extractZip(cmdlineZip, cmdlineToolsRoot);
  const extracted = join(cmdlineToolsRoot, "cmdline-tools");
  if (!existsSync(extracted)) throw new Error("Android command line tools archive extracted incorrectly.");
  if (existsSync(cmdlineLatest)) {
    throw new Error(`Cannot move command line tools because ${cmdlineLatest} already exists.`);
  }
  renameSync(extracted, cmdlineLatest);
}

const env = androidEnv();
acceptLicenses(env);
runSdkManager(["platform-tools", "platforms;android-36", "build-tools;36.0.0"], env);

console.log(`JAVA_HOME=${jdkRoot}`);
console.log(`ANDROID_HOME=${sdkRoot}`);

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
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", zipPath, destination],
    { cwd: root, stdio: "inherit" },
  );
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
