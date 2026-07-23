import birthdaySource from "./idol-birthdays.json"

// Migrated from apps/legacy/public/assets/json/idol_birthday.json.
export type BirthdayRecord = {
  name: string
  birthday: string
  color: string
  agency: string
  month: number
  day: number
}

type BirthdaySourceRecord = Omit<BirthdayRecord, "month" | "day">

const birthdayPattern = /^(\d{2})-(\d{2})$/
const colorPattern = /^#[0-9a-f]{6}$/i

function normalizeRecord(record: BirthdaySourceRecord): BirthdayRecord | null {
  const match = birthdayPattern.exec(record.birthday)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return {
    ...record,
    color: colorPattern.test(record.color) ? record.color : "#e684a8",
    month,
    day,
  }
}

export const birthdays = (birthdaySource as BirthdaySourceRecord[]).flatMap(
  (record) => {
    const normalized = normalizeRecord(record)
    return normalized ? [normalized] : []
  }
)

const birthdaysByDate = new Map<string, BirthdayRecord[]>()

for (const birthday of birthdays) {
  const key = `${birthday.month}-${birthday.day}`
  const records = birthdaysByDate.get(key)
  if (records) records.push(birthday)
  else birthdaysByDate.set(key, [birthday])
}

export function getBirthdaysOn(month: number, day: number) {
  return birthdaysByDate.get(`${month}-${day}`) ?? []
}
