import {
  NAMECARD_PRODUCTION_YEAR_MAX,
  NAMECARD_PRODUCTION_YEAR_MIN,
} from "@imsweb/contracts/fudaba/runtime"

const PRODUCTION_YEAR_MIN = NAMECARD_PRODUCTION_YEAR_MIN
/** 不能制作未来日期的名片，所以上限是今年（契约上限只是结构性兜底）。 */
const PRODUCTION_YEAR_MAX = Math.min(
  NAMECARD_PRODUCTION_YEAR_MAX,
  new Date().getFullYear()
)

export const PRODUCTION_YEARS = Array.from(
  { length: PRODUCTION_YEAR_MAX - PRODUCTION_YEAR_MIN + 1 },
  (_, index) => String(PRODUCTION_YEAR_MAX - index)
)

export const PRODUCTION_MONTHS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
)

/** 三个日期下拉都给了「-」，用户任何一级都能退回到「只填到这里」。 */
export const CLEAR_DATE = "-"

/** 只给出该年该月真实存在的日子，2 月与大小月都按实际天数截断。 */
export function productionDays(year: string, month: string): string[] {
  const monthNumber = Number(month)
  if (!year || !monthNumber) return []
  const total = new Date(Number(year), monthNumber, 0).getDate()
  return Array.from({ length: total }, (_, index) =>
    String(index + 1).padStart(2, "0")
  )
}

export interface MadeOnParts {
  year: string
  month: string
  day: string
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; every part is optional but the year. */
export function splitMadeOn(value: string | null): MadeOnParts {
  const [year = "", month = "", day = ""] = (value ?? "").split("-")
  return { year, month: year ? month : "", day: year && month ? day : "" }
}

export function joinMadeOn(
  year: string,
  month: string,
  day: string
): string | null {
  if (!year) return null
  if (!month) return year
  if (!day) return `${year}-${month}`
  return `${year}-${month}-${day}`
}
