import { isRouteErrorResponse } from "react-router"
import { useTranslation } from "react-i18next"

import { RootAppLayout, RootDocumentLayout } from "~/layouts/root-layout"
import type { Route } from "./+types/root"
import "./app.css"
import { NavigationLink } from "~/components/navigation/navigation-link"

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

export { RootDocumentLayout as Layout }

export default RootAppLayout

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
      <NavigationLink
        to="/"
        className="mt-8 w-fit rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("errors.backHome")}
      </NavigationLink>
      {stack && (
        <pre className="mt-8 w-full overflow-x-auto rounded-md bg-muted p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
