import type { LiveEvent } from "~/lib/api"

export const LIVE_ARCHIVE_START_MONTH = "2020-08"
export const LIVE_PAGE_SIZE = 10

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function nextMonthKey(date: Date): string {
  return monthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1))
}

export function eventDate(event: LiveEvent): Date {
  return new Date(event.year, event.month - 1, event.day)
}

export function sortLiveEvents(events: LiveEvent[]): LiveEvent[] {
  return [...events].sort((a, b) => {
    const dateDifference = eventDate(a).getTime() - eventDate(b).getTime()
    return dateDifference || a.title.localeCompare(b.title, "ja")
  })
}

export function upcomingLiveEvents(
  events: LiveEvent[],
  now: Date
): LiveEvent[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 14)
  return sortLiveEvents(
    events.filter((event) => {
      const date = eventDate(event)
      return date >= start && date < end
    })
  )
}

export function eventsForMonth(
  events: LiveEvent[],
  selectedMonth: string
): LiveEvent[] {
  return sortLiveEvents(
    events.filter(
      (event) => `${event.year}-${pad(event.month)}` === selectedMonth
    )
  )
}

export function livePage(events: LiveEvent[], page: number): LiveEvent[] {
  const start = (page - 1) * LIVE_PAGE_SIZE
  return events.slice(start, start + LIVE_PAGE_SIZE)
}

export function livePageCount(events: LiveEvent[]): number {
  return Math.max(1, Math.ceil(events.length / LIVE_PAGE_SIZE))
}
