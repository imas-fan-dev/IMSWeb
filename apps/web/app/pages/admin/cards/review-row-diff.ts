/**
 * 审核窗的对照行是同一个结构：标签 + 线上值 + 提交后的值（含列表逐项差异）。
 *
 * 投稿审核（13 项）、认领审核（6 项）、补充审核（按提交里出现的键）各自决定
 * 「比较哪些字段、值怎么读」，但拼行的规则只有这一份：没改动就不标色，
 * 列表字段只把真正增删的项挑出来。
 */
export interface DiffItems {
  kept: string[]
  removed: string[]
  added: string[]
}

export interface DiffRow {
  label: string
  /** 线上值；`null` 表示这个字段本来就没有内容。 */
  live: string | null
  /** 提交后的值；`null` 表示这一侧没有提交或没有改动。 */
  pending: string | null
  /** 列表字段的逐项差异；文本字段没有。 */
  items?: DiffItems
}

/** 两侧都有的项保持中性，只有增删标色。 */
export function diffItems(
  before: readonly string[],
  after: readonly string[]
): DiffItems {
  const next = new Set(after)
  const previous = new Set(before)
  return {
    kept: before.filter((item) => next.has(item)),
    removed: before.filter((item) => !next.has(item)),
    added: after.filter((item) => !previous.has(item)),
  }
}

export function textRow(
  label: string,
  live: string | null,
  pending: string | null,
  /** 这一侧是否提供了新值；没有提供就只显示线上值。 */
  submitted = true
): DiffRow {
  return {
    label,
    live,
    pending: submitted && live !== pending ? pending : null,
  }
}

export function listRow(
  label: string,
  before: readonly string[],
  after: readonly string[],
  render: (values: readonly string[]) => string,
  submitted = true
): DiffRow {
  const items = diffItems(before, after)
  return {
    label,
    live: render(before),
    pending:
      submitted && (items.removed.length > 0 || items.added.length > 0)
        ? render(after)
        : null,
    items,
  }
}
