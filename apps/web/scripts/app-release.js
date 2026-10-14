import { existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

import {
  deviceArchivePath,
  ensurePlatformProject,
  log,
  newestPath,
  reportBuildOrigins,
  run,
  signApkLocally,
  tauriConfiguration,
  walk,
  webWorkspaceRoot,
} from "./app-device.js"
import { latestBuildToolsPath } from "./app-toolchain.js"

export const RELEASE_PLATFORMS = ["ios", "android"]

// Android versionCode is capped by the Play Store's own numeric ceiling; iOS
// --build-number is a u32. Both fit a minutes-since-epoch counter for
// millennia, so one formula covers both platforms without per-platform caps.
export const ANDROID_MAX_VERSION_CODE = 2_100_000_000
export const IOS_MAX_BUILD_NUMBER = 4_294_967_295

const USAGE = `用法: node scripts/app-release.js <ios|android> [选项]

为预览分发构建一个独立产物：iOS 产出未签名 IPA（配合 Sideloadly 等工具由用户自助签名安装），
Android 产出经本地预览密钥签名、可直接安装的 APK。

选项:
  --version-suffix <值>   追加到基础版本号的预发布标识，例如太平洋时间 202609111930
  --build-number <整数>   iOS CFBundleVersion / Android versionCode 使用的数值，必须在
                          1..${IOS_MAX_BUILD_NUMBER} 之间（Android 额外要求 <= ${ANDROID_MAX_VERSION_CODE}）
  --out <目录>            产物输出目录（默认 dist/app-release）
  --keystore <路径>       Android 签名密钥库路径（默认 ~/.android/debug.keystore）
  --keystore-pass <值>    密钥库口令（默认 android）
  --key-alias <值>        密钥别名（默认 androiddebugkey）
  --key-pass <值>         密钥口令（默认与 --keystore-pass 相同）`

export function parseAppReleaseArguments(argv) {
  const [platform = "", ...rest] = argv
  if (!RELEASE_PLATFORMS.includes(platform)) {
    if (platform === "--help" || platform === "help" || !platform) {
      return { help: true }
    }
    throw new Error(`平台必须是 ${RELEASE_PLATFORMS.join(" 或 ")}`)
  }

  const options = {
    help: false,
    platform,
    versionSuffix: "",
    buildNumber: 0,
    out: "dist/app-release",
    keystore: "",
    keystorePass: "android",
    keyAlias: "androiddebugkey",
    keyPass: "",
  }

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    const value = rest[index + 1]
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argument} 需要一个值`)
    }
    switch (argument) {
      case "--version-suffix":
        options.versionSuffix = value
        break
      case "--build-number":
        options.buildNumber = Number(value)
        break
      case "--out":
        options.out = value
        break
      case "--keystore":
        options.keystore = value
        break
      case "--keystore-pass":
        options.keystorePass = value
        break
      case "--key-alias":
        options.keyAlias = value
        break
      case "--key-pass":
        options.keyPass = value
        break
      default:
        throw new Error(`无法识别的参数 ${argument}`)
    }
    index += 1
  }

  if (!options.versionSuffix) throw new Error("--version-suffix 是必需的")
  if (
    !Number.isInteger(options.buildNumber) ||
    options.buildNumber < 1 ||
    options.buildNumber > IOS_MAX_BUILD_NUMBER
  ) {
    throw new Error(`--build-number 必须是 1..${IOS_MAX_BUILD_NUMBER} 之间的整数`)
  }
  if (
    options.platform === "android" &&
    options.buildNumber > ANDROID_MAX_VERSION_CODE
  ) {
    throw new Error(
      `Android --build-number 必须 <= ${ANDROID_MAX_VERSION_CODE}`
    )
  }
  if (!options.keyPass) options.keyPass = options.keystorePass

  return options
}

// A version already carrying a prerelease/build-metadata suffix (e.g. a
// leftover local override) would otherwise nest a second `-preview.` tag on
// every subsequent run; strip back to the bare MAJOR.MINOR.PATCH first.
export function basePreviewVersion(rawVersion) {
  const match = /^\d+\.\d+\.\d+/.exec(rawVersion)
  if (!match) {
    throw new Error(`tauri.conf.json 的 version 不是合法的 semver：${rawVersion}`)
  }
  return match[0]
}

export function previewVersion(rawVersion, versionSuffix) {
  return `${basePreviewVersion(rawVersion)}-preview.${versionSuffix}`
}

function ensureOutputDirectory(outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true })
}

function runIosRelease(options, workspaceRoot, environment) {
  const { base } = tauriConfiguration(workspaceRoot)
  const version = previewVersion(base.version, options.versionSuffix)
  const buildRoot = join(workspaceRoot, "src-tauri/gen/apple/build")

  reportBuildOrigins(environment)
  ensurePlatformProject(workspaceRoot, "ios", environment)

  const config = JSON.stringify({ version })
  const status = run(
    "pnpm",
    [
      "exec",
      "tauri",
      "ios",
      "build",
      "--target",
      "aarch64",
      "--no-sign",
      "--build-number",
      String(options.buildNumber),
      "--config",
      config,
    ],
    { cwd: workspaceRoot, env: environment }
  )
  if (status !== 0) throw new Error("tauri ios build 失败")

  const ipaPath = deviceArchivePath(buildRoot)
  const outputDirectory = resolve(workspaceRoot, options.out)
  ensureOutputDirectory(outputDirectory)
  const destination = join(
    outputDirectory,
    `imsweb-preview-ios-${options.versionSuffix}.ipa`
  )
  run("cp", [ipaPath, destination])
  log(`iOS 预览包：${destination}`)
  return { path: destination, version }
}

function newestAndroidApk(outputsDirectory, profile) {
  return newestPath(
    walk(outputsDirectory, (entryPath) => entryPath.endsWith(".apk")).filter(
      (entryPath) => entryPath.includes(`/${profile}/`)
    )
  )
}

function runAndroidRelease(options, workspaceRoot, environment) {
  const { base } = tauriConfiguration(workspaceRoot)
  const version = previewVersion(base.version, options.versionSuffix)

  reportBuildOrigins(environment)
  ensurePlatformProject(workspaceRoot, "android", environment)

  const config = JSON.stringify({
    version,
    bundle: { android: { versionCode: options.buildNumber } },
  })
  const status = run(
    "pnpm",
    ["exec", "tauri", "android", "build", "--apk", "--target", "aarch64", "--config", config],
    { cwd: workspaceRoot, env: environment }
  )
  if (status !== 0) throw new Error("tauri android build 失败")

  const outputsDirectory = join(
    workspaceRoot,
    "src-tauri/gen/android/app/build/outputs/apk"
  )
  let apkPath = newestAndroidApk(outputsDirectory, "release")
  if (!apkPath) throw new Error("找不到 Android APK 产物")

  if (apkPath.includes("-unsigned")) {
    const buildTools = latestBuildToolsPath(environment)
    if (!buildTools) throw new Error("找不到 Android build-tools，无法签名")
    const keystore =
      options.keystore || join(environment.HOME ?? "", ".android/debug.keystore")
    if (!existsSync(keystore)) {
      throw new Error(`找不到签名密钥库：${keystore}`)
    }
    apkPath = signApkLocally({
      apkPath,
      buildTools,
      environment,
      keystore,
      keystorePass: options.keystorePass,
      keyAlias: options.keyAlias,
      keyPass: options.keyPass,
    })
  }

  const outputDirectory = resolve(workspaceRoot, options.out)
  ensureOutputDirectory(outputDirectory)
  const destination = join(
    outputDirectory,
    `imsweb-preview-android-${options.versionSuffix}.apk`
  )
  run("cp", [apkPath, destination])
  log(`Android 预览包：${destination}`)
  return { path: destination, version }
}

export function runAppRelease(
  argv = process.argv.slice(2),
  environment = process.env
) {
  const options = parseAppReleaseArguments(argv)
  if (options.help) {
    log(USAGE)
    return 0
  }
  const workspaceRoot = webWorkspaceRoot()
  const result =
    options.platform === "ios"
      ? runIosRelease(options, workspaceRoot, environment)
      : runAndroidRelease(options, workspaceRoot, environment)
  log(`版本号：${result.version}`)
  return 0
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined

if (entryUrl === import.meta.url) {
  try {
    process.exitCode = runAppRelease()
  } catch (error) {
    globalThis.console.error(
      error instanceof Error ? error.message : String(error)
    )
    process.exitCode = 1
  }
}
