/**
 * Build-time target switch, shared by the route manifest and the document shell.
 *
 * `VITE_IMS_APP_TARGET=app` selects the Tauri-packaged build. The value is
 * inlined by Vite, so the web build keeps its existing output rather than
 * carrying a runtime branch. See `env.d.ts` and `.env.example`.
 */
export const IS_APP_TARGET = import.meta.env.VITE_IMS_APP_TARGET === "app"

/**
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` report real
 * values instead of zero inside the iOS WKWebView, so the app shell's title bar
 * and tab bar can clear the notch and the home indicator. The web build keeps
 * the plain viewport: its layouts do not budget for the insets, so opting the
 * site into the display cutout would slide the site header under the status bar
 * on notched phones.
 */
export const VIEWPORT_CONTENT = IS_APP_TARGET
  ? "width=device-width, initial-scale=1, viewport-fit=cover"
  : "width=device-width, initial-scale=1"
