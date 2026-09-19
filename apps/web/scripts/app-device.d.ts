export const IOS_TARGETS: readonly string[]
export const ANDROID_TARGETS: readonly string[]
export const PROFILES: readonly string[]

export interface AndroidAbiTarget {
  tauriTarget: string
  flavor: string
}

export const ANDROID_ABI_TARGETS: Record<string, AndroidAbiTarget>

export interface AppDeviceOptions {
  command: string
  platform: string
  target: string
  profile: string
  device: string
  host: string
  live: boolean
  launch: boolean
  build: boolean
  open: boolean
  passthrough: string[]
}

export interface DeliveryTarget {
  identifier: string
  name: string
  state?: string
  runtime?: string
  emulator?: boolean
}

export function parseAppDeviceArguments(argv: string[]): AppDeviceOptions

export function androidApplicationId(
  bundle: { identifier: string; debugSuffix?: string },
  profile: string
): string

export function iosSimulatorRustTarget(architecture?: string): string

export function newestPath(paths: string[]): string

export function selectTarget(
  candidates: DeliveryTarget[],
  requested: string,
  options: {
    kind: string
    prefer?: (candidate: DeliveryTarget) => boolean
  }
): DeliveryTarget

export function iosBuildArguments(input: {
  target: string
  profile: string
  exportMethod: string
}): string[]

export function androidBuildArguments(input: {
  tauriTarget: string
  profile: string
}): string[]

export function signApkLocally(input: {
  apkPath: string
  buildTools: string
  environment: NodeJS.ProcessEnv
}): string

export function runAppDevice(
  argv?: string[],
  environment?: NodeJS.ProcessEnv
): number

export function webWorkspaceRoot(): string

export function run(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): number

export function capture(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): { status: number; stdout: string; stderr: string }

export function log(message: string): void

export function readJsonFile(path: string): unknown

export interface TauriConfiguration {
  base: {
    productName: string
    version: string
    identifier: string
    [key: string]: unknown
  }
  android: {
    bundle?: { android?: { debugApplicationIdSuffix?: string } }
    [key: string]: unknown
  }
}

export function tauriConfiguration(workspaceRoot: string): TauriConfiguration

export function walk(
  directory: string,
  predicate: (entryPath: string, entry: import("node:fs").Dirent) => boolean,
  depth?: number
): string[]

export function ensurePlatformProject(
  workspaceRoot: string,
  platform: "ios" | "android",
  environment: NodeJS.ProcessEnv
): void

export function reportBuildOrigins(
  environment: NodeJS.ProcessEnv
): Record<string, string>

export function deviceArchivePath(buildRoot: string): string
