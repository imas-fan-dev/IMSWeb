import type { CatalogBirthdays } from "~/lib/api"

export type BirthdayRecord = CatalogBirthdays["items"][number]

export function indexBirthdays(items: BirthdayRecord[]) {
  const byDate = new Map<string, BirthdayRecord[]>()
  for (const item of items) {
    const key = `${item.month}-${item.day}`
    const records = byDate.get(key)
    if (records) records.push(item)
    else byDate.set(key, [item])
  }
  return (month: number, day: number) => byDate.get(`${month}-${day}`) ?? []
}
