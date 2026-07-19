import type { CapacitorConfig } from "@capacitor/cli";

const isV4 = process.env.TRAVEL_HUNTER_ANDROID_TARGET === "v4";

const config: CapacitorConfig = {
  appId: "com.travelhunter.accessorytool",
  appName: "旅行猎手饰品工具",
  webDir: isV4 ? "dist/android-v4" : "dist/android-v2",
  android: {
    path: isV4 ? "android-capacitor-v4" : "android",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
