import { ExternalLinkIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { supportLinks } from "../home-content"

export function SiteSupport() {
  return (
    <section className="border-t" aria-labelledby="support-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">SITE SUPPORT</p>
          <h2 id="support-heading" className="mt-2 text-2xl font-semibold">
            网站支持
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {supportLinks.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-24 items-center gap-4 rounded-md border bg-card px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={cn("h-9 w-1 shrink-0 rounded-full", link.accent)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{link.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <ExternalLinkIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
