import {
  ExternalLinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { LucideIconPicker } from "~/components/lucide-icon-picker"
import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import {
  Dialog,
  DialogClose,
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
  FieldTitle,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import {
  createWikiStoryContentType,
  createWikiStorySourcePlatform,
  deleteWikiStoryContentType,
  deleteWikiStorySourcePlatform,
  isApiError,
  updateWikiStoryContentType,
  updateWikiStorySourcePlatform,
} from "~/lib/api"
import type { WikiStoryContentType, WikiStorySourcePlatform } from "~/lib/api"
import { NavigationLink } from "~/components/navigation/navigation-link"

type CatalogKind = "content-type" | "source-platform"
type CatalogOption = WikiStoryContentType | WikiStorySourcePlatform

type DeleteTarget = {
  kind: CatalogKind
  option: CatalogOption
}

type OptionForm = {
  name: string
  iconName: string
  homepageUrl: string
  description: string
  isActive: boolean
}

const emptyForm: OptionForm = {
  name: "",
  iconName: "link-2",
  homepageUrl: "",
  description: "",
  isActive: true,
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "保存失败，请稍后重试"
}

export function StorySourceCatalogDialog({
  open,
  contentTypes: contentTypeProps,
  sourcePlatforms: sourcePlatformProps,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  contentTypes: WikiStoryContentType[]
  sourcePlatforms: WikiStorySourcePlatform[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [contentTypes, setContentTypes] = useState(contentTypeProps)
  const [sourcePlatforms, setSourcePlatforms] = useState(sourcePlatformProps)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === "content-type") {
        await deleteWikiStoryContentType(deleteTarget.option.id).send()
        setContentTypes((current) =>
          current.filter((option) => option.id !== deleteTarget.option.id)
        )
      } else {
        await deleteWikiStorySourcePlatform(deleteTarget.option.id).send()
        setSourcePlatforms((current) =>
          current.filter((option) => option.id !== deleteTarget.option.id)
        )
      }
      toast.success(`“${deleteTarget.option.name}”已删除`)
      setDeleteTarget(null)
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>内容类型与来源平台</DialogTitle>
            <DialogDescription>
              这里的目录会用于每条卡片内容，并同步展示在公开 Wiki。
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="content-types">
            <TabsList>
              <TabsTrigger value="content-types">
                内容类型 {contentTypes.length}
              </TabsTrigger>
              <TabsTrigger value="source-platforms">
                来源平台 {sourcePlatforms.length}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="content-types">
              <CatalogPanel
                kind="content-type"
                options={contentTypes}
                onChanged={(option) => {
                  setContentTypes((current) => upsertOption(current, option))
                  onSaved()
                }}
                onDelete={(option) =>
                  setDeleteTarget({ kind: "content-type", option })
                }
              />
            </TabsContent>
            <TabsContent value="source-platforms">
              <CatalogPanel
                kind="source-platform"
                options={sourcePlatforms}
                onChanged={(option) => {
                  setSourcePlatforms((current) => upsertOption(current, option))
                  onSaved()
                }}
                onDelete={(option) =>
                  setDeleteTarget({ kind: "source-platform", option })
                }
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              完成
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除目录项？</AlertDialogTitle>
            <AlertDialogDescription>
              仅未被任何来源引用的目录项可以删除。已有引用时请改为停用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CatalogPanel<Option extends CatalogOption>({
  kind,
  options,
  onChanged,
  onDelete,
}: {
  kind: CatalogKind
  options: Option[]
  onChanged: (option: Option) => void
  onDelete: (option: Option) => void
}) {
  const [editing, setEditing] = useState<Option | null>(null)
  const [form, setForm] = useState<OptionForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const isPlatform = kind === "source-platform"

  function startCreate() {
    setEditing(null)
    setForm(emptyForm)
  }

  function startEdit(option: Option) {
    setEditing(option)
    setForm({
      name: option.name,
      iconName: "iconName" in option ? option.iconName : "link-2",
      homepageUrl: "homepageUrl" in option ? option.homepageUrl : "",
      description: option.description,
      isActive: option.isActive,
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      let option: CatalogOption
      if (isPlatform) {
        const submission = {
          name: form.name,
          homepageUrl: form.homepageUrl,
          description: form.description,
          isActive: form.isActive,
        }
        option = editing
          ? (
              await updateWikiStorySourcePlatform(
                editing.id,
                editing.revision,
                submission
              ).send()
            ).option
          : (await createWikiStorySourcePlatform(submission).send()).option
      } else {
        const submission = {
          name: form.name,
          iconName: form.iconName,
          description: form.description,
          isActive: form.isActive,
        }
        option = editing
          ? (
              await updateWikiStoryContentType(
                editing.id,
                editing.revision,
                submission
              ).send()
            ).option
          : (await createWikiStoryContentType(submission).send()).option
      }
      onChanged(option as Option)
      toast.success(editing ? "目录项已更新" : "目录项已新增")
      startCreate()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <form className="flex flex-col gap-4 border-b pb-5" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">
              {editing
                ? `编辑“${editing.name}”`
                : `新增${isPlatform ? "来源平台" : "内容类型"}`}
            </h3>
            <p className="text-xs text-muted-foreground">
              停用后不会出现在新增来源的选择列表中，历史内容仍保留。
            </p>
          </div>
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={startCreate}
            >
              <PlusIcon data-icon="inline-start" />
              改为新增
            </Button>
          ) : null}
        </div>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${kind}-name`}>名称</FieldLabel>
              <Input
                id={`${kind}-name`}
                required
                maxLength={80}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            {isPlatform ? (
              <Field>
                <FieldLabel htmlFor={`${kind}-homepage`}>平台主页</FieldLabel>
                <Input
                  id={`${kind}-homepage`}
                  type="url"
                  placeholder="https://..."
                  value={form.homepageUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      homepageUrl: event.target.value,
                    }))
                  }
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${kind}-icon`}>图标</FieldLabel>
                <LucideIconPicker
                  id={`${kind}-icon`}
                  value={form.iconName}
                  onValueChange={(iconName) =>
                    setForm((current) => ({ ...current, iconName }))
                  }
                />
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor={`${kind}-description`}>说明</FieldLabel>
            <Textarea
              id={`${kind}-description`}
              maxLength={240}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${kind}-active`}
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, isActive: checked }))
              }
            />
            <FieldContent>
              <FieldLabel htmlFor={`${kind}-active`}>
                <FieldTitle>启用</FieldTitle>
              </FieldLabel>
              <FieldDescription>允许在新建和编辑来源时选择。</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : null}
            {editing ? "保存修改" : "新增目录项"}
          </Button>
        </div>
      </form>

      <div className="divide-y rounded-md border">
        {options.map((option) => (
          <div
            key={option.id}
            className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {"iconName" in option ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <ConfigurableLucideIcon
                      name={option.iconName}
                      aria-hidden="true"
                      className="size-4"
                    />
                  </span>
                ) : null}
                <p className="font-medium">{option.name}</p>
                <Badge variant={option.isActive ? "secondary" : "outline"}>
                  {option.isActive ? "启用" : "停用"}
                </Badge>
              </div>
              {option.description ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {option.description}
                </p>
              ) : null}
              {"homepageUrl" in option && option.homepageUrl ? (
                <NavigationLink
                  href={option.homepageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  平台主页
                  <ExternalLinkIcon className="size-3" />
                </NavigationLink>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => startEdit(option)}
              >
                <PencilIcon data-icon="inline-start" />
                编辑
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => onDelete(option)}
              >
                <Trash2Icon data-icon="inline-start" />
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function upsertOption<Option extends CatalogOption>(
  options: Option[],
  option: Option
) {
  const exists = options.some((candidate) => candidate.id === option.id)
  const next = exists
    ? options.map((candidate) =>
        candidate.id === option.id ? option : candidate
      )
    : [...options, option]
  return [...next].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id - right.id
  )
}
