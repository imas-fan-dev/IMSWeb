import { LoaderCircleIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Checkbox } from "~/components/ui/checkbox"
import {
  wikiEntryKindOptions,
  wikiStoryEntrySubtypeOptions,
} from "~/components/wiki/wiki-entry-kind"
import {
  Dialog,
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { ImageCompositionEditor } from "~/pages/admin/stories/image-composition-editor"
import {
  createWikiAgency,
  createWikiGroup,
  createWikiIdol,
  deleteWikiGroup,
  deleteWikiIdol,
  defaultWikiImageTransform,
  isApiError,
  saveWikiEntityImage,
  updateWikiAgency,
  updateWikiGroup,
  updateWikiIdol,
  type WikiAdminAgency,
  type WikiAdminGroup,
  type WikiAdminIdol,
  type WikiEntryKind,
  type WikiImageTransform,
  type WikiStoryEntrySubtype,
} from "~/lib/api"

export type WikiEntityEditorTarget =
  | { kind: "agency"; entity: WikiAdminAgency | null }
  | {
      kind: "group"
      agency: WikiAdminAgency
      entity: WikiAdminGroup | null
    }
  | {
      kind: "idol"
      agency: WikiAdminAgency
      entity: WikiAdminIdol | null
    }

type EntityForm = {
  code: string
  name: string
  bannerTitle: string
  folderName: string
  wikiUrl: string
  color: string
  textColor: string
  wikiEnabled: boolean
  groupIds: number[]
  entryKind: WikiEntryKind
  entrySubtype: WikiStoryEntrySubtype | null
}

function initialForm(target: WikiEntityEditorTarget): EntityForm {
  if (target.kind === "agency") {
    return {
      code: target.entity?.code ?? "",
      name: target.entity?.name ?? "",
      bannerTitle: target.entity?.bannerTitle ?? "",
      folderName: "",
      wikiUrl: "",
      color: target.entity?.color ?? "#777777",
      textColor: "#ffffff",
      wikiEnabled: target.entity?.wikiEnabled ?? true,
      groupIds: [],
      entryKind: "other",
      entrySubtype: null,
    }
  }
  if (target.kind === "group") {
    return {
      code: target.entity?.code ?? "",
      name: target.entity?.name ?? "",
      bannerTitle: "",
      folderName: "",
      wikiUrl: "",
      color: target.entity?.color ?? target.agency.color ?? "#777777",
      textColor: "#ffffff",
      wikiEnabled: true,
      groupIds: [],
      entryKind: "other",
      entrySubtype: null,
    }
  }
  return {
    code: "",
    name: target.entity?.name ?? "",
    bannerTitle: "",
    folderName: target.entity?.folderName ?? "",
    wikiUrl: target.entity?.wikiUrl ?? "",
    color: target.entity?.color ?? target.agency.color ?? "#777777",
    textColor: target.entity?.textColor ?? "#ffffff",
    wikiEnabled: target.entity?.wikiEnabled ?? true,
    groupIds: target.entity?.groupIds ?? [],
    entryKind: target.entity?.entryKind ?? "idol",
    entrySubtype: target.entity?.entrySubtype ?? null,
  }
}

function targetTitle(target: WikiEntityEditorTarget) {
  const action = target.entity ? "编辑" : "新增"
  if (target.kind === "agency") return `${action}企划`
  if (target.kind === "group") return `${action}栏目`
  return `${action}内容页`
}

function targetNoun(target: WikiEntityEditorTarget) {
  if (target.kind === "agency") return "企划"
  if (target.kind === "group") return "栏目"
  return "内容页"
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请稍后重试"
}

export function WikiEntityEditorDialog({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: WikiEntityEditorTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  if (!target) return null
  return (
    <WikiEntityEditorDialogContent
      key={`${target.kind}-${target.entity?.id ?? "new"}`}
      target={target}
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  )
}

function WikiEntityEditorDialogContent({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: WikiEntityEditorTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() => initialForm(target))
  const [file, setFile] = useState<File | null>(null)
  const currentTransform = target.entity?.imageTransform
  const [transform, setTransform] = useState<WikiImageTransform>(
    currentTransform ?? defaultWikiImageTransform
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const initialTransformKey = useMemo(
    () => JSON.stringify(currentTransform ?? defaultWikiImageTransform),
    [currentTransform]
  )

  function update<Key extends keyof EntityForm>(
    key: Key,
    value: EntityForm[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateEntryKind(entryKind: WikiEntryKind) {
    setForm((current) => ({
      ...current,
      entryKind,
      entrySubtype:
        entryKind === "story" ? (current.entrySubtype ?? "main") : null,
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    let entitySaved = false
    let savedId = target.entity?.id ?? null
    try {
      if (target.kind === "agency") {
        const payload = {
          name: form.name.trim(),
          color: form.color,
          bannerTitle: form.bannerTitle.trim() || form.name.trim(),
          wikiEnabled: form.wikiEnabled,
        }
        if (target.entity) {
          await updateWikiAgency(target.entity.id, payload).send()
        } else {
          const result = await createWikiAgency({
            ...payload,
            code: form.code.trim(),
          }).send()
          savedId = result.agency.id
        }
      } else if (target.kind === "group") {
        const payload = { name: form.name.trim(), color: form.color }
        if (target.entity) {
          await updateWikiGroup(target.entity.id, payload).send()
        } else {
          const result = await createWikiGroup(target.agency.id, {
            ...payload,
            code: form.code.trim(),
          }).send()
          savedId = result.group.id
        }
      } else {
        const payload = {
          name: form.name.trim(),
          color: form.color || null,
          textColor: form.textColor,
          wikiUrl: form.wikiUrl.trim() || null,
          wikiEnabled: form.wikiEnabled,
          groupIds: form.groupIds,
          entryKind: form.entryKind,
          entrySubtype: form.entrySubtype,
        }
        if (target.entity) {
          await updateWikiIdol(target.entity.id, payload).send()
        } else {
          const result = await createWikiIdol(target.agency.id, {
            ...payload,
            folderName: form.folderName.trim(),
          }).send()
          savedId = result.idol.id
        }
      }
      entitySaved = true

      const mediaChanged =
        Boolean(file) || JSON.stringify(transform) !== initialTransformKey
      if (savedId && mediaChanged) {
        await saveWikiEntityImage({
          kind: target.kind,
          id: savedId,
          file,
          transform,
          expectedRevision: target.entity?.mediaRevision ?? 0,
        }).send()
      }

      toast.success(`${targetTitle(target)}已保存`)
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (entitySaved) {
        onOpenChange(false)
        onSaved()
        toast.error(
          `${targetNoun(target)}资料已保存，但图片未保存：${errorMessage(error)}`
        )
      } else {
        toast.error(errorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteEntity() {
    if (target.kind === "agency" || !target.entity) return
    setDeleting(true)
    try {
      if (target.kind === "group") {
        await deleteWikiGroup(
          target.entity.id,
          target.entity.mediaRevision
        ).send()
        toast.success(`栏目“${target.entity.name}”已删除`)
      } else {
        const result = await deleteWikiIdol(
          target.entity.id,
          target.entity.mediaRevision
        ).send()
        toast.success(
          `内容页“${target.entity.name}”已删除，${result.softDeleted.cards} 张卡片和 ${result.softDeleted.stories} 条来源已软删除`
        )
      }
      setDeleteConfirmationOpen(false)
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  const currentImageUrl =
    target.kind === "idol" ? target.entity?.imageUrl : target.entity?.iconUrl

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <form
            className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col"
            onSubmit={submit}
          >
            <DialogHeader className="border-b p-4 pr-12">
              <DialogTitle>{targetTitle(target)}</DialogTitle>
              <DialogDescription>
                {target.kind === "agency"
                  ? "维护企划名称、展示信息和识别图标。"
                  : target.kind === "group"
                    ? `栏目固定归属于${target.agency.name}，只负责组织内容页。`
                    : `维护内容页类型、资料及其在${target.agency.name}下的多个栏目关系。`}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <FieldGroup>
                {!target.entity && target.kind !== "idol" ? (
                  <Field>
                    <FieldLabel htmlFor="wiki-entity-code">标识</FieldLabel>
                    <Input
                      id="wiki-entity-code"
                      required
                      pattern="[a-z0-9][a-z0-9_-]*"
                      value={form.code}
                      onChange={(event) => update("code", event.target.value)}
                    />
                    <FieldDescription>
                      仅限小写字母、数字、下划线或连字符，创建后不可修改。
                    </FieldDescription>
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="wiki-entity-name">名称</FieldLabel>
                  <Input
                    id="wiki-entity-name"
                    required
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </Field>

                {target.kind === "idol" ? (
                  <FieldSet>
                    <FieldLegend>内容页类型</FieldLegend>
                    <FieldDescription>
                      类型决定目录中的标识；真实组合和剧情专题也作为内容页维护。
                    </FieldDescription>
                    <ToggleGroup
                      value={[form.entryKind]}
                      variant="outline"
                      spacing={0}
                      className="grid w-full grid-cols-2 sm:grid-cols-4"
                      aria-label="内容页类型"
                      onValueChange={(values) => {
                        const entryKind = values[0] as WikiEntryKind | undefined
                        if (entryKind) updateEntryKind(entryKind)
                      }}
                    >
                      {wikiEntryKindOptions.map(
                        ({ value, label, icon: Icon }) => (
                          <ToggleGroupItem
                            key={value}
                            value={value}
                            className="min-w-0"
                          >
                            <Icon data-icon="inline-start" aria-hidden="true" />
                            {label}
                          </ToggleGroupItem>
                        )
                      )}
                    </ToggleGroup>
                  </FieldSet>
                ) : null}

                {target.kind === "idol" && form.entryKind === "story" ? (
                  <FieldSet>
                    <FieldLegend>剧情类型</FieldLegend>
                    <FieldDescription>
                      用于在目录中区分主线、活动和特殊剧情。
                    </FieldDescription>
                    <ToggleGroup
                      value={[form.entrySubtype ?? "main"]}
                      variant="outline"
                      spacing={0}
                      className="grid w-full grid-cols-4"
                      aria-label="剧情类型"
                      onValueChange={(values) => {
                        const entrySubtype = values[0] as
                          | WikiStoryEntrySubtype
                          | undefined
                        if (entrySubtype) {
                          update("entrySubtype", entrySubtype)
                        }
                      }}
                    >
                      {wikiStoryEntrySubtypeOptions.map(({ value, label }) => (
                        <ToggleGroupItem
                          key={value}
                          value={value}
                          className="min-w-0"
                        >
                          {label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FieldSet>
                ) : null}

                {target.kind === "agency" ? (
                  <Field>
                    <FieldLabel htmlFor="wiki-entity-banner-title">
                      展示标题
                    </FieldLabel>
                    <Input
                      id="wiki-entity-banner-title"
                      value={form.bannerTitle}
                      onChange={(event) =>
                        update("bannerTitle", event.target.value)
                      }
                    />
                  </Field>
                ) : null}

                {!target.entity && target.kind === "idol" ? (
                  <Field>
                    <FieldLabel htmlFor="wiki-entity-folder">
                      素材目录
                    </FieldLabel>
                    <Input
                      id="wiki-entity-folder"
                      required
                      pattern="[a-z0-9][a-z0-9_-]*"
                      value={form.folderName}
                      onChange={(event) =>
                        update("folderName", event.target.value)
                      }
                    />
                    <FieldDescription>
                      用于对象存储路径，创建后不可修改。
                    </FieldDescription>
                  </Field>
                ) : null}

                {target.kind === "idol" ? (
                  <Field>
                    <FieldLabel htmlFor="wiki-entity-wiki-url">
                      Wiki 链接（可选）
                    </FieldLabel>
                    <Input
                      id="wiki-entity-wiki-url"
                      type="url"
                      inputMode="url"
                      maxLength={2048}
                      placeholder="https://example.com/wiki/..."
                      value={form.wikiUrl}
                      onChange={(event) =>
                        update("wikiUrl", event.target.value)
                      }
                    />
                    <FieldDescription>
                      配置后，公开内容页会显示跳转到外部 Wiki 的按钮。
                    </FieldDescription>
                  </Field>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <ColorField
                    id="wiki-entity-color"
                    label="主题色"
                    value={form.color}
                    onChange={(value) => update("color", value)}
                  />
                  {target.kind === "idol" ? (
                    <ColorField
                      id="wiki-entity-text-color"
                      label="文字色"
                      value={form.textColor}
                      onChange={(value) => update("textColor", value)}
                    />
                  ) : null}
                </div>

                {target.kind !== "group" ? (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="wiki-entity-enabled"
                      checked={form.wikiEnabled}
                      onCheckedChange={(checked) =>
                        update("wikiEnabled", Boolean(checked))
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="wiki-entity-enabled">
                        在公开 Wiki 显示
                      </FieldLabel>
                    </FieldContent>
                  </Field>
                ) : null}

                {target.kind === "idol" ? (
                  <FieldSet>
                    <FieldLegend>所属栏目</FieldLegend>
                    <FieldDescription>
                      可选择多个栏目，也可以留空；未归档内容会在企划末尾展示。
                    </FieldDescription>
                    <FieldGroup className="grid gap-2 sm:grid-cols-2">
                      {target.agency.groups.map((group) => {
                        const checked = form.groupIds.includes(group.id)
                        return (
                          <Field key={group.id} orientation="horizontal">
                            <Checkbox
                              id={`wiki-idol-group-${group.id}`}
                              checked={checked}
                              onCheckedChange={(nextChecked) =>
                                update(
                                  "groupIds",
                                  nextChecked
                                    ? [...form.groupIds, group.id]
                                    : form.groupIds.filter(
                                        (id) => id !== group.id
                                      )
                                )
                              }
                            />
                            <FieldContent>
                              <FieldLabel
                                htmlFor={`wiki-idol-group-${group.id}`}
                              >
                                {group.name}
                              </FieldLabel>
                            </FieldContent>
                          </Field>
                        )
                      })}
                      {!target.agency.groups.length ? (
                        <p className="text-sm text-muted-foreground sm:col-span-2">
                          当前企划没有栏目，保存后内容页会进入未归档区域。
                        </p>
                      ) : null}
                    </FieldGroup>
                  </FieldSet>
                ) : null}

                <FieldSet>
                  <FieldLegend>
                    {target.kind === "idol" ? "页面图片与构图" : "图标与构图"}
                  </FieldLegend>
                  <FieldDescription>
                    构图参数可随时调整，后台预览与公开 Wiki 保持一致。
                  </FieldDescription>
                  <ImageCompositionEditor
                    id="wiki-entity-image"
                    file={file}
                    currentUrl={currentImageUrl}
                    transform={transform}
                    disabled={saving}
                    onFileChange={setFile}
                    onTransformChange={setTransform}
                  />
                </FieldSet>
              </FieldGroup>
            </div>

            <DialogFooter className="m-0 rounded-none sm:flex-row sm:justify-end">
              {target.kind !== "agency" && target.entity ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={saving || deleting}
                  onClick={() => setDeleteConfirmationOpen(true)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  {target.kind === "group" ? "删除栏目" : "删除内容页"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmationOpen}
        onOpenChange={(nextOpen) => {
          if (!deleting) setDeleteConfirmationOpen(nextOpen)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {target.kind === "idol" ? "删除这个内容页？" : "删除这个栏目？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target.kind === "idol"
                ? `内容页“${target.entity?.name ?? ""}”会从前台和管理目录隐藏，关联卡片与剧情来源会被软删除。页面图片、剧情图片和数据库记录都会保留，便于后续恢复。`
                : `只会删除栏目“${target.kind === "group" ? target.entity?.name : ""}”及其归档关系。内容页和剧情会保留，仅属于该栏目的内容页将进入未归档区域。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDeleteEntity()}
            >
              {deleting ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          className="size-8 shrink-0 p-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          aria-label={`${label}色值`}
          pattern="#[0-9A-Fa-f]{6}"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  )
}
