import type { ReactNode } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Skeleton } from "~/components/ui/skeleton"
import { PageShell } from "~/components/shared/page-shell"
import { Button, buttonVariants } from "~/components/ui/button"
import { accountAuthPath } from "~/pages/account/account-auth-return"
import { NAMECARD_MANAGE_HREF } from "~/lib/namecards/share-links"

import { SHARE_EXCHANGE_SOON, type ShareStatus } from "./share-status"

/** 分享页的公共外壳：桌面左右两栏（左预览、右信息），窄屏上下堆叠。 */
export function SharePageShell({
  displayName,
  profileHref,
  description,
  preview,
  status,
  currentPath,
}: {
  /** 分享人（名片持有者）的名字。 */
  displayName: string
  /** 分享人的公开主页（`/user/<pageSlug||uid>`）。 */
  profileHref: string
  /** 一句话说明这份分享，如「分享了这张名片」。 */
  description: string
  preview: ReactNode
  status: ShareStatus
  /** 本页路径：登录链接把它当 `returnTo`，登录后回到这里。 */
  currentPath: string
}) {
  return (
    <PageShell width="read" className="py-8 sm:py-10">
      <section className="mx-auto flex w-full max-w-sm flex-col gap-5">
        <div className="min-w-0">{preview}</div>
        <aside className="space-y-4">
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
              状态行里普通文字与链接共用同一套字号 / 行高 / 基线（`items-baseline` + `text-sm leading-5`）：
              连接不再是 `buttonVariants` 的按钮外观，避免两者高度与基线对不齐。
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
    <PageShell width="wide" className="py-10">
      <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">{message}</h1>
        <NavigationLink
          to="/community/cards"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          去名片墙看看
        </NavigationLink>
      </section>
    </PageShell>
  )
}

/** 取数期间的外壳骨架：布局与真页面一致，避免数据回来时跳一下。 */
export function SharePageSkeleton() {
  return (
    <PageShell width="wide" className="py-6 sm:py-8">
      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
    </PageShell>
  )
}
