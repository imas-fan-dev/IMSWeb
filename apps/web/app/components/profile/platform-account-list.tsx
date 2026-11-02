import { NavigationLink } from "~/components/navigation/navigation-link"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import type { PlatformAccountLink } from "~/lib/api"
import { PLATFORM_ICON_URLS } from "./platform-account-icons"

const GROUP_LABELS: Record<string, string> = {
  game: "游戏",
  social: "平台",
}

function PlatformIcon({ account }: { account: PlatformAccountLink }) {
  const url = account.icon ? PLATFORM_ICON_URLS[account.icon] : undefined
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="size-4 shrink-0"
        style={{ color: account.color ?? undefined }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold"
      style={{
        backgroundColor: account.color ? `${account.color}22` : "var(--muted)",
        color: account.color ?? "inherit",
      }}
    >
      {account.name.slice(0, 1)}
    </span>
  )
}

function CopyValue({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`复制 ${value}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success("已复制"))
          .catch(() => toast.error("复制失败"))
      }}
    >
      <CopyIcon className="size-3.5" aria-hidden="true" />
    </button>
  )
}

/**
 * 平台账号：只列「图标 + 值」，ID 类带复制按钮，链接类整行可点。
 * 个人主页不参与分组，单独占一行显示完整链接。
 */
export function PlatformAccountList({
  accounts,
}: {
  accounts: readonly PlatformAccountLink[]
}) {
  const homepage = accounts.find((account) => account.group === "link")
  const groups = ["game", "social"] as const

  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-label="平台账号"
    >
      <h2 className="text-sm font-medium">平台账号</h2>
      {homepage ? (
        <NavigationLink
          href={homepage.url ?? homepage.value}
          className="block truncate text-sm text-primary underline-offset-4 hover:underline"
        >
          {homepage.value}
        </NavigationLink>
      ) : null}
      {groups.map((group) => {
        const rows = accounts.filter((account) => account.group === group)
        if (!rows.length) return null
        return (
          <div key={group} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{GROUP_LABELS[group]}</p>
            <ul className="flex flex-wrap gap-2">
              {rows.map((account) => (
                <li
                  key={account.kindId}
                  className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                >
                  <PlatformIcon account={account} />
                  {account.url ? (
                    <NavigationLink
                      href={account.url}
                      title={account.name}
                      className="max-w-40 truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {account.value}
                    </NavigationLink>
                  ) : (
                    <>
                      <span
                        title={account.name}
                        className="max-w-40 truncate font-mono text-xs"
                      >
                        {account.value}
                      </span>
                      <CopyValue value={account.value} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
