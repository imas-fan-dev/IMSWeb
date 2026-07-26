import {
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router"
import { ThemeProvider } from "next-themes"
import { useTranslation } from "react-i18next"

import { ImageLoadingIndicator } from "~/components/shared/image-loading-indicator"
import { ThemeColorSync } from "~/components/shared/theme-toggle"
import { Toaster } from "~/components/ui/sonner"
import { I18nProvider } from "~/i18n/provider"
import { defaultLanguage } from "~/i18n/resources"
import type { Route } from "./+types/root"
import "./app.css"

export function meta() {
  return [
    { title: "IMSWeb | 偶像大师交流站" },
    {
      name: "description",
      content: "面向中文制作人社区的偶像大师资料、活动与共同创作入口。",
    },
  ]
}

export function links() {
  return [{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }]
}

export function Layout({ children }: { children: React.ReactNode }) {
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

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ImageLoadingIndicator />
      <ThemeColorSync />
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation()
  let message: string = t("errors.pageProblem")
  let details: string = t("errors.unexpected")
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404 ? t("errors.notFound") : t("errors.requestFailed")
    details =
      error.status === 404
        ? t("errors.notFoundDetails")
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-primary">IMSWeb</p>
      <h1 className="mt-2 text-3xl font-semibold">{message}</h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">{details}</p>
      <Link
        to="/"
        className="mt-8 w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("errors.backHome")}
      </Link>
      {stack && (
        <pre className="mt-8 w-full overflow-x-auto rounded-md bg-muted p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
