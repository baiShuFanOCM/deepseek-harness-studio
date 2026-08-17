# Agent Note: Linux desktop support

Status: implemented

English | [中文](2026-08-16-linux-desktop-support.zh.md)

## Problem

The Desktop application shipped only macOS arm64 and Windows x64 builds. The Host runtime already supported Linux — the sandbox layer probes `bwrap` then `landlock`, every native dependency (Landlock launcher, koffi, node-pty, Sharp, node-addon-require-builtin) has Linux prebuilds in the lockfile, and CI already runs the Linux host gate — but the Desktop layer rejected the platform in four places: the Plugin Center platform whitelist, the electron-builder Linux target, the auto-update publisher, and the release workflow. Linux users could not install plugins, produce AppImage/deb artifacts, or receive updates.

## Decision

**The Plugin Center whitelist covers Linux x64 and arm64.** `SUPPORTED_PLUGIN_PLATFORMS` in `packages/plugin-center/contracts` adds `linux-x64` and `linux-arm64`, and the `PLATFORM` tuple regex accepts `linux-*`. `apps/desktop/src/plugin-center/environment.ts` maps both Linux tuples; the npm-ecosystem catalog and its bundled fixture advertise the same five-platform list. Compatibility fingerprints on Linux therefore resolve instead of throwing.

**electron-builder produces AppImage and deb for both Linux architectures.** The `linux` build section targets `AppImage` and `deb` with an `${arch}` artifact name, sharing the tracked `build/icon.png` with macOS and Windows. `verify-packaged-runtime.ts` afterPack now enforces the Linux native-module inventory per architecture — Landlock launcher, koffi, node-addon-require-builtin (`-gnu` naming), node-pty prebuilds, and a Sharp `.node` — mirroring the Windows gate. The root `dist:linux:desktop` entry stages a `linux`-targeted runtime and invokes electron-builder directly.

**The auto-update publisher accepts Linux channel metadata.** `publish-update.ts` recognizes `-linux.yml` (x64, the default channel file electron-updater requests) and `-linux-arm64.yml` as Linux channels instead of throwing, keeps the Windows bare-channel and macOS `-mac.yml` forms, and validates Linux AppImage payloads without the macOS ZIP requirement.

**The release workflow builds and verifies Linux on native runners.** `desktop-release.yml` adds a Linux job matrixed over x64 (`ubuntu-24.04`) and arm64 (`ubuntu-24.04-arm`), stages the runtime for `linux`, builds AppImage and deb, and uploads the channel metadata. The publish job requires one DMG, ZIP, and EXE plus two AppImages and two debs before generating `SHA256SUMS` and creating the draft release; release notes list Linux.

**Linux windows stay frameless and opaque.** `apps/desktop/src/main.ts` drops `transparent` and `titleBarOverlay` on Linux — Electron provides no equivalent native material there and the Web client explicitly keeps solid surfaces (ui-theme `base.css`) — while keeping the renderer drag region, matching the chrome decision in the [Electron loopback Web supervisor](../../architecture/2026-08-14-electron-loopback-web-supervisor.md). The tray falls back to the colored `build/icon.png` because StatusNotifierItem does not tint template images, and `extraResources` ships that icon into `desktop-resources`.

## Alternatives considered

**Keep the plugin whitelist at darwin/win32 and gate Linux installs.** Rejected because the catalog, fingerprint, and preflight pipeline is the only plugin-install path; a Linux user would see every plugin as incompatible. Extending the shared tuple is the smallest coherent change and the runtime evidence already exists on Linux.

**Package Linux with `dir` only, like the current default.** Rejected because AppImage is the format electron-updater's LinuxUpdater consumes; deb covers Debian/Ubuntu installs. AppImage plus deb is the same footprint as the macOS ZIP requirement and keeps the update channel usable.

**Reuse the monochrome tray template on Linux.** Rejected because StatusNotifierItem renders the image as-is, and the macOS template would be invisible on dark panels. The app icon is a tracked asset already packaged for macOS and Windows.

## Consequences

Linux becomes a first-class Desktop target with the same plugin-install, auto-update, and release machinery as macOS and Windows. The Plugin Center whitelist now names five tuples, so a future architecture change to the tuple list must keep `linux-*` forms in mind. Packaging the Linux runtime brings the Landlock launcher and the other native modules into every Linux artifact, increasing unpacked size; the afterPack gate fails a build rather than shipping a broken Host. Linux AppImage auto-update depends on electron-updater's LinuxUpdater and the generic OSS feed, which now publishes `-linux.yml` metadata; the deb payload does not participate in auto-update. Linux windows stay frameless without native material, so the client owns the drag region and the tray uses the colored app icon; Linux installer signing remains separate release work, as it already was for Windows Authenticode and macOS notarization.

## Verification

Contract and Desktop unit tests pin the whitelist (`compatibility.spec.ts`), the platform mapping (`plugin-center-compatibility.spec.ts`), the packaged Linux native-module gate (`verify-packaged-runtime.spec.ts`), the AppImage/deb packaging configuration (`packaging-config.spec.ts`), Linux channel metadata (`publish-update.spec.ts`), and the three-platform workflow assertions plus bilingual download copy (`github-release-workflow.spec.ts`). Desktop `typecheck` and the affected contract/Desktop/Web suites pass. The release workflow's Linux jobs are exercised only on a real `desktop-v*` tag push; the afterPack gate fails the build if the staged runtime omits a required Linux module.
