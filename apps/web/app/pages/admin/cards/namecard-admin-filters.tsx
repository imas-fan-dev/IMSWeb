import { CheckboxFilterGroup, SearchField } from "~/components/admin/filter-bar"
import {
  UserSearchCombobox,
  type UserSearchSelection,
} from "~/components/admin/user-search-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { NAMECARD_STATUS_FILTERS } from "./namecard-status-options"

/** 归属账号筛选项：`id` 进查询，`displayName` 只用于展示。 */
export type NamecardOwnerSelection = UserSearchSelection

const ORIGIN_OPTIONS = [
  { value: "legacy", label: "游客投稿" },
  { value: "exchange", label: "注册用户投稿" },
] as const

interface NamecardAdminFiltersProps {
  /** 制作人名称输入框的原始值；防抖与写入 URL 由页面负责。 */
  query: string
  onQueryChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
  origins: string[]
  onOriginToggle: (origin: string, checked: boolean) => void
  owner: NamecardOwnerSelection | null
  onOwnerChange: (owner: NamecardOwnerSelection | null) => void
}

/**
 * 名片审核与名片管理的共用筛选条：制作人名称、所属用户、审核状态、投稿来源。
 *
 * 两个页面各自持有 URL 状态，这里只负责把控件摆成同一条筛选条；控件内部的交互
 * （账号检索、勾选语义）封在各自的组件与 hook 里，因此同一份实现能同时服务两处，
 * 也不会把筛选语义复制第二遍。
 */
export function NamecardAdminFilters({
  query,
  onQueryChange,
  status,
  onStatusChange,
  origins,
  onOriginToggle,
  owner,
  onOwnerChange,
}: NamecardAdminFiltersProps) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3">
      <SearchField
        label="制作人名称"
        placeholder="搜索制作人名称"
        value={query}
        onChange={onQueryChange}
        className="w-56"
      />
      {/* 筛选条不露账号 UUID：用户只按昵称辨认账号。 */}
      <UserSearchCombobox
        value={owner}
        onChange={onOwnerChange}
        showAccountId={false}
      />
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        审核状态
        <Select
          value={status || "all"}
          items={NAMECARD_STATUS_FILTERS}
          onValueChange={(value) =>
            onStatusChange(value === "all" ? "" : String(value))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAMECARD_STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <CheckboxFilterGroup
        label="投稿来源"
        items={ORIGIN_OPTIONS}
        values={origins}
        onToggle={onOriginToggle}
      />
    </div>
  )
}
