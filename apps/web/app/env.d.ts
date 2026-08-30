/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the Hono API, for builds whose frontend is not served
   * from that origin. Empty for browser builds; required for packaged Tauri
   * builds. See `app/lib/api/origin.ts`.
   */
  readonly VITE_IMS_API_ORIGIN?: string
  /**
   * Absolute public address of the website, for links a person opens in a
   * browser later. Empty for browser builds, which resolve against the
   * document; packaged Tauri builds should set it, because neither the API
   * origin nor the local WebView scheme names the host that serves pages.
   * See `app/lib/api/origin.ts`.
   */
  readonly VITE_IMS_PUBLIC_SITE_ORIGIN?: string
  /**
   * Optional HTTP(S) host for MapLibre styles, tiles, fonts, and sprites.
   * It leaves API requests and outward-facing website links unchanged.
   */
  readonly VITE_IMS_MAP_TRANSPORT_ORIGIN?: string
  /**
   * Build-time target switch. `"app"` produces the Tauri-packaged route
   * manifest with admin routes excluded; unset or any other value produces
   * the web manifest unchanged. See `app/routes.ts`.
   */
  readonly VITE_IMS_APP_TARGET?: string
}
