# Privacy and Offline Operation

旅行猎手饰品对比工具是 MurphyPotato 制作的非官方玩家工具。

玩家发行包运行时不收集、上传或向作者传输个人信息、截图、配装数据或设备标识，也不主动连接非本地服务器。

## Windows

- 页面与 OCR 资源由只监听 `127.0.0.1` 的包内本机服务提供。
- 本机服务校验 Host 与同源写请求，不提供 CORS。
- v5 使用 CSP 限制脚本、图片、Worker、WASM 和网络连接来源，并返回 `nosniff`、`no-referrer` 与 Permissions-Policy 等安全响应头。
- v5 已确认饰品只写入工具目录的 `data/accessories-v5.json`，不读取或迁移 v4 数据。
- v5 仅接受 `data:image/png;base64,...` 形式且标记为 `tooltip-crop` 的裁剪图；`http:`、`https:`、`file:`、`javascript:` 及其他图片地址会被拒绝或移除。

## Screenshot Handling in v5

- 上传的完整截图只用于当前 OCR 复核，在页面内存中临时保留。
- 工具从饰品名称和强化等级开始，保存到最后一条词条结束的原色 tooltip 区域。
- 背包、角色、聊天、坐标和其他游戏画面不应进入持久化文件。
- 找不到可靠裁剪边界时，工具会标明失败。玩家可以重新截图，或选择仅保存已复核词条；工具不会回退保存完整原图。
- 清空全部饰品需要二次确认，确认后立即把 v5 数据文件写为空库。

## Android and System Backup

当前 v5 不包含 Android 版本，也不修改 v4 Android 工程。现有 Android 发行包不申请联网、相机、麦克风、位置或媒体读取权限。

操作系统、浏览器及用户自行启用的系统备份行为由用户设备设置决定，不属于工具主动通信。本项目不修改或干预用户的 Android 备份设置。

## Source Builds

从源码首次构建可能联网下载 npm 包、Tesseract 语言数据等公开依赖。玩家发行包内置运行资源，正常使用不需要联网。

本项目与 simMC、Mojang Studios、Microsoft 或 ModernUI 项目无官方关联。
