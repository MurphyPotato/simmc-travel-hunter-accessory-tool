# Version History

This repository is an import of the surviving v1-v4 source archive. The original workspace was not a valid Git repository, so no historical commit graph was available to preserve. Release tags identify the matching Windows packages, but they intentionally target the same transparent import commit rather than pretending to reconstruct an original timeline.

| Tag | Local package date | Build command | Main behavior |
| --- | --- | --- | --- |
| `v1` | 2026-06-25 | `npm run build:v1` | Basic four-piece comparison tool |
| `v2` | 2026-06-25 | `npm run build:v2` | Adds first-run graphical tutorial |
| `v3-old` | 2026-07-02 | `npm run build:v3-old` | Warehouse workflow without persistence |
| `v3` | 2026-07-02 | `npm run build:v3` | Warehouse workflow with directory persistence |
| `v4` | 2026-07-18 | `npm run build:v4` | Dual-font OCR, structured confidence review, persistent warehouse |

The source tree keeps all version entry points and version-selectable build/package scripts. Older release ZIPs are uploaded unchanged to GitHub Releases.

The original v1/v2 source referenced local tooltip screenshots for its example buttons. Those player screenshots are intentionally absent from the public source archive, so a fresh source build shows no bundled example images; the unchanged historical Windows ZIPs still contain their original compiled examples.

The `android/` project and `android-v2` build target are retained as a legacy experiment. Generated web assets, APKs, Gradle caches, SDK paths, and OCR binaries are excluded because they are reproducible outputs or machine-local state.
