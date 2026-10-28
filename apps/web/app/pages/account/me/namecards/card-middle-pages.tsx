import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { NAMECARD_MIDDLE_IMAGE_LIMIT } from "@imsweb/contracts/fudaba/runtime"

export type MiddlePageDraft =
  | { kind: "existing"; index: number; url: string }
  | { kind: "new"; file: File; url: string }

function seed(urls: readonly string[]): MiddlePageDraft[] {
  return urls.map((url, index) => ({ kind: "existing", index, url }))
}

/**
 * Middle pages are an ordered set, so the editor always submits the whole list:
 * `#i` keeps the page the card already has at position i, `@n` is the n-th newly
 * chosen file. Keeping a page therefore costs no re-upload.
 */
export function CardMiddlePages({
  initialUrls,
  disabled,
  saving,
  onSave,
}: {
  initialUrls: readonly string[]
  disabled: boolean
  saving: boolean
  onSave: (input: { images: File[]; order: string[] }) => void
}) {
  const signature = initialUrls.join("|")
  const [pages, setPages] = useState<MiddlePageDraft[]>(() => seed(initialUrls))
  const [seededFrom, setSeededFrom] = useState(signature)
  const createdUrls = useRef(new Set<string>())
  const inputRef = useRef<HTMLInputElement | null>(null)

  // The server-side set is the identity: a fresh save re-seeds the local list
  // without an effect round trip.
  if (seededFrom !== signature) {
    setSeededFrom(signature)
    setPages(seed(initialUrls))
  }

  useEffect(() => {
    const urls = createdUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const payload = useMemo(() => {
    const images: File[] = []
    const order: string[] = []
    for (const page of pages) {
      if (page.kind === "new") {
        order.push(`@${images.length}`)
        images.push(page.file)
      } else {
        order.push(`#${page.index}`)
      }
    }
    return { images, order }
  }, [pages])

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const room = NAMECARD_MIDDLE_IMAGE_LIMIT - pages.length
    const accepted = Array.from(files).slice(0, Math.max(0, room))
    if (!accepted.length) return
    const added = accepted.map((file) => {
      const url = URL.createObjectURL(file)
      createdUrls.current.add(url)
      return { kind: "new" as const, file, url }
    })
    setPages((current) => [...current, ...added])
  }

  const remove = (position: number) => {
    setPages((current) => {
      const removed = current[position]
      if (removed?.kind === "new" && createdUrls.current.has(removed.url)) {
        URL.revokeObjectURL(removed.url)
        createdUrls.current.delete(removed.url)
      }
      return current.filter((_page, index) => index !== position)
    })
  }

  const move = (position: number, delta: number) => {
    setPages((current) => {
      const target = position + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [page] = next.splice(position, 1)
      next.splice(target, 0, page!)
      return next
    })
  }

  return (
    <section className="mt-6 border-t pt-5" aria-labelledby="card-middle-pages-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="card-middle-pages-title" className="text-sm font-medium">
            中间页
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            正面与背面之间的内页，展示顺序按下面的排列；最多{" "}
            {NAMECARD_MIDDLE_IMAGE_LIMIT} 张，不添加即双面名片。
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {pages.length} / {NAMECARD_MIDDLE_IMAGE_LIMIT}
        </span>
      </div>

      {pages.length > 0 ? (
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {pages.map((page, position) => (
            <li
              key={page.kind === "new" ? page.url : `${page.index}-${page.url}`}
              className="group relative overflow-hidden rounded-md border bg-muted"
            >
              <img
                src={page.url}
                alt={`中间页 ${position + 1}`}
                className="aspect-3/4 w-full object-cover"
              />
              <span className="absolute top-1 left-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px] leading-none">
                {position + 1}
              </span>
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`上移中间页 ${position + 1}`}
                    disabled={disabled || position === 0}
                    onClick={() => move(position, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`下移中间页 ${position + 1}`}
                    disabled={disabled || position === pages.length - 1}
                    onClick={() => move(position, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  aria-label={`移除中间页 ${position + 1}`}
                  disabled={disabled}
                  onClick={() => remove(position)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          暂未添加中间页。
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled || pages.length >= NAMECARD_MIDDLE_IMAGE_LIMIT}
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled || saving || pages.length >= NAMECARD_MIDDLE_IMAGE_LIMIT
          }
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon data-icon="inline-start" aria-hidden="true" />
          添加中间页
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || saving}
          onClick={() => onSave(payload)}
        >
          {saving ? "保存中…" : "保存中间页"}
        </Button>
      </div>
    </section>
  )
}
