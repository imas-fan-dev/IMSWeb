import { Outlet } from "react-router"
import { useTranslation } from "react-i18next"

import { AdminReturnShortcut } from "~/components/shared/admin-return-shortcut"
import { SiteFooter } from "~/components/shared/site-footer"
import { SiteHeader } from "~/components/shared/site-header"

export default function PublicLayout() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-100 -translate-y-16 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-sm focus:translate-y-0"
      >
        {t("accessibility.skipToContent")}
      </a>
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
      <AdminReturnShortcut />
    </div>
  )
}
