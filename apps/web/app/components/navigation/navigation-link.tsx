import { forwardRef, type MouseEvent, type ReactNode } from "react"
import { Link, NavLink, type LinkProps, type NavLinkProps } from "react-router"
import { toast } from "sonner"

import { IS_APP_TARGET } from "~/lib/app-target"
import type {
  NavigationAvailability,
  NavigationTarget,
} from "~/lib/navigation/navigation-target"
import { resolveNavigation } from "~/lib/navigation/resolve-navigation"
import {
  openSystemUrl,
  shouldUseSystemOpener,
} from "~/lib/navigation/system-opener"

type NavigationSource =
  | { to: NavigationTarget; href?: never }
  | { href: string; to?: never }

export type NavigationLinkProps = Omit<LinkProps, "to"> &
  NavigationSource & {
    availability?: NavigationAvailability
  }

function reportOpenFailure() {
  toast.error("无法打开链接，请检查系统浏览器设置后重试。")
}

export const NavigationLink = forwardRef<
  HTMLAnchorElement,
  NavigationLinkProps
>(function NavigationLink(
  {
    availability = "all",
    discover,
    download,
    href,
    onClick,
    prefetch,
    preventScrollReset,
    relative,
    reloadDocument,
    replace,
    state,
    to,
    viewTransition,
    ...anchorProps
  },
  ref
) {
  if (availability === "web" && IS_APP_TARGET) return null

  const decision = resolveNavigation(to ?? href ?? "")
  if (decision.kind === "unavailable") return null

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      decision.kind !== "system" ||
      !shouldUseSystemOpener()
    ) {
      return
    }

    event.preventDefault()
    void openSystemUrl(decision.href).catch(reportOpenFailure)
  }

  if (decision.kind === "router") {
    return (
      <Link
        {...anchorProps}
        ref={ref}
        to={decision.to}
        discover={discover}
        download={download}
        onClick={onClick}
        prefetch={prefetch}
        preventScrollReset={preventScrollReset}
        relative={relative}
        reloadDocument={reloadDocument}
        replace={replace}
        state={state}
        viewTransition={viewTransition}
      />
    )
  }

  return (
    <a
      {...anchorProps}
      ref={ref}
      href={decision.href}
      download={download}
      onClick={handleClick}
    />
  )
})

export type NavigationNavLinkProps = NavLinkProps & {
  availability?: NavigationAvailability
}

export const NavigationNavLink = forwardRef<
  HTMLAnchorElement,
  NavigationNavLinkProps
>(function NavigationNavLink({ availability = "all", ...props }, ref) {
  if (availability === "web" && IS_APP_TARGET) return null
  return <NavLink {...props} ref={ref} />
})

export function NavigationBoundary({
  availability = "all",
  children,
}: {
  availability?: NavigationAvailability
  children: ReactNode
}) {
  return availability === "web" && IS_APP_TARGET ? null : children
}
