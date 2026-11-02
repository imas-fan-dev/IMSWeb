import { CopyIcon, HomeIcon } from "lucide-react"
import { toast } from "sonner"

import { NavigationLink } from "~/components/navigation/navigation-link"
import type { PlatformAccountLink } from "~/lib/api"
import { PLATFORM_ICON_URLS } from "./platform-account-icons"

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

const BADGE =
  "inline-flex items-center gap-1.5 rounded-full border bg-transparent px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/50"

function borderStyle(account: PlatformAccountLink) {
  return account.color ? { borderColor: account.color } : undefined
}

async function copyValue(account: PlatformAccountLink) {
  try {
    await navigator.clipboard.writeText(account.value)
    toast.success(`已复制 ${account.name}`)
  } catch {
    toast.error("复制失败，请手动选择复制")
  }
}

/**
 * 平台账号：个人主页单独一行完整链接，其余是纯描边的品牌色 badge。
 * 纯 ID 的直接显示 ID 并可点击复制；有链接的整块跳转、只显示平台名。
 */
export function PlatformAccountList({
  accounts,
}: {
  accounts: readonly PlatformAccountLink[]
}) {
  if (accounts.length === 0) return null
  const homepage = accounts.find((account) => account.group === "link")
  const marks = accounts.filter((account) => account.group !== "link")
  return (
    <div className="space-y-2">
      {homepage ? (
        <NavigationLink
          href={homepage.value}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <HomeIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{homepage.value}</span>
        </NavigationLink>
      ) : null}
      {marks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {marks.map((account) =>
            account.url ? (
              <NavigationLink
                key={account.kindId}
                href={account.url}
                className={BADGE}
                style={borderStyle(account)}
                title={`${account.name} · ${account.value}`}
              >
                <PlatformMark account={account} />
                {account.name}
              </NavigationLink>
            ) : (
              <button
                key={account.kindId}
                type="button"
                className={BADGE}
                style={borderStyle(account)}
                title={`${account.name} · ${account.value}`}
                aria-label={`复制 ${account.name} ${account.value}`}
                onClick={() => void copyValue(account)}
              >
                <PlatformMark account={account} />
                <span className="font-mono">{account.value}</span>
                <CopyIcon className="size-3 opacity-60" aria-hidden="true" />
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  )
}
