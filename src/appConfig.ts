export type AppVersion = "v1" | "v2" | "v3-old" | "v3" | "v4" | "android-v2";

function resolveAppVersion(value: string | undefined): AppVersion {
  if (value === "android-v2") return "android-v2";
  if (value === "v3-old") return "v3-old";
  if (value === "v3") return "v3";
  if (value === "v4") return "v4";
  if (value === "v2") return "v2";
  return "v1";
}

export const APP_VERSION = resolveAppVersion(import.meta.env.VITE_APP_VERSION);

export const IS_ANDROID_APP = APP_VERSION === "android-v2";

export const APP_STORAGE_NAMESPACE = `travel-hunter-accessory-tool:${APP_VERSION}`;

export const GUIDE_VERSION = "guide-v1";

export const GUIDE_SEEN_KEY = `${APP_STORAGE_NAMESPACE}:tutorial:${GUIDE_VERSION}:seen`;

export const HAS_GUIDE = APP_VERSION === "v2" || APP_VERSION === "android-v2";

export const IS_V3 = APP_VERSION === "v3" || APP_VERSION === "v3-old";

export const IS_V4 = APP_VERSION === "v4";
