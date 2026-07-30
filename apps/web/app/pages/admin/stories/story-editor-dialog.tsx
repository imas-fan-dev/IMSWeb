import {
  ImageOffIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { ImageCompositionEditor } from "~/pages/admin/stories/image-composition-editor"
import {
  createWikiStoryBatch,
  createWikiStorySources,
  defaultWikiImageTransform,
  isApiError,
  parseBilibiliStoryUrl,
  updateWikiStory,
  updateWikiStoryCard,
} from "~/lib/api"
import type {
  WikiAdminStories,
  WikiAdminStory,
  WikiAdminStoryCard,
  WikiImageTransform,
  WikiStoryContentType,
  WikiStoryCoverAsset,
  WikiStoryBatchSubmission,
  WikiStorySourcePlatform,
  WikiStorySourceSubmission,
  WikiStorySubmission,
} from "~/lib/api"

type StorySourceForm = WikiStorySourceSubmission & { key: number }

type StoryForm = {
  category: string
  cardName: string
  subtitle: string
  sources: StorySourceForm[]
  image: File | null
  coverMode: "shared" | "custom" | "none"
  coverAssetId: number | null
  imageTransform: WikiImageTransform
}

export type StoryEditorDefaults = Partial<
  Pick<
    WikiAdminStoryCard,
    | "category"
    | "cardName"
    | "subtitle"
    | "imageUrl"
    | "imageTransform"
    | "mediaRevision"
  >
>

export type StoryEditorMode =
  | "create-card"
  | "add-sources"
  | "edit-card"
  | "edit-source"

function emptySource(
  contentTypes: WikiStoryContentType[],
  sourcePlatforms: WikiStorySourcePlatform[],
  key = 0
): StorySourceForm {
  return {
    key,
    upName: "",
    videoTitle: "",
    url: "",
    contentTypeId: contentTypes.find((option) => option.isActive)?.id ?? 0,
    sourcePlatformId:
      sourcePlatforms.find((option) => option.isActive)?.id ?? 0,
  }
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function storyForm(
  story: WikiAdminStory | WikiAdminStoryCard | null,
  category: string,
  defaults: StoryEditorDefaults | undefined,
  mode: StoryEditorMode,
  contentTypes: WikiStoryContentType[],
  sourcePlatforms: WikiStorySourcePlatform[]
): StoryForm {
  return {
    category: story?.category ?? defaults?.category ?? category,
    cardName: story?.cardName ?? defaults?.cardName ?? "",
    subtitle: story?.subtitle ?? defaults?.subtitle ?? "",
    sources:
      story && mode === "edit-source" && "upName" in story
        ? [
            {
              key: 0,
              upName: story.upName,
              videoTitle: story.videoTitle,
              url: story.url,
              contentTypeId: story.contentTypeId,
              sourcePlatformId: story.sourcePlatformId,
            },
          ]
        : [emptySource(contentTypes, sourcePlatforms)],
    image: null,
    coverMode: story?.coverAssetId
      ? "shared"
      : story?.imageUrl || defaults?.imageUrl
        ? "custom"
        : "none",
    coverAssetId: story?.coverAssetId ?? null,
    imageTransform:
      story?.imageTransform ??
      defaults?.imageTransform ??
      defaultWikiImageTransform,
  }
}

export function StoryEditorDialog({
  open,
  story,
  agency,
  idol,
  categories,
  contentTypes,
  sourcePlatforms,
  coverAssets = [],
  defaultCategory,
  defaults,
  mode,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  story: WikiAdminStory | WikiAdminStoryCard | null
  agency: string
  idol: string
  categories: WikiAdminStories["categories"]
  contentTypes: WikiStoryContentType[]
  sourcePlatforms: WikiStorySourcePlatform[]
  coverAssets?: WikiStoryCoverAsset[]
  defaultCategory: string
  defaults?: StoryEditorDefaults
  mode?: StoryEditorMode
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const resolvedMode: StoryEditorMode =
    mode ??
    (story ? "edit-source" : defaults?.cardName ? "add-sources" : "create-card")
  const [form, setForm] = useState(() =>
    storyForm(
      story,
      defaultCategory,
      defaults,
      resolvedMode,
      contentTypes,
      sourcePlatforms
    )
  )
  const [saving, setSaving] = useState(false)
  const [parsingSourceKey, setParsingSourceKey] = useState<number | null>(null)
  const creatingCard = resolvedMode === "create-card"
  const addingToExistingCard = resolvedMode === "add-sources"
  const editingCard = resolvedMode === "edit-card"
  const editingSource = resolvedMode === "edit-source"
  const showsCardFields = creatingCard || editingCard
  const showsSources = creatingCard || addingToExistingCard || editingSource
  const selectedCoverAsset = coverAssets.find(
    (asset) => asset.id === form.coverAssetId
  )

  function setValue<Key extends keyof StoryForm>(
    key: Key,
    value: StoryForm[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setSourceValue<Key extends keyof WikiStorySourceSubmission>(
    sourceKey: number,
    key: Key,
    value: WikiStorySourceSubmission[Key]
  ) {
    setForm((current) => ({
      ...current,
      sources: current.sources.map((source) =>
        source.key === sourceKey ? { ...source, [key]: value } : source
      ),
    }))
  }

  function addSource() {
    setForm((current) => {
      const key = current.sources.length
        ? Math.max(...current.sources.map((source) => source.key)) + 1
        : 0
      return {
        ...current,
        sources: [
          ...current.sources,
          emptySource(contentTypes, sourcePlatforms, key),
        ],
      }
    })
  }

  function removeSource(sourceKey: number) {
    setForm((current) =>
      current.sources.length === 1 && !creatingCard
        ? current
        : {
            ...current,
            sources: current.sources.filter(
              (source) => source.key !== sourceKey
            ),
          }
    )
  }

  async function parseBilibili(sourceKey: number) {
    const source = form.sources.find((candidate) => candidate.key === sourceKey)
    if (!source?.url.trim()) return
    setParsingSourceKey(sourceKey)
    try {
      const result = await parseBilibiliStoryUrl(source.url).send()
      const bilibiliPlatform = sourcePlatforms.find(
        (option) =>
          option.isActive && option.name.toLocaleLowerCase() === "bilibili"
      )
      setForm((current) => ({
        ...current,
        sources: current.sources.map((candidate) =>
          candidate.key === sourceKey
            ? {
                ...candidate,
                url: result.std_url,
                upName: result.up,
                videoTitle: result.title,
                sourcePlatformId:
                  bilibiliPlatform?.id ?? candidate.sourcePlatformId,
              }
            : candidate
        ),
      }))
      toast.success("Bilibili 信息已补全")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setParsingSourceKey(null)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editingCard && story) {
        const category = categories.find(
          (candidate) => candidate.name === form.category
        )
        if (!story.cardId || !category) {
          throw new Error("card target is incomplete")
        }
        await updateWikiStoryCard(story.cardId, {
          agency,
          idol,
          categoryId: category.id,
          cardName: form.cardName,
          subtitle: form.subtitle,
          image: form.image,
          coverAssetId: form.coverMode === "shared" ? form.coverAssetId : null,
          removeImage: form.coverMode === "none",
          imageTransform: form.imageTransform,
          mediaRevision: story.mediaRevision,
        }).send()
      } else if (editingSource && story && "upName" in story) {
        const source = form.sources[0]
        const submission: WikiStorySubmission = {
          agency,
          idol,
          category: form.category,
          cardName: form.cardName,
          subtitle: form.subtitle,
          upName: source.upName,
          videoTitle: source.videoTitle,
          url: source.url,
          contentTypeId: source.contentTypeId,
          sourcePlatformId: source.sourcePlatformId,
          image: form.image,
          imageTransform: form.imageTransform,
          mediaRevision: story.mediaRevision,
        }
        await updateWikiStory(story.id, story, submission).send()
      } else if (addingToExistingCard) {
        if (!story?.cardId) {
          throw new Error("card target is incomplete")
        }
        await createWikiStorySources(story.cardId, {
          agency,
          idol,
          expectedRevision: story.mediaRevision,
          sources: form.sources,
        }).send()
      } else {
        const submission: WikiStoryBatchSubmission = {
          agency,
          idol,
          category: form.category,
          cardName: form.cardName,
          subtitle: form.subtitle,
          sources: form.sources,
          image: form.image,
          coverAssetId: form.coverMode === "shared" ? form.coverAssetId : null,
          imageTransform: form.imageTransform,
        }
        await createWikiStoryBatch(submission).send()
      }
      toast.success(
        editingCard
          ? "剧情卡片已更新"
          : editingSource
            ? "剧情来源已更新"
            : addingToExistingCard
              ? `${form.sources.length} 条剧情来源已新增`
              : form.sources.length
                ? `卡片与 ${form.sources.length} 条来源已新增`
                : "卡片已新增"
      )
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {editingCard
                ? "编辑剧情卡片"
                : editingSource
                  ? "编辑剧情来源"
                  : addingToExistingCard
                    ? "新增剧情来源"
                    : "新增剧情卡片"}
            </DialogTitle>
            <DialogDescription>
              {agency} · {idol}
              {!creatingCard && form.cardName ? ` · ${form.cardName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {showsCardFields ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="wiki-story-category">分类</FieldLabel>
                    {editingCard ? (
                      <Select
                        value={form.category}
                        onValueChange={(value) =>
                          setValue("category", value ?? form.category)
                        }
                      >
                        <SelectTrigger
                          id="wiki-story-category"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          alignItemWithTrigger={false}
                        >
                          <SelectGroup>
                            {categories.map((category) => (
                              <SelectItem
                                key={category.id}
                                value={category.name}
                              >
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <Input
                          id="wiki-story-category"
                          list="wiki-story-categories"
                          required
                          value={form.category}
                          onChange={(event) =>
                            setValue("category", event.target.value)
                          }
                        />
                        <datalist id="wiki-story-categories">
                          {categories.map((category) => (
                            <option key={category.id} value={category.name} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="wiki-story-card-name">
                      卡片名
                    </FieldLabel>
                    <Input
                      id="wiki-story-card-name"
                      required
                      value={form.cardName}
                      onChange={(event) =>
                        setValue("cardName", event.target.value)
                      }
                    />
                    <FieldDescription>
                      保存时自动补齐中文书名括号。
                    </FieldDescription>
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="wiki-story-subtitle">
                    剧情备注
                  </FieldLabel>
                  <Input
                    id="wiki-story-subtitle"
                    value={form.subtitle}
                    onChange={(event) =>
                      setValue("subtitle", event.target.value)
                    }
                  />
                </Field>
              </>
            ) : null}

            {showsSources ? (
              <FieldSet className="min-w-0 gap-3">
                <div className="flex items-center justify-between gap-3">
                  <FieldLegend className="mb-0" variant="label">
                    内容与来源
                  </FieldLegend>
                  {creatingCard || addingToExistingCard ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addSource}
                    >
                      <PlusIcon data-icon="inline-start" />
                      添加来源
                    </Button>
                  ) : null}
                </div>

                {form.sources.map((source, index) => {
                  const parsing = parsingSourceKey === source.key
                  const id = `wiki-story-source-${source.key}`
                  const availableContentTypes = contentTypes.filter(
                    (option) =>
                      option.isActive || option.id === source.contentTypeId
                  )
                  const availableSourcePlatforms = sourcePlatforms.filter(
                    (option) =>
                      option.isActive || option.id === source.sourcePlatformId
                  )
                  return (
                    <div
                      key={source.key}
                      className="flex flex-col gap-4 rounded-md border p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">来源 {index + 1}</p>
                        {creatingCard || addingToExistingCard ? (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={
                              form.sources.length === 1 && !creatingCard
                            }
                            aria-label={`删除来源 ${index + 1}`}
                            title={`删除来源 ${index + 1}`}
                            onClick={() => removeSource(source.key)}
                          >
                            <Trash2Icon />
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor={`${id}-content-type`}>
                            内容类型
                          </FieldLabel>
                          <Select
                            items={availableContentTypes.map((option) => ({
                              value: String(option.id),
                              label: `${option.name}${option.isActive ? "" : "（已停用）"}`,
                            }))}
                            value={String(source.contentTypeId || "")}
                            onValueChange={(value) =>
                              setSourceValue(
                                source.key,
                                "contentTypeId",
                                Number(value)
                              )
                            }
                          >
                            <SelectTrigger
                              id={`${id}-content-type`}
                              className="w-full"
                            >
                              <SelectValue placeholder="选择内容类型" />
                            </SelectTrigger>
                            <SelectContent
                              align="start"
                              alignItemWithTrigger={false}
                            >
                              <SelectGroup>
                                {availableContentTypes.map((option) => (
                                  <SelectItem
                                    key={option.id}
                                    value={String(option.id)}
                                  >
                                    {option.name}
                                    {option.isActive ? "" : "（已停用）"}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${id}-source-platform`}>
                            来源平台
                          </FieldLabel>
                          <Select
                            items={availableSourcePlatforms.map((option) => ({
                              value: String(option.id),
                              label: `${option.name}${option.isActive ? "" : "（已停用）"}`,
                            }))}
                            value={String(source.sourcePlatformId || "")}
                            onValueChange={(value) =>
                              setSourceValue(
                                source.key,
                                "sourcePlatformId",
                                Number(value)
                              )
                            }
                          >
                            <SelectTrigger
                              id={`${id}-source-platform`}
                              className="w-full"
                            >
                              <SelectValue placeholder="选择来源平台" />
                            </SelectTrigger>
                            <SelectContent
                              align="start"
                              alignItemWithTrigger={false}
                            >
                              <SelectGroup>
                                {availableSourcePlatforms.map((option) => (
                                  <SelectItem
                                    key={option.id}
                                    value={String(option.id)}
                                  >
                                    {option.name}
                                    {option.isActive ? "" : "（已停用）"}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <Field>
                        <FieldLabel htmlFor={`${id}-url`}>内容链接</FieldLabel>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            id={`${id}-url`}
                            type="url"
                            required
                            placeholder="https://..."
                            value={source.url}
                            onChange={(event) =>
                              setSourceValue(
                                source.key,
                                "url",
                                event.target.value
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              !source.url.trim() || parsingSourceKey !== null
                            }
                            onClick={() => void parseBilibili(source.key)}
                          >
                            {parsing ? (
                              <LoaderCircleIcon
                                data-icon="inline-start"
                                className="animate-spin"
                              />
                            ) : (
                              <WandSparklesIcon data-icon="inline-start" />
                            )}
                            解析
                          </Button>
                        </div>
                      </Field>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor={`${id}-up-name`}>
                            发布者或署名
                          </FieldLabel>
                          <Input
                            id={`${id}-up-name`}
                            required
                            value={source.upName}
                            onChange={(event) =>
                              setSourceValue(
                                source.key,
                                "upName",
                                event.target.value
                              )
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${id}-video-title`}>
                            内容标题
                          </FieldLabel>
                          <Input
                            id={`${id}-video-title`}
                            required
                            value={source.videoTitle}
                            onChange={(event) =>
                              setSourceValue(
                                source.key,
                                "videoTitle",
                                event.target.value
                              )
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  )
                })}
              </FieldSet>
            ) : null}

            {creatingCard || editingCard ? (
              <Field>
                <FieldLabel>卡片图片与构图</FieldLabel>
                <ToggleGroup
                  value={[form.coverMode]}
                  variant="outline"
                  spacing={0}
                  className="w-full"
                  aria-label="封面来源"
                  onValueChange={(values) => {
                    const coverMode = values[0] as StoryForm["coverMode"]
                    if (!coverMode) return
                    setForm((current) => ({
                      ...current,
                      coverMode,
                      image: coverMode === "custom" ? current.image : null,
                      coverAssetId:
                        coverMode === "shared"
                          ? (current.coverAssetId ??
                            coverAssets.find((asset) => asset.isActive)?.id ??
                            null)
                          : null,
                    }))
                  }}
                >
                  <ToggleGroupItem value="shared" className="flex-1">
                    <ImagesIcon data-icon="inline-start" />
                    共享素材
                  </ToggleGroupItem>
                  <ToggleGroupItem value="custom" className="flex-1">
                    <UploadIcon data-icon="inline-start" />
                    独立上传
                  </ToggleGroupItem>
                  <ToggleGroupItem value="none" className="flex-1">
                    <ImageOffIcon data-icon="inline-start" />
                    无封面
                  </ToggleGroupItem>
                </ToggleGroup>

                {form.coverMode === "shared" ? (
                  <div className="mt-4 flex flex-col gap-4">
                    <Field>
                      <FieldLabel htmlFor="wiki-story-cover-asset">
                        共享素材
                      </FieldLabel>
                      <Select
                        items={coverAssets
                          .filter(
                            (asset) =>
                              asset.isActive || asset.id === form.coverAssetId
                          )
                          .map((asset) => ({
                            label: asset.name,
                            value: String(asset.id),
                          }))}
                        value={
                          form.coverAssetId ? String(form.coverAssetId) : ""
                        }
                        onValueChange={(value) =>
                          setValue("coverAssetId", Number(value) || null)
                        }
                      >
                        <SelectTrigger
                          id="wiki-story-cover-asset"
                          className="w-full"
                        >
                          <SelectValue placeholder="选择企划素材" />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          alignItemWithTrigger={false}
                        >
                          <SelectGroup>
                            {coverAssets
                              .filter(
                                (asset) =>
                                  asset.isActive ||
                                  asset.id === form.coverAssetId
                              )
                              .map((asset) => (
                                <SelectItem
                                  key={asset.id}
                                  value={String(asset.id)}
                                >
                                  {asset.name}
                                  {asset.isActive ? "" : "（已停用）"}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    {selectedCoverAsset ? (
                      <ImageCompositionEditor
                        id="wiki-story-shared-image"
                        file={null}
                        currentUrl={selectedCoverAsset.imageUrl}
                        transform={form.imageTransform}
                        previewRatio="story"
                        disabled={saving}
                        showFileInput={false}
                        onFileChange={() => undefined}
                        onTransformChange={(imageTransform) =>
                          setValue("imageTransform", imageTransform)
                        }
                      />
                    ) : (
                      <FieldDescription>
                        当前企划没有可用素材，请先前往企划素材库上传。
                      </FieldDescription>
                    )}
                  </div>
                ) : form.coverMode === "custom" ? (
                  <div className="mt-4">
                    <ImageCompositionEditor
                      id="wiki-story-image"
                      file={form.image}
                      currentUrl={
                        story?.coverAssetId
                          ? ""
                          : story?.imageUrl || defaults?.imageUrl
                      }
                      transform={form.imageTransform}
                      previewRatio="story"
                      disabled={saving}
                      onFileChange={(image) => setValue("image", image)}
                      onTransformChange={(imageTransform) =>
                        setValue("imageTransform", imageTransform)
                      }
                    />
                  </div>
                ) : null}
              </Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button
              type="submit"
              disabled={
                saving ||
                parsingSourceKey !== null ||
                (form.sources.length > 0 &&
                  (!contentTypes.some((option) => option.isActive) ||
                    !sourcePlatforms.some((option) => option.isActive))) ||
                (showsCardFields &&
                  form.coverMode === "shared" &&
                  !form.coverAssetId)
              }
            >
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              {editingCard || editingSource
                ? "保存修改"
                : creatingCard
                  ? form.sources.length
                    ? `保存卡片与 ${form.sources.length} 个来源`
                    : "仅保存卡片"
                  : `添加 ${form.sources.length} 个来源`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
