/**
 * 名片的时间展示：作者填的 `madeOn`（`YYYY` / `YYYY-MM` / `YYYY-MM-DD` 文本）与创建时间。
 *
 * 时区一律钉死 `Asia/Shanghai`，与名片墙/详情的既有格式化保持一致；不要再就地
 * `toLocaleString()`（属主编辑器那边就是这么写坏的）。
 */
/** `en-CA` 的短日期就是 `YYYY-MM-DD`。 */
const ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
})

/** 时刻只到分钟：交换记录不需要秒。 */
const CLOCK_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
})

/**
 * `madeOn` 允许只填年份或年月。统一按 `yyyy-mm-dd` 呈现，**没填的部分不补**：
 * `2025` / `2025-03` / `2025-03-02`；格式不对返回 null（由调用方回退创建时间）。
 */
export function madeOnLabel(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  if (day) return `${year}-${month}-${day}`
  if (month) return `${year}-${month}`
  return year ?? null
}

/** 回落用的创建时间：`YYYY-MM-DD`；解析不了时返回 null（宁可少一行也不显示 Invalid Date）。 */
export function namecardDateLabel(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : ISO_DATE.format(date)
}

/** 交换记录的时间：`YYYY-MM-DD HH:mm`，与名片日期同一时区口径。 */
export function namecardDateTimeLabel(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? null
    : `${ISO_DATE.format(date)} ${CLOCK_TIME.format(date)}`
}

/** 瓦片上的「制作时间」：优先 `madeOn`，缺失时回退创建时间。 */
export function cardTimeLabel(card: {
  madeOn: string | null
  createdAt: string
}): string | null {
  return madeOnLabel(card.madeOn) ?? namecardDateLabel(card.createdAt)
}
