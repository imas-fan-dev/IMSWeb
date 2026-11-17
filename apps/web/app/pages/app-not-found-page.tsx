import { LinkIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useAppNavigation } from "~/components/app/app-navigation-provider"
import { Button } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"

/**
 * App catch-all. A registered page keeps an unknown or retired address from
 * rendering an empty outlet, and gives the shell a legal root to return to.
 */
export default function AppNotFoundPage() {
  const { t } = useTranslation()
  const { canGoBack, goBack } = useAppNavigation()

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LinkIcon aria-hidden="true" className="size-6" />
      </div>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">页面不存在</h1>
        <p className="text-sm text-muted-foreground">
          这个地址可能已经变更或被移除。返回首页继续浏览。
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canGoBack ? (
          <Button variant="outline" onClick={goBack}>
            {t("navigation.back")}
          </Button>
        ) : null}
        <Button render={<NavigationLink to="/" />}>返回首页</Button>
      </div>
    </main>
  )
}
