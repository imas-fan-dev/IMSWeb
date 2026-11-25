import { XIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  TAG_NAME_MAX_LENGTH,
  appendAliases,
} from "./tag-library-model"

export interface AliasChipFieldProps {
  id: string
  aliases: string[]
  draft: string
  disabled?: boolean
  onChange: (aliases: string[]) => void
  onDraftChange: (draft: string) => void
}

/**
 * Alias chips with an inline input: Enter or a comma commits the draft as a
 * chip, Backspace on an empty input removes the last one. The parent owns both
 * lists so a dialog submit can flush whatever is still being typed.
 */
export function AliasChipField({
  id,
  aliases,
  draft,
  disabled,
  onChange,
  onDraftChange,
}: AliasChipFieldProps) {
  function commitDraft() {
    const next = appendAliases(aliases, draft)
    if (next.length !== aliases.length) onChange(next)
    onDraftChange("")
  }

  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {aliases.map((alias) => (
          <Badge key={alias} variant="secondary" className="gap-1 pr-1">
            {alias}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 sm:size-5"
              disabled={disabled}
              aria-label={`移除别名 ${alias}`}
              title="移除别名"
              onClick={() =>
                onChange(aliases.filter((item) => item !== alias))
              }
            >
              <XIcon className="size-3" aria-hidden="true" />
            </Button>
          </Badge>
        ))}
        <Input
          id={id}
          value={draft}
          disabled={disabled}
          maxLength={TAG_NAME_MAX_LENGTH}
          placeholder={
            aliases.length === 0
              ? "输入别名后按回车，可用逗号分隔"
              : "继续添加别名"
          }
          className="h-8 min-w-40 flex-1 border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
          onBlur={commitDraft}
          onChange={(event) => {
            const value = event.target.value
            if (/[,，]/.test(value)) {
              const next = appendAliases(aliases, value)
              if (next.length !== aliases.length) onChange(next)
              onDraftChange("")
              return
            }
            onDraftChange(value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The alias input lives inside the dialog form; Enter adds a chip
              // instead of submitting it.
              event.preventDefault()
              commitDraft()
              return
            }
            if (event.key === "Backspace" && draft === "" && aliases.length > 0) {
              event.preventDefault()
              onChange(aliases.slice(0, -1))
            }
          }}
        />
      </div>
    </div>
  )
}
