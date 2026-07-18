# 旅行猎手饰品对比工具

本工具当前主线是 `v4` 双字体仓库式饰品对比工具：上传或粘贴截图，自动区分 Minecraft 1.21.8 原版字体和 ModernUI 思源黑体，人工复核后入库，再计算最高期望伤害的剑套和弓套。

## 运行

```bash
npm install
npm run build:v4
npm run dev:v4
```

打开 `http://127.0.0.1:5173/`。

## 版本

- `v1`：基础计算器版本，不包含教程弹窗。
- `v2`：带图形化教程，首次打开自动弹出，之后可点击右上角“教程”按钮重复观看。
- `v3-old`：仓库式历史版，不保存已确认饰品库。
- `v3`：仓库式历史稳定版，已确认饰品保存在 `data/accessories-v3.json`。
- `v4`：当前主线，双字体混合 OCR、字段级置信度与人工复核，数据独立保存在 `data/accessories-v4.json`。

各版本按版本号隔离构建和数据。`v4` 不修改 `v3`、`v3-old` 的入口、OCR 或数据文件，也不包含教程、示例入口、当前四件套编辑区和固定主词条。

## v4 使用说明

1. 点击“选择图片”导入一张或多张饰品 tooltip 截图，或在页面前台时直接按 `Ctrl+V` 粘贴截图。
2. 截图进入“待识别饰品库”，OCR 完成后检查部位、品质、强化等级和词条。
3. 修改错误识别结果后点击“确认饰品”，饰品进入“待选饰品库”。
4. 至少确认一件饰品后点击“计算并替换”。
5. 在“方案预览”里切换“剑套 / 弓套”，查看两套最高期望伤害组合。
6. 已被当前预览选中的饰品会在待选库里标记，重新计算后可看“交换日志”。

注意：v4 允许少于 4 件饰品参与计算，缺失部位会使用空白占位。百分比伤害减免、潜行速度和原版词条只展示，不计入伤害评分。黄色“需要复核”字段必须以原图为准。

## 验证

```bash
npm test
npm run build:v4
npm run package:win:v4
```

开发环境可打开 `http://127.0.0.1:5173/?benchmark=1`，手动选择素材库图片后运行 v4 浏览器端 OCR 基准。基准清单只保存字段真值，不会把测试截图打入发行包。

首次运行双字体合成校准前执行：

```bash
npm run prepare:v4-fonts
```

该命令只把已提供 ModernUI JAR 中的思源黑体和 Inter 提取到已忽略的 `tools/cache/modernui-fonts/`。基准页中的“运行合成校准”会覆盖原版 GUI 缩放、颜色变化、裁剪偏移和轻度 JPEG 压缩；字体、合成图和基准代码均不进入生产构建或发行包。

## 构建和分发

```bash
npm run build:v1
npm run build:v2
npm run build:v3-old
npm run build:v3
npm run build:v4
npm run package:win
npm run package:win:v3-old
npm run package:win:v3
npm run package:win:v4
```

`npm run package:win` 会生成所有隔离版本；只制作当前版本时使用 `npm run package:win:v4`。

- `release/travel-hunter-accessory-tool-v1-win.zip`
- `release/travel-hunter-accessory-tool-v2-win.zip`
- `release/travel-hunter-accessory-tool-v3-old-win.zip`
- `release/travel-hunter-accessory-tool-v3-win.zip`
- `release/travel-hunter-accessory-tool-v4-win.zip`

玩家解压后双击 `启动工具.bat` 即可使用，不需要安装 Node 或 npm。

Android 相关脚本是早期实验内容，当前主线暂不维护手机移植。

## 说明

- v4 会在 `主戒指 / 副戒指 / 主护符 / 副护符` 四个部位中分别选择最高收益组合。
- 同一部位多件饰品会自动择优；缺失部位使用空白占位。
- 暴击按期望值计算。
- 百分比伤害减免、潜行速度和原版词条只展示，不计入伤害评分。
- 截图 OCR 结果需要手动复核后再导入。
