import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import { useId, useState, type FormEvent } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"

/**
 * The footer shared by the admin namecard tables: a page readout, the
 * first/last and previous/next pairs, and a box for jumping straight to a page.
 *
 * The jump box keeps a draft only while it is being typed in (`null` means
 * "follow the current page"), so navigating with the arrows updates the box
 * without an effect. The draft accepts digits only and is clamped to the last
 * page, so it can never hold a value the submit would reject.
 */
export function AdminPagination({
  page,
  totalPages,
  disabled,
  onChange,
}: {
  page: number
  totalPages: number
  disabled: boolean
  onChange: (page: number) => void
}) {
  const jumpInputId = useId()
  const lastPage = Math.max(1, totalPages)
  const maxDigits = String(lastPage).length + 1
  const [jumpDraft, setJumpDraft] = useState<string | null>(null)

  function changeDraft(value: string) {
    // Digit keys only, and never above the last page: the box mirrors the range
    // it can actually jump to instead of holding values submit would reject.
    const digits = value.replace(/\D/g, "").slice(0, maxDigits)
    setJumpDraft(digits === "" ? "" : String(Math.min(Number(digits), lastPage)))
  }

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = Number(jumpDraft)
    if (!Number.isSafeInteger(target) || target < 1 || target > lastPage) {
      setJumpDraft(null)
      return
    }
    setJumpDraft(null)
    if (target !== page) onChange(target)
  }

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        第 {page} / {lastPage} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="跳到首页"
          disabled={disabled || page <= 1}
          onClick={() => onChange(1)}
        >
          <ChevronsLeftIcon data-icon="inline-start" />
          首页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          下一页
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="跳到尾页"
          disabled={disabled || page >= lastPage}
          onClick={() => onChange(lastPage)}
        >
          尾页
          <ChevronsRightIcon data-icon="inline-end" />
        </Button>
        <form className="flex items-center gap-2" onSubmit={submitJump}>
          <label
            className="text-sm text-muted-foreground"
            htmlFor={jumpInputId}
          >
            跳至
          </label>
          <Input
            id={jumpInputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-16 text-center"
            value={jumpDraft ?? String(page)}
            disabled={disabled}
            aria-label="跳转页码"
            onChange={(event) => changeDraft(event.target.value)}
          />
          <span className="text-sm text-muted-foreground">页</span>
          <Button type="submit" variant="outline" size="sm" disabled={disabled}>
            跳转
          </Button>
        </form>
      </div>
    </div>
  )
}
