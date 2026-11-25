import { PlusIcon, XIcon } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import {
  NAMECARD_TAG_LIMIT,
  NAMECARD_TAG_MAX_LENGTH,
} from "@imsweb/contracts/namecards/runtime"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  isApiError,
  setNamecardCardTags,
  validateNamecardTags,
} from "~/lib/api"
import { cn } from "~/lib/utils"

import {
  normalizeTagText,
  tagComparisonKey,
  tagSuggestionRows,
  useTagSuggestions,
  type TagSuggestionRow,
} from "./use-tag-suggestions"

/**
 * 两个变体共用一套 chip 交互，差别只在「已保存的标签能不能改」与「有没有
 * 自己的保存按钮」：
 * - `form`：四个编辑窗口。所有 chip 都是草稿，可改可删；保存交给窗口 footer。
 * - `inline`：名片墙 / 详情窗。已保存的 chip 只读；`+` 出来的 chip 可改可删；
 *   有草稿时底部展开【保存】，直接写标签端点。
 */
export type NamecardTagEditorVariant = "form" | "inline"

export interface NamecardTagEditorProps {
  /** 已保存的标签（inline 变体里是只读的）。 */
  value: string[]
  /** 每次 chip 变化都会回调；inline 保存失败时提示，成功后才清掉草稿。 */
  onChange: (next: string[]) => void
  variant: NamecardTagEditorVariant
  /** 没有 `onSave` 时，inline 变体用它直接调标签端点。 */
  cardId?: string
  /** 由调用方接管保存（例如窗口整体提交）；不传则用 `cardId` 调端点。 */
  onSave?: (tags: string[]) => void | Promise<void>
  saving?: boolean
  disabled?: boolean
  className?: string
  /**
   * inline 变体里已保存 chip 的点击回调：名片墙用它把标签追加到筛选。
   * 不传时已保存 chip 保持纯展示（默认行为）。
   */
  onValueClick?: (tag: string) => void
}

interface DraftChip {
  key: string
  text: string
}

type ChipTarget =
  | { kind: "new" }
  | { kind: "value"; index: number }
  | { kind: "draft"; key: string }

interface EditingState {
  target: ChipTarget
  text: string
}

let chipSequence = 0
function nextChipKey() {
  chipSequence += 1
  return `tag-chip-${chipSequence}`
}

/**
 * 提交前的收尾：归一去重、截到上限。服务端还会再做一次，这里保证界面上不会
 * 出现「看似两个、实际一个」的 chip。
 */
export function uniqueTagList(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const tag of tags) {
    const text = normalizeTagText(tag).slice(0, NAMECARD_TAG_MAX_LENGTH)
    if (!text) continue
    const key = tagComparisonKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(text)
  }
  return next
}

/**
 * 名片标签编辑器：点【+】在末尾插入一个随文字变宽的输入 chip，回车或失焦把
 * 它提交成草稿 chip；点草稿的文字重新进入输入态，点【x】整条删除。候选下拉
 * 锚在输入 chip 下方，第一行永远是输入的原文，其后只排预设标签。
 */
export function NamecardTagEditor({
  value,
  onChange,
  variant,
  cardId,
  onSave,
  saving = false,
  disabled = false,
  className,
  onValueClick,
}: NamecardTagEditorProps) {
  const [draft, setDraft] = useState<DraftChip[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [internalSaving, setInternalSaving] = useState(false)
  const hintId = useId()

  const inline = variant === "inline"
  const busy = saving || internalSaving
  const totalCount = value.length + draft.length
  const limitReached = totalCount >= NAMECARD_TAG_LIMIT
  const dirty = inline && draft.length > 0
  const takenTags = [...value, ...draft.map((chip) => chip.text)]

  function hasTag(text: string, except?: ChipTarget) {
    const key = tagComparisonKey(text)
    const inValue = value.some(
      (tag, index) =>
        !(except?.kind === "value" && except.index === index) &&
        tagComparisonKey(tag) === key
    )
    if (inValue) return true
    return draft.some(
      (chip) => !(except?.kind === "draft" && except.key === chip.key) && tagComparisonKey(chip.text) === key
    )
  }

  function startNewChip() {
    if (disabled || busy || limitReached || editing) return
    setEditing({ target: { kind: "new" }, text: "" })
  }

  function startEditingValue(index: number) {
    if (disabled || busy || editing) return
    setEditing({ target: { kind: "value", index }, text: value[index] ?? "" })
  }

  function startEditingDraft(key: string) {
    if (disabled || busy || editing) return
    const chip = draft.find((entry) => entry.key === key)
    if (!chip) return
    setEditing({ target: { kind: "draft", key }, text: chip.text })
  }

  function removeValueChip(index: number) {
    if (disabled || busy) return
    onChange(value.filter((_, current) => current !== index))
  }

  function removeDraftChip(key: string) {
    if (disabled || busy) return
    setDraft((current) => current.filter((chip) => chip.key !== key))
    setEditing((current) =>
      current?.target.kind === "draft" && current.target.key === key
        ? null
        : current
    )
  }

  function closeWithoutCommit() {
    setEditing(null)
  }

  /** 回车 / 失焦 / 点候选都走这里；空白文本等价于删除该 chip。 */
  /** 屏蔽词自检；网络失败时不拦（保存时服务端仍会校验）。 */
  async function isBlockedTag(name: string): Promise<boolean> {
    try {
      const { blocked } = await validateNamecardTags([name]).send()
      return blocked.length > 0
    } catch {
      return false
    }
  }

  async function commitEditing(text: string) {
    const target = editing?.target
    setEditing(null)
    if (!target) return
    const nextText = normalizeTagText(text).slice(0, NAMECARD_TAG_MAX_LENGTH)
    if (nextText && (await isBlockedTag(nextText))) {
      // 命中屏蔽词：提示并丢弃这次输入（新 chip 不加入，已有 chip 保留原文）。
      toast.error(`标签「${nextText}」包含屏蔽词，无法添加。`)
      return
    }

    if (target.kind === "new") {
      if (!nextText) {
        return
      }
      if (limitReached || hasTag(nextText)) return
      if (inline) {
        setDraft((current) => [...current, { key: nextChipKey(), text: nextText }])
      } else {
        onChange([...value, nextText])
      }
      return
    }

    if (target.kind === "value") {
      const next = value.slice()
      if (!nextText) {
        next.splice(target.index, 1)
      } else if (hasTag(nextText, target)) {
        // 与已有 chip 重名：旧的这条被并入，重名提交不再留下第二个 chip。
        next.splice(target.index, 1)
      } else {
        next[target.index] = nextText
      }
      onChange(next)
      return
    }

    if (!nextText || hasTag(nextText, target)) {
      setDraft((current) => current.filter((chip) => chip.key !== target.key))
      return
    }
    setDraft((current) =>
      current.map((chip) =>
        chip.key === target.key ? { ...chip, text: nextText } : chip
      )
    )
  }

  async function saveDrafts() {
    if (!inline || !dirty || disabled || busy) return
    const combined = uniqueTagList([...value, ...draft.map((chip) => chip.text)])
    setInternalSaving(true)
    try {
      let saved = combined
      if (onSave) {
        await onSave(combined)
      } else if (cardId) {
        const response = await setNamecardCardTags(cardId, combined).send()
        saved = uniqueTagList(response.tags.map((tag) => tag.name))
      }
      onChange(saved)
      setDraft([])
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "标签保存失败，请重试")
    } finally {
      setInternalSaving(false)
    }
  }

  function cancelDrafts() {
    if (busy) return
    setEditing(null)
    setDraft([])
  }

  // 名片墙/详情的内联编辑器不展示数量说明（用户 2026-11-20 要求）。
  const hintVisible = !inline

  return (
    <div
      data-namecard-tag-editor={variant}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <div
        role="group"
        aria-label="名片标签"
        aria-describedby={hintVisible ? hintId : undefined}
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {value.map((text, index) => {
          const editingThis =
            editing?.target.kind === "value" && editing.target.index === index
          const editor = (
            <TagChipEditor
              key={`value-${index}`}
              text={editing?.text ?? ""}
              label={`编辑标签 ${text}`}
              disabled={disabled || busy}
              takenTags={takenTags}
              onChangeText={(next) =>
                setEditing({ target: { kind: "value", index }, text: next })
              }
              onCommit={commitEditing}
              onCancel={closeWithoutCommit}
              hintId={hintId}
            />
          )
          if (editingThis) return editor
          return inline ? (
            <Badge
            key={`value-${index}`}
            variant="secondary"
            className="max-w-40 rounded-full"
          >
              {onValueClick ? (
                <button
                  type="button"
                  className="max-w-36 truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  aria-label={`按标签 ${text} 筛选`}
                  title={`按「${text}」筛选`}
                  onClick={() => onValueClick(text)}
                >
                  {text}
                </button>
              ) : (
                <span className="truncate">{text}</span>
              )}
            </Badge>
          ) : (
            <EditableTagChip
              key={`value-${index}`}
              text={text}
              disabled={disabled || busy}
              onEdit={() => startEditingValue(index)}
              onRemove={() => removeValueChip(index)}
            />
          )
        })}

        {draft.map((chip) => {
          const editingThis =
            editing?.target.kind === "draft" && editing.target.key === chip.key
          if (editingThis) {
            return (
              <TagChipEditor
                key={chip.key}
                text={editing?.text ?? ""}
                label={`编辑标签 ${chip.text}`}
                disabled={disabled || busy}
                takenTags={takenTags}
                onChangeText={(next) =>
                  setEditing({ target: { kind: "draft", key: chip.key }, text: next })
                }
                onCommit={commitEditing}
                onCancel={closeWithoutCommit}
                hintId={hintId}
              />
            )
          }
          return (
            <EditableTagChip
              key={chip.key}
              text={chip.text}
              disabled={disabled || busy}
              onEdit={() => startEditingDraft(chip.key)}
              onRemove={() => removeDraftChip(chip.key)}
            />
          )
        })}

        {editing?.target.kind === "new" ? (
          <TagChipEditor
            text={editing.text}
            label="新标签"
            disabled={disabled || busy}
            takenTags={takenTags}
            onChangeText={(next) =>
              setEditing({ target: { kind: "new" }, text: next })
            }
            onCommit={commitEditing}
            onCancel={closeWithoutCommit}
            hintId={hintId}
          />
        ) : null}

        {!editing && !limitReached ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-5 gap-1 rounded-full px-2 py-0 text-xs text-muted-foreground"
            aria-label="添加标签"
            title="添加标签"
            disabled={disabled || busy}
            onClick={startNewChip}
          >
            <PlusIcon aria-hidden="true" className="size-3" />
            {value.length === 0 ? "添加标签" : null}
          </Button>
        ) : null}
      </div>

      {hintVisible ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {limitReached
            ? `最多添加 ${NAMECARD_TAG_LIMIT} 个标签，每个不超过 ${NAMECARD_TAG_MAX_LENGTH} 字`
            : `最多 ${NAMECARD_TAG_LIMIT} 个标签，每个不超过 ${NAMECARD_TAG_MAX_LENGTH} 字`}
        </p>
      ) : null}

      {inline ? (
        <div
          // 高度过渡负责「展开/收起」，reduced-motion 下直接切换；不 dirty 时
          // 整个保存行从可访问树与 Tab 顺序里移除（与 card-bulk-actions 一致）。
          aria-hidden={!dirty || undefined}
          inert={!dirty}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-emphasized motion-reduce:transition-none",
            dirty ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="bg-background"
                disabled={disabled || busy}
                onClick={cancelDrafts}
              >
                取消
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={disabled || busy}
                onClick={saveDrafts}
              >
                {busy ? (
                  <span
                    aria-hidden="true"
                    className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                  />
                ) : null}
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 草稿态 chip：文字部分点开编辑，尾部【x】整条删除。 */
function EditableTagChip({
  text,
  disabled,
  onEdit,
  onRemove,
}: {
  text: string
  disabled: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <Badge
      variant="outline"
      className="max-w-44 gap-1 rounded-full pr-1"
    >
      <button
        type="button"
        className="max-w-36 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        aria-label={`编辑标签 ${text}`}
        title={text}
        disabled={disabled}
        onClick={onEdit}
      >
        {text}
      </button>
      <button
        type="button"
        className="rounded-full p-0.5 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`删除标签 ${text}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" className="size-3" />
      </button>
    </Badge>
  )
}

/**
 * 输入态 chip：宽度由一段不可见的同字体文字撑开（内联 grid 叠放），所以每敲
 * 一个字 chip 就跟着变宽。候选下拉锚在这个 chip 的正下方。
 */
function TagChipEditor({
  text,
  label,
  disabled,
  takenTags,
  onChangeText,
  onCommit,
  onCancel,
  hintId,
}: {
  text: string
  label: string
  disabled: boolean
  takenTags: readonly string[]
  onChangeText: (text: string) => void
  onCommit: (text: string) => void
  onCancel: () => void
  hintId?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const composing = useRef(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const { presets } = useTagSuggestions(text)
  const rows = tagSuggestionRows(text, presets, takenTags)
  const listOpen = !dismissed && rows.length > 0
  const activeRow = rows[Math.min(activeIndex, Math.max(rows.length - 1, 0))]

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }, [])

  function pick(row: TagSuggestionRow) {
    onCommit(row.kind === "input" ? row.text : row.preset.name)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing) return
    if (event.key === "ArrowDown" && rows.length > 0) {
      event.preventDefault()
      setDismissed(false)
      setActiveIndex((current) => Math.min(current + 1, rows.length - 1))
      return
    }
    if (event.key === "ArrowUp" && rows.length > 0) {
      event.preventDefault()
      setDismissed(false)
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (listOpen && activeRow) pick(activeRow)
      else onCommit(text)
      return
    }
    if (event.key === "Escape") {
      event.stopPropagation()
      if (listOpen) setDismissed(true)
      else onCancel()
    }
  }

  // 候选挂在 body 上：瓦片有 overflow-hidden，绝对定位会被裁切；再按视口空间选择上/下。
  // 定位直接写 DOM 样式，避免 effect 内同步 setState 触发额外渲染。
  useLayoutEffect(() => {
    if (!listOpen) return
    const update = () => {
      const anchor = anchorRef.current
      const menu = menuRef.current
      if (!anchor || !menu) return
      const rect = anchor.getBoundingClientRect()
      const menuHeight = Math.min(224, menu.scrollHeight || 224)
      const below = rect.bottom + 4
      const top =
        below + menuHeight > window.innerHeight &&
        rect.top - 4 - menuHeight > 0
          ? rect.top - 4 - menuHeight
          : below
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - 216)
      )
      menu.style.left = `${left}px`
      menu.style.top = `${top}px`
      menu.style.visibility = "visible"
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [listOpen])

  return (
    <div ref={anchorRef} className="relative inline-flex max-w-full">
      <span
        className={cn(
          // 与 chips 完全同款：outline Badge 的边框/底色/内边距，不加聚焦环。
          "inline-flex h-5 items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs",
          disabled && "opacity-50"
        )}
      >
        <span className="inline-grid min-w-16.5">
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 whitespace-pre"
          >
            {text || "\u00a0"}
          </span>
          <input
            ref={inputRef}
            value={text}
            maxLength={NAMECARD_TAG_MAX_LENGTH}
            aria-label={label}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              listOpen && activeRow ? `${listId}-${activeIndex}` : undefined
            }
            aria-describedby={hintId}
            disabled={disabled}
            className="col-start-1 row-start-1 w-0 min-w-full border-0 bg-transparent p-0 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => {
              onChangeText(event.currentTarget.value)
              setActiveIndex(0)
              setDismissed(false)
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (composing.current) return
              onCommit(text)
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
          />
        </span>
      </span>

      {listOpen
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label="标签候选"
              className="invisible fixed z-50 max-h-56 w-52 overflow-y-auto rounded-lg border bg-popover p-1 text-xs text-popover-foreground shadow-md"
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
                // 鼠标按下不抢焦点，否则输入框先失焦提交，候选就点不到了。
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(row)}
              >
                {row.kind === "input" ? (
                  <>
                    <PlusIcon aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{row.text}</span>
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
        </ul>,
        document.body
      )
        : null}
    </div>
  )
}
