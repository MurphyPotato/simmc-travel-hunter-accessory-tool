# Version History

This repository is an import of the surviving v1-v4 source archive. The original workspace was not a valid Git repository, so no historical commit graph was available to preserve. Historical tags retain that transparent import baseline; the v2 and v4 tags also include their later Android packaging additions rather than pretending to reconstruct an original development timeline.

| Tag | Local package date | Build command | Main behavior |
| --- | --- | --- | --- |
| `v1` | 2026-06-25 | `npm run build:v1` | Basic four-piece comparison tool |
| `v2` | 2026-06-25 | `npm run build:v2` / `npm run build:android` | Adds first-run graphical tutorial; Windows and historical Android packages share one Release |
| `v3-old` | 2026-07-02 | `npm run build:v3-old` | Warehouse workflow without persistence |
| `v3` | 2026-07-02 | `npm run build:v3` | Warehouse workflow with directory persistence |
| `v4` | 2026-07-18 | `npm run build:v4` / `npm run build:android:v4` | Dual-font OCR, structured confidence review and persistent warehouse on Windows and Android |
| `v5` (unreleased RC) | 2026-07-20 | `npm run build:v5` / `npm run package:win:v5` | Windows-only internal candidate with tooltip-only image persistence, local security hardening and bounded OCR worker lifetime |

The source tree keeps all version entry points and version-selectable build/package scripts. Older release ZIPs are uploaded unchanged to GitHub Releases.

`v5` has no tag or public Release yet. Stable download links and GitHub Latest remain on `v4` until the Windows candidate passes player retesting. Android v5 work is intentionally deferred and the existing v4 Android project is not modified by v5.

The original v1/v2 source referenced local tooltip screenshots for its example buttons. Those player screenshots are intentionally absent from the public source archive, so a fresh source build shows no bundled example images; the unchanged historical Windows ZIPs still contain their original compiled examples.

The `android/` project and `android-v2` build target are retained as a legacy experiment. Generated web assets, APKs, Gradle caches, SDK paths, and OCR binaries are excluded because they are reproducible outputs or machine-local state.
