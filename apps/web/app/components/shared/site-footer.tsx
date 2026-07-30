import { ExternalLinkIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

export function SiteFooter() {
  const { t } = useTranslation()

  return (
    <footer className="border-t bg-muted/35">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-medium text-foreground">{t("brand.name")}</p>
          <p className="mt-1">{t("footer.maintainedBy")}</p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-3"
          aria-label={t("footer.navigationLabel")}
        >
          <Link to="/about" className="hover:text-foreground">
            {t("footer.about")}
          </Link>
          <Link to="/admin/login" className="hover:text-foreground">
            {t("footer.admin")}
          </Link>
          <a
            href="/wiki/"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {t("navigation.storySite")}
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </a>
        </nav>
      </div>
    </footer>
  )
}
