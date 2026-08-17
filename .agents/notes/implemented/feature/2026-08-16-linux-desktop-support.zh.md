# Agent Note: Linux 桌面支持

Status: implemented

[English](2026-08-16-linux-desktop-support.md) | 中文

## 问题

桌面应用此前只发布 macOS arm64 与 Windows x64 构建。Host 运行时本身已经支持 Linux——沙箱层依次探测 `bwrap` 与 `landlock`，全部原生依赖（Landlock launcher、koffi、node-pty、Sharp、node-addon-require-builtin）在锁文件中都有 Linux 预编译，CI 也已运行 Linux Host gate——但桌面层在四处拒绝了该平台：插件中心平台白名单、electron-builder 的 Linux 目标、自动更新发布器以及发布工作流。Linux 用户既无法安装插件，也无法产出 AppImage/deb 产物或接收更新。

## 决策

**插件中心白名单覆盖 Linux x64 与 arm64。** `packages/plugin-center/contracts` 中的 `SUPPORTED_PLUGIN_PLATFORMS` 增加 `linux-x64` 与 `linux-arm64`，平台元组正则也接受 `linux-*`。`apps/desktop/src/plugin-center/environment.ts` 映射两个 Linux 元组；npm 生态目录与其内置夹具公布相同的五平台列表。Linux 上的兼容性指纹因此可以正常解析而不是抛错。

**electron-builder 为两种 Linux 架构产出 AppImage 与 deb。** `linux` 构建段以 `${arch}` 产物名目标 `AppImage` 与 `deb`，与 macOS、Windows 共用受跟踪的 `build/icon.png`。`verify-packaged-runtime.ts` 的 afterPack 现在按架构强制校验 Linux 原生模块清单——Landlock launcher、koffi、node-addon-require-builtin（`-gnu` 命名）、node-pty 预编译与 Sharp `.node`——与 Windows gate 对称。根级 `dist:linux:desktop` 入口 staging 一个 `linux` 目标的运行时并直接调用 electron-builder。

**自动更新发布器接受 Linux 渠道元数据。** `publish-update.ts` 将 `-linux.yml`（x64，electron-updater 请求的默认渠道文件）与 `-linux-arm64.yml` 识别为 Linux 渠道而不是抛错，保留 Windows 裸渠道与 macOS `-mac.yml` 形式，并在无 macOS ZIP 要求的情况下校验 Linux AppImage 载荷。

**发布工作流在原生 runner 上构建并验证 Linux。** `desktop-release.yml` 新增 Linux job，按 x64（`ubuntu-24.04`）与 arm64（`ubuntu-24.04-arm`）矩阵，为 `linux` staging 运行时，构建 AppImage 与 deb，并上传渠道元数据。发布 job 在生成 `SHA256SUMS` 并创建草稿 release 前，要求一个 DMG、ZIP、EXE 以及两个 AppImage 与两个 deb；发布说明列出 Linux。

**Linux 窗口保持无边框与不透明。** `apps/desktop/src/main.ts` 在 Linux 上移除 `transparent` 与 `titleBarOverlay`——Electron 在那里没有等价的原生材质，Web 客户端也明确保持实心表面（ui-theme `base.css`）——同时保留渲染器拖拽区，与 [Electron loopback Web supervisor](../../architecture/2026-08-14-electron-loopback-web-supervisor.md) 中的 chrome 决策一致。托盘回退到彩色的 `build/icon.png`，因为 StatusNotifierItem 不会给模板图着色，`extraResources` 将该图标一并打进 `desktop-resources`。

## 备选方案

**白名单保持 darwin/win32，对 Linux 安装做 gate。** 否决。目录、指纹与预检管道是唯一的插件安装路径；Linux 用户会看到每个插件都不兼容。扩展共享元组是最小的连贯改动，而且 Linux 上已有运行时证据。

**像当前默认那样只用 `dir` 打包 Linux。** 否决。AppImage 是 electron-updater 的 LinuxUpdater 消费的格式；deb 覆盖 Debian/Ubuntu 安装。AppImage 加 deb 与 macOS ZIP 要求占用相同空间，并保持更新渠道可用。

**在 Linux 上复用单色托盘模板。** 否决。StatusNotifierItem 原样渲染图像，macOS 模板在深色面板上会不可见。应用图标是已为 macOS 与 Windows 打包的受跟踪资产。

## 影响

Linux 成为与 macOS、Windows 同级的一等桌面目标，插件安装、自动更新与发布机制完全一致。插件中心白名单现在命名五个元组，未来对该元组列表的架构调整必须同时考虑 `linux-*` 形式。打包 Linux 运行时会把 Landlock launcher 与其他原生模块带进每个 Linux 产物，增加解包体积；afterPack gate 会令构建失败而不是发布一个损坏的 Host。Linux AppImage 自动更新依赖 electron-updater 的 LinuxUpdater 与通用 OSS feed，现在发布 `-linux.yml` 元数据；deb 载荷不参与自动更新。Linux 窗口保持无边框且无原生材质，因此客户端持有拖拽区，托盘使用彩色应用图标；Linux 安装包签名仍是独立的发布工作，正如 Windows Authenticode 与 macOS 公证一样。

## 验证

Contract 与 Desktop 单元测试钉住白名单（`compatibility.spec.ts`）、平台映射（`plugin-center-compatibility.spec.ts`）、打包后的 Linux 原生模块 gate（`verify-packaged-runtime.spec.ts`）、AppImage/deb 打包配置（`packaging-config.spec.ts`）、Linux 渠道元数据（`publish-update.spec.ts`）以及三平台工作流断言与双语下载文案（`github-release-workflow.spec.ts`）。Desktop `typecheck` 与受影响的 contract/Desktop/Web 套件通过。发布工作流的 Linux job 只在真实 `desktop-v*` tag 推送时执行；afterPack gate 会在 staging 运行时遗漏必需 Linux 模块时令构建失败。
