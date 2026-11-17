import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"

import { GlassFilterDefs } from "~/components/shared/glass-filter-defs"
import { ImageLoadingIndicator } from "~/components/shared/image-loading-indicator"
import { SeriesBrowserIcon } from "~/components/shared/series-browser-icon"
import { TauriInteractionGuard } from "~/components/shared/tauri-interaction-guard"
import { ThemeColorSync } from "~/components/shared/theme-toggle"
import { Toaster } from "~/components/ui/sonner"
import { I18nProvider } from "~/i18n/provider"
import { IS_APP_TARGET, VIEWPORT_CONTENT } from "~/lib/app-target"
import { defaultLanguage } from "~/i18n/resources"

export function RootDocumentLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={defaultLanguage}
      // Enables the Chromium-only refraction ceiling. Safe to leave on for every
      // engine because the filter is attached to a decorative overlay: a hostile
      // engine costs a rim highlight, not the surface. Verified on chromium,
      // firefox and webkit; see the ADR for the measurement.
      data-glass-refraction="on"
      data-app-target={IS_APP_TARGET ? "app" : undefined}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content={VIEWPORT_CONTENT} />
        <meta name="theme-color" content="#171717" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-svh antialiased">
        <I18nProvider>{children}</I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export function RootAppLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <GlassFilterDefs />
      <ImageLoadingIndicator />
      <SeriesBrowserIcon />
      <ThemeColorSync />
      <TauriInteractionGuard />
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  )
}
