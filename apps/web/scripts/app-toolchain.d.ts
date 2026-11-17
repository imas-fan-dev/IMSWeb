export const REQUIRED_NODE_MAJOR: number
export const REQUIRED_NODE_MINOR: number
export const REQUIRED_IOS_RUST_TARGETS: readonly string[]
export const REQUIRED_ANDROID_RUST_TARGETS: readonly string[]
export const MINIMUM_GRADLE_JAVA_MAJOR: number
export const MAXIMUM_GRADLE_JAVA_MAJOR: number

export type PrerequisiteStatus = "ok" | "warn" | "fail"

export interface PrerequisiteCheck {
  name: string
  status: PrerequisiteStatus
  detail: string
  remedy: string
}

export interface PrerequisiteGroup {
  label: string
  checks: PrerequisiteCheck[]
}

export function commandPath(
  command: string,
  environment?: NodeJS.ProcessEnv
): string

export function androidSdkRoot(environment?: NodeJS.ProcessEnv): string

export function androidNdkRoot(
  environment?: NodeJS.ProcessEnv,
  sdkRoot?: string
): string

export function androidToolPath(
  name: string,
  environment?: NodeJS.ProcessEnv
): string

export function latestBuildToolsPath(environment?: NodeJS.ProcessEnv): string

export function javaMajorVersion(environment?: NodeJS.ProcessEnv): number

export function installedRustTargets(environment?: NodeJS.ProcessEnv): string[]

export function xcodeDeveloperDirectory(environment?: NodeJS.ProcessEnv): string

export function collectPrerequisites(input: {
  platform: string
  workspaceRoot: string
  environment?: NodeJS.ProcessEnv
}): PrerequisiteGroup[]

export function prerequisiteFailures(groups: PrerequisiteGroup[]): string[]

export function formatPrerequisiteReport(groups: PrerequisiteGroup[]): string
