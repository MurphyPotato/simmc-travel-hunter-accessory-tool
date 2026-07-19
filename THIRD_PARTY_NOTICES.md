# Third-Party Notices

The MIT license in this repository applies only to original project code and documentation authored for this tool. It does not relicense third-party software, game assets, fonts, screenshots, trademarks, or data.

| Component | Upstream license / status | Use in this project |
| --- | --- | --- |
| React / React DOM | MIT | User interface runtime |
| Vite | MIT | Build and development tooling |
| Lucide | ISC | Interface icons |
| Capacitor | MIT | Legacy Android experiment |
| Capacitor Filesystem | MIT | Android v4 private accessory-library persistence |
| Gradle build tooling | Apache-2.0 | Legacy Android experiment; the wrapper JAR is regenerated locally and is not committed |
| Tesseract.js | Apache-2.0 | Browser OCR worker |
| Tesseract OCR core | Apache-2.0 | WebAssembly OCR engine |
| Tesseract language data | Apache-2.0 or upstream model-specific terms | Simplified Chinese and English recognition in release packages |
| Node.js | MIT plus bundled third-party notices | Portable local HTTP runtime in Windows release packages |
| GNU Unifont | GPL-2.0-or-later with font embedding exception | Development-time glyph reference used by the Minecraft font template generator |
| Source Han Sans | SIL Open Font License 1.1 | Optional local ModernUI calibration only; font files are not committed or shipped |
| Inter | SIL Open Font License 1.1 | Optional local ModernUI calibration only; font files are not committed or shipped |

`src/generated/minecraftFontV4.ts` contains compatibility glyph data generated from Minecraft 1.21.8 client font resources and GNU Unifont references. That data is not granted under this repository's MIT license. Minecraft names, visual assets, and trademarks belong to their respective owners.

JAR binaries (including ModernUI, Minecraft client, and Gradle wrapper JARs), local font files, and the real tooltip screenshot corpus are deliberately excluded from this public repository and its source history.

For complete upstream license texts, consult each dependency's package or official repository. Release ZIPs are distributed for user convenience and retain all applicable upstream license obligations.
