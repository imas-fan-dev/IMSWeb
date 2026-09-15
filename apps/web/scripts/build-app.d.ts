export const DEFAULT_APP_ORIGIN: string

export function normalizeAppBuildOrigin(
  name: string,
  value: string | undefined,
  allowInsecureLan?: boolean
): string

export function appBuildEnvironment(environment?: NodeJS.ProcessEnv): Omit<
  NodeJS.ProcessEnv,
  "VITE_IMS_LOCAL_MEDIA_PATH_PREFIX" | "IMS_LOCAL_MEDIA_PROXY_ORIGIN"
> & {
  VITE_IMS_APP_TARGET: "app"
  VITE_IMS_API_ORIGIN: string
  VITE_IMS_PUBLIC_SITE_ORIGIN: string
  VITE_IMS_MAP_TRANSPORT_ORIGIN: string
}

export function runAppBuild(environment?: NodeJS.ProcessEnv): number
