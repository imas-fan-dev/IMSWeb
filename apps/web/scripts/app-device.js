import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { networkInterfaces } from "node:os"
import { basename, join, resolve } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

import { appBuildEnvironment } from "./build-app.js"
import {
  androidToolPath,
  collectPrerequisites,
  formatPrerequisiteReport,
  latestBuildToolsPath,
  prerequisiteFailures,
} from "./app-toolchain.js"

export const IOS_TARGETS = ["simulator", "device"]
export const ANDROID_TARGETS = ["emulator", "device"]
export const PROFILES = ["debug", "release"]

export const ANDROID_ABI_TARGETS = {
  "arm64-v8a": { tauriTarget: "aarch64", flavor: "arm64" },
  "armeabi-v7a": { tauriTarget: "armv7", flavor: "arm" },
  x86: { tauriTarget: "i686", flavor: "x86" },
  x86_64: { tauriTarget: "x86_64", flavor: "x86_64" },
}

const USAGE = `用法: node scripts/app-device.js <命令> [选项]

命令:
  doctor                      检查 iOS/Android 打包与安装的前置依赖
  devices                     列出可用的模拟器、模拟机与已连接真机
  ios                         构建并安装 iOS 包
  android                     构建并安装 Android 包

选项:
  --target <值>               ios: simulator|device（默认 simulator）
                              android: emulator|device（默认 emulator）
  --profile <debug|release>   构建配置（默认 debug）
  --release                   等价于 --profile release
  --device <名称|UDID|序列号> 指定目标；省略时自动选择唯一或已启动的目标
  --live                      改用 Tauri 热重载会话，而不是安装自包含包
  --host [IP]                 --live 真机联调使用的局域网地址；省略值时自动探测
  --platform <ios|android>    仅对 doctor 与 devices 生效
  --skip-build                复用已有产物，跳过构建
  --no-launch                 安装后不自动启动
  --open                      打开 Xcode 或 Android Studio 而不是直接运行
  --                          其后参数原样传给 Tauri CLI`

function webWorkspaceRoot() {
  const currentDirectory = process.cwd()
  const candidates = [
    currentDirectory,
    resolve(currentDirectory, "apps/web"),
    resolve(currentDirectory, ".."),
  ]
  const workspace = candidates.find((candidate) =>
    existsSync(resolve(candidate, "react-router.config.ts"))
  )
  if (!workspace) throw new Error("Cannot locate the @imsweb/web workspace")
  return workspace
}

export function parseAppDeviceArguments(argv) {
  const options = {
    command: "",
    platform: "",
    target: "",
    profile: "debug",
    device: "",
    host: "",
    live: false,
    launch: true,
    build: true,
    open: false,
    passthrough: [],
  }

  const args = [...argv]
  // `pnpm run app -- ios ...` forwards the separator itself; a leading one is a
  // pnpm artifact, not the start of Tauri passthrough arguments.
  if (args[0] === "--") args.shift()

  const separator = args.indexOf("--")
  if (separator !== -1) {
    options.passthrough = args.splice(separator + 1)
    args.splice(separator, 1)
  }

  const [command = "", ...rest] = args
  options.command = command

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    const value = rest[index + 1]
    const takesValue = value !== undefined && !value.startsWith("--")

    switch (argument) {
      case "--target":
      case "--profile":
      case "--device":
      case "--platform":
        if (!takesValue) {
          throw new Error(`${argument} 需要一个值`)
        }
        options[argument.slice(2)] = value
        index += 1
        break
      case "--host":
        options.host = takesValue ? value : "auto"
        if (takesValue) index += 1
        break
      case "--release":
        options.profile = "release"
        break
      case "--debug":
        options.profile = "debug"
        break
      case "--live":
        options.live = true
        break
      case "--skip-build":
        options.build = false
        break
      case "--no-launch":
        options.launch = false
        break
      case "--open":
        options.open = true
        break
      default:
        throw new Error(`无法识别的参数 ${argument}`)
    }
  }

  if (options.command === "ios" || options.command === "android") {
    options.platform = options.command
  }
  if (!options.target) {
    options.target = options.platform === "android" ? "emulator" : "simulator"
  }
  if (!PROFILES.includes(options.profile)) {
    throw new Error(`--profile 只接受 ${PROFILES.join(" 或 ")}`)
  }

  const allowedTargets =
    options.platform === "android" ? ANDROID_TARGETS : IOS_TARGETS
  if (options.platform && !allowedTargets.includes(options.target)) {
    throw new Error(
      `${options.platform} 的 --target 只接受 ${allowedTargets.join(" 或 ")}`
    )
  }

  return options
}

function run(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ?? process.env,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function capture(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: env ?? process.env,
  })
  if (result.error || typeof result.status !== "number") {
    return { status: 1, stdout: "", stderr: "" }
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function log(message) {
  globalThis.console.log(message)
}

function readJsonFile(path) {
  // A bare SyntaxError names neither the file nor the field, which is useless
  // when two configs are read back to back.
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`无法解析 ${path}：${error.message}`, { cause: error })
  }
}

function tauriConfiguration(workspaceRoot) {
  const base = readJsonFile(join(workspaceRoot, "src-tauri/tauri.conf.json"))
  const android = readJsonFile(
    join(workspaceRoot, "src-tauri/tauri.android.conf.json")
  )
  return { base, android }
}

export function androidApplicationId({ identifier, debugSuffix }, profile) {
  // Tauri sanitizes the bundle identifier into a Java package for Android.
  const packageName = identifier.replace(/-/g, "_")
  return profile === "debug"
    ? `${packageName}${debugSuffix ?? ""}`
    : packageName
}

export function iosSimulatorRustTarget(architecture = process.arch) {
  return architecture === "x64" ? "x86_64" : "aarch64-sim"
}

export function newestPath(paths) {
  const existing = paths.filter((candidate) => existsSync(candidate))
  if (!existing.length) return ""
  return existing
    .map((candidate) => ({
      candidate,
      modified: statSync(candidate).mtimeMs,
    }))
    .sort((left, right) => left.modified - right.modified)
    .at(-1).candidate
}

function walk(directory, predicate, depth = 6) {
  if (depth < 0 || !existsSync(directory)) return []
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (predicate(entryPath, entry)) {
      found.push(entryPath)
      continue
    }
    if (entry.isDirectory())
      found.push(...walk(entryPath, predicate, depth - 1))
  }
  return found
}

// ---------------------------------------------------------------- iOS targets

function listIosSimulators() {
  const { status, stdout } = capture("xcrun", [
    "simctl",
    "list",
    "devices",
    "available",
    "--json",
  ])
  if (status !== 0) return []
  // Listing is best-effort: an unreadable simctl payload should leave the
  // other target lists intact rather than take the whole command down.
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  return Object.entries(parsed.devices ?? {}).flatMap(([runtime, devices]) =>
    devices.map((device) => ({
      name: device.name,
      identifier: device.udid,
      state: device.state,
      runtime: runtime.split(".").at(-1),
    }))
  )
}

function listIosDevices() {
  const output = join(
    process.env.TMPDIR ?? "/tmp",
    "imsweb-devicectl-devices.json"
  )
  const { status } = capture("xcrun", [
    "devicectl",
    "list",
    "devices",
    "--quiet",
    "--json-output",
    output,
  ])
  if (status !== 0 || !existsSync(output)) return []
  let parsed
  try {
    parsed = JSON.parse(readFileSync(output, "utf8"))
  } catch {
    return []
  } finally {
    // The temp file goes either way; a parse failure used to leak it.
    rmSync(output, { force: true })
  }
  return (parsed.result?.devices ?? [])
    .filter(
      (device) =>
        device.hardwareProperties?.platform === "iOS" &&
        device.connectionProperties?.pairingState === "paired"
    )
    .map((device) => {
      // `tunnelState` is the live CoreDevice tunnel, not reachability. A paired
      // device on the local network parks at "disconnected" and only opens the
      // tunnel when a command needs it, so reporting that raw value made every
      // installable device look unusable. Pairing is the real gate.
      const tunnelUp = device.connectionProperties?.tunnelState === "connected"
      return {
        name: device.deviceProperties?.name ?? "iOS device",
        identifier: device.hardwareProperties?.udid ?? "",
        state: tunnelUp ? "connected" : "paired",
        lastConnected: device.connectionProperties?.lastConnectionDate ?? "",
      }
    })
}

export function selectTarget(candidates, requested, { kind, prefer }) {
  if (requested) {
    const match = candidates.find(
      (candidate) =>
        candidate.identifier === requested ||
        candidate.name.toLowerCase().includes(requested.toLowerCase())
    )
    if (!match) {
      throw new Error(
        `找不到名称或标识为 ${requested} 的 ${kind}；先运行 devices 查看可用目标`
      )
    }
    return match
  }

  if (!candidates.length) {
    throw new Error(`没有可用的 ${kind}；先运行 devices 查看目标状态`)
  }
  const preferred = prefer ? candidates.filter(prefer) : []
  if (preferred.length) return preferred[0]
  if (candidates.length > 1) {
    const names = candidates.map((candidate) => candidate.name).join(", ")
    throw new Error(`存在多个 ${kind}，请用 --device 指定：${names}`)
  }
  return candidates[0]
}

// ------------------------------------------------------------ Android targets

function listAndroidDevices(environment) {
  const adb = androidToolPath("adb", environment)
  if (!adb) return []
  const { status, stdout } = capture(adb, ["devices", "-l"])
  if (status !== 0) return []
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("*"))
    .map((line) => {
      const [serial, state, ...descriptors] = line.split(/\s+/)
      const model = descriptors
        .find((descriptor) => descriptor.startsWith("model:"))
        ?.slice("model:".length)
      return {
        identifier: serial,
        name: model ?? serial,
        state,
        emulator: serial.startsWith("emulator-"),
      }
    })
    .filter((device) => device.state === "device")
}

function listAndroidVirtualDevices(environment) {
  const emulator = androidToolPath("emulator", environment)
  if (!emulator) return []
  const { status, stdout } = capture(emulator, ["-list-avds"])
  if (status !== 0) return []
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function androidDeviceAbi(adb, serial) {
  const { status, stdout } = capture(adb, [
    "-s",
    serial,
    "shell",
    "getprop",
    "ro.product.cpu.abi",
  ])
  return status === 0 ? stdout.trim() : ""
}

// --------------------------------------------------------------------- builds

export function iosBuildArguments({ target, profile, exportMethod }) {
  const args = ["ios", "build", "--target", target]
  if (profile === "debug") args.push("--debug")
  if (target !== "aarch64-sim" && target !== "x86_64") {
    args.push("--export-method", exportMethod)
  }
  return args
}

export function androidBuildArguments({ tauriTarget, profile }) {
  const args = ["android", "build", "--apk", "--target", tauriTarget]
  if (profile === "debug") args.push("--debug")
  return args
}

function ensurePlatformProject(workspaceRoot, platform, environment) {
  const generated = join(
    workspaceRoot,
    platform === "ios" ? "src-tauri/gen/apple" : "src-tauri/gen/android"
  )
  if (existsSync(generated)) return
  log(`生成 ${platform} 平台工程（首次运行）…`)
  const status = run("pnpm", ["exec", "tauri", platform, "init"], {
    cwd: workspaceRoot,
    env: environment,
  })
  if (status !== 0) throw new Error(`tauri ${platform} init 失败`)
}

function reportBuildOrigins(environment) {
  const build = appBuildEnvironment(environment)
  log(
    `打包 origin：API ${build.VITE_IMS_API_ORIGIN}，` +
      `站点 ${build.VITE_IMS_PUBLIC_SITE_ORIGIN}` +
      (build.VITE_IMS_MAP_TRANSPORT_ORIGIN
        ? `，地图 ${build.VITE_IMS_MAP_TRANSPORT_ORIGIN}`
        : "")
  )
  return build
}

// -------------------------------------------------------------- installations

function extractIpa(workspaceRoot, ipaPath) {
  const scratch = join(
    workspaceRoot,
    "src-tauri/gen/apple/build/.device-install"
  )
  rmSync(scratch, { force: true, recursive: true })
  mkdirSync(scratch, { recursive: true })
  const status = run("unzip", ["-o", "-q", ipaPath, "-d", scratch])
  if (status !== 0) throw new Error("解压 IPA 失败")
  const bundles = walk(join(scratch, "Payload"), (entryPath) =>
    entryPath.endsWith(".app")
  )
  if (!bundles.length) throw new Error("IPA 中没有找到 .app bundle")
  return bundles[0]
}

function installOnIosSimulator({ simulator, bundlePath, identifier, launch }) {
  if (simulator.state !== "Booted") {
    log(`启动模拟器 ${simulator.name}…`)
    capture("xcrun", ["simctl", "boot", simulator.identifier])
  }
  run("open", ["-ga", "Simulator"])

  log(`安装 ${basename(bundlePath)} 到 ${simulator.name}…`)
  const installed = run("xcrun", [
    "simctl",
    "install",
    simulator.identifier,
    bundlePath,
  ])
  if (installed !== 0) return installed
  if (!launch) return 0
  return run("xcrun", ["simctl", "launch", simulator.identifier, identifier])
}

function installOnIosDevice({ device, bundlePath, identifier, launch }) {
  log(`安装 ${basename(bundlePath)} 到 ${device.name}…`)
  const installed = run("xcrun", [
    "devicectl",
    "device",
    "install",
    "app",
    "--device",
    device.identifier,
    bundlePath,
  ])
  if (installed !== 0) return installed
  if (!launch) return 0
  return run("xcrun", [
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    device.identifier,
    identifier,
  ])
}

export function signApkLocally({ apkPath, buildTools, environment }) {
  const keystore = join(environment.HOME ?? "", ".android/debug.keystore")
  if (!existsSync(keystore)) {
    throw new Error(
      "本地调试 keystore 不存在；先运行一次 Android debug 构建或用 keytool 生成"
    )
  }
  const aligned = apkPath.replace(/\.apk$/, "-aligned.apk")
  rmSync(aligned, { force: true })

  const zipaligned = run(join(buildTools, "zipalign"), [
    "-p",
    "-f",
    "4",
    apkPath,
    aligned,
  ])
  if (zipaligned !== 0) throw new Error("zipalign 失败")

  const signed = run(join(buildTools, "apksigner"), [
    "sign",
    "--ks",
    keystore,
    "--ks-pass",
    "pass:android",
    "--ks-key-alias",
    "androiddebugkey",
    "--key-pass",
    "pass:android",
    aligned,
  ])
  if (signed !== 0) throw new Error("apksigner 失败")
  return aligned
}

function installOnAndroid({ adb, device, apkPath, applicationId, launch }) {
  log(`安装 ${basename(apkPath)} 到 ${device.name}…`)
  const installed = run(adb, [
    "-s",
    device.identifier,
    "install",
    "-r",
    apkPath,
  ])
  if (installed !== 0) return installed
  if (!launch) return 0
  return run(adb, [
    "-s",
    device.identifier,
    "shell",
    "monkey",
    "-p",
    applicationId,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ])
}

// ------------------------------------------------------------------- commands

function runDoctor(options, workspaceRoot, environment) {
  const groups = collectPrerequisites({
    platform: options.platform,
    workspaceRoot,
    environment,
  })
  log(formatPrerequisiteReport(groups))
  const failures = prerequisiteFailures(groups)
  if (!failures.length) {
    log("前置依赖检查通过。安装指引见 docs/development/app-device-delivery.md")
    return 0
  }
  log(
    `存在 ${failures.length} 项阻塞依赖，安装步骤见 docs/development/app-device-delivery.md`
  )
  return 1
}

function runDevices(options, environment) {
  if (options.platform !== "android" && process.platform === "darwin") {
    log("[iOS 模拟器]")
    for (const simulator of listIosSimulators()) {
      log(
        `  ${simulator.state === "Booted" ? "*" : " "} ${simulator.name} ` +
          `(${simulator.runtime}) ${simulator.identifier}`
      )
    }
    log("")
    log("[iOS 真机]")
    const devices = listIosDevices()
    if (!devices.length) log("  未检测到已配对设备")
    for (const device of devices) {
      log(
        `    ${device.name} ${device.identifier} [${device.state}]` +
          (device.lastConnected ? ` last ${device.lastConnected}` : "")
      )
    }
    log("")
  }

  if (options.platform !== "ios") {
    log("[Android 已连接目标]")
    const devices = listAndroidDevices(environment)
    if (!devices.length) log("  未检测到设备或模拟机")
    for (const device of devices) {
      log(
        `    ${device.name} ${device.identifier} ` +
          `[${device.emulator ? "emulator" : "device"}]`
      )
    }
    log("")
    log("[Android 可启动 AVD]")
    const avds = listAndroidVirtualDevices(environment)
    if (!avds.length) log("  未创建 AVD")
    for (const avd of avds) log(`    ${avd}`)
  }

  return 0
}

function detectLanHost() {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(
      (entry) =>
        entry && entry.family === "IPv4" && !entry.internal && entry.address
    )
    .map((entry) => entry.address)
  const privateAddress = addresses.find((address) =>
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)
  )
  if (!privateAddress) {
    throw new Error("无法自动探测局域网地址，请显式传入 --host <IP>")
  }
  return privateAddress
}

function runLiveSession(options, workspaceRoot, environment) {
  const args = [options.platform, "dev"]
  if (options.device) args.push(options.device)
  if (options.profile === "release") args.push("--release")
  if (options.open) args.push("--open")
  if (options.host) {
    const host = options.host === "auto" ? detectLanHost() : options.host
    args.push("--host", host)
    log(`热重载会话使用局域网地址 ${host}`)
  }
  args.push(...options.passthrough)

  return run("pnpm", ["exec", "tauri", ...args], {
    cwd: workspaceRoot,
    env: environment,
  })
}

function simulatorBundlePath(buildRoot, productName) {
  return newestPath(
    walk(buildRoot, (entryPath) => entryPath.endsWith(".app")).filter(
      (entryPath) =>
        entryPath.includes("-sim/") &&
        basename(entryPath) === `${productName}.app`
    )
  )
}

function deviceArchivePath(buildRoot) {
  const ipaPath = newestPath(
    walk(buildRoot, (entryPath) => entryPath.endsWith(".ipa"))
  )
  if (!ipaPath) {
    throw new Error("找不到 IPA 产物；确认构建成功或去掉 --skip-build")
  }
  return ipaPath
}

function runIosDelivery(options, workspaceRoot, environment) {
  const { base } = tauriConfiguration(workspaceRoot)
  const productName = base.productName
  const simulatorBuild = options.target === "simulator"
  const rustTarget = simulatorBuild ? iosSimulatorRustTarget() : "aarch64"

  const target = simulatorBuild
    ? selectTarget(listIosSimulators(), options.device, {
        kind: "iOS 模拟器",
        prefer: (candidate) => candidate.state === "Booted",
      })
    : selectTarget(listIosDevices(), options.device, {
        kind: "iOS 真机",
        prefer: (candidate) => candidate.state === "connected",
      })

  if (options.build) {
    reportBuildOrigins(environment)
    ensurePlatformProject(workspaceRoot, "ios", environment)
    const args = iosBuildArguments({
      target: rustTarget,
      profile: options.profile,
      exportMethod: environment.IMS_IOS_EXPORT_METHOD ?? "debugging",
    })
    const status = run(
      "pnpm",
      ["exec", "tauri", ...args, ...options.passthrough],
      { cwd: workspaceRoot, env: environment }
    )
    if (status !== 0) return status
  }

  const buildRoot = join(workspaceRoot, "src-tauri/gen/apple/build")
  const bundlePath = simulatorBuild
    ? simulatorBundlePath(buildRoot, productName)
    : extractIpa(workspaceRoot, deviceArchivePath(buildRoot))

  if (!bundlePath) {
    throw new Error("找不到 iOS 产物；确认构建成功或去掉 --skip-build")
  }

  return simulatorBuild
    ? installOnIosSimulator({
        simulator: target,
        bundlePath,
        identifier: base.identifier,
        launch: options.launch,
      })
    : installOnIosDevice({
        device: target,
        bundlePath,
        identifier: base.identifier,
        launch: options.launch,
      })
}

function runAndroidDelivery(options, workspaceRoot, environment) {
  const { base, android } = tauriConfiguration(workspaceRoot)
  const adb = androidToolPath("adb", environment)
  if (!adb) throw new Error("找不到 adb；先运行 doctor 检查 Android SDK")

  const wantsEmulator = options.target === "emulator"
  const device = selectTarget(
    listAndroidDevices(environment).filter(
      (candidate) => candidate.emulator === wantsEmulator
    ),
    options.device,
    { kind: wantsEmulator ? "Android 模拟机" : "Android 真机" }
  )

  const abi = androidDeviceAbi(adb, device.identifier)
  const abiTarget = ANDROID_ABI_TARGETS[abi]
  if (!abiTarget) {
    throw new Error(`不支持的设备 ABI ${abi || "(未知)"}`)
  }

  if (options.build) {
    reportBuildOrigins(environment)
    ensurePlatformProject(workspaceRoot, "android", environment)
    const args = androidBuildArguments({
      tauriTarget: abiTarget.tauriTarget,
      profile: options.profile,
    })
    const status = run(
      "pnpm",
      ["exec", "tauri", ...args, ...options.passthrough],
      { cwd: workspaceRoot, env: environment }
    )
    if (status !== 0) return status
  }

  const outputs = join(
    workspaceRoot,
    "src-tauri/gen/android/app/build/outputs/apk"
  )
  let apkPath = newestPath(
    walk(outputs, (entryPath) => entryPath.endsWith(".apk")).filter(
      (entryPath) => entryPath.includes(`/${options.profile}/`)
    )
  )
  if (!apkPath) {
    throw new Error("找不到 APK 产物；确认构建成功或去掉 --skip-build")
  }

  if (apkPath.includes("-unsigned")) {
    if (environment.IMS_ANDROID_LOCAL_SIGNING !== "1") {
      throw new Error(
        "Release APK 未签名，无法安装。仅供本机验证时设置 " +
          "IMS_ANDROID_LOCAL_SIGNING=1 使用本地 debug keystore 重新签名；" +
          "正式分发必须使用受管上传密钥。"
      )
    }
    const buildTools = latestBuildToolsPath(environment)
    if (!buildTools) {
      throw new Error("找不到 Android build-tools，无法本地签名")
    }
    log("使用本地 debug keystore 签名（仅限本机验证，不可用于分发）…")
    apkPath = signApkLocally({ apkPath, buildTools, environment })
  }

  return installOnAndroid({
    adb,
    device,
    apkPath,
    applicationId: androidApplicationId(
      {
        identifier: base.identifier,
        debugSuffix: android.bundle?.android?.debugApplicationIdSuffix,
      },
      options.profile
    ),
    launch: options.launch,
  })
}

export function runAppDevice(
  argv = process.argv.slice(2),
  environment = process.env
) {
  const options = parseAppDeviceArguments(argv)
  const workspaceRoot = webWorkspaceRoot()

  switch (options.command) {
    case "doctor":
      return runDoctor(options, workspaceRoot, environment)
    case "devices":
      return runDevices(options, environment)
    case "ios":
    case "android":
      if (options.live) {
        return runLiveSession(options, workspaceRoot, environment)
      }
      return options.command === "ios"
        ? runIosDelivery(options, workspaceRoot, environment)
        : runAndroidDelivery(options, workspaceRoot, environment)
    case "help":
    case "--help":
    case "":
      log(USAGE)
      return options.command ? 0 : 1
    default:
      log(USAGE)
      throw new Error(`无法识别的命令 ${options.command}`)
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined

if (entryUrl === import.meta.url) {
  try {
    process.exitCode = runAppDevice()
  } catch (error) {
    globalThis.console.error(
      error instanceof Error ? error.message : String(error)
    )
    process.exitCode = 1
  }
}
