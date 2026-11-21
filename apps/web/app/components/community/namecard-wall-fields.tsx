import { toast } from "sonner"
import { useEffect } from "react"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { NamecardIdentityFields } from "~/components/community/namecard-identity-fields"
import { NamecardTagEditor } from "~/components/community/namecard-tag-editor"
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
  /** 团体名片：制作人名称为空，展示与检索改用团体名称。 */
  isGroupCard: boolean
  madeOn: string | null
  seriesCodes: string[]
  favoriteCharacterIds: number[]
  /** 标签即时生效、不进审核载荷；与内容一起随窗口保存提交。 */
  tags: string[]
}

export function wallCardDraftFromCard(card: {
  producerName: string | null
  producerReading: string | null
  groupName: string | null
  isGroupCard?: boolean
  madeOn: string | null
  seriesCodes: string[]
  favoriteCharacters: { id: number }[]
  tags?: readonly { name: string; presetId?: number | null }[]
}): WallCardDraft {
  return {
    producerName: card.producerName ?? "",
    producerReading: card.producerReading,
    groupName: card.groupName,
    isGroupCard: card.isGroupCard === true,
    madeOn: card.madeOn,
    seriesCodes: [...card.seriesCodes],
    favoriteCharacterIds: card.favoriteCharacters.map(
      (character) => character.id
    ),
    tags: (card.tags ?? []).map((tag) => tag.name),
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
  if (draft.isGroupCard !== live.isGroupCard) {
    payload.isGroupCard = draft.isGroupCard
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
  // 标签是白名单里唯一「即时生效」的字段：服务端写完内容后整组替换，不进审核载荷。
  if (draft.tags.join("\u0000") !== live.tags.join("\u0000")) {
    payload.tags = draft.tags
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

      <Field data-disabled={disabled || undefined}>
        <FieldLabel>标签</FieldLabel>
        <NamecardTagEditor
          variant="form"
          value={draft.tags}
          disabled={disabled}
          onChange={(tags) => patch({ tags })}
        />
        <FieldDescription>
          标签即时生效、不参与审核；会随这次提交一起保存。
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
