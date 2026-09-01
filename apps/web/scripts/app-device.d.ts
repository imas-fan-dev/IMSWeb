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
