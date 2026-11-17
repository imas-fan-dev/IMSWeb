export interface AndroidAppBuildOrigins {
  VITE_IMS_API_ORIGIN: string
  VITE_IMS_PUBLIC_SITE_ORIGIN: string
  VITE_IMS_MAP_TRANSPORT_ORIGIN: string
}

export function androidReleaseAllowsCleartext(
  environment: NodeJS.ProcessEnv,
  buildEnvironment: AndroidAppBuildOrigins
): boolean

export function configureGeneratedAndroidCleartext(input: {
  environment: NodeJS.ProcessEnv
  buildEnvironment: AndroidAppBuildOrigins
  gradlePath: string
}): boolean
