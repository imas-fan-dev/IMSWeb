export const APP_DEV_PORT: number

export function appDevOrigin(environment?: NodeJS.ProcessEnv): string

export function appDevEnvironment(
  environment?: NodeJS.ProcessEnv
): NodeJS.ProcessEnv & {
  VITE_IMS_APP_TARGET: "app"
  VITE_IMS_API_ORIGIN: string
  VITE_IMS_PUBLIC_SITE_ORIGIN: string
}

export function runAppDev(environment?: NodeJS.ProcessEnv): number
