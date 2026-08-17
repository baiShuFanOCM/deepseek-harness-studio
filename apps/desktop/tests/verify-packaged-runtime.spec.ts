import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { afterPack } from '../scripts/verify-packaged-runtime.ts'

const UPDATE_URL = 'https://ml2022.oss-cn-hangzhou.aliyuncs.com/deepseek-harness-desktop/releases'

function context(
  appOutDir: string,
  electronPlatformName = 'darwin',
  publish: unknown = [{ provider: 'generic', url: UPDATE_URL, channel: 'rc' }],
  arch: string = 'x64',
) {
  return {
    appOutDir,
    electronPlatformName,
    arch,
    packager: {
      appInfo: {
        productFilename: 'DeepSeek Harness',
        updaterCacheDirName: 'deepseek-harness-updater',
      },
      config: { publish },
    },
    outDir: appOutDir,
    targets: [],
  } as unknown as Parameters<typeof afterPack>[0]
}

async function writeRequiredMacRuntime(appOutDir: string): Promise<void> {
  const modules = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
  const required = [
    ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
    ['pnpm', 'bin', 'pnpm.cjs'],
  ]
  for (const segments of required) {
    const file = join(modules, ...segments)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, '')
  }
  await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.7.0' }))
}

describe('packaged desktop runtime verification', () => {
  it('accepts the packaged runtime and writes its update configuration', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      await writeRequiredMacRuntime(appOutDir)

      await expect(afterPack(context(appOutDir))).resolves.toBeUndefined()
      const updateConfiguration = load(await readFile(join(
        appOutDir,
        'DeepSeek Harness.app',
        'Contents',
        'Resources',
        'app-update.yml',
      ), 'utf8'))
      expect(updateConfiguration).toEqual({
        provider: 'generic',
        url: UPDATE_URL,
        updaterCacheDirName: 'deepseek-harness-updater',
        channel: 'rc',
      })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects missing or insecure update providers', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-update-'))
    try {
      await writeRequiredMacRuntime(appOutDir)
      await expect(afterPack(context(appOutDir, 'darwin', null)))
        .rejects.toThrow('packaged desktop requires one generic HTTPS update provider')
      await expect(afterPack(context(appOutDir, 'darwin', [{
        provider: 'generic',
        url: 'http://updates.example.test',
        channel: 'rc',
      }])))
        .rejects.toThrow('packaged desktop update provider must use HTTPS')
      await expect(afterPack(context(appOutDir, 'darwin', [{
        provider: 'generic',
        url: UPDATE_URL,
      }])))
        .rejects.toThrow('packaged desktop requires an explicit update channel')
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a packaged shell whose package manager is absent or not pinned', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-pnpm-'))
    try {
      const modules = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
      const required = [
        ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
        ['pnpm', 'bin', 'pnpm.cjs'],
      ]
      for (const segments of required) {
        const file = join(modules, ...segments)
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, '')
      }
      await mkdir(join(modules, 'pnpm'), { recursive: true })
      await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.6.0' }))

      await expect(afterPack(context(appOutDir))).rejects.toThrow('packaged pnpm version must be 11.7.0')
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a shell whose Host dependency tree was filtered out', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      await expect(afterPack(context(appOutDir))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('requires Windows x64 native modules in a Windows package', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-win-'))
    try {
      const modules = join(appOutDir, 'resources', 'host', 'node_modules')
      const required = [
        ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
        ['pnpm', 'bin', 'pnpm.cjs'],
        ['@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'],
        ['node-addon-require-builtin-win32-x64-msvc', 'prebuilt', 'win32-x64-msvc-napi-v9.node'],
        ['node-pty', 'prebuilds', 'win32-x64', 'pty.node'],
        ['node-pty', 'prebuilds', 'win32-x64', 'conpty.node'],
        ['@img', 'sharp-win32-x64', 'lib', 'sharp-win32-x64-test.node'],
      ]
      for (const segments of required) {
        const file = join(modules, ...segments)
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, '')
      }
      await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.7.0' }))

      await expect(afterPack(context(appOutDir, 'win32'))).resolves.toBeUndefined()
      await rm(join(modules, 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node'))
      await expect(afterPack(context(appOutDir, 'win32'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it.each([
    ['linux-x64', 'linux', 'x64', 'linux-x64',
      ['@deepseek-ai', 'node-addon-landlock-run-linux-x64', 'bin', 'landlock-run'],
      ['node-addon-require-builtin-linux-x64-gnu', 'prebuilt', 'linux-x64-gnu-napi-v9.node']],
    ['linux-arm64', 'linux', 'arm64', 'linux-arm64',
      ['@deepseek-ai', 'node-addon-landlock-run-linux-arm64', 'bin', 'landlock-run'],
      ['node-addon-require-builtin-linux-arm64-gnu', 'prebuilt', 'linux-arm64-gnu-napi-v9.node']],
  ])('requires %s native modules in a %s package', async (_label, platform, arch, tuple, landlock, requireBuiltin) => {
    const appOutDir = await mkdtemp(join(tmpdir(), `dsh-packaged-runtime-${tuple}-`))
    try {
      const modules = join(appOutDir, 'resources', 'host', 'node_modules')
      const required = [
        ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
        ['pnpm', 'bin', 'pnpm.cjs'],
        ['@koromix', `koffi-${tuple}`, `${tuple.replace('-', '_')}`, 'koffi.node'],
        ['node-pty', 'prebuilds', tuple, 'pty.node'],
        ['@img', `sharp-${tuple}`, 'lib', `sharp-${tuple}-test.node`],
        requireBuiltin,
        landlock,
      ]
      for (const segments of required) {
        const file = join(modules, ...segments)
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, '')
      }
      await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.7.0' }))

      await expect(afterPack(context(appOutDir, platform, undefined, arch))).resolves.toBeUndefined()
      await rm(join(modules, ...landlock))
      await expect(afterPack(context(appOutDir, platform, undefined, arch))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })
})
