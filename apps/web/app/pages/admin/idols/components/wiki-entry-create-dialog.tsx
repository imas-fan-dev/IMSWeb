import { ChevronDownIcon, LoaderCircleIcon, PlusIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react"

import { ImageCompositionEditor } from "~/components/admin/image-composition-editor"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  createWikiIdol,
  defaultWikiImageTransform,
  isApiError,
  saveWikiEntityImage,
  type WikiAdminAgency,
  type WikiAdminIdol,
} from "~/lib/api"
import {
  entryPayload,
  initialEntryDraft,
  type WikiEntryDraft,
} from "../wiki-entry-draft-model"
import {
  ColorField,
  WikiEntryGroupFields,
  WikiEntryTypeFields,
} from "./wiki-entry-fields"

export type WikiEntryCreated = {
  idol: WikiAdminIdol
  imageError?: string
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

// Mounted once per opening. Agency changes never replace the draft session.
export function WikiEntryCreateDialog({
  agencies,
  initialAgencyId,
  loading,
  catalogError,
  onRetry,
  onClose,
  onCreated,
  returnFocus,
}: {
  agencies: WikiAdminAgency[]
  initialAgencyId?: number
  loading: boolean
  catalogError: unknown
  onRetry: () => void
  onClose: () => void
  onCreated: (result: WikiEntryCreated) => void
  returnFocus: RefObject<HTMLButtonElement | null>
}) {
  const [selection, setSelection] = useState(() => ({
    catalog: agencies,
    agencyId: initialAgencyId ?? null,
    draft: initialEntryDraft(agencies.find(({ id }) => id === initialAgencyId)),
    customColor: false,
    notice: "",
  }))
  const [file, setFile] = useState<File | null>(null)
  const [transform, setTransform] = useState(defaultWikiImageTransform)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [moreOpen, setMoreOpen] = useState(false)
  const busy = useRef(false)
  const created = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Reconcile only an authoritative loaded catalog, never a loading/error placeholder.
  // Updating this component's state during render prevents a stale selection being submitted.
  if (selection.catalog !== agencies && !loading && !catalogError && !saving) {
    const nextAgency = agencies.find(({ id }) => id === selection.agencyId)
    const groupIds = selection.draft.groupIds.filter((id) =>
      nextAgency?.groups.some((group) => group.id === id)
    )
    const invalidAgency = selection.agencyId !== null && !nextAgency
    const invalidGroups = groupIds.length !== selection.draft.groupIds.length
    setSelection({
      ...selection,
      catalog: agencies,
      agencyId: nextAgency?.id ?? null,
      draft: {
        ...selection.draft,
        groupIds,
        color: selection.customColor
          ? selection.draft.color
          : (nextAgency?.color ?? "#777777"),
      },
      notice: invalidAgency
        ? "原企划已不可用，请重新选择企划；资料和头像草稿已保留。"
        : invalidGroups
          ? "目录已更新，失效的栏目选择已移除，请检查后创建。"
          : selection.notice,
    })
  }

  const { draft, agencyId, notice } = selection
  const agency = agencies.find(({ id }) => id === agencyId)
  const blocked = saving || loading || Boolean(catalogError)
  const options = agencies.map(({ id, name, wikiEnabled }) => ({
    value: String(id),
    label: `${name}${wikiEnabled ? "" : "（暂不公开）"}`,
  }))

  function patchDraft(patch: Partial<WikiEntryDraft>) {
    if (busy.current) return
    setSelection((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
    }))
    setSaveError("")
  }

  function selectAgency(value: string | null) {
    if (blocked || busy.current) return
    const next = agencies.find(({ id }) => String(id) === value)
    if (!next || next.id === agencyId) return
    setSelection((current) => ({
      ...current,
      agencyId: next.id,
      draft: {
        ...current.draft,
        groupIds: [],
        color: current.customColor
          ? current.draft.color
          : (next.color ?? "#777777"),
      },
      notice:
        current.agencyId === null
          ? ""
          : "已切换企划，请重新选择栏目；资料和头像草稿已保留。",
    }))
    setSaveError("")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || created.current || blocked || !agency) return
    if (
      ![draft.color, draft.textColor].every((color) =>
        /^#[0-9a-f]{6}$/i.test(color)
      )
    ) {
      setMoreOpen(true)
      setSaveError("请填写有效的六位十六进制颜色色值。")
      return
    }
    if (
      draft.groupIds.some(
        (id) => !agency.groups.some((group) => group.id === id)
      )
    ) {
      setSaveError("栏目已变化，请重新选择栏目后创建。")
      return
    }
    busy.current = true
    setSaving(true)
    setSaveError("")
    let result: WikiEntryCreated
    try {
      const { idol } = await createWikiIdol(agency.id, {
        ...entryPayload(draft),
        folderName: draft.folderName.trim(),
      }).send()
      created.current = true
      result = { idol }
      if (file) {
        try {
          await saveWikiEntityImage({
            kind: "idol",
            id: idol.id,
            file,
            transform,
            expectedRevision: idol.mediaRevision,
          }).send()
        } catch (error) {
          result.imageError = errorMessage(error)
        }
      }
    } catch (error) {
      if (mounted.current) setSaveError(errorMessage(error))
      return
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
    if (mounted.current) onCreated(result)
  }

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (!open) {
          if (busy.current) details.cancel()
          else onClose()
        }
      }}
    >
      <DialogContent
        layout="pinned"
        className="gap-0 p-0 sm:max-w-2xl"
        showCloseButton={!saving}
        finalFocus={returnFocus}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={submit}
          aria-busy={saving}
        >
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>新增内容页</DialogTitle>
            <DialogDescription>
              先选择所属企划，再填写资料并选择栏目。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="p-4">
            <FieldGroup>
              {loading ? (
                <p role="status">正在加载企划与栏目…</p>
              ) : catalogError ? (
                <Alert role="alert">
                  <AlertTitle>目录加载失败</AlertTitle>
                  <AlertDescription>
                    {errorMessage(catalogError)}
                  </AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={onRetry}
                  >
                    重试加载目录
                  </Button>
                </Alert>
              ) : !agencies.length ? (
                <Alert>
                  <AlertTitle>还没有企划</AlertTitle>
                  <AlertDescription>
                    请先建立企划，再回来新增内容页。
                  </AlertDescription>
                  <NavigationLink
                    to="/admin/idols/agencies"
                    className={buttonVariants({
                      variant: "outline",
                      className: "mt-2",
                    })}
                  >
                    前往企划管理
                  </NavigationLink>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="wiki-entry-agency">
                  所属企划（必选）
                </FieldLabel>
                <Select
                  items={options}
                  value={agency ? String(agency.id) : null}
                  disabled={blocked || !agencies.length}
                  onValueChange={selectAgency}
                >
                  <SelectTrigger id="wiki-entry-agency" className="w-full">
                    <SelectValue placeholder="请选择企划" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  栏目随企划变化；切换企划会清空栏目选择。
                </FieldDescription>
              </Field>
              {notice ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              ) : null}
              {!agency ? (
                <p className="text-sm text-muted-foreground">
                  选择企划后，将显示可选栏目和内容页资料。
                </p>
              ) : (
                <fieldset disabled={blocked} className="min-w-0">
                  <FieldGroup>
                    <WikiEntryGroupFields
                      groups={agency.groups}
                      value={draft.groupIds}
                      onChange={(groupIds) => patchDraft({ groupIds })}
                      disabled={blocked}
                    />
                    <Field>
                      <FieldLabel htmlFor="wiki-entry-name">名称</FieldLabel>
                      <Input
                        id="wiki-entry-name"
                        required
                        value={draft.name}
                        onChange={(event) =>
                          patchDraft({ name: event.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="wiki-entry-folder">
                        素材目录
                      </FieldLabel>
                      <Input
                        id="wiki-entry-folder"
                        required
                        pattern="[a-z0-9][a-z0-9_-]*"
                        value={draft.folderName}
                        onChange={(event) =>
                          patchDraft({ folderName: event.target.value })
                        }
                      />
                      <FieldDescription>
                        仅限小写字母、数字、下划线或连字符，创建后不可修改。
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="wiki-entry-url">
                        Wiki 链接（可选）
                      </FieldLabel>
                      <Input
                        id="wiki-entry-url"
                        type="url"
                        inputMode="url"
                        maxLength={2048}
                        value={draft.wikiUrl}
                        onChange={(event) =>
                          patchDraft({ wikiUrl: event.target.value })
                        }
                      />
                    </Field>
                    <FieldSet>
                      <FieldLegend>头像与构图（可选）</FieldLegend>
                      <FieldDescription>
                        创建内容页后保存图片；上传失败时无需重复创建。
                      </FieldDescription>
                      <ImageCompositionEditor
                        id="wiki-entry-image"
                        file={file}
                        transform={transform}
                        disabled={blocked}
                        onFileChange={setFile}
                        onTransformChange={setTransform}
                      />
                    </FieldSet>
                    <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                      <CollapsibleTrigger
                        type="button"
                        disabled={blocked}
                        className="group flex w-full items-center justify-between rounded-md py-2 text-sm font-medium"
                      >
                        更多设置
                        <ChevronDownIcon
                          className="size-4 group-aria-expanded:rotate-180"
                          aria-hidden="true"
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <FieldGroup>
                          <WikiEntryTypeFields
                            draft={draft}
                            onChange={patchDraft}
                            disabled={blocked}
                          />
                          <div className="grid gap-5 sm:grid-cols-2">
                            <ColorField
                              id="wiki-entry-color"
                              label="主题色"
                              value={draft.color}
                              disabled={blocked}
                              onChange={(color) => {
                                setSelection((current) => ({
                                  ...current,
                                  customColor: true,
                                  draft: { ...current.draft, color },
                                }))
                              }}
                            />
                            <ColorField
                              id="wiki-entry-text-color"
                              label="文字色"
                              value={draft.textColor}
                              disabled={blocked}
                              onChange={(textColor) =>
                                patchDraft({ textColor })
                              }
                            />
                          </div>
                          <Field orientation="horizontal">
                            <Checkbox
                              id="wiki-entry-enabled"
                              checked={draft.wikiEnabled}
                              disabled={blocked}
                              onCheckedChange={(checked) =>
                                patchDraft({ wikiEnabled: Boolean(checked) })
                              }
                            />
                            <FieldContent>
                              <FieldLabel htmlFor="wiki-entry-enabled">
                                在公开 Wiki 显示
                              </FieldLabel>
                            </FieldContent>
                          </Field>
                        </FieldGroup>
                      </CollapsibleContent>
                    </Collapsible>
                  </FieldGroup>
                </fieldset>
              )}
              {saveError ? (
                <Alert role="alert">
                  <AlertTitle>创建失败</AlertTitle>
                  <AlertDescription>{saveError}，已保留草稿。</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </DialogBody>
          <DialogFooter className="m-0 rounded-none">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                if (!busy.current) onClose()
              }}
            >
              取消
            </Button>
            <Button type="submit" disabled={blocked || !agency}>
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              {saving ? "正在创建…" : "创建内容页"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
