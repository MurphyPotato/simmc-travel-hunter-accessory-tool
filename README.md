# 旅行猎手饰品对比工具

[![CI](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/MurphyPotato/simmc-travel-hunter-accessory-tool?label=latest)](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

面向 simMC 旅行猎手玩法的离线饰品 OCR、仓库管理与剑/弓最优配装计算工具。推荐使用 **v4**。

## 下载与安装

1. 打开 [Releases](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/releases/latest)。
2. 下载 `travel-hunter-accessory-tool-v4-win.zip`。
3. 解压整个 ZIP，不要直接在压缩软件里运行。
4. 双击 `启动工具.bat`。
5. 保持黑色启动窗口打开；关闭该窗口即停止工具。

玩家不需要安装 Node、npm 或开发环境。工具和 OCR 均在本机离线运行。

```mermaid
flowchart LR
  A[上传或 Ctrl+V 粘贴截图] --> B[OCR 识别]
  B --> C[人工复核标红字段]
  C --> D[确认进入待选饰品库]
  D --> E[计算并替换]
  E --> F[切换剑套或弓套预览]
```

## 使用方法

1. 上传一张或多张饰品 tooltip 截图，或在页面前台直接按 `Ctrl+V`。
2. 查看 OCR 结果；黄色或红色字段必须对照原截图复核。
3. 点击“确认饰品”，将饰品放入待选库。
4. 至少确认一件后点击“计算并替换”。缺失部位会使用空白饰品占位。
5. 在方案预览中切换剑套和弓套，按截图与完整词条在游戏内找到对应饰品。

v4 会把已确认饰品和截图保存在工具目录的 `data/accessories-v4.json`。移动工具时请移动整个解压目录。

## 版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| v4 | 推荐 | 双字体 OCR、字段级置信度、目录持久化、剑/弓最优配装 |
| v3 | 历史稳定版 | 仓库式流程和目录持久化，使用旧 OCR 内核 |
| v3-old | 历史版 | 仓库式流程，不保存已确认饰品 |
| v2 | 历史版 | 四件套编辑器和首次教程 |
| v1 | 历史版 | 基础饰品对比计算器 |
| Android v2 | 实验版 | 早期 Capacitor 移植，不再作为当前发行目标 |

各版本 ZIP 可在 [全部 Releases](https://github.com/MurphyPotato/simmc-travel-hunter-accessory-tool/releases) 下载。详细变更见 [版本历史](docs/VERSION_HISTORY.md)。

## OCR 说明

- v4 自动区分 Minecraft 1.21.8 原版像素字体和 ModernUI 思源黑体。
- 当前本地回归集的数值精确准确率为 99.29%，自动接受字段没有发现静默错误。
- 资源包字体、截图压缩、裁剪或游戏 UI 变化都可能降低准确率。
- OCR 只负责减少录入量，人工复核后的内容才是最终真值。

## 从源码运行

要求 Node.js 20 或更高版本。

```bash
npm ci
npm test
npm run build:v4
npm run dev:v4
```

首次构建会联网下载 Tesseract 语言数据；生成的玩家发行包仍完全离线。其他版本使用 `build:v1`、`build:v2`、`build:v3-old`、`build:v3` 构建。

## 隐私与数据

- 工具不上传截图、OCR 文本或饰品数据。
- 仓库不包含真实测试截图、玩家饰品库、Minecraft/ModernUI JAR 或本机字体缓存。
- 发布 ZIP 的校验值见 [SHA256SUMS](checksums/SHA256SUMS.txt)。

## License

原创代码使用 [MIT License](LICENSE)。第三方组件、OCR 数据和字体兼容数据仍受各自许可约束，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本项目与 simMC、Mojang Studios、Microsoft 或 ModernUI 项目无官方关联。
