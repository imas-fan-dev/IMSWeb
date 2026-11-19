import { XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  type NamecardCharacterCatalog,
  type NamecardCharacterCatalogEntry,
  type NamecardCharacterCatalogUnit,
} from "@imsweb/contracts/fudaba/characters"

import { UnitMemberSummary } from "~/components/shared/unit-member-summary"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Separator } from "~/components/ui/separator"
import { NAMECARD_CHARACTER_CATEGORY_LABELS } from "~/lib/namecard-character-categories"
import {
  CHARACTER_FILTER_ALL as ALL_VALUE,
  matchCharacterCandidates,
  unitLabel,
} from "~/lib/namecard-character-match"

import { ClearInputButton } from "./clear-input-button"
import { useFilterPopover } from "./use-filter-popover"

/**
 * 名片册 / 名片墙筛选栏的紧凑版担当角色选择器。
 *
 * 输入框里直接排已选 badge，候选列表收在输入框下面，默认不占版面；组合是
 * 快捷方式，勾选后展开成它列出的全部成员 badge（取消组合也只退掉这些成员）。
 * 候选列表的筛选与行样式与后台组合编辑器的成员筛选一致；编辑器用的
 * `CharacterMultiSelect` 保持原样。
 */
export function CharacterFilterSelect({
  id,
  catalog,
  loading,
  selectedIds,
  disabled,
  onChange,
}: {
  id: string
  catalog: NamecardCharacterCatalog | null
  loading: boolean
  selectedIds: number[]
  disabled: boolean
  onChange: (characterIds: number[]) => void
}) {
  const [agencyCode, setAgencyCode] = useState(ALL_VALUE)
  const [category, setCategory] = useState(ALL_VALUE)
  const [query, setQuery] = useState("")
  const { open, setOpen, rootRef, rootProps } = useFilterPopover()

  const controlDisabled = disabled || loading
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const reachedLimit = selectedIds.length >= NAMECARD_FAVORITE_CHARACTER_LIMIT

  const {
    characters: characterById,
    filteredCharacters,
    matchedCharacters,
    matchedUnits,
    fallbackCharacters,
    nothingMatched,
  } = useMemo(
    () =>
      matchCharacterCandidates({
        catalog,
        agencyCode,
        category,
        query: normalizedQuery,
      }),
    [catalog, agencyCode, category, normalizedQuery]
  )

  const selectedEntries = selectedIds
    .map((characterId) => characterById.get(characterId))
    .filter(
      (entry): entry is NamecardCharacterCatalogEntry => entry !== undefined
    )
  const empty =
    !loading &&
    filteredCharacters.length === 0 &&
    matchedUnits.length === 0 &&
    fallbackCharacters.length === 0

  const agencyItems = [
    { value: ALL_VALUE, label: "全部企划" },
    ...(catalog?.agencies ?? []).map((agency) => ({
      value: agency.code,
      label: agency.name,
    })),
  ]
  const categoryItems = [
    { value: ALL_VALUE, label: "全部分类" },
    ...(catalog?.categories ?? []).map((item) => ({
      value: item,
      label: NAMECARD_CHARACTER_CATEGORY_LABELS[item],
    })),
  ]

  function changeCharacter(characterId: number, checked: boolean) {
    if (checked) {
      if (selectedIds.includes(characterId) || reachedLimit) return
      const next = [...selectedIds, characterId]
      onChange(next)
      // 收满上限之后没有可选项了，顺手收起面板。
      if (next.length >= NAMECARD_FAVORITE_CHARACTER_LIMIT) setOpen(false)
      return
    }
    onChange(selectedIds.filter((current) => current !== characterId))
  }

  function changeUnit(unit: NamecardCharacterCatalogUnit, checked: boolean) {
    if (!checked) {
      const members = new Set(unit.memberIds)
      onChange(selectedIds.filter((id) => !members.has(id)))
      return
    }
    const next = new Set(selectedIds)
    for (const memberId of unit.memberIds) {
      if (next.size >= NAMECARD_FAVORITE_CHARACTER_LIMIT) break
      next.add(memberId)
    }
    onChange([...next])
    // 组合是一次加满的批量选择，选完收起。
    setOpen(false)
  }

  function characterRow(entry: NamecardCharacterCatalogEntry) {
    const checked = selectedIds.includes(entry.id)
    return (
      <label
        key={entry.id}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
      >
        <Checkbox
          checked={checked}
          disabled={controlDisabled || (!checked && reachedLimit)}
          onCheckedChange={(value) => changeCharacter(entry.id, value === true)}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{entry.nameCn}</span>
        <span className="truncate text-xs text-muted-foreground">
          {entry.nameJa ?? entry.nameEn ?? ""}
        </span>
      </label>
    )
  }

  return (
    <Field id={id} data-disabled={controlDisabled || undefined}>
      <FieldLabel id={`${id}-label`}>
        担当角色
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({selectedIds.length}/{NAMECARD_FAVORITE_CHARACTER_LIMIT})
        </span>
      </FieldLabel>
      <div ref={rootRef} className="relative" {...rootProps}>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-0.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          aria-labelledby={`${id}-label`}
        >
          {selectedEntries.map((entry) => (
            <Badge
              key={entry.id}
              variant="secondary"
              className="max-w-full gap-0.5 pr-0.5"
            >
              <span className="truncate">{entry.nameCn}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-4"
                disabled={disabled}
                aria-label={`移除担当 ${entry.nameCn}`}
                title="移除"
                onClick={() => changeCharacter(entry.id, false)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </Badge>
          ))}

          <div className="relative min-w-24 flex-1">
            <Input
              id={`${id}-search`}
              type="text"
              value={query}
              placeholder="搜索角色名、别名或组合名"
              disabled={controlDisabled}
              aria-label="搜索担当角色"
              aria-expanded={open}
              aria-controls={open ? `${id}-candidates` : undefined}
              className="h-7 border-0 bg-transparent pr-7 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setOpen(true)
              }}
            />
            {query ? (
              <ClearInputButton
                label="清空角色搜索"
                className="right-0"
                onClick={() => {
                  setQuery("")
                  setOpen(true)
                }}
              />
            ) : null}
          </div>

          {selectedIds.length > 0 || query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground"
              disabled={disabled}
              aria-label="清空担当角色"
              title="清空"
              onClick={() => {
                setQuery("")
                onChange([])
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {open ? (
          <div
            id={`${id}-candidates`}
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-background shadow-lg"
          >
            <div className="grid grid-cols-2 gap-2 border-b p-2">
              <Select
                items={agencyItems}
                value={agencyCode}
                disabled={controlDisabled}
                onValueChange={(value) =>
                  setAgencyCode(String(value ?? ALL_VALUE))
                }
              >
                <SelectTrigger
                  id={`${id}-agency`}
                  size="sm"
                  className="w-full min-w-0"
                  aria-label="企划"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {agencyItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                items={categoryItems}
                value={category}
                disabled={controlDisabled}
                onValueChange={(value) =>
                  setCategory(String(value ?? ALL_VALUE))
                }
              >
                <SelectTrigger
                  id={`${id}-category`}
                  size="sm"
                  className="w-full min-w-0"
                  aria-label="分类"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div
              className="h-44 overflow-y-auto overscroll-contain p-2 sm:h-56"
              role="group"
              aria-label="担当角色候选"
            >
              {loading && !catalog ? (
                <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  正在载入角色目录。
                </p>
              ) : empty ? (
                <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  当前企划没有匹配的角色。
                </p>
              ) : (
                <>
                  {nothingMatched && normalizedQuery ? (
                    <p className="px-2 pb-1 text-xs text-muted-foreground">
                      没有匹配的角色，可选择以下兜底条目。
                    </p>
                  ) : null}

                  {matchedUnits.length ? (
                    <div className="mb-1" role="group" aria-label="组合">
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        组合
                      </p>
                      {matchedUnits.map((unit) => {
                        const checked = unit.memberIds.every((memberId) =>
                          selectedIds.includes(memberId)
                        )
                        return (
                          <label
                            key={`unit-${unit.id}`}
                            className="@container flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={
                                controlDisabled || (!checked && reachedLimit)
                              }
                              onCheckedChange={(value) =>
                                changeUnit(unit, value === true)
                              }
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {unitLabel(unit)}
                            </span>
                            <UnitMemberSummary
                              className="max-w-[45%] text-xs text-muted-foreground"
                              names={unit.memberIds
                                .map(
                                  (memberId) =>
                                    characterById.get(memberId)?.nameCn
                                )
                                .filter(
                                  (name): name is string => name !== undefined
                                )}
                            />
                          </label>
                        )
                      })}
                    </div>
                  ) : null}

                  {matchedUnits.length ? <Separator className="my-1" /> : null}

                  {matchedCharacters.map(characterRow)}

                  {fallbackCharacters.length ? (
                    <div
                      className="mt-1 border-t pt-1"
                      role="group"
                      aria-label="兜底条目"
                    >
                      {fallbackCharacters.map(characterRow)}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  )
}
