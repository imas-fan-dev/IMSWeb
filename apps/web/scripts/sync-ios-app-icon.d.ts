export interface IosAppIconSyncResult {
  readonly skipped: boolean
  readonly copied: boolean
  readonly patched: boolean
}

export function deterministicObjectId(seed: string): string
export function wireAppIconIntoProject(projectText: string): string
export function patchProjectFile(projectPath: string): boolean
export function syncIosAppIcon(options?: {
  webRoot?: string
}): IosAppIconSyncResult
