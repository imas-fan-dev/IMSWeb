import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useState, type RefObject } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
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
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  exportAdminWikiEntryDocumentStructured,
  type WikiAdminEntryDocumentExportStructured,
} from "~/lib/api"
import { errorMessage } from "./wiki-workbench-model"
import {
  EXPORT_COLLAPSE_THRESHOLD,
  structuredExportDraft,
  structuredExportSummary,
} from "./wiki-document-model"

type DraftResponse = {
  key: string
  draft: WikiAdminEntryDocumentExportStructured | null
  error: unknown
}

const IDLE: DraftResponse = { key: "", draft: null, error: null }

/**
 * "从结构化卡片生成草稿" dialog.
 *
 * The API converts the entry's existing `wiki_story_cards` / `wiki_story_links`
 * into Enhanced Markdown without writing anything. The dialog shows the draft,
 * its coverage summary, and every data-hygiene `lintWarnings` row, then hands the
 * text to the editor as an insert or a replace. Saving stays a separate,
 * deliberate action in the editor header.
 */
export function DocumentExportDialog({
  open,
  onOpenChange,
  entryId,
  finalFocus,
  onInsert,
  onReplace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryId: number
  /** Source textarea that regains focus when the dialog closes. */
  finalFocus?: RefObject<HTMLTextAreaElement | null>
  /** Receives the generated Markdown; the editor inserts it at the caret. */
  onInsert: (markdown: string) => void
  /** Replaces the whole editor draft with the generated Markdown. */
  onReplace: (markdown: string) => void
}) {
  const [stripBrackets, setStripBrackets] = useState(false)
  const [collapseThreshold, setCollapseThreshold] = useState(
    EXPORT_COLLAPSE_THRESHOLD
  )
  const [request, setRequest] = useState<DraftResponse>(IDLE)
  // Requests are keyed by their options, so opening the dialog or changing a
  // control invalidates the previous draft without a second render pass.
  const key = open ? `${entryId}|${stripBrackets}|${collapseThreshold}` : ""

  useEffect(() => {
    if (!open) return
    let active = true
    void exportAdminWikiEntryDocumentStructured({
      entryId,
      stripBrackets,
      collapseThreshold,
    })
      .send()
      .then((draft) => {
        if (active) setRequest({ key, draft, error: null })
      })
      .catch((error: unknown) => {
        if (active) setRequest({ key, draft: null, error })
      })
    return () => {
      active = false
    }
  }, [collapseThreshold, entryId, key, open, stripBrackets])

  const current = request.key === key
  const draft = current ? request.draft : null
  const error = current ? request.error : null
  const loading = open && !current
  const markdown = draft ? structuredExportDraft(draft.markdown) : ""
  const warnings = draft?.lintWarnings ?? []

  const handOff = (accept: (value: string) => void) => {
    if (!markdown) return
    accept(markdown)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layout="pinned"
        className="sm:max-w-2xl"
        finalFocus={finalFocus}
      >
        <DialogHeader>
          <DialogTitle>从结构化卡片生成草稿</DialogTitle>
          <DialogDescription>
            把当前内容页的结构化卡片与来源转换成增强 Markdown
            草稿。整个过程只读取数据库，不会保存，也不会删除任何卡片或来源；
            插入或替换后是否保存由你决定。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 py-2">
          <div className="flex flex-wrap items-center gap-6">
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id="wiki-export-strip-brackets"
                checked={stripBrackets}
                onCheckedChange={(checked) =>
                  setStripBrackets(Boolean(checked))
                }
              />
              <FieldLabel htmlFor="wiki-export-strip-brackets">
                去除卡名外层【】
              </FieldLabel>
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="wiki-export-collapse-threshold">
                折叠阈值（卡）
              </FieldLabel>
              <Input
                id="wiki-export-collapse-threshold"
                type="number"
                min={1}
                max={500}
                value={collapseThreshold}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next >= 1 && next <= 500) {
                    setCollapseThreshold(Math.trunc(next))
                  }
                }}
              />
              <FieldDescription>
                超过该卡数的分类默认折叠，默认 {EXPORT_COLLAPSE_THRESHOLD}。
              </FieldDescription>
            </Field>
          </div>

          {loading ? (
            <p
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
              正在生成草稿…
            </p>
          ) : null}

          {error ? (
            <Alert>
              <AlertTitle>生成失败</AlertTitle>
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}

          {draft ? (
            <div className="flex flex-col gap-2">
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {structuredExportSummary(draft.stats)}
              </p>
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">
                  数据卫生提醒 {warnings.length ? `(${warnings.length})` : ""}
                </h3>
                {warnings.length ? (
                  <ul
                    aria-label="数据卫生提醒"
                    className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-xs"
                  >
                    {warnings.map((warning, index) => (
                      <li key={`${warning.code}-${index}`}>
                        <span className="font-mono">{warning.context}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {warning.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    未发现需要人工处理的数据问题。
                  </p>
                )}
              </div>
              <Textarea
                aria-label="生成的草稿"
                value={markdown}
                readOnly
                spellCheck={false}
                className="min-h-56 font-mono text-xs"
              />
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
            disabled={!markdown}
            onClick={() => handOff(onReplace)}
          >
            替换编辑器草稿
          </Button>
          <Button
            type="button"
            disabled={!markdown}
            onClick={() => handOff(onInsert)}
          >
            插入到光标处
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
