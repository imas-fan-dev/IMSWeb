import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import process from "node:process"

export const REQUIRED_NODE_MAJOR = 22
export const REQUIRED_NODE_MINOR = 13

export const REQUIRED_IOS_RUST_TARGETS = [
  "aarch64-apple-ios",
  "aarch64-apple-ios-sim",
  "x86_64-apple-ios",
]

export const REQUIRED_ANDROID_RUST_TARGETS = [
  "aarch64-linux-android",
  "armv7-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
]

// Gradle 8.14 refuses to configure :buildSrc on newer JDKs, so the generated
// Android project only builds on a Java toolchain inside this range.
export const MINIMUM_GRADLE_JAVA_MAJOR = 17
export const MAXIMUM_GRADLE_JAVA_MAJOR = 21

export function commandPath(command, environment = process.env) {
  const entries = (environment.PATH ?? "").split(delimiter).filter(Boolean)
  for (const entry of entries) {
    const candidate = resolve(entry, command)
    if (existsSync(candidate)) return candidate
  }
  return ""
}

function capture(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: environment,
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

export function androidSdkRoot(environment = process.env) {
  const configured = (
    environment.ANDROID_HOME ??
    environment.ANDROID_SDK_ROOT ??
    ""
  ).trim()
  if (configured) return existsSync(configured) ? configured : ""

  const home = (environment.HOME ?? "").trim()
  if (!home) return ""
  const fallback = resolve(home, "Library/Android/sdk")
  return existsSync(fallback) ? fallback : ""
}

export function androidNdkRoot(environment = process.env, sdkRoot = "") {
  const configured = (
    environment.NDK_HOME ??
    environment.ANDROID_NDK_HOME ??
    environment.ANDROID_NDK_ROOT ??
    ""
  ).trim()
  if (configured) return existsSync(configured) ? configured : ""

  const root = sdkRoot || androidSdkRoot(environment)
  if (!root) return ""
  const bundled = join(root, "ndk")
  if (!existsSync(bundled)) return ""
  const versions = readdirSync(bundled).filter((entry) => /^\d+\./.test(entry))
  if (!versions.length) return ""
  return join(bundled, versions.sort(compareVersionNames).at(-1))
}

function compareVersionNames(left, right) {
  const parse = (value) => value.split(/[.-]/).map((part) => Number(part) || 0)
  const leftParts = parse(left)
  const rightParts = parse(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function androidToolPath(name, environment = process.env) {
  const root = androidSdkRoot(environment)
  const candidates = root
    ? [
        join(root, "platform-tools", name),
        join(root, "emulator", name),
        join(root, "cmdline-tools/latest/bin", name),
        join(root, "tools/bin", name),
      ]
    : []
  const bundled = candidates.find((candidate) => existsSync(candidate))
  return bundled ?? commandPath(name, environment)
}

export function latestBuildToolsPath(environment = process.env) {
  const root = androidSdkRoot(environment)
  if (!root) return ""
  const buildTools = join(root, "build-tools")
  if (!existsSync(buildTools)) return ""
  const versions = readdirSync(buildTools).filter((entry) =>
    /^\d+\./.test(entry)
  )
  if (!versions.length) return ""
  return join(buildTools, versions.sort(compareVersionNames).at(-1))
}

export function javaMajorVersion(environment = process.env) {
  const home = (environment.JAVA_HOME ?? "").trim()
  const executable = home
    ? join(home, "bin/java")
    : commandPath("java", environment)
  if (!executable || !existsSync(executable)) return 0

  const { stdout, stderr } = capture(executable, ["-version"], environment)
  const match = `${stderr}${stdout}`.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return 0
  const major = Number(match[1])
  return major === 1 ? Number(match[2] ?? 0) : major
}

export function installedRustTargets(environment = process.env) {
  const rustup = commandPath("rustup", environment)
  if (!rustup) return []
  const { status, stdout } = capture(
    rustup,
    ["target", "list", "--installed"],
    environment
  )
  if (status !== 0) return []
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function xcodeDeveloperDirectory(environment = process.env) {
  const xcodeSelect = commandPath("xcode-select", environment)
  if (!xcodeSelect) return ""
  const { status, stdout } = capture(xcodeSelect, ["-p"], environment)
  return status === 0 ? stdout.trim() : ""
}

function check(name, status, detail, remedy = "") {
  return { name, status, detail, remedy }
}

function nodeVersionCheck() {
  const [major, minor] = process.versions.node.split(".").map(Number)
  const satisfied =
    major > REQUIRED_NODE_MAJOR ||
    (major === REQUIRED_NODE_MAJOR && minor >= REQUIRED_NODE_MINOR)
  return check(
    "Node.js",
    satisfied ? "ok" : "fail",
    `v${process.versions.node}`,
    satisfied
      ? ""
      : `安装 Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.0`
  )
}

function rustTargetChecks(required, installed, label) {
  const missing = required.filter((target) => !installed.includes(target))
  return check(
    `Rust ${label} targets`,
    missing.length ? "fail" : "ok",
    missing.length ? `缺少 ${missing.join(", ")}` : required.join(", "),
    missing.length ? `rustup target add ${missing.join(" ")}` : ""
  )
}

function sharedChecks(workspaceRoot, environment) {
  const tauriCli = join(workspaceRoot, "node_modules/.bin/tauri")
  const pnpm = commandPath("pnpm", environment)
  const rustup = commandPath("rustup", environment)
  const cargo = commandPath("cargo", environment)

  return [
    nodeVersionCheck(),
    check(
      "pnpm",
      pnpm ? "ok" : "fail",
      pnpm || "未找到",
      pnpm ? "" : "corepack enable && corepack prepare pnpm@11 --activate"
    ),
    check(
      "Rust toolchain",
      rustup && cargo ? "ok" : "fail",
      rustup || "未找到 rustup",
      rustup && cargo
        ? ""
        : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    ),
    check(
      "Tauri CLI",
      existsSync(tauriCli) ? "ok" : "fail",
      existsSync(tauriCli) ? tauriCli : "未安装工作区依赖",
      existsSync(tauriCli) ? "" : "pnpm install --frozen-lockfile"
    ),
  ]
}

function iosChecks(workspaceRoot, environment) {
  const developerDirectory = xcodeDeveloperDirectory(environment)
  const fullXcode =
    developerDirectory.length > 0 &&
    !developerDirectory.endsWith("CommandLineTools")
  const pod = commandPath("pod", environment)
  const xcrun = commandPath("xcrun", environment)
  const developmentTeam = (
    environment.TAURI_APPLE_DEVELOPMENT_TEAM ??
    environment.APPLE_DEVELOPMENT_TEAM ??
    ""
  ).trim()

  const checks = [
    check(
      "macOS 主机",
      process.platform === "darwin" ? "ok" : "fail",
      process.platform,
      process.platform === "darwin" ? "" : "iOS 构建只能在 macOS 上执行"
    ),
    check(
      "Xcode",
      fullXcode ? "ok" : "fail",
      developerDirectory || "未选择 Developer 目录",
      fullXcode
        ? ""
        : "安装完整 Xcode 后执行 sudo xcode-select -s /Applications/Xcode.app"
    ),
    check(
      "xcrun",
      xcrun ? "ok" : "fail",
      xcrun || "未找到",
      xcrun ? "" : "安装 Xcode Command Line Tools"
    ),
    check(
      "CocoaPods",
      pod ? "ok" : "fail",
      pod || "未找到",
      pod ? "" : "brew install cocoapods"
    ),
    rustTargetChecks(
      REQUIRED_IOS_RUST_TARGETS,
      installedRustTargets(environment),
      "iOS"
    ),
    check(
      "Apple 开发团队",
      developmentTeam ? "ok" : "warn",
      developmentTeam || "未设置 TAURI_APPLE_DEVELOPMENT_TEAM",
      developmentTeam
        ? ""
        : "真机构建前导出 TAURI_APPLE_DEVELOPMENT_TEAM=<Team ID>"
    ),
    check(
      "生成的 Apple 工程",
      existsSync(join(workspaceRoot, "src-tauri/gen/apple")) ? "ok" : "warn",
      existsSync(join(workspaceRoot, "src-tauri/gen/apple"))
        ? "src-tauri/gen/apple"
        : "尚未生成",
      existsSync(join(workspaceRoot, "src-tauri/gen/apple"))
        ? ""
        : "首次运行安装命令时自动执行 tauri ios init"
    ),
  ]

  return checks
}

function androidChecks(workspaceRoot, environment) {
  const sdkRoot = androidSdkRoot(environment)
  const ndkRoot = androidNdkRoot(environment, sdkRoot)
  const adb = androidToolPath("adb", environment)
  const emulator = androidToolPath("emulator", environment)
  const buildTools = latestBuildToolsPath(environment)
  const javaMajor = javaMajorVersion(environment)
  const javaSupported =
    javaMajor >= MINIMUM_GRADLE_JAVA_MAJOR &&
    javaMajor <= MAXIMUM_GRADLE_JAVA_MAJOR

  return [
    check(
      "Android SDK",
      sdkRoot ? "ok" : "fail",
      sdkRoot || "未设置 ANDROID_HOME",
      sdkRoot ? "" : 'export ANDROID_HOME="$HOME/Library/Android/sdk"'
    ),
    check(
      "Android NDK",
      ndkRoot ? "ok" : "fail",
      ndkRoot || "未设置 NDK_HOME",
      ndkRoot
        ? ""
        : 'export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"'
    ),
    check(
      "Java",
      javaSupported ? "ok" : "fail",
      javaMajor ? `Java ${javaMajor}` : "未找到 java",
      javaSupported
        ? ""
        : `Gradle 需要 Java ${MINIMUM_GRADLE_JAVA_MAJOR}-${MAXIMUM_GRADLE_JAVA_MAJOR}；` +
            "export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
    ),
    check(
      "adb",
      adb ? "ok" : "fail",
      adb || "未找到",
      adb ? "" : "通过 Android Studio 安装 Platform-Tools"
    ),
    check(
      "emulator",
      emulator ? "ok" : "warn",
      emulator || "未找到",
      emulator ? "" : "只影响模拟器安装；通过 Android Studio 安装 Emulator"
    ),
    check(
      "build-tools",
      buildTools ? "ok" : "warn",
      buildTools || "未找到",
      buildTools ? "" : "本地签名 release APK 需要 zipalign 与 apksigner"
    ),
    rustTargetChecks(
      REQUIRED_ANDROID_RUST_TARGETS,
      installedRustTargets(environment),
      "Android"
    ),
    check(
      "生成的 Android 工程",
      existsSync(join(workspaceRoot, "src-tauri/gen/android")) ? "ok" : "warn",
      existsSync(join(workspaceRoot, "src-tauri/gen/android"))
        ? "src-tauri/gen/android"
        : "尚未生成",
      existsSync(join(workspaceRoot, "src-tauri/gen/android"))
        ? ""
        : "首次运行安装命令时自动执行 tauri android init"
    ),
  ]
}

export function collectPrerequisites({
  platform,
  workspaceRoot,
  environment = process.env,
}) {
  const groups = [
    { label: "通用", checks: sharedChecks(workspaceRoot, environment) },
  ]
  if (platform !== "android") {
    groups.push({ label: "iOS", checks: iosChecks(workspaceRoot, environment) })
  }
  if (platform !== "ios") {
    groups.push({
      label: "Android",
      checks: androidChecks(workspaceRoot, environment),
    })
  }
  return groups
}

export function prerequisiteFailures(groups) {
  return groups.flatMap(({ label, checks }) =>
    checks
      .filter((entry) => entry.status === "fail")
      .map((entry) => `${label} / ${entry.name}: ${entry.detail}`)
  )
}

// CJK ideographs and full-width punctuation occupy two terminal columns, so
// String.padEnd on a mixed label misaligns the report.
function displayWidth(value) {
  let width = 0
  for (const character of value) {
    const code = character.codePointAt(0)
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    width += wide ? 2 : 1
  }
  return width
}

function padDisplay(value, width) {
  return value + " ".repeat(Math.max(0, width - displayWidth(value)))
}

export function formatPrerequisiteReport(groups) {
  const lines = []
  for (const { label, checks } of groups) {
    lines.push(`[${label}]`)
    for (const entry of checks) {
      const marker = { ok: "  ok  ", warn: " warn ", fail: " fail " }[
        entry.status
      ]
      lines.push(`${marker} ${padDisplay(entry.name, 22)} ${entry.detail}`)
      if (entry.remedy) lines.push(`${" ".repeat(7)} → ${entry.remedy}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}
