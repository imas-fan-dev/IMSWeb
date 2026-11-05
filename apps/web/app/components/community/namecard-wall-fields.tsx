import { toast } from "sonner"
import { useEffect } from "react"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { FieldGroup } from "~/components/ui/field"
import { NamecardIdentityFields } from "~/components/community/namecard-identity-fields"
import {
  SeriesMultiSelect,
  type SeriesOption,
} from "~/components/community/series-multi-select"
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
        <NamecardIdentityFields
          idPrefix="wall-card"
          draft={draft}
          disabled={disabled}
          requiredName={mode === "claim"}
          showReading={mode === "claim"}
          showMadeOn={mode === "claim"}
          onChange={patch}
        />
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
