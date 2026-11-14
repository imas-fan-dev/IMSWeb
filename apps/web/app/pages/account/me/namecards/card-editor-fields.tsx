import { useEffect, useState } from "react"

import { toast } from "sonner"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { NamecardIdentityFields } from "~/components/community/namecard-identity-fields"
import { SeriesMultiSelect } from "~/components/community/series-multi-select"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import type { FudabaCardFields, FudabaSeries } from "~/lib/api"
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import { CreditsEditor } from "./card-credits-editor"
import { CardModule, type CardModuleModes } from "./card-module"

const FLAG_OPTIONS = [
  {
    id: "exchange-card-is-original",
    field: "isOriginal",
    title: "原创声明",
    description:
      "此名片主体部分为自行绘制、约稿或授权使用，而非在官图基础上进行的二次修改或描摹。",
  },
  {
    id: "exchange-card-made-with-ai",
    field: "madeWithAi",
    title: "AI 声明",
    description: "此名片主体部分使用生成式 AI 直接参与制作。",
  },
] as const

const EXCHANGE_MODE_OPTIONS = [
  { value: "auto", label: "自动允许", hint: "自动通过任何人的交换申请" },
  { value: "manual", label: "手动允许", hint: "需逐张确认每一次交换申请" },
  { value: "none", label: "不可交换", hint: "不接受他人主动发起交换" },
] as const

/** 字数进度，例如「(12/2000)」；标题右侧的小字提示。 */
export function FieldCounter({
  value,
  limit,
}: {
  value: number
  limit: number
}) {
  return (
    <span className="ml-1 text-xs font-normal text-muted-foreground">
      ({value}/{limit})
    </span>
  )
}

export function CardFields({
  draft,
  series,
  disabled,
  modes,
  required = true,
  onChange,
}: {
  draft: FudabaCardFields
  series: FudabaSeries[]
  disabled: boolean
  /** 每个模块可单独设为仅显示 / 编辑 / 不可见。 */
  modes?: CardModuleModes
  /** 后台可以保存资料不全的名片，此时不标必填。 */
  required?: boolean
  onChange: (draft: FudabaCardFields) => void
}) {
  const { catalog, loading, failed } = useNamecardCharacterCatalog()
  const [modeDirection, setModeDirection] = useState<"next" | "previous">(
    "next"
  )
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
    if (failed) {
      toast.error("担当角色目录载入失败，请稍后重试")
    }
  }, [failed])

  function patch(next: Partial<FudabaCardFields>) {
    const merged = { ...draft, ...next }
    // 团体名片意味着「任何人都可以自由领取」，所以交换模式固定自动、
    // 可见性必须打开，不能被单独关掉。
    onChange(
      merged.isGroupCard
        ? { ...merged, exchangeMode: "auto", visible: true }
        : merged
    )
  }

  return (
    <FieldGroup>
      <CardModule mode={modes?.identity}>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <NamecardIdentityFields
            idPrefix="exchange-card"
            draft={draft}
            disabled={disabled}
            requiredName={required}
            onChange={patch}
          />
        </FieldGroup>
      </CardModule>

      <CardModule mode={modes?.series}>
        <div data-card-field="seriesCodes">
          <SeriesMultiSelect
            id="exchange-card-series"
            required={required}
            series={series}
            selectedCodes={draft.seriesCodes}
            lockedCodes={lockedSeriesCodes}
            disabled={disabled}
            onChange={(seriesCodes) => patch({ seriesCodes })}
          />
        </div>
      </CardModule>

      <CardModule mode={modes?.characters}>
        <div data-card-field="favoriteCharacterIds">
          <CharacterMultiSelect
            id="exchange-card-characters"
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
        </div>
      </CardModule>

      <CardModule mode={modes?.bio}>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-bio">
            简介
            <FieldCounter value={draft.bio.length} limit={2000} />
          </FieldLabel>
          <Textarea
            id="exchange-card-bio"
            value={draft.bio}
            maxLength={2000}
            disabled={disabled}
            className="min-h-24 resize-y"
            onChange={(event) => patch({ bio: event.currentTarget.value })}
          />
          <FieldDescription>
            可填写名片的简单说明，用于记录设计思路、发放场合、使用素材等。
          </FieldDescription>
        </Field>
      </CardModule>

      <CardModule mode={modes?.credits}>
        <div data-card-field="credits">
          <CreditsEditor
            credits={draft.credits}
            disabled={disabled}
            onChange={(credits) => patch({ credits })}
          />
        </div>
      </CardModule>

      <CardModule mode={modes?.flags}>
        <FieldGroup className="gap-3">
          {FLAG_OPTIONS.map((option) => (
            <Field key={option.id} data-disabled={disabled || undefined}>
              <FieldLabel htmlFor={option.id}>{option.title}</FieldLabel>
              <Field orientation="horizontal">
                <Checkbox
                  id={option.id}
                  checked={draft[option.field]}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    // 两条声明互斥，勾上一条即取消另一条。
                    const checkedNow = checked === true
                    patch(
                      option.field === "isOriginal"
                        ? { isOriginal: checkedNow, madeWithAi: false }
                        : { isOriginal: false, madeWithAi: checkedNow }
                    )
                  }}
                />
                <label
                  htmlFor={option.id}
                  className="min-w-0 text-sm text-muted-foreground"
                >
                  {option.description}
                </label>
              </Field>
            </Field>
          ))}
        </FieldGroup>
      </CardModule>

      <CardModule mode={modes?.exchangeNote}>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-trade-note">
            交换说明
            <FieldCounter value={draft.tradeNote.length} limit={1000} />
          </FieldLabel>
          <Textarea
            id="exchange-card-trade-note"
            value={draft.tradeNote}
            maxLength={1000}
            disabled={disabled}
            className="min-h-20 resize-y"
            onChange={(event) =>
              patch({ tradeNote: event.currentTarget.value })
            }
          />
        </Field>
      </CardModule>

      <CardModule mode={modes?.exchangeMode}>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel>交换模式</FieldLabel>
          <Tabs
            value={draft.isGroupCard ? "auto" : draft.exchangeMode}
            onValueChange={(value) => {
              const from = EXCHANGE_MODE_OPTIONS.findIndex(
                (option) => option.value === draft.exchangeMode
              )
              const to = EXCHANGE_MODE_OPTIONS.findIndex(
                (option) => option.value === value
              )
              setModeDirection(to >= from ? "next" : "previous")
              patch({
                exchangeMode: value as FudabaCardFields["exchangeMode"],
              })
            }}
          >
            <TabsList aria-label="交换模式" className="w-full sm:w-auto">
              {EXCHANGE_MODE_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  // 团体名片只能是自动交换，其他选项置灰。
                  disabled={
                    disabled || (draft.isGroupCard && option.value !== "auto")
                  }
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* 换模式时说明横向滑入，方向跟随点击顺序。 */}
          <p
            key={draft.exchangeMode}
            className={`mt-2 text-sm text-muted-foreground motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in ${
              modeDirection === "next"
                ? "motion-safe:slide-in-from-right-2"
                : "motion-safe:slide-in-from-left-2"
            }`}
          >
            {
              EXCHANGE_MODE_OPTIONS.find(
                (option) => option.value === draft.exchangeMode
              )?.hint
            }
          </p>
        </Field>
      </CardModule>

      <CardModule mode={modes?.visibility}>
        <Field
          orientation="horizontal"
          data-disabled={disabled || draft.isGroupCard || undefined}
        >
          <Checkbox
            id="exchange-card-visible"
            checked={draft.visible}
            disabled={disabled || draft.isGroupCard}
            onCheckedChange={(checked) => patch({ visible: checked === true })}
          />
          <label
            htmlFor="exchange-card-visible"
            className="min-w-0 text-sm font-medium"
          >
            他人可在名片墙和用户主页看到这张名片。
          </label>
        </Field>
      </CardModule>
    </FieldGroup>
  )
}
