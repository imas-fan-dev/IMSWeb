import { LoaderCircleIcon } from "lucide-react"
import { useState, type RefObject } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import {
  parseAdminWikiBilibiliBatch,
  type WikiAdminParseBilibiliBatchResult,
  type WikiStoryContentType,
} from "~/lib/api"
import { errorMessage } from "./wiki-workbench-model"
import {
  BATCH_BILIBILI_LIMIT,
  BATCH_BILIBILI_WRAPPERS,
  DEFAULT_BATCH_CONTENT_TYPE,
  batchBilibiliSnippet,
  batchContentTypeOptions,
  bilibiliSourceLine,
  splitBatchBilibiliUrls,
  type BatchBilibiliWrapper,
} from "./wiki-document-model"

/**
 * Bulk authoring macro: paste up to twenty Bilibili links, parse them, and
 * insert one Enhanced Markdown source-list line per resolved link.
 *
 * Parsing is an explicit step so per-link failures stay visible before anything
 * reaches the document, and only the links that resolved are inserted.
 */
export function DocumentBatchLinksDialog({
  open,
  onOpenChange,
  contentTypes,
  finalFocus,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentTypes: readonly WikiStoryContentType[]
  /**
   * Where focus lands when the dialog closes.
   *
   * The caller passes the source textarea so a maintainer keeps typing at the
   * caret where the links were just inserted instead of re-tabbing from the
   * toolbar.
   */
  finalFocus?: RefObject<HTMLTextAreaElement | null>
  /** Receives the generated Markdown; the editor inserts it at the caret. */
  onInsert: (snippet: string) => void
}) {
  const [urlText, setUrlText] = useState("")
  const [contentType, setContentType] = useState(DEFAULT_BATCH_CONTENT_TYPE)
  const [wrapper, setWrapper] = useState<BatchBilibiliWrapper>("lines")
  const [parsing, setParsing] = useState(false)
  const [result, setResult] =
    useState<WikiAdminParseBilibiliBatchResult | null>(null)
  const [error, setError] = useState<unknown>(null)

  const urls = splitBatchBilibiliUrls(urlText)
  const tooMany = urls.length > BATCH_BILIBILI_LIMIT
  const contentTypeOptions = batchContentTypeOptions(contentTypes)
  const parsed = result?.items ?? []
  const resolved = parsed.filter((item) => item.ok && item.stdUrl)
  const failed = parsed.length - resolved.length

  const parse = async () => {
    if (!urls.length || tooMany) return
    setParsing(true)
    setError(null)
    try {
      setResult(await parseAdminWikiBilibiliBatch(urls).send())
    } catch (failure) {
      setResult(null)
      setError(failure)
    } finally {
      setParsing(false)
    }
  }

  const insert = () => {
    const lines = resolved.map((item) =>
      bilibiliSourceLine({
        contentType,
        up: item.up ?? "",
        stdUrl: item.stdUrl ?? "",
        title: item.title ?? "",
      })
    )
    const snippet = batchBilibiliSnippet(lines, wrapper)
    if (!snippet) return
    onInsert(snippet)
    onOpenChange(false)
  }

  const reset = () => {
    setUrlText("")
    setResult(null)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        // Reset after the exit animation so the next batch starts clean.
        if (!next) reset()
      }}
    >
      <DialogContent
        layout="pinned"
        className="sm:max-w-lg"
        finalFocus={finalFocus}
      >
        <DialogHeader>
          <DialogTitle>批量解析 B 站链接</DialogTitle>
          <DialogDescription>
            粘贴多条链接后逐条解析，成功的结果会作为 「-
            [类型｜Bilibili｜UP](规范URL) 标题」插入到编辑器光标处。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="wiki-batch-bilibili-urls">
              B 站链接（每行一条）
            </FieldLabel>
            <Textarea
              id="wiki-batch-bilibili-urls"
              aria-label="B 站链接列表"
              value={urlText}
              onChange={(event) => {
                setUrlText(event.target.value)
                // Any edit invalidates the previous parse results.
                setResult(null)
                setError(null)
              }}
              placeholder={
                "https://www.bilibili.com/video/BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE"
              }
              spellCheck={false}
              className="min-h-32 font-mono text-xs"
            />
            <FieldDescription>
              已识别 {urls.length} 条（去重后），一次最多 {BATCH_BILIBILI_LIMIT}{" "}
              条。
            </FieldDescription>
          </Field>

          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-40">
              <FieldLabel htmlFor="wiki-batch-bilibili-content-type">
                内容类型
              </FieldLabel>
              <Select
                items={contentTypeOptions.map((name) => ({
                  label: name,
                  value: name,
                }))}
                value={contentType}
                onValueChange={(value) =>
                  setContentType(value ?? DEFAULT_BATCH_CONTENT_TYPE)
                }
              >
                <SelectTrigger
                  id="wiki-batch-bilibili-content-type"
                  aria-label="批量解析内容类型"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {contentTypeOptions.map((name) => (
                      <SelectItem key={name} value={name} aria-label={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div role="group" aria-label="输出包装" className="flex gap-2">
              {BATCH_BILIBILI_WRAPPERS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={wrapper === option.id ? "default" : "outline"}
                  aria-pressed={wrapper === option.id}
                  onClick={() => setWrapper(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {tooMany ? (
            <Alert>
              <AlertTitle>链接过多</AlertTitle>
              <AlertDescription>
                一次最多解析 {BATCH_BILIBILI_LIMIT} 条链接，请拆分后再试。
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert>
              <AlertTitle>批量解析失败</AlertTitle>
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-2">
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {resolved.length} 条成功 · {failed} 条失败
              </p>
              <ul
                aria-label="批量解析结果"
                className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-xs"
              >
                {parsed.map((item) => (
                  <li key={item.inputUrl} className="flex flex-col gap-0.5">
                    <span className="font-mono break-all">{item.inputUrl}</span>
                    <span
                      className={
                        item.ok ? "text-muted-foreground" : "text-destructive"
                      }
                    >
                      {item.ok
                        ? `成功 · ${item.title || "（无标题）"} · ${item.up || "未知发布者"}`
                        : `失败 · ${item.error || "解析失败"}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            取消
          </DialogClose>
          <Button
            type="button"
            variant="outline"
            disabled={!urls.length || tooMany || parsing}
            onClick={() => void parse()}
          >
            {parsing ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : null}
            解析链接
          </Button>
          <Button type="button" disabled={!resolved.length} onClick={insert}>
            {resolved.length ? `插入 ${resolved.length} 条链接` : "插入链接"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
