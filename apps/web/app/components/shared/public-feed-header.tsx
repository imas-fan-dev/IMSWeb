import type { ReactNode } from "react"

type PublicFeedHeaderProps = {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}

export function PublicFeedHeader({
  eyebrow,
  title,
  description,
  actions,
}: PublicFeedHeaderProps) {
  return (
    <header className="border-b bg-muted/25" data-slot="public-feed-header">
      <div
        className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-6 px-4 py-10 sm:flex-row sm:items-end sm:px-6 sm:py-14 lg:px-8"
        data-slot="public-feed-header-content"
      >
        <div className="max-w-2xl min-w-0">
          <p className="text-xs font-semibold text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold wrap-anywhere">{title}</h1>
          <p className="mt-3 leading-7 wrap-anywhere text-muted-foreground">
            {description}
          </p>
        </div>
        {actions}
      </div>
    </header>
  )
}
