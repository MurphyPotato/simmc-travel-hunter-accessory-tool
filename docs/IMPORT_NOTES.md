# Source Archive Import Notes

Imported from the local workspace on 2026-07-18.

Included:

- React/TypeScript source for v1, v2, v3-old, v3 and v4
- OCR decision logic, generated compatibility templates and unit tests
- Windows build/package scripts
- Legacy Android v2 project and isolated Android v4 Capacitor project
- Empty v3/v4 data-store templates

Excluded:

- Other simMC tools and unrelated workspace files
- Real tooltip screenshot corpora and benchmark output
- User accessory data
- JAR binaries, including Minecraft, ModernUI and the reproducible Gradle wrapper JAR
- Extracted fonts, traineddata source files and generated OCR runtime files
- `node_modules`, Gradle caches, build outputs, local SDK paths and credentials

The five Windows ZIPs are not committed to Git. They are published unchanged as GitHub Release assets to avoid adding about 375 MB of duplicated portable Node runtimes to repository history.

Because v1/v2 loaded example images directly from the excluded local screenshot folders, fresh public source builds do not bundle those examples. This is a deliberate privacy and redistribution boundary, not missing source code.

The legacy Android project keeps its Gradle wrapper scripts and properties, but not `gradle-wrapper.jar`. Android developers can regenerate that standard binary with a trusted local Gradle installation by running `gradle wrapper`.
