/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the Hono API, for builds whose frontend is not served
   * from that origin. Empty for browser builds; required for packaged Tauri
   * builds. See `app/lib/api/origin.ts`.
   */
  readonly VITE_IMS_API_ORIGIN?: string
  /**
   * Build-time target switch. `"app"` produces the Tauri-packaged route
   * manifest with admin routes excluded; unset or any other value produces
   * the web manifest unchanged. See `app/routes.ts`.
   */
  readonly VITE_IMS_APP_TARGET?: string
}
