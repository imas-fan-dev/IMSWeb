import type { LucideIcon } from "lucide-react"
import { useId, type ReactNode } from "react"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { cn } from "~/lib/utils"

export const adminControlClass =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium"

export const adminTextareaClass = cn(
  adminControlClass,
  "min-h-36 resize-y py-2 font-mono leading-6"
)

export function AdminField({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm leading-none font-medium">
        {label}
      </label>
      {children}
      {description ? (
        <p className="text-xs/5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="relative flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 border-l-2 border-primary pl-4">
        <p className="text-[0.68rem] font-semibold text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl/tight font-semibold text-balance sm:text-[1.75rem]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm/6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

export function AdminStatus({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>
}

export function AdminPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  footer,
  className,
  contentClassName,
  size = "default",
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  size?: "default" | "sm"
}) {
  const titleId = useId()

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      size={size}
      className={className}
    >
      <CardHeader className="border-b">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            <CardTitle>
              <h2 id={titleId}>{title}</h2>
            </CardTitle>
            {description ? (
              <CardDescription className="mt-1 leading-5">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Empty className="min-h-40 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
