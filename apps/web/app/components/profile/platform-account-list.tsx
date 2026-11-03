import { CopyIcon, HomeIcon } from "lucide-react"
import { toast } from "sonner"

import { NavigationLink } from "~/components/navigation/navigation-link"
import type { PlatformAccountLink } from "~/lib/api"
import { PLATFORM_ICON_URLS } from "./platform-account-icons"

/** 后端区分五类，公开页只把它们并成「游戏 ID」与「平台账号」两块。 */
const GROUPS = [
  { key: "game", title: "游戏 ID", match: ["game"] },
  {
    key: "platform",
    title: "平台账号",
    match: ["social", "showcase", "game-platform"],
  },
] as const

/** 单色图标用遮罩上色，白色由 background-color 提供。 */
function PlatformMark({ account }: { account: PlatformAccountLink }) {
  const url = account.icon ? PLATFORM_ICON_URLS[account.icon] : undefined
  if (!url) return null
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 bg-white"
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
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

const BADGE =
  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50"

/** 品牌色铺底、白字、白图标；有用户名时用用户名顶替平台名。 */
function AccountBadge({ account }: { account: PlatformAccountLink }) {
  // 只有外链才有用户名，纯 ID 一律显示值本身。
  const label =
    account.url === null ? account.value : (account.username ?? account.name)
  const background = account.color ?? "oklch(0.55 0.02 260)"
  const body = (
    <>
      <PlatformMark account={account} />
      <span className="truncate">{label}</span>
      {account.url === null ? (
        <CopyIcon aria-hidden="true" className="size-3 shrink-0 text-white" />
      ) : null}
    </>
  )
  if (account.url === null) {
    return (
      <button
        type="button"
        className={BADGE}
        style={{ backgroundColor: background }}
        aria-label={`复制${account.name}：${account.value}`}
        title={`${account.name} ・ ${account.value}`}
        onClick={() => {
          void navigator.clipboard.writeText(account.value)
          toast.success(`已复制 ${account.value}`)
        }}
      >
        {body}
      </button>
    )
  }
  return (
    <NavigationLink
      href={account.url}
      target="_blank"
      rel="noreferrer"
      className={BADGE}
      style={{ backgroundColor: background }}
      title={`${account.name} ・ ${account.value}`}
    >
      {body}
    </NavigationLink>
  )
}

export function PlatformAccountList({
  accounts,
}: {
  accounts: readonly PlatformAccountLink[]
}) {
  const homepage = accounts.find((account) => account.group === "link")
  if (accounts.length === 0) return null
  return (
    <div className="space-y-2">
      {homepage ? (
        <NavigationLink
          href={homepage.value}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm text-muted-foreground underline decoration-border decoration-dotted underline-offset-2 hover:decoration-foreground"
        >
          <HomeIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{homepage.value}</span>
        </NavigationLink>
      ) : null}
      {GROUPS.map((group) => {
        const rows = accounts.filter((account) =>
          (group.match as readonly string[]).includes(account.group)
        )
        if (rows.length === 0) return null
        return (
          <div key={group.key} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {group.title}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rows.map((account) => (
                <AccountBadge key={account.kindId} account={account} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
