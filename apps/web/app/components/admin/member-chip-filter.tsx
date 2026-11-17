import { useMemo, useState } from "react"
import { XIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import type { NamecardCharacterCatalogEntry } from "~/lib/api"
import { cn } from "~/lib/utils"

/** One picked character: the id drives the query, the name renders the chip. */
export interface MemberChip {
  id: number
  nameCn: string
}

const SUGGESTION_LIMIT = 8

/**
 * Multi-member filter for the unit list. The picked characters stay inside the
 * field as chips so the whole selection stays visible, every chip can be dropped
 * on its own, and the free text only types ahead to the next character.
 */
export function MemberChipFilter({
  id,
  selected,
  characters,
  disabled,
  onChange,
}: {
  id: string
  selected: MemberChip[]
  characters: NamecardCharacterCatalogEntry[]
  disabled: boolean
  onChange: (ids: number[]) => void
}) {
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState(false)

  const selectedIds = useMemo(
    () => new Set(selected.map((member) => member.id)),
    [selected]
  )

  const suggestions = useMemo(() => {
    const query = draft.trim().toLocaleLowerCase("zh-CN")
    if (query === "") return []
    return characters
      .filter((entry) => !selectedIds.has(entry.id))
      .filter((entry) =>
        [entry.nameCn, entry.nameJa, entry.nameEn, entry.aliases].some(
          (field) =>
            field !== null && field.toLocaleLowerCase("zh-CN").includes(query)
        )
      )
      .slice(0, SUGGESTION_LIMIT)
  }, [characters, draft, selectedIds])

  function addMember(member: MemberChip) {
    if (selectedIds.has(member.id)) return
    onChange([...selected.map((current) => current.id), member.id])
    setDraft("")
  }

  function removeMember(memberId: number) {
    onChange(
      selected.map((current) => current.id).filter((current) => current !== memberId)
    )
  }

  return (
    <div className="relative min-w-0">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1",
          open && "border-ring ring-3 ring-ring/50 ring-inset",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {selected.map((member) => (
          <Badge key={member.id} variant="secondary" className="gap-1 pr-1">
            {member.nameCn}
            <button
              type="button"
              aria-label={`移除成员 ${member.nameCn}`}
              className="rounded-sm opacity-70 transition hover:opacity-100"
              onClick={() => removeMember(member.id)}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          aria-label="按成员筛选"
          className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={selected.length === 0 ? "按成员筛选…" : ""}
          value={draft}
          onBlur={() => setOpen(false)}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              const [first] = suggestions
              if (first) addMember({ id: first.id, nameCn: first.nameCn })
              return
            }
            if (event.key === "Backspace" && draft === "") {
              const last = selected[selected.length - 1]
              if (last) removeMember(last.id)
            }
          }}
        />
        {selected.length > 0 ? (
          <button
            type="button"
            aria-label="清除成员筛选"
            className="ml-auto shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onChange([])}
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addMember({ id: entry.id, nameCn: entry.nameCn })}
              >
                <span className="truncate">{entry.nameCn}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.agencyName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
