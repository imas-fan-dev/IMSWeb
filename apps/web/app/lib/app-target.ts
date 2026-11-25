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

/**
 * Top offset for page-owned sticky controls below the App title bar.
 *
 * AppLayout defines the inset from its current chrome mode. Web pages keep
 * their existing site-header offset instead.
 */
export const APP_STICKY_HEADER_OFFSET = "top-[var(--app-header-inset)]"

/**
 * Where a floating control has to sit in the app build to clear the tab bar.
 *
 * The capsule is 58px tall and sits at least 24px above the screen edge.
 * On Android it can sit higher to clear the system navigation bar. The app
 * shell adds the safe-area inset to both content and floating-control clearance.
 *
 * This lives here rather than beside the capsule because the wiki controls that
 * need it are shared with the web build: they already import `IS_APP_TARGET`
 * from this module to gate the offset, and importing the app shell's tab bar
 * would pull it into the web module graph. Gate every use on `IS_APP_TARGET` so
 * the web bundle keeps the constant `false` and drops the branch.
 */
export const APP_FLOATING_CONTROL_OFFSET = "bottom-[var(--app-floating-bottom)]"
