import type { ReactNode } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Skeleton } from "~/components/ui/skeleton"
import { BrandWordmark } from "~/components/shared/brand-wordmark"
import { PageShell } from "~/components/shared/page-shell"
import { Button, buttonVariants } from "~/components/ui/button"
import { accountAuthPath } from "~/pages/account/account-auth-return"
import { NAMECARD_MANAGE_HREF } from "~/lib/namecards/share-links"

import { SHARE_EXCHANGE_SOON, type ShareStatus } from "./share-status"

/**
 * 分享页顶部站点标识：独立页面没有站点头栏，这里补一个能回主页的 LOGO（2026-11-18 用户要求）。
 * 图片是装饰性的，可访问名交给链接自己。
 */
function SharePageBrand() {
  return (
    <NavigationLink
      to="/"
      aria-label="回到 IMSWeb 首页"
      className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <BrandWordmark className="h-10 sm:h-12" alt="" />
    </NavigationLink>
  )
}

/**
 * 分享页的公共外壳（2026-11-18 用户调整）：上下一栏、水平居中、在视口里垂直居中；
 * 用 `min-h-dvh` 而不是定高，内容比视口高时整页正常滚动、不会把顶部裁掉。
 */
export function SharePageShell({
  displayName,
  profileHref,
  description,
  preview,
  status,
  currentPath,
}: {
  /** 分享人（名片持有者）的名字 */
  displayName: string
  /** 分享人的公开主页（`/user/<pageSlug||uid>`） */
  profileHref: string
  /** 一句话说明这份分享，如「向你分享了 1 张名片」 */
  description: string
  preview: ReactNode
  status: ShareStatus
  /** 本页路径：登录链接把它当 `returnTo`，登录后回到这里。 */
  currentPath: string
}) {
  return (
    <PageShell
      width="read"
      className="flex min-h-dvh flex-col justify-center py-10 sm:py-14"
    >
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 sm:max-w-md">
        <SharePageBrand />
        <div className="w-full min-w-0">{preview}</div>
        <aside className="w-full space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-lg font-semibold">
              <NavigationLink to={profileHref} className="hover:underline">
                {displayName}
              </NavigationLink>
            </h1>
            <p className="text-sm/5 text-muted-foreground">{description}</p>
          </div>
          <div className="space-y-2">
            {/*
              【交换】本期不开放：按钮永远渲染、永远 disabled，写接口（/commit、/request）前端不调用。
            */}
            <Button type="button" size="lg" className="w-full" disabled>
              {SHARE_EXCHANGE_SOON}
            </Button>
            {/*
              状态行里普通文字与链接共用同一套字号 / 行高 / 基线（`items-baseline` + `text-sm/5`）：
              链接不再是 `buttonVariants` 的按钮外观，避免两者高度与基线对不齐。
            */}
            <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-sm/5">
              <span className="text-muted-foreground">{status.message}</span>
              {status.action ? (
                <NavigationLink
                  to={
                    status.action.kind === "login"
                      ? accountAuthPath("login", currentPath)
                      : NAMECARD_MANAGE_HREF
                  }
                  className="font-medium text-primary underline decoration-from-font underline-offset-4 hover:no-underline"
                >
                  {status.action.label}
                </NavigationLink>
              ) : null}
            </p>
          </div>
        </aside>
      </section>
    </PageShell>
  )
}

/** 整页错误态：单卡「这张名片当前不开放交换」/ 快速清单「找不到这位制作人」。 */
export function SharePageError({ message }: { message: string }) {
  return (
    <PageShell
      width="read"
      className="flex min-h-dvh flex-col justify-center py-10"
    >
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5">
        <SharePageBrand />
        <div className="flex w-full flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
          <h1 className="text-xl font-semibold">{message}</h1>
          <NavigationLink
            to="/community/cards"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            去名片墙看看
          </NavigationLink>
        </div>
      </section>
    </PageShell>
  )
}

/** 取数期间的外壳骨架：布局与真页面一致（LOGO + 1:1 预览 + 信息块），避免数据回来时跳一下。 */
export function SharePageSkeleton() {
  return (
    <PageShell
      width="read"
      className="flex min-h-dvh flex-col justify-center py-10 sm:py-14"
    >
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 sm:max-w-md">
        <Skeleton className="h-10 w-36 sm:h-12 sm:w-44" />
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="flex w-full flex-col items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
    </PageShell>
  )
}
