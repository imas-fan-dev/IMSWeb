import { LoaderCircleIcon, SaveIcon, SearchIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import {
  NAMECARD_CHARACTER_CATEGORIES,
  type NamecardCharacter,
  type NamecardCharacterAgency,
  type NamecardCharacterCategory,
} from "~/lib/api"
import { NAMECARD_CHARACTER_CATEGORY_LABELS } from "~/lib/namecard-character-categories"
import { useDebouncedValue } from "~/lib/use-debounced-value"
import {
  isUnitDraftValid,
  type UnitDraft,
  type UnitMemberOption,
} from "./namecard-unit-model"

/** Sentinel for the member filters' 「全部」 option; never collides with an id or category. */
const ALL_VALUE = "all"

/** The three inputs that drive one member candidate request. */
type MemberSearch = {
  query: string
  agencyId: number | null
  category: NamecardCharacterCategory | null
}

interface UnitEditorProps {
  editing: boolean
  agencies: NamecardCharacterAgency[]
  draft: UnitDraft
  saving: boolean
  /** `null` while the member candidates are still being loaded. */
  memberCandidates: NamecardCharacter[] | null
  /**
   * Every member seen so far, keyed by id, so a checked member keeps its label
   * after a later search narrows `memberCandidates`.
   */
  memberIndex: Map<number, UnitMemberOption>
  onChange: (draft: UnitDraft) => void
  onMemberSearch: (
    query: string,
    agencyId: number | null,
    category: NamecardCharacterCategory | null
  ) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function UnitEditorDialog({
  open,
  onOpenChange,
  ...editor
}: UnitEditorProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-2xl">
        {open ? <UnitEditorForm {...editor} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so every opening starts from a clean
 * member search without syncing state from props inside an effect. */
function UnitEditorForm({
  editing,
  agencies,
  draft,
  saving,
  memberCandidates,
  memberIndex,
  onChange,
  onMemberSearch,
  onCancel,
  onSubmit,
}: UnitEditorProps) {
  const [memberQuery, setMemberQuery] = useState("")
  const [memberAgency, setMemberAgency] = useState(ALL_VALUE)
  const [memberCategory, setMemberCategory] = useState(ALL_VALUE)

  const memberLoading = memberCandidates === null

  // The page loads the unfiltered list when the dialog opens, so the first
  // debounced value only records where the search starts from.
  const searched = useRef<MemberSearch>({
    query: memberQuery.trim(),
    agencyId: null,
    category: null,
  })
  const debouncedMemberQuery = useDebouncedValue(memberQuery)
  const memberAgencyId =
    memberAgency === ALL_VALUE ? null : Number(memberAgency)
  const memberCategoryValue =
    memberCategory === ALL_VALUE
      ? null
      : (memberCategory as NamecardCharacterCategory)
  // The trigger reads its label from `items`, so both selects need the same
  // option list the menu renders.
  const memberAgencyItems = [
    { value: ALL_VALUE, label: "全部企划" },
    ...agencies.map((agency) => ({
      value: String(agency.id),
      label: agency.name,
    })),
  ]
  const memberCategoryItems = [
    { value: ALL_VALUE, label: "全部分类" },
    ...NAMECARD_CHARACTER_CATEGORIES.map((value) => ({
      value,
      label: NAMECARD_CHARACTER_CATEGORY_LABELS[value],
    })),
  ]
  useEffect(() => {
    const next: MemberSearch = {
      query: debouncedMemberQuery.trim(),
      agencyId: memberAgencyId,
      category: memberCategoryValue,
    }
    const previous = searched.current
    if (
      next.query === previous.query &&
      next.agencyId === previous.agencyId &&
      next.category === previous.category
    ) {
      return
    }
    searched.current = next
    onMemberSearch(next.query, next.agencyId, next.category)
  }, [
    debouncedMemberQuery,
    memberAgencyId,
    memberCategoryValue,
    onMemberSearch,
  ])

  function toggleAgency(agencyId: number, checked: boolean) {
    onChange({
      ...draft,
      agencyIds: checked
        ? [...draft.agencyIds, agencyId]
        : draft.agencyIds.filter((id) => id !== agencyId),
    })
  }

  function toggleMember(memberId: number, checked: boolean) {
    onChange({
      ...draft,
      memberIds: checked
        ? [...draft.memberIds, memberId]
        : draft.memberIds.filter((id) => id !== memberId),
    })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? "编辑组合" : "新增组合"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "保存后名片的组合候选立即使用新内容。"
            : "新增组合会进入所选企划的名片组合候选。"}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FieldGroup className="py-5">
          <Field>
            <FieldLabel htmlFor="namecard-unit-name-cn">中文名</FieldLabel>
            <Input
              id="namecard-unit-name-cn"
              value={draft.nameCn}
              disabled={saving}
              maxLength={120}
              required
              onChange={(event) =>
                onChange({ ...draft, nameCn: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-unit-name-ja">日文名</FieldLabel>
            <Input
              id="namecard-unit-name-ja"
              value={draft.nameJa}
              disabled={saving}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...draft, nameJa: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-unit-name-en">英文名</FieldLabel>
            <Input
              id="namecard-unit-name-en"
              value={draft.nameEn}
              disabled={saving}
              maxLength={160}
              onChange={(event) =>
                onChange({ ...draft, nameEn: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-unit-aliases">别名</FieldLabel>
            <Textarea
              id="namecard-unit-aliases"
              value={draft.aliases}
              disabled={saving}
              maxLength={4000}
              onChange={(event) =>
                onChange({ ...draft, aliases: event.target.value })
              }
            />
            <FieldDescription>
              可换行或用逗号分隔，用于搜索匹配。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="namecard-unit-display-order">
              排序值
            </FieldLabel>
            <Input
              id="namecard-unit-display-order"
              type="number"
              min={0}
              value={draft.displayOrder}
              disabled={saving}
              onChange={(event) =>
                onChange({ ...draft, displayOrder: event.target.value })
              }
            />
          </Field>
          <Field data-disabled={saving || undefined}>
            <FieldLabel id="namecard-unit-agencies-label">所属企划</FieldLabel>
            <FieldDescription>至少选择一个企划。</FieldDescription>
            <div
              className="mt-2 max-h-44 overflow-y-auto overscroll-contain rounded-lg border bg-background p-2"
              role="group"
              aria-labelledby="namecard-unit-agencies-label"
            >
              {agencies.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  暂无可选企划。
                </p>
              ) : (
                agencies.map((agency) => {
                  const checked = draft.agencyIds.includes(agency.id)
                  return (
                    <label
                      key={agency.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={saving}
                        onCheckedChange={(value) =>
                          toggleAgency(agency.id, value === true)
                        }
                      />
                      <span
                        className="size-3 shrink-0 rounded-sm border"
                        style={{ backgroundColor: agency.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {agency.name}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </Field>
          <Field data-disabled={saving || undefined}>
            <FieldLabel id="namecard-unit-members-label">成员</FieldLabel>
            <FieldDescription>至少选择一名成员。</FieldDescription>
            <div
              className="mt-2 overflow-hidden rounded-lg border bg-background"
              aria-labelledby="namecard-unit-members-label"
            >
              <div className="grid grid-cols-2 gap-2 border-b p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
                <Select
                  items={memberAgencyItems}
                  value={memberAgency}
                  disabled={saving}
                  onValueChange={(value) => setMemberAgency(String(value))}
                >
                  <SelectTrigger
                    className="w-full min-w-0"
                    aria-label="成员企划"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL_VALUE}>全部企划</SelectItem>
                      {agencies.map((agency) => (
                        <SelectItem key={agency.id} value={String(agency.id)}>
                          {agency.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  items={memberCategoryItems}
                  value={memberCategory}
                  disabled={saving}
                  onValueChange={(value) => setMemberCategory(String(value))}
                >
                  <SelectTrigger
                    className="w-full min-w-0"
                    aria-label="成员分类"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL_VALUE}>全部分类</SelectItem>
                      {NAMECARD_CHARACTER_CATEGORIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {NAMECARD_CHARACTER_CATEGORY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="relative col-span-2 sm:col-span-1">
                  <SearchIcon
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={memberQuery}
                    placeholder="搜索角色后勾选（中文名 / 日文名 / 英文名 / 别名）"
                    disabled={saving}
                    className="pl-9"
                    onChange={(event) => setMemberQuery(event.target.value)}
                  />
                </div>
              </div>
              <div
                className="h-44 overflow-y-auto overscroll-contain p-2 sm:h-56"
                role="group"
                aria-label="成员候选"
                aria-busy={memberLoading || undefined}
              >
                {memberCandidates === null ? (
                  <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    正在加载角色候选…
                  </p>
                ) : memberCandidates.length === 0 ? (
                  <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    没有匹配的角色。
                  </p>
                ) : (
                  memberCandidates.map((candidate) => {
                    const checked = draft.memberIds.includes(candidate.id)
                    return (
                      <label
                        key={candidate.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={saving}
                          onCheckedChange={(value) =>
                            toggleMember(candidate.id, value === true)
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {candidate.nameCn}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {candidate.nameJa ?? candidate.nameEn ?? ""}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
            <div className="mt-3 min-h-8">
              {draft.memberIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚未选择成员。</p>
              ) : (
                <div className="flex flex-wrap gap-2" aria-label="已选成员">
                  {draft.memberIds.map((memberId) => {
                    const option = memberIndex.get(memberId)
                    const label = option?.nameCn ?? `角色 #${memberId}`
                    return (
                      <Badge
                        key={memberId}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {label}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 sm:size-5"
                          disabled={saving}
                          aria-label={`移除成员 ${label}`}
                          title="移除"
                          onClick={() => toggleMember(memberId, false)}
                        >
                          <XIcon className="size-3" aria-hidden="true" />
                        </Button>
                      </Badge>
                    )
                  })}
                </div>
              )}
            </div>
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          取消
        </Button>
        <Button type="submit" disabled={saving || !isUnitDraftValid(draft)}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {editing ? "保存修改" : "新增组合"}
        </Button>
      </DialogFooter>
    </form>
  )
}
