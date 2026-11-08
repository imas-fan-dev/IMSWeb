import type { CatalogBirthdays } from "~/lib/api"

export type BirthdayRecord = CatalogBirthdays["items"][number]

export function birthdayStoryHref(birthday: BirthdayRecord) {
  if (!birthday.story) return null
  return `/story?agency=${encodeURIComponent(birthday.story.agency)}&idol=${encodeURIComponent(birthday.story.idol)}`
}

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
