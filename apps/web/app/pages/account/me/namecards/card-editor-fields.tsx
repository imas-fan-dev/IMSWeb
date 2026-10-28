import { useEffect, useState } from "react"

import { toast } from "sonner"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { normalizeProducerReading } from "./card-reading"
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
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
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
/** 三个日期下拉都给了「-」，用户任何一级都能退回到「只填到这里」。 */
const CLEAR_DATE = "-"

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

/** 必填星号；前后留一点空隙，读屏不读它（`aria-hidden`）。 */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-1 text-destructive">
      *
    </span>
  )
}

export function CardFields({
  draft,
  series,
  disabled,
  modes,
  onChange,
}: {
  draft: FudabaCardFields
  series: FudabaSeries[]
  disabled: boolean
  /** 每个模块可单独设为仅显示 / 编辑 / 不可见。 */
  modes?: CardModuleModes
  onChange: (draft: FudabaCardFields) => void
}) {
  const { catalog, loading, failed } = useNamecardCharacterCatalog()
  const [modeDirection, setModeDirection] = useState<"next" | "previous">("next")
  const madeOn = splitMadeOn(draft.madeOn)
  // 输入法在组合期间会先落全角英文字母，此时原样保留，提交或失去焦点时再清理。
  const [readingComposing, setReadingComposing] = useState(false)
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
    onChange({ ...draft, ...next })
  }

  return (
    <FieldGroup>
      <CardModule mode={modes?.identity}>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <Field data-disabled={disabled || undefined} data-card-field="producerName">
            <FieldLabel htmlFor="exchange-card-producer-name">
              制作人名称 <RequiredMark />
            </FieldLabel>
            <Input
              id="exchange-card-producer-name"
              value={draft.producerName}
              maxLength={80}
              required
              disabled={disabled}
              onChange={(event) =>
                patch({ producerName: event.currentTarget.value })
              }
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
              autoComplete="off"
              onChange={(event) => {
                const composing =
                  readingComposing ||
                  (event.nativeEvent as { isComposing?: boolean }).isComposing ===
                    true
                if (composing) {
                  patch({ producerReading: event.currentTarget.value || null })
                  return
                }
                patch({
                  producerReading: normalizeProducerReading(
                    event.currentTarget.value
                  ),
                })
              }}
              onCompositionStart={() => setReadingComposing(true)}
              onCompositionEnd={(event) => {
                setReadingComposing(false)
                patch({
                  producerReading: normalizeProducerReading(
                    event.currentTarget.value
                  ),
                })
              }}
              onBlur={(event) =>
                patch({
                  producerReading: normalizeProducerReading(
                    event.currentTarget.value
                  ),
                })
              }
            />
            <FieldDescription>
              仅可使用日文假名与英文字母，可用撇号或连字符分隔音节，排序时会忽略它们。
            </FieldDescription>
          </Field>

          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor="exchange-card-group-name">团体名称</FieldLabel>
            <Input
              id="exchange-card-group-name"
              value={draft.groupName ?? ""}
              maxLength={80}
              disabled={disabled}
              onChange={(event) => {
                const value = event.currentTarget.value
                patch({ groupName: value ? value : null })
              }}
            />
            <FieldDescription>
              可填入所属支部、事务所或社会团体名称。
            </FieldDescription>
          </Field>

          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor="exchange-card-made-on-year">制作时间</FieldLabel>
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
                  id="exchange-card-made-on-year"
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
                  id="exchange-card-made-on-month"
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
                  id="exchange-card-made-on-day"
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
            <FieldDescription>可以只精确到年份或月份。</FieldDescription>
          </Field>
        </FieldGroup>
      </CardModule>

      <CardModule mode={modes?.series}>
        <div data-card-field="seriesCodes">
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
        <div data-card-field="favoriteCharacterIds">
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
                seriesCodes: Array.from(
                  new Set([...draft.seriesCodes, ...required])
                ),
              })
            }}
          />
        </div>
      </CardModule>

      <CardModule mode={modes?.bio}>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-bio">简介</FieldLabel>
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

      <CardModule mode={modes?.exchangeMode}>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel>交换模式</FieldLabel>
          <Tabs
            value={draft.exchangeMode}
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
                  disabled={disabled}
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* 换模式时说明横向滑入，方向跟随点击顺序。 */}
          <p
            key={draft.exchangeMode}
            className={`mt-2 text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 ${
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
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-visible"
            checked={draft.visible}
            disabled={disabled}
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
