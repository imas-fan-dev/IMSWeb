import { toast } from "sonner"
import { useEffect } from "react"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import {
  CLEAR_DATE,
  joinMadeOn,
  PRODUCTION_MONTHS,
  PRODUCTION_YEARS,
  productionDays,
  splitMadeOn,
} from "~/components/community/namecard-made-on"
import { normalizeProducerReading } from "~/pages/account/me/namecards/card-reading"
import {
  SeriesMultiSelect,
  type SeriesOption,
} from "~/components/community/series-multi-select"
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
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"

/**
 * 名片墙上的两种短表单：认领带全部六个基础字段，补充只要其中四个。
 * 两者都不含图片与简介，那些只能在认领通过后的名片编辑器里改。
 */
export type WallCardFieldMode = "claim" | "supplement"

export interface WallCardDraft {
  producerName: string
  producerReading: string | null
  groupName: string | null
  madeOn: string | null
  seriesCodes: string[]
  favoriteCharacterIds: number[]
}

export function wallCardDraftFromCard(card: {
  producerName: string | null
  producerReading: string | null
  groupName: string | null
  madeOn: string | null
  seriesCodes: string[]
  favoriteCharacters: { id: number }[]
}): WallCardDraft {
  return {
    producerName: card.producerName ?? "",
    producerReading: card.producerReading,
    groupName: card.groupName,
    madeOn: card.madeOn,
    seriesCodes: [...card.seriesCodes],
    favoriteCharacterIds: card.favoriteCharacters.map(
      (character) => character.id
    ),
  }
}

/** 提交时只带真正改过的字段；没动过的键让服务端保留 live 值。 */
export function wallCardPayload(
  mode: WallCardFieldMode,
  draft: WallCardDraft,
  live: WallCardDraft
) {
  const payload: Record<string, unknown> = {}
  if (draft.producerName.trim() !== live.producerName.trim()) {
    payload.producerName = draft.producerName.trim()
  }
  if (mode === "claim" && draft.producerReading !== live.producerReading) {
    payload.producerReading = draft.producerReading
  }
  if (draft.groupName !== live.groupName) {
    payload.groupName = draft.groupName
  }
  if (mode === "claim" && draft.madeOn !== live.madeOn) {
    payload.madeOn = draft.madeOn
  }
  if (draft.seriesCodes.join(",") !== live.seriesCodes.join(",")) {
    payload.seriesCodes = draft.seriesCodes
  }
  const nextCharacters = [...draft.favoriteCharacterIds].sort((a, b) => a - b)
  const liveCharacters = [...live.favoriteCharacterIds].sort((a, b) => a - b)
  if (nextCharacters.join(",") !== liveCharacters.join(",")) {
    payload.favoriteCharacterIds = draft.favoriteCharacterIds
  }
  return payload
}

export function wallCardChanged(
  mode: WallCardFieldMode,
  draft: WallCardDraft,
  live: WallCardDraft
) {
  return Object.keys(wallCardPayload(mode, draft, live)).length > 0
}

export function NamecardWallFields({
  mode,
  draft,
  series,
  disabled,
  onChange,
}: {
  mode: WallCardFieldMode
  draft: WallCardDraft
  series: readonly SeriesOption[]
  disabled: boolean
  onChange: (draft: WallCardDraft) => void
}) {
  const { catalog, loading, failed } = useNamecardCharacterCatalog()
  const madeOn = splitMadeOn(draft.madeOn)
  // 担当角色所属的企划必须勾选且不可取消，否则角色与企划会互相矛盾。
  const lockedSeriesCodes = Array.from(
    new Set(
      (catalog?.characters ?? [])
        .filter((entry) => draft.favoriteCharacterIds.includes(entry.id))
        .map((entry) => entry.agencyCode)
        .filter((code): code is string => Boolean(code))
    )
  )

  useEffect(() => {
    if (failed) toast.error("担当角色目录载入失败，请稍后重试")
  }, [failed])

  function patch(next: Partial<WallCardDraft>) {
    onChange({ ...draft, ...next })
  }

  return (
    <FieldGroup>
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="wall-card-producer-name">制作人名称</FieldLabel>
          <Input
            id="wall-card-producer-name"
            value={draft.producerName}
            maxLength={80}
            disabled={disabled}
            onChange={(event) =>
              patch({ producerName: event.currentTarget.value })
            }
          />
        </Field>

        {mode === "claim" ? (
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor="wall-card-producer-reading">
              制作人名读音
            </FieldLabel>
            <Input
              id="wall-card-producer-reading"
              value={draft.producerReading ?? ""}
              maxLength={80}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) =>
                patch({
                  producerReading:
                    normalizeProducerReading(event.currentTarget.value) || null,
                })
              }
            />
            <FieldDescription>
              仅可使用日文假名与英文字母，用于按读音排序。
            </FieldDescription>
          </Field>
        ) : null}

        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="wall-card-group-name">团体名称</FieldLabel>
          <Input
            id="wall-card-group-name"
            value={draft.groupName ?? ""}
            maxLength={80}
            disabled={disabled}
            onChange={(event) => {
              const value = event.currentTarget.value
              patch({ groupName: value ? value : null })
            }}
          />
        </Field>

        {mode === "claim" ? (
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor="wall-card-made-on-year">制作时间</FieldLabel>
            <div className="flex min-w-0 items-center gap-2">
              <Select
                value={madeOn.year || CLEAR_DATE}
                disabled={disabled}
                onValueChange={(value) => {
                  const year = String(value ?? CLEAR_DATE)
                  patch({
                    madeOn:
                      year === CLEAR_DATE
                        ? null
                        : joinMadeOn(year, madeOn.month, madeOn.day),
                  })
                }}
              >
                <SelectTrigger
                  id="wall-card-made-on-year"
                  className="w-full"
                  aria-label="制作年份"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem value={CLEAR_DATE}>-</SelectItem>
                    {PRODUCTION_YEARS.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year} 年
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={madeOn.month || CLEAR_DATE}
                disabled={disabled || !madeOn.year}
                onValueChange={(value) => {
                  const month = String(value ?? CLEAR_DATE)
                  const keepsDay =
                    month !== CLEAR_DATE &&
                    Boolean(madeOn.day) &&
                    productionDays(madeOn.year, month).includes(madeOn.day)
                  patch({
                    madeOn: joinMadeOn(
                      madeOn.year,
                      month === CLEAR_DATE ? "" : month,
                      keepsDay ? madeOn.day : ""
                    ),
                  })
                }}
              >
                <SelectTrigger
                  id="wall-card-made-on-month"
                  className="w-full"
                  aria-label="制作月份"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem value={CLEAR_DATE}>-</SelectItem>
                    {PRODUCTION_MONTHS.map((month) => (
                      <SelectItem key={month} value={month}>
                        {Number(month)} 月
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={madeOn.day || CLEAR_DATE}
                disabled={disabled || !madeOn.month}
                onValueChange={(value) => {
                  const day = String(value ?? CLEAR_DATE)
                  patch({
                    madeOn: joinMadeOn(
                      madeOn.year,
                      madeOn.month,
                      day === CLEAR_DATE ? "" : day
                    ),
                  })
                }}
              >
                <SelectTrigger
                  id="wall-card-made-on-day"
                  className="w-full"
                  aria-label="制作日期"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem value={CLEAR_DATE}>-</SelectItem>
                    {productionDays(madeOn.year, madeOn.month).map((day) => (
                      <SelectItem key={day} value={day}>
                        {Number(day)} 日
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </Field>
        ) : null}
      </FieldGroup>

      <SeriesMultiSelect
        id="wall-card-series"
        series={series}
        selectedCodes={draft.seriesCodes}
        lockedCodes={lockedSeriesCodes}
        disabled={disabled}
        onChange={(seriesCodes) => patch({ seriesCodes })}
      />

      <CharacterMultiSelect
        id="wall-card-characters"
        catalog={catalog}
        loading={loading}
        selectedIds={draft.favoriteCharacterIds}
        disabled={disabled || loading}
        onChange={(favoriteCharacterIds) => {
          const agencyCodes = (catalog?.characters ?? [])
            .filter((entry) => favoriteCharacterIds.includes(entry.id))
            .map((entry) => entry.agencyCode)
            .filter((code): code is string => Boolean(code))
          patch({
            favoriteCharacterIds,
            seriesCodes: Array.from(
              new Set([...draft.seriesCodes, ...agencyCodes])
            ),
          })
        }}
      />
    </FieldGroup>
  )
}
