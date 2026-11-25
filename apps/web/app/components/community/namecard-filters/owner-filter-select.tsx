import { SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"

import type { NamecardCollectionOwners } from "@imsweb/contracts/namecards"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Input } from "~/components/ui/input"
import { getNamecardCollectionOwners } from "~/lib/api"
import { useDebouncedValue } from "~/lib/use-debounced-value"

import { ClearInputButton } from "./clear-input-button"

/** 所属用户筛选项：`accountId` 进查询，其余字段只用于展示。 */
export type NamecardOwnerSelection = NamecardCollectionOwners["list"][number]

const SEARCH_DELAY = 300
const OWNER_LIMIT = 8

function OwnerAvatar({ owner }: { owner: NamecardOwnerSelection }) {
  return (
    <Avatar size="sm" aria-hidden="true">
      {owner.avatarUrl ? <AvatarImage src={owner.avatarUrl} alt="" /> : null}
      <AvatarFallback>{owner.displayName.slice(0, 1)}</AvatarFallback>
    </Avatar>
  )
}

/**
 * 名片册「所属用户」筛选：按昵称检索自己册内的卡主，选中后原地换成可清空的 chip。
 *
 * 与后台名片筛选的归属账号控件同一交互：输入即检索、下拉候选带头像与昵称、
 * 选中后固定在输入框里。候选范围由接口钉死（自己 + 册内出现过的卡主）。
 */
export function OwnerFilterSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string
  value: NamecardOwnerSelection | null
  disabled: boolean
  onChange: (owner: NamecardOwnerSelection | null) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<NamecardOwnerSelection[]>([])
  const debouncedQuery = useDebouncedValue(query, SEARCH_DELAY)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (!trimmed) return
    let active = true
    getNamecardCollectionOwners({ q: trimmed, limit: OWNER_LIMIT })
      .send()
      .then((payload) => {
        if (active) setResults(payload.list)
      })
      .catch(() => {
        if (active) setResults([])
      })
    return () => {
      active = false
    }
  }, [debouncedQuery])

  // 输入一旦清空就收起上一轮结果，不在 effect 里回写状态。
  const visibleResults = query.trim() ? results : []

  if (value) {
    return (
      <div className="relative">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/40 pr-8 pl-2">
          <OwnerAvatar owner={value} />
          <span className="min-w-0 truncate text-sm">{value.displayName}</span>
        </div>
        <ClearInputButton label="清空所属用户" onClick={() => onChange(null)} />
      </div>
    )
  }

  return (
    <div className="relative">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="text"
        className="pr-8 pl-9"
        value={query}
        placeholder="搜索用户昵称"
        disabled={disabled}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {query ? (
        <ClearInputButton
          label="清空所属用户搜索"
          onClick={() => {
            setQuery("")
            setResults([])
          }}
        />
      ) : null}
      {visibleResults.length ? (
        <ul
          role="listbox"
          aria-label="所属用户检索结果"
          className="absolute top-full left-0 z-20 mt-1 flex w-full flex-col divide-y overflow-hidden rounded-md border bg-popover text-sm shadow-md"
        >
          {visibleResults.map((owner) => (
            <li key={owner.accountId} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  onChange(owner)
                  setQuery("")
                  setResults([])
                }}
              >
                <OwnerAvatar owner={owner} />
                <span className="min-w-0 flex-1 truncate">
                  {owner.displayName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
