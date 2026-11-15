import { SearchIcon, UserRoundIcon, XIcon } from "lucide-react"
import { useId } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { usePlatformUserSearch } from "~/pages/admin/cards/use-platform-user-search"

/** 归属账号筛选项：`id` 进查询，`displayName` 只用于展示。 */
export interface UserSearchSelection {
  id: string
  displayName: string
}

/**
 * 归属账号检索控件：未选中时按昵称检索平台账号，选中后原地换成可取消的 chip。
 *
 * 固定 `w-56`：检索输入与选中后的 chip 占同一个盒子，切换状态不会改变筛选区宽度。
 * `showAccountId` 控制结果行是否露出账号 UUID；筛选条按产品约定不露，编辑场景才露。
 */
export function UserSearchCombobox({
  value,
  onChange,
  showAccountId,
  disabled = false,
}: {
  value: UserSearchSelection | null
  onChange: (value: UserSearchSelection | null) => void
  showAccountId: boolean
  disabled?: boolean
}) {
  const { query, setQuery, visibleResults, reset } = usePlatformUserSearch()
  const labelId = useId()

  return (
    <div className="flex w-56 flex-col gap-1.5 text-xs text-muted-foreground">
      <span id={labelId}>所属用户</span>
      {value ? (
        <div className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            <UserRoundIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">{value.displayName}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="取消所属用户筛选"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              reset()
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="w-full pl-8"
            aria-labelledby={labelId}
            value={query}
            placeholder="按昵称检索用户"
            disabled={disabled}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {visibleResults.length ? (
            <ul
              role="listbox"
              aria-label="用户检索结果"
              className="absolute top-full left-0 z-20 mt-1 flex w-full flex-col divide-y overflow-hidden rounded-md border bg-popover text-sm shadow-md"
            >
              {visibleResults.map((account) => (
                <li key={account.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      onChange({
                        id: account.id,
                        displayName: account.displayName,
                      })
                      reset()
                    }}
                  >
                    <span className="min-w-0">
                      <span className="truncate">{account.displayName}</span>
                      {showAccountId ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {account.id}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {account.status === "active" ? "正常" : "停用"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
