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
import {
  CLEAR_DATE,
  joinMadeOn,
  productionDays,
  PRODUCTION_MONTHS,
  PRODUCTION_YEARS,
  splitMadeOn,
} from "~/components/community/namecard-made-on"
import { normalizeProducerReading } from "~/pages/account/me/namecards/card-reading"

/** 名称、读音、团体、制作时间——编辑窗与墙上的表单只有这四项完全相同。 */
export interface NamecardIdentityDraft {
  producerName: string
  producerReading: string | null
  groupName: string | null
  /** 团体名片：制作人名称为空，展示与检索改用团体名称。 */
  isGroupCard?: boolean
  madeOn: string | null
}

/**
 * 名片身份字段。
 *
 * 个人编辑窗（13 项）和名片墙（6/4 项）各自维护草稿与提交差异，但四个输入框的
 * 结构和读音归一化规则是同一套；这里只负责把值画出来并回报改动。
 */
export function NamecardIdentityFields({
  idPrefix,
  draft,
  disabled = false,
  requiredName = false,
  showReading = true,
  showMadeOn = true,
  onChange,
}: {
  /** 用于把两处的 input id 分开，例如 `exchange-card` 与 `wall-card`。 */
  idPrefix: string
  draft: NamecardIdentityDraft
  disabled?: boolean
  requiredName?: boolean
  showReading?: boolean
  showMadeOn?: boolean
  onChange: (patch: Partial<NamecardIdentityDraft>) => void
}) {
  const madeOn = splitMadeOn(draft.madeOn ?? "")

  return (
    <>
      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-producer-name`}>
          制作人名称
          {requiredName && !draft.isGroupCard ? (
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        <Input
          id={`${idPrefix}-producer-name`}
          value={draft.producerName}
          maxLength={80}
          required={requiredName && !draft.isGroupCard}
          disabled={disabled}
          onChange={(event) => onChange({ producerName: event.currentTarget.value })}
        />
        {draft.isGroupCard ? (
          <FieldDescription>
            团体名片可不填：留空时展示与检索使用团体名称。
          </FieldDescription>
        ) : null}
      </Field>

      {showReading ? (
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-producer-reading`}>
            制作人名读音
          </FieldLabel>
          <Input
            id={`${idPrefix}-producer-reading`}
            value={draft.producerReading ?? ""}
            maxLength={80}
            disabled={disabled}
            autoComplete="off"
            // 输入法组字期间先原样回写，组字结束再归一，避免把半截假名吃掉。
            onChange={(event) => {
              const native = event.nativeEvent
              // 输入法组字时 React 仍会派发变更事件，靠 isComposing 区分。
              const composing = "isComposing" in native && native.isComposing === true
              onChange({
                producerReading: composing
                  ? event.currentTarget.value || null
                  : normalizeProducerReading(event.currentTarget.value),
              })
            }}
            onBlur={(event) =>
              onChange({
                producerReading: normalizeProducerReading(
                  event.currentTarget.value
                ),
              })
            }
          />
          <FieldDescription>
            仅可使用日文假名与英文字母，用于按读音排序。
          </FieldDescription>
        </Field>
      ) : null}

      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-group-name`}>
          团体名称
          {draft.isGroupCard ? (
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        <Input
          id={`${idPrefix}-group-name`}
          value={draft.groupName ?? ""}
          maxLength={80}
          required={draft.isGroupCard}
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value
            onChange({ groupName: value ? value : null })
          }}
        />
        {/* 说明区里的勾选项：结构照抄「原创声明 / AI 声明」的复选框行。 */}
        <Field data-card-field="isGroupCard" orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-is-group`}
            checked={draft.isGroupCard === true}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ isGroupCard: checked === true })
            }
          />
          <label
            htmlFor={`${idPrefix}-is-group`}
            className="min-w-0 text-sm text-muted-foreground"
          >
            该名片为团体名片，任何人都可以自由领取。
          </label>
        </Field>
      </Field>

      {showMadeOn ? (
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-made-on-year`}>制作时间</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Select
              value={madeOn.year || CLEAR_DATE}
              disabled={disabled}
              onValueChange={(value) => {
                const year = String(value ?? CLEAR_DATE)
                onChange({
                  madeOn:
                    year === CLEAR_DATE
                      ? null
                      : joinMadeOn(year, madeOn.month, madeOn.day),
                })
              }}
            >
              <SelectTrigger
                id={`${idPrefix}-made-on-year`}
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
                onChange({
                  madeOn: joinMadeOn(
                    madeOn.year,
                    month === CLEAR_DATE ? "" : month,
                    keepsDay ? madeOn.day : ""
                  ),
                })
              }}
            >
              <SelectTrigger
                id={`${idPrefix}-made-on-month`}
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
                onChange({
                  madeOn: joinMadeOn(
                    madeOn.year,
                    madeOn.month,
                    day === CLEAR_DATE ? "" : day
                  ),
                })
              }}
            >
              <SelectTrigger
                id={`${idPrefix}-made-on-day`}
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
      ) : null}
    </>
  )
}
