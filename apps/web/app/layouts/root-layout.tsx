import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"

import { ImageLoadingIndicator } from "~/components/shared/image-loading-indicator"
import { SeriesBrowserIcon } from "~/components/shared/series-browser-icon"
import { ThemeColorSync } from "~/components/shared/theme-toggle"
import { Toaster } from "~/components/ui/sonner"
import { I18nProvider } from "~/i18n/provider"
import { defaultLanguage } from "~/i18n/resources"

export function RootDocumentLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLanguage} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      <ImageLoadingIndicator />
      <SeriesBrowserIcon />
      <ThemeColorSync />
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  )
}
