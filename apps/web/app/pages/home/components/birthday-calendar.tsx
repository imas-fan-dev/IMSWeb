import {
  CakeSliceIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { getBirthdaysOn } from "../birthday-data"

const weekdays = ["一", "二", "三", "四", "五", "六", "日"]

type VisibleMonth = {
  year: number
  month: number
}

type BirthdayCalendarProps = {
  today?: Date
}

function calendarCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const mondayOffset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month, 0).getDate()

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - mondayOffset + 1
    return day >= 1 && day <= daysInMonth ? day : null
  })
}

function shiftMonth(current: VisibleMonth, offset: number): VisibleMonth {
  const shifted = new Date(current.year, current.month - 1 + offset, 1)
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 }
}

export function BirthdayCalendar({
  today = new Date(),
}: BirthdayCalendarProps) {
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(() => ({
    year: todayYear,
    month: todayMonth,
  }))
  const [selectedDay, setSelectedDay] = useState<number | null>(todayDay)
  const cells = useMemo(
    () => calendarCells(visibleMonth.year, visibleMonth.month),
    [visibleMonth.month, visibleMonth.year]
  )
  const selectedBirthdays = selectedDay
    ? getBirthdaysOn(visibleMonth.month, selectedDay)
    : []

  function navigateMonths(offset: number) {
    setVisibleMonth((current) => shiftMonth(current, offset))
    setSelectedDay(null)
  }

  function navigateYears(offset: number) {
    setVisibleMonth((current) => ({
      ...current,
      year: current.year + offset,
    }))
    setSelectedDay(null)
  }

  function returnToToday() {
    setVisibleMonth({ year: todayYear, month: todayMonth })
    setSelectedDay(todayDay)
  }

  return (
    <section
      className="border-y bg-muted/20"
      aria-labelledby="birthday-heading"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary">BIRTHDAYS</p>
            <h2 id="birthday-heading" className="mt-2 text-2xl font-semibold">
              偶像生日日历
            </h2>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            已收录 347 位偶像
          </p>
        </div>

        <div className="grid overflow-hidden rounded-md border bg-card lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p
                className="text-lg font-semibold"
                aria-live="polite"
                data-testid="calendar-month"
              >
                {visibleMonth.year} 年 {visibleMonth.month} 月
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => navigateYears(-1)}
                  aria-label="上一年"
                  title="上一年"
                >
                  <ChevronsLeftIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonths(-1)}
                  aria-label="上个月"
                  title="上个月"
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" onClick={returnToToday}>
                  今日
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => navigateMonths(1)}
                  aria-label="下个月"
                  title="下个月"
                >
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => navigateYears(1)}
                  aria-label="下一年"
                  title="下一年"
                >
                  <ChevronsRightIcon aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-7 gap-1.5 sm:gap-2">
              {weekdays.map((weekday) => (
                <span
                  key={weekday}
                  className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {weekday}
                </span>
              ))}
              {cells.map((day, index) => {
                if (!day) {
                  return (
                    <span
                      key={`empty-${index}`}
                      className="aspect-square rounded-md bg-muted/25"
                      aria-hidden="true"
                    />
                  )
                }

                const birthdayCount = getBirthdaysOn(
                  visibleMonth.month,
                  day
                ).length
                const isToday =
                  visibleMonth.year === todayYear &&
                  visibleMonth.month === todayMonth &&
                  day === todayDay
                const isSelected = day === selectedDay
                const birthdayLabel = birthdayCount
                  ? `，${birthdayCount} 位偶像生日`
                  : ""

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    aria-label={`${visibleMonth.month} 月 ${day} 日${birthdayLabel}`}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "relative flex aspect-square min-w-0 items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:border-primary/55 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      isSelected &&
                        "border-primary bg-accent text-accent-foreground",
                      isToday && "ring-1 ring-primary/55"
                    )}
                  >
                    <span>{day}</span>
                    {birthdayCount ? (
                      <CakeSliceIcon
                        className="absolute right-1 bottom-1 size-3 text-primary sm:right-1.5 sm:bottom-1.5"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t p-5 lg:border-t-0 lg:border-l lg:p-6">
            <div className="flex items-center gap-2">
              <CakeSliceIcon
                className="size-5 text-primary"
                aria-hidden="true"
              />
              <h3 className="font-semibold">当天生日</h3>
            </div>
            <div className="mt-5" aria-live="polite">
              {selectedDay ? (
                <p className="text-sm text-muted-foreground">
                  {visibleMonth.year} 年 {visibleMonth.month} 月 {selectedDay}{" "}
                  日
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  选择日历中的日期查看生日名单。
                </p>
              )}

              {selectedDay && selectedBirthdays.length ? (
                <ul className="mt-4 divide-y">
                  {selectedBirthdays.map((idol) => (
                    <li
                      key={`${idol.agency}-${idol.name}`}
                      className="flex items-center gap-3 py-3 first:pt-0"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-2 ring-background"
                        style={{ backgroundColor: idol.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {idol.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {idol.agency}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : selectedDay ? (
                <div className="mt-8 text-center text-sm text-muted-foreground">
                  <CalendarDaysIcon
                    className="mx-auto mb-3 size-7"
                    aria-hidden="true"
                  />
                  这一天暂无收录的偶像生日。
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
