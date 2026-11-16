/**
 * 名片的时间展示：作者填的 `madeOn`（`YYYY` / `YYYY-MM` / `YYYY-MM-DD` 文本）与创建时间。
 *
 * 时区一律钉死 `Asia/Shanghai`，与名片墙/详情的既有格式化保持一致；不要再就地
 * `toLocaleString()`（属主编辑器那边就是这么写坏的）。
 */
const DATE_ONLY = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
})

/** `en-CA` 的短日期就是 `YYYY-MM-DD`。 */
const ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
})

/** `madeOn` 允许只填年份或年月；缺失时返回 null，由调用方回退到创建时间。 */
export function madeOnLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const [year, month, day] = value.split("-")
  if (!year) return null
  if (!month) return `${year} 年`
  if (!day) return `${year} 年 ${Number(month)} 月`
  const parsed = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(parsed.valueOf())
    ? `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
    : DATE_ONLY.format(parsed)
}

/** 回落用的创建时间：`YYYY-MM-DD`；解析不了时返回 null（宁可少一行也不显示 Invalid Date）。 */
export function namecardDateLabel(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : ISO_DATE.format(date)
}

/** 瓦片上的「制作时间」：优先 `madeOn`，缺失时回退创建时间。 */
export function cardTimeLabel(card: {
  madeOn: string | null
  createdAt: string
}): string | null {
  return madeOnLabel(card.madeOn) ?? namecardDateLabel(card.createdAt)
}
