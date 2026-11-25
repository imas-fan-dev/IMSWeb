import { PlusIcon, XIcon } from "lucide-react"
import { useId, useRef, useState } from "react"

import {
  NAMECARD_TAG_FILTER_LIMIT,
  NAMECARD_TAG_MAX_LENGTH,
} from "@imsweb/contracts/namecards/runtime"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

import {
  normalizeTagText,
  tagComparisonKey,
  tagSuggestionRows,
  useTagSuggestions,
  type TagSuggestionRow,
} from "../use-tag-suggestions"
import { useFilterPopover } from "./use-filter-popover"

/**
 * 名片墙的标签筛选：多选 + 自由输入。候选只有预设标签（名称/别名命中），
 * 首位固定是输入的原文 —— 自由标签不进候选，但服务端仍按子串匹配它们。
 */
export function TagFilterSelect({
  id,
  value,
  disabled = false,
  onChange,
}: {
  id: string
  /** 已选筛选词，词之间 OR。 */
  value: readonly string[]
  disabled?: boolean
  onChange: (tags: string[]) => void
}) {
  const listId = useId()
  const inputId = `${id}-input`
  const labelId = `${id}-label`
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const composing = useRef(false)
  const { open, setOpen, rootRef, rootProps } = useFilterPopover()
  const { presets } = useTagSuggestions(query)
  const rows = tagSuggestionRows(query, presets, value)
  const activeRow = rows[Math.min(activeIndex, Math.max(rows.length - 1, 0))]
  const reachedLimit = value.length >= NAMECARD_TAG_FILTER_LIMIT
  const listOpen = open && rows.length > 0 && !reachedLimit

  function commit(text: string) {
    const next = normalizeTagText(text).slice(0, NAMECARD_TAG_MAX_LENGTH)
    if (!next) return
    const key = tagComparisonKey(next)
    if (
      value.some((tag) => tagComparisonKey(tag) === key) ||
      value.length >= NAMECARD_TAG_FILTER_LIMIT
    ) {
      setQuery("")
      return
    }
    onChange([...value, next])
    setQuery("")
    setActiveIndex(0)
  }

  function pick(row: TagSuggestionRow) {
    commit(row.kind === "input" ? row.text : row.preset.name)
  }

  function remove(tag: string) {
    const key = tagComparisonKey(tag)
    onChange(value.filter((current) => tagComparisonKey(current) !== key))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing) return
    if (event.key === "ArrowDown" && listOpen) {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, rows.length - 1))
      return
    }
    if (event.key === "ArrowUp" && listOpen) {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (listOpen && activeRow) pick(activeRow)
      else commit(query)
      return
    }
    if (event.key === "Escape" && query) {
      // 第一次 Esc 先收回输入原文；浮层本身由 useFilterPopover 收起。
      event.stopPropagation()
      setQuery("")
    }
  }

  return (
    <Field id={id} data-disabled={disabled || undefined}>
      <FieldLabel id={labelId} htmlFor={inputId}>
        标签
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({value.length}/{NAMECARD_TAG_FILTER_LIMIT})
        </span>
      </FieldLabel>
      <div ref={rootRef} className="relative" {...rootProps}>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-0.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          aria-labelledby={labelId}
        >
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="max-w-full gap-0.5 rounded-full pr-0.5"
            >
              <span className="truncate">{tag}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-4"
                disabled={disabled}
                aria-label={`移除标签筛选 ${tag}`}
                title="移除"
                onClick={() => remove(tag)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </Badge>
          ))}

          <div className="relative min-w-32 flex-1 md:min-w-48">
            <Input
              id={inputId}
              type="text"
              role="combobox"
              aria-label="标签筛选"
              aria-autocomplete="list"
              aria-expanded={listOpen}
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={
                listOpen && activeRow ? `${listId}-${activeIndex}` : undefined
              }
              value={query}
              placeholder={
                reachedLimit ? "最多同时筛选 5 个标签" : "输入或选择标签"
              }
              disabled={disabled || reachedLimit}
              className="h-7 border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setActiveIndex(0)
                setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
            />
          </div>

          {value.length > 0 || query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground"
              disabled={disabled}
              aria-label="清空标签筛选"
              title="清空"
              onClick={() => {
                setQuery("")
                onChange([])
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {listOpen ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="标签候选"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-xs text-popover-foreground shadow-lg"
          >
            {rows.map((row, index) => (
              <li
                key={row.kind === "input" ? "input" : `preset-${row.preset.id}`}
                className="list-none"
              >
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left outline-none",
                    index === activeIndex && "bg-muted"
                  )}
                  // 鼠标按下不抢焦点，否则输入框先失焦收起候选。
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(row)}
                >
                  {row.kind === "input" ? (
                    <>
                      <PlusIcon aria-hidden="true" className="size-3 shrink-0" />
                      <span className="truncate">{row.text}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        作为筛选词
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="truncate">{row.preset.name}</span>
                      {row.alias ? (
                        <span className="truncate text-muted-foreground">
                          {row.alias}
                        </span>
                      ) : null}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  )
}
