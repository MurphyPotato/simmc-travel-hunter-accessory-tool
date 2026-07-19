# Android 构建与安装

## 玩家安装

- v4 APK：[`travel-hunter-accessory-tool-v4-android-debug.apk`](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/releases/download/v4/travel-hunter-accessory-tool-v4-android-debug.apk)
- v2 历史 APK：[`travel-hunter-accessory-tool-v2-android-debug.apk`](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/releases/download/v2/travel-hunter-accessory-tool-v2-android-debug.apk)
- 红米 K50 / 澎湃 OS 需要为下载 APK 的浏览器或文件管理器允许一次“安装未知应用”。
- 两个 APK 使用同一个应用 ID 和签名，v4 可以覆盖升级 v2。
- APK 不申请 `android.permission.INTERNET`，OCR 和配装计算均离线运行。

## 源码构建

要求 Node.js 20+、JDK 21 与 Android SDK 36。首次构建会准备缺失的 Android 工具和 Gradle Wrapper；这些生成文件不提交到 Git。

```powershell
npm ci
npm run package:android:v2:debug
npm run package:android:v4:debug
```

输出：

```text
release/travel-hunter-accessory-tool-v2-android-debug.apk
release/travel-hunter-accessory-tool-v4-android-debug.apk
```

`android/` 保留旧 v2 工程，`android-capacitor-v4/` 是独立 v4 工程。v4 使用 Capacitor Filesystem 将确认后的饰品库保存到应用私有数据目录。
