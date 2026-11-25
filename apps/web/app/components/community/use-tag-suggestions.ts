import { useEffect, useState } from "react"

import {
  getNamecardTagSuggestions,
  type NamecardTagSuggestionPreset,
} from "~/lib/api"
import { useDebouncedValue } from "~/lib/use-debounced-value"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_LIMIT = 8

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g
const WHITESPACE = /\s+/g

/**
 * 标签文本的显示形态：NFKC 归一（全角转半角）、去零宽字符、空白折叠成一个
 * 空格。服务端在归一之后再做小写比较，这里保留大小写用于显示。
 */
export function normalizeTagText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(WHITESPACE, " ")
    .trim()
}

/** 去重比较用的键：归一之后再加小写，与服务端的唯一性口径一致。 */
export function tagComparisonKey(value: string): string {
  return normalizeTagText(value).toLowerCase()
}

export type TagSuggestionRow =
  | { kind: "input"; text: string }
  | {
      kind: "preset"
      preset: NamecardTagSuggestionPreset
      /** 命中来自别名时，把那个别名放在名称右侧说明来源。 */
      alias: string | null
    }

interface RankedPreset {
  row: Extract<TagSuggestionRow, { kind: "preset" }>
  rank: number
}

/**
 * 候选行的排列：输入的原文固定第一行（用户随时可以按原文建标签），其后是
 * 预设标签 —— 与原文完全相等的排最前（选中它会把写法规范成预设名），其次是
 * 名称/别名前缀命中，最后才是只有子串命中的。服务端已按前缀优先排序，这里
 * 再排一次是为了让顺序不依赖响应的顺序（管理台改名/别名后仍稳定）。
 *
 * `taken` 是已经加过的标签，命中的预设不再出现在候选里，避免重复添加。
 */
export function tagSuggestionRows(
  input: string,
  presets: readonly NamecardTagSuggestionPreset[],
  taken: readonly string[] = []
): TagSuggestionRow[] {
  const text = normalizeTagText(input)
  if (!text) return []
  const inputKey = text.toLowerCase()
  const takenKeys = new Set(taken.map(tagComparisonKey))
  const ranked: RankedPreset[] = []

  for (const preset of presets) {
    if (takenKeys.has(tagComparisonKey(preset.name))) continue
    let rank = -1
    let alias: string | null = null
    let aliasRank = -1
    const names = [preset.name, ...preset.aliases]
    for (const name of names) {
      const key = tagComparisonKey(name)
      const matched =
        key === inputKey ? 2 : key.startsWith(inputKey) ? 1 : key.includes(inputKey) ? 0 : -1
      if (matched < 0) continue
      rank = Math.max(rank, matched)
      if (name !== preset.name && matched >= aliasRank) {
        aliasRank = matched
        alias = name
      }
    }
    if (rank < 0) continue
    ranked.push({
      row: {
        kind: "preset",
        preset,
        // 只有别名命中到与整条预设同等的优先级时才需要展示别名。
        alias: aliasRank === rank ? alias : null,
      },
      rank,
    })
  }

  // Array.prototype.sort 是稳定排序，同组内保持服务端给的顺序。
  ranked.sort((left, right) => right.rank - left.rank)
  return [{ kind: "input", text }, ...ranked.map((entry) => entry.row)]
}

/**
 * 标签候选：输入停顿 300ms 之后请求 suggest 接口，只回预设标签。空输入不发
 * 请求；响应带着它对应的查询词一起存，切换查询词后旧响应不会再显示出来
 * （后到的旧请求也不会覆盖新结果）。
 */
export function useTagSuggestions(query: string, limit = SUGGEST_LIMIT) {
  const trimmed = normalizeTagText(query)
  const debounced = useDebouncedValue(trimmed, SUGGEST_DEBOUNCE_MS)
  const [result, setResult] = useState<{
    query: string
    presets: NamecardTagSuggestionPreset[]
  } | null>(null)

  useEffect(() => {
    if (!debounced) return
    let active = true
    getNamecardTagSuggestions(debounced, limit)
      .send()
      .then(
        (response) => {
          if (active) setResult({ query: debounced, presets: response.presets })
        },
        () => {
          // 候选只是辅助：请求失败时按「没有候选」处理，输入原文照常可用。
          if (active) setResult({ query: debounced, presets: [] })
        }
      )
    return () => {
      active = false
    }
  }, [debounced, limit])

  const current = debounced && result?.query === debounced ? result.presets : []
  return {
    presets: current as NamecardTagSuggestionPreset[],
    loading: Boolean(debounced) && result?.query !== debounced,
  }
}
