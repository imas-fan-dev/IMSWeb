import { useEffect, useState } from "react"

import { getPublicFudabaSeries } from "~/lib/api"
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"

interface SeriesOption {
  code: string
  displayName: string
}

/**
 * 审核窗里的对照行用可读文字：企划写名称、担当角色写角色名，
 * 而不是把 `765as` 这类数据代号直接甩给审核员。
 */
export function useReviewLabels() {
  const [series, setSeries] = useState<SeriesOption[]>([])
  const { catalog } = useNamecardCharacterCatalog()

  useEffect(() => {
    let active = true
    getPublicFudabaSeries()
      .send()
      .then((result) => {
        if (active) setSeries(result.items)
      })
      .catch(() => {
        // 目录读取失败时退回代号，仍能看出改了什么。
      })
    return () => {
      active = false
    }
  }, [])

  const names = new Map(series.map((item) => [item.code, item.displayName]))
  const characters = new Map(
    (catalog?.characters ?? []).map((character) => [
      character.id,
      character.nameJa ?? character.nameCn,
    ])
  )

  return {
    seriesLabel: (code: string) => names.get(code) ?? code,
    seriesList: (codes: readonly string[]) =>
      codes.map((code) => names.get(code) ?? code).join("、"),
    characterList: (ids: readonly number[]) =>
      ids.map((id) => characters.get(id) ?? `#${id}`).join("、"),
  }
}

export interface ReviewRow {
  label: string
  /** 现在线上的值；`null` 表示这个字段本来就没有内容。 */
  live: string | null
  /** 这次提交后的值；与 `live` 相同表示没有改动。 */
  pending: string | null
}

function blank(value: string | null): boolean {
  return value === null || value.trim().length === 0
}

/** 用文字颜色区分删改：旧值红、新值绿，空白字段不拿「-」占位。 */
function RowValue({ row }: { row: ReviewRow }) {
  const live = blank(row.live) ? null : row.live
  const pending = blank(row.pending) ? null : row.pending
  if (live === pending) return <span>{live ?? ""}</span>
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {live ? <span className="text-destructive">{live}</span> : null}
      {live && pending ? <span aria-hidden="true">→</span> : null}
      {pending ? <span className="text-success">{pending}</span> : null}
    </span>
  )
}

/** 逐字段对照；两侧都空白的字段直接省略。 */
export function ReviewFieldRows({ rows }: { rows: readonly ReviewRow[] }) {
  const visible = rows.filter((row) => !blank(row.live) || !blank(row.pending))
  if (!visible.length) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        这次提交没有可以对照的文字字段。
      </p>
    )
  }
  return (
    <div className="rounded-lg border">
      {visible.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 border-b p-3 last:border-b-0 sm:grid-cols-[6rem_1fr]"
        >
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <div className="text-sm">
            <RowValue row={row} />
          </div>
        </div>
      ))}
    </div>
  )
}
