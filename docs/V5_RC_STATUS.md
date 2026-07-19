# v5 Windows RC Status

`v5` 是独立于 v1-v4 的 Windows 内部候选版本。当前不创建 `v5` 标签、公开 Prerelease 或 Android v5 工程。

## Candidate Scope

- 独立入口、构建目标和 `data/accessories-v5.json` 空数据模板。
- 继承 v4 双字体 OCR、词典、字模和伤害计算。
- OCR 复核显示原截图和将要保存的原色 tooltip 裁剪。
- 裁剪失败时只允许重新截图或仅保存词条，不保存完整原图。
- 待选库、方案预览和交换日志统一使用 tooltip 裁剪。
- 清空全部需确认，并立即写入空库。
- OCR 最多两个 Worker；v5 中全部空闲 120 秒后终止，页面退出、清空队列和异常路径也释放资源。
- Windows 本机服务启用 CSP、Host/同源校验、安全响应头和严格离线构建扫描。

## Local Candidate

构建命令：

```bash
npm ci
npm test
npm run build:v5
npm run package:win:v5
```

本地候选文件名为 `travel-hunter-accessory-tool-v5-win-rc1.zip`。该文件用于内部直传复测，不作为 GitHub Release 资产提交。

当前内部候选 SHA256：

```text
14A5839F746AE7D13F7D16D0103C557D67CEFA1C75C9BE6788569824256C63A9
```

## Current Verification

- `npm test`：60 项通过。
- TypeScript 检查与 v1、v2、v3-old、v3、v4、v5 构建通过。
- 原版字体回归图保存为 `495×179` PNG，边界停在最后一条词条，不包含物品 ID 和组件行。
- ModernUI 回归图保存为 `396×189` PNG，完整包含标题至最后词条。
- 两张图同时导入时均完成 OCR，未再出现语言包缓存写入失败；Worker 上限仍为 2。
- 便携服务的 CSP、安全响应头、Host/同源校验、外链图片拒绝、OCR 缓存绕过和立即清空写回均通过。
- 浏览器黑盒复测外部请求、控制台错误和页面异常均为 0；测试 Chrome、Node 和端口已清理。

## Release Gate

Windows OCR、保存、计算、清库、窄屏布局和资源释放复测通过后，才创建正式 v5 Windows Release。Android v5 在 Windows 稳定且现有 Android 反馈结束后另行迁移，并加入同一个 v5 Release；不会静默替换正式资产。
