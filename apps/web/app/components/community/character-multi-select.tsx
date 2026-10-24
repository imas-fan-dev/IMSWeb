import { SearchIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  type NamecardCharacterCatalog,
  type NamecardCharacterCatalogEntry,
  type NamecardCharacterCatalogUnit,
} from "@imsweb/contracts/fudaba/characters"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { UnitMemberSummary } from "~/components/shared/unit-member-summary"
import { NAMECARD_CHARACTER_CATEGORY_LABELS } from "~/lib/namecard-character-categories"

/** Sentinel for the two filters' 「全部」 option; never collides with an id or category. */
const ALL_VALUE = "all"

type SelectedUnit = {
  id: number
  nameCn: string
  memberIds: number[]
}

/**
 * Case-insensitive substring match across a character's or unit's four search
 * fields. `aliases` is one packed string, so it needs no splitting.
 */
function matchesQuery(fields: (string | null)[], normalizedQuery: string) {
  return fields.some(
    (field) =>
      field !== null &&
      field.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
  )
}

/**
 * A character picker driven entirely by one public catalog payload.
 *
 * Filters (agency and category) and the free-text query are applied in memory,
 * so a keystroke never waits on the network. `isFallback` entries are pinned to
 * the end of the candidate list; when a query matches nothing they ignore the
 * agency filter, so the 「其他…」 buckets stay reachable as the escape hatch.
 * Units are search shortcuts: checking one adds every member it lists, and the
 * unit is remembered for the session as a single removable chip that withdraws
 * the members it contributed. A unit matches the agency filter when any of its
 * agencies is selected, and the category filter when any member has that
 * category, so neither filter can surface a row outside its own scope.
 */
export function CharacterMultiSelect({
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
  const [selectedUnits, setSelectedUnits] = useState<SelectedUnit[]>([])

  const controlDisabled = disabled || loading
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const reachedLimit = selectedIds.length >= NAMECARD_FAVORITE_CHARACTER_LIMIT

  const characterById = useMemo(
    () =>
      new Map(
        (catalog?.characters ?? []).map((entry) => [entry.id, entry] as const)
      ),
    [catalog]
  )

  // A unit chip stays while at least one of its members is still chosen, so a
  // cleared selection cannot leave a ghost chip behind.
  const visibleUnits = selectedUnits.filter((unit) =>
    unit.memberIds.some((memberId) => selectedIds.includes(memberId))
  )
  const coveredByUnits = new Set(visibleUnits.flatMap((unit) => unit.memberIds))
  const individualSelected = selectedIds
    .filter((id) => !coveredByUnits.has(id))
    .map((id) => characterById.get(id))
    .filter(
      (entry): entry is NamecardCharacterCatalogEntry => entry !== undefined
    )

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

  const filtered = (catalog?.characters ?? []).filter(
    (entry) =>
      (agencyCode === ALL_VALUE || entry.agencyCode === agencyCode) &&
      (category === ALL_VALUE || entry.category === category)
  )
  const matchedCharacters = filtered.filter(
    (entry) =>
      !entry.isFallback &&
      (!normalizedQuery ||
        matchesQuery(
          [entry.nameCn, entry.nameJa, entry.nameEn, entry.aliases],
          normalizedQuery
        ))
  )
  const selectedAgencyId =
    agencyCode === ALL_VALUE
      ? null
      : ((catalog?.agencies ?? []).find((agency) => agency.code === agencyCode)
          ?.id ?? null)
  const matchedUnits = normalizedQuery
    ? (catalog?.units ?? []).filter(
        (unit) =>
          matchesQuery(
            [unit.nameCn, unit.nameJa, unit.nameEn, unit.aliases],
            normalizedQuery
          ) &&
          (selectedAgencyId === null ||
            unit.agencyIds.includes(selectedAgencyId)) &&
          (category === ALL_VALUE ||
            unit.memberIds.some(
              (memberId) => characterById.get(memberId)?.category === category
            ))
      )
    : []
  const nothingMatched =
    matchedCharacters.length === 0 && matchedUnits.length === 0
  // Fallback entries are the 「其他…」 escape hatch. They live under the sentinel
  // 其他 agency, so once a query matches nothing they ignore the agency filter —
  // filtering to a single agency must not hide the rows offered as the fallback.
  // The category filter still applies, so a 吉祥物 filter offers 「其他吉祥物」
  // rather than the idol bucket.
  const fallbackPool =
    normalizedQuery && nothingMatched ? (catalog?.characters ?? []) : filtered
  const fallbackCharacters = fallbackPool.filter(
    (entry) =>
      entry.isFallback &&
      (category === ALL_VALUE || entry.category === category)
  )
  const empty =
    !loading &&
    filtered.length === 0 &&
    matchedUnits.length === 0 &&
    fallbackCharacters.length === 0

  function changeCharacter(characterId: number, checked: boolean) {
    if (checked) {
      if (selectedIds.includes(characterId) || reachedLimit) return
      onChange([...selectedIds, characterId])
      return
    }
    onChange(selectedIds.filter((current) => current !== characterId))
  }

  function addUnit(unit: NamecardCharacterCatalogUnit) {
    const next = new Set(selectedIds)
    for (const memberId of unit.memberIds) {
      if (next.size >= NAMECARD_FAVORITE_CHARACTER_LIMIT) break
      next.add(memberId)
    }
    setSelectedUnits((previous) =>
      previous.some((selected) => selected.id === unit.id)
        ? previous
        : [
            ...previous,
            { id: unit.id, nameCn: unit.nameCn, memberIds: unit.memberIds },
          ]
    )
    onChange([...next])
  }

  function removeUnit(unitId: number) {
    const removed = selectedUnits.find((unit) => unit.id === unitId)
    if (!removed) return
    const remaining = selectedUnits.filter((unit) => unit.id !== unitId)
    const stillCovered = new Set(remaining.flatMap((unit) => unit.memberIds))
    const removedIds = new Set(removed.memberIds)
    setSelectedUnits(remaining)
    onChange(
      selectedIds.filter((id) => !removedIds.has(id) || stillCovered.has(id))
    )
  }

  function changeUnit(unit: NamecardCharacterCatalogUnit, checked: boolean) {
    if (checked) {
      addUnit(unit)
      return
    }
    removeUnit(unit.id)
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
        <span className="text-xs text-muted-foreground">
          {entry.agencyName}
        </span>
      </label>
    )
  }

  return (
    <Field id={id} data-disabled={controlDisabled || undefined}>
      <FieldLabel id={`${id}-label`}>担当角色</FieldLabel>
      <FieldDescription>
        可跨企划选择，最多 {NAMECARD_FAVORITE_CHARACTER_LIMIT}{" "}
        人；搜索支持角色名、别名与组合名。
      </FieldDescription>

      <div
        className="mt-2 overflow-hidden rounded-lg border bg-background"
        aria-labelledby={`${id}-label`}
      >
        <div className="grid grid-cols-2 gap-2 border-b p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
          <Select
            items={agencyItems}
            value={agencyCode}
            disabled={controlDisabled}
            onValueChange={(value) => setAgencyCode(String(value ?? ALL_VALUE))}
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
            onValueChange={(value) => setCategory(String(value ?? ALL_VALUE))}
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
          <div className="relative col-span-2 sm:col-span-1">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              value={query}
              placeholder="搜索担当角色"
              disabled={controlDisabled}
              className="pl-9"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
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
                    const checked = selectedUnits.some(
                      (selected) => selected.id === unit.id
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
                          {unit.nameCn}
                        </span>
                        <UnitMemberSummary
                          className="max-w-[45%] text-xs text-muted-foreground"
                          names={unit.memberIds
                            .map(
                              (memberId) => characterById.get(memberId)?.nameCn
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

      <div className="mt-3 min-h-8">
        {visibleUnits.length || individualSelected.length ? (
          <div className="flex flex-wrap gap-2" aria-label="已选担当角色">
            {visibleUnits.map((unit) => (
              <Badge
                key={`unit-${unit.id}`}
                variant="secondary"
                className="gap-1 pr-1"
              >
                {unit.nameCn}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 sm:size-5"
                  disabled={disabled}
                  aria-label={`移除组合 ${unit.nameCn}`}
                  title="移除"
                  onClick={() => removeUnit(unit.id)}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              </Badge>
            ))}
            {individualSelected.map((entry) => (
              <Badge key={entry.id} variant="secondary" className="gap-1 pr-1">
                {entry.nameCn}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 sm:size-5"
                  disabled={disabled}
                  aria-label={`移除担当 ${entry.nameCn}`}
                  title="移除"
                  onClick={() => changeCharacter(entry.id, false)}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未选择担当角色。</p>
        )}
      </div>
    </Field>
  )
}
