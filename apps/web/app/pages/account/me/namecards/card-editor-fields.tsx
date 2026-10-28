import { useEffect } from "react"

import { toast } from "sonner"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { SeriesMultiSelect } from "~/components/community/series-multi-select"
import { Checkbox } from "~/components/ui/checkbox"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import type { FudabaCardFields, FudabaSeries } from "~/lib/api"
import {
  NAMECARD_PRODUCTION_YEAR_MAX,
  NAMECARD_PRODUCTION_YEAR_MIN,
} from "@imsweb/contracts/fudaba/runtime"

import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import { CreditsEditor } from "./card-credits-editor"
import { CardModule, type CardModuleModes } from "./card-module"

const PRODUCTION_YEAR_MIN = NAMECARD_PRODUCTION_YEAR_MIN
/** 不能制作未来日期的名片，所以上限是今年（契约上限只是结构性兜底）。 */
const PRODUCTION_YEAR_MAX = Math.min(
  NAMECARD_PRODUCTION_YEAR_MAX,
  new Date().getFullYear()
)
const PRODUCTION_YEARS = Array.from(
  { length: PRODUCTION_YEAR_MAX - PRODUCTION_YEAR_MIN + 1 },
  (_, index) => String(PRODUCTION_YEAR_MAX - index)
)
const PRODUCTION_MONTHS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
)

/** 只给出该年该月真实存在的日子，2 月与大小月都按实际天数截断。 */
function productionDays(year: string, month: string): string[] {
  const monthNumber = Number(month)
  if (!year || !monthNumber) return []
  const total = new Date(Number(year), monthNumber, 0).getDate()
  return Array.from({ length: total }, (_, index) =>
    String(index + 1).padStart(2, "0")
  )
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; every part is optional but the year. */
function splitMadeOn(value: string | null) {
  const [year = "", month = "", day = ""] = (value ?? "").split("-")
  return { year, month: year ? month : "", day: year && month ? day : "" }
}

function joinMadeOn(year: string, month: string, day: string): string | null {
  if (!year) return null
  if (!month) return year
  if (!day) return `${year}-${month}`
  return `${year}-${month}-${day}`
}

const EXCHANGE_MODE_OPTIONS = [
  { value: "auto", label: "自动交换", hint: "对方确认后立即交换" },
  { value: "manual", label: "手动确认", hint: "需要你逐张确认交换请求" },
  { value: "none", label: "不参与交换", hint: "只在名片墙展示" },
] as const

export function CardFields({
  draft,
  series,
  disabled,
  invalidFields = [],
  modes,
  onChange,
}: {
  draft: FudabaCardFields
  series: FudabaSeries[]
  disabled: boolean
  /** 每个模块可单独设为仅显示 / 编辑 / 不可见。 */
  modes?: CardModuleModes
  /** Field names that failed the client-side gate, highlighted on submit. */
  invalidFields?: readonly string[]
  onChange: (draft: FudabaCardFields) => void
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
  const highlight = (field: string) =>
    invalidFields.includes(field)
      ? "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background"
      : undefined

  useEffect(() => {
    if (failed) {
      toast.error("担当角色目录载入失败，请稍后重试")
    }
  }, [failed])

  function patch(next: Partial<FudabaCardFields>) {
    onChange({ ...draft, ...next })
  }

  return (
    <FieldGroup>
      <CardModule mode={modes?.identity}>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field
          data-disabled={disabled || undefined}
          data-card-field="producerName"
          className={highlight("producerName")}
        >
          <FieldLabel htmlFor="exchange-card-producer-name">
            制作人名称
          </FieldLabel>
          <Input
            id="exchange-card-producer-name"
            value={draft.producerName}
            maxLength={80}
            required
            aria-invalid={invalidFields.includes("producerName") || undefined}
            disabled={disabled}
            onChange={(event) => patch({ producerName: event.currentTarget.value })}
          />
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-producer-reading">
            制作人名读音
          </FieldLabel>
          <Input
            id="exchange-card-producer-reading"
            value={draft.producerReading ?? ""}
            maxLength={80}
            disabled={disabled}
            placeholder="例：シェイシェイ"
            aria-invalid={
              invalidFields.includes("producerReading") || undefined
            }
            onChange={(event) => {
              // 只接受假名与英文字母，与服务端 CHECK 保持一致。
              const value = event.currentTarget.value.replace(
                /[^ぁ-ゖァ-ヺーA-Za-z ]/g,
                ""
              )
              patch({ producerReading: value ? value : null })
            }}
          />
          <FieldDescription>
            仅可使用日文假名与英文字母，用于按读音排序。
          </FieldDescription>
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-group-name">团体名称</FieldLabel>
          <Input
            id="exchange-card-group-name"
            value={draft.groupName ?? ""}
            maxLength={80}
            disabled={disabled}
            placeholder="以团体名义投稿时填写"
            onChange={(event) => {
              const value = event.currentTarget.value
              patch({ groupName: value ? value : null })
            }}
          />
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-made-on-year">制作时间</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Select
              value={madeOn.year || undefined}
              disabled={disabled}
              onValueChange={(value) => {
                const year = String(value ?? "")
                patch({
                  madeOn: year
                    ? joinMadeOn(year, madeOn.month, madeOn.day)
                    : null,
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-year" className="w-full">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {PRODUCTION_YEARS.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year} 年
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={madeOn.month || undefined}
              disabled={disabled || !madeOn.year}
              onValueChange={(value) => {
                const month = String(value ?? "")
                const keepsDay =
                  madeOn.day &&
                  productionDays(madeOn.year, month).includes(madeOn.day)
                patch({
                  madeOn: joinMadeOn(
                    madeOn.year,
                    month,
                    month && keepsDay ? madeOn.day : ""
                  ),
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-month" className="w-full">
                <SelectValue placeholder="月份" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {PRODUCTION_MONTHS.map((month) => (
                    <SelectItem key={month} value={month}>
                      {Number(month)} 月
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={madeOn.day || undefined}
              disabled={disabled || !madeOn.month}
              onValueChange={(value) => {
                const day = String(value ?? "")
                patch({
                  madeOn: joinMadeOn(madeOn.year, madeOn.month, day),
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-day" className="w-full">
                <SelectValue placeholder="日" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {productionDays(madeOn.year, madeOn.month).map((day) => (
                    <SelectItem key={day} value={day}>
                      {Number(day)} 日
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <FieldDescription>可以只填到年份或月份。</FieldDescription>
        </Field>
        </FieldGroup>
      </CardModule>

      <CardModule mode={modes?.series}>
      <div data-card-field="seriesCodes" className={highlight("seriesCodes")}>
        <SeriesMultiSelect
          id="exchange-card-series"
          series={series}
          selectedCodes={draft.seriesCodes}
          lockedCodes={lockedSeriesCodes}
          disabled={disabled}
          onChange={(seriesCodes) => patch({ seriesCodes })}
        />
      </div>
      </CardModule>

      <CardModule mode={modes?.characters}>

      <div
        data-card-field="favoriteCharacterIds"
        className={highlight("favoriteCharacterIds")}
      >
        <CharacterMultiSelect
          id="exchange-card-characters"
          catalog={catalog}
          loading={loading}
          selectedIds={draft.favoriteCharacterIds}
          disabled={disabled || loading}
          onChange={(favoriteCharacterIds) => {
            const required = (catalog?.characters ?? [])
              .filter((entry) => favoriteCharacterIds.includes(entry.id))
              .map((entry) => entry.agencyCode)
              .filter((code): code is string => Boolean(code))
            patch({
              favoriteCharacterIds,
              seriesCodes: Array.from(new Set([...draft.seriesCodes, ...required])),
            })
          }}
        />
      </div>
      </CardModule>

      <CardModule mode={modes?.exchangeMode}>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel id="exchange-card-exchange-mode-label">交换方式</FieldLabel>
        <Tabs
          value={draft.exchangeMode}
          onValueChange={(value) =>
            patch({ exchangeMode: value as FudabaCardFields["exchangeMode"] })
          }
        >
          <TabsList
            aria-labelledby="exchange-card-exchange-mode-label"
            className="w-full sm:w-auto"
          >
            {EXCHANGE_MODE_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                disabled={disabled}
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {EXCHANGE_MODE_OPTIONS.map((option) => (
            <TabsContent key={option.value} value={option.value}>
              <p className="text-sm text-muted-foreground">{option.hint}</p>
            </TabsContent>
          ))}
        </Tabs>
      </Field>
      </CardModule>

      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <CardModule mode={modes?.flags}>
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-is-original"
            checked={draft.isOriginal}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ isOriginal: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-is-original">原创作品</FieldLabel>
            <FieldDescription>
              此名片主体部分为自行绘制、约稿或授权使用，而非在官图基础上进行的二次修改或描摹。
            </FieldDescription>
          </div>
        </Field>
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-made-with-ai"
            checked={draft.madeWithAi}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ madeWithAi: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-made-with-ai">
              使用 AI 生成
            </FieldLabel>
            <FieldDescription>
              此名片主体部分使用生成式 AI 直接参与制作。
            </FieldDescription>
          </div>
        </Field>
        </CardModule>
        <CardModule mode={modes?.visibility}>
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-visible"
            checked={draft.visible}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ visible: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-visible">公开名片</FieldLabel>
            <FieldDescription>他人可在名片墙和用户主页看到这张名片。</FieldDescription>
          </div>
        </Field>
        </CardModule>
      </FieldGroup>

      <CardModule mode={modes?.bio}>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor="exchange-card-bio">名片简介</FieldLabel>
        <Textarea
          id="exchange-card-bio"
          value={draft.bio}
          maxLength={2000}
          disabled={disabled}
          className="min-h-24 resize-y"
          onChange={(event) => patch({ bio: event.currentTarget.value })}
        />
      </Field>
      </CardModule>

      <CardModule mode={modes?.exchangeNote}>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor="exchange-card-trade-note">交换说明</FieldLabel>
        <Textarea
          id="exchange-card-trade-note"
          value={draft.tradeNote}
          maxLength={1000}
          disabled={disabled}
          className="min-h-20 resize-y"
          onChange={(event) => patch({ tradeNote: event.currentTarget.value })}
        />
      </Field>
      </CardModule>

      <CardModule mode={modes?.credits}>
      <div data-card-field="credits" className={highlight("credits")}>
        <CreditsEditor
          credits={draft.credits}
          disabled={disabled}
          onChange={(credits) => patch({ credits })}
        />
      </div>
      </CardModule>
    </FieldGroup>
  )
}
