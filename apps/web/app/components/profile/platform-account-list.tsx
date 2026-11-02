import { HomeIcon } from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Badge } from "~/components/ui/badge"
import type { PlatformAccountLink } from "~/lib/api"
import { PLATFORM_ICON_URLS } from "./platform-account-icons"

const GROUP_LABELS: Record<string, string> = {
  game: "游戏 ID",
  social: "平台账号",
}

/** 单色图标用遮罩上色，品牌色才会真正生效。 */
function PlatformMark({ account }: { account: PlatformAccountLink }) {
  const url = account.icon ? PLATFORM_ICON_URLS[account.icon] : undefined
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold"
        style={{
          backgroundColor: account.color ? `${account.color}22` : "var(--muted)",
          color: account.color ?? "inherit",
        }}
      >
        {account.name.slice(0, 1)}
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0"
      style={{
        backgroundColor: account.color ?? "currentColor",
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  )
}

/** 一条账号：ID 类可复制，链接类点开新页；统一用 Badge 承载。 */
function AccountBadge({ account }: { account: PlatformAccountLink }) {
  const content = (
    <>
      <PlatformMark account={account} />
      <span className="truncate">{account.value}</span>
    </>
  )
  const className = "max-w-full gap-1.5 font-normal"
  if (account.url) {
    return (
      <Badge variant="secondary" className={className} render={
        <NavigationLink href={account.url} />
      }>
        {content}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={className}>
      {content}
    </Badge>
  )
}

/**
 * 平台账号：先游戏 ID，再个人主页（独占一行完整链接），最后其余平台。
 * 名片的复制按钮不在这里：ID 直接显示在 Badge 上，方便手动选取。
 */
export function PlatformAccountList({ accounts }: { accounts: PlatformAccountLink[] }) {
  if (accounts.length === 0) return null
  const homepage = accounts.find((account) => account.kindId === "homepage")
  const rest = accounts.filter((account) => account.kindId !== "homepage")

  return (
    <section className="space-y-3" aria-label="平台账号">
      <h2 className="text-sm font-medium text-muted-foreground">平台账号</h2>

      {(["game", "social"] as const).map((group) => {
        const rows = rest.filter((account) => account.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="space-y-1.5">
            <h3 className="text-xs text-muted-foreground">{GROUP_LABELS[group]}</h3>
            <div className="flex flex-wrap gap-1.5">
              {rows.map((account) => (
                <AccountBadge key={account.kindId} account={account} />
              ))}
            </div>
          </div>
        )
      })}

      {homepage ? (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <HomeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <NavigationLink
            href={homepage.value}
            className="truncate underline decoration-border decoration-dotted underline-offset-2 hover:decoration-foreground"
          >
            {homepage.value}
          </NavigationLink>
        </div>
      ) : null}
    </section>
  )
}
