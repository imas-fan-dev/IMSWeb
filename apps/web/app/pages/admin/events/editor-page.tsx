import {
  ArrowLeftIcon,
  AlignLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  FileTextIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { AdminEmptyState, adminControlClass } from "~/components/admin/admin-ui"
import {
  defaultEditorialCoverTransform,
} from "~/components/editorial/editorial-cover"
import { CommunityPostDetail } from "~/components/editorial/community-post-detail"
import { RichTextEditor } from "~/components/editorial/rich-text-editor"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  createAdminCommunityPost,
  getAdminCommunityPost,
  previewAdminCommunityPost,
  setAdminCommunityPostStatus,
  updateAdminCommunityPost,
  uploadEditorialAsset,
  type EditorialArticle,
  type EditorialCoverTransform,
  type EditorialRelatedLink,
} from "~/lib/api"
import type { Route } from "./+types/editor-page"

const emptyDoc = { type: "doc", content: [] } as Record<string, unknown>

type EventFields = {
  name: string
  contact: string
  startAt: string
  endAt: string
  venueName: string
  address: string
  registrationUrl: string
  eventStatus: "scheduled" | "ongoing" | "ended" | "cancelled"
}

const emptyFields: EventFields = {
  name: "",
  contact: "",
  startAt: "",
  endAt: "",
  venueName: "",
  address: "",
  registrationUrl: "",
  eventStatus: "scheduled",
}

const publishedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function formatPublishedAt(value: unknown) {
  const source = stringValue(value)
  if (!source) return "将在首次发布时记录"
  const date = new Date(source)
  return Number.isNaN(date.valueOf()) ? source : publishedAtFormatter.format(date)
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return ""
  const direct = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  if (direct) return direct[0]
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function hasArticleBody(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasArticleBody)
  if (!value || typeof value !== "object") return false
  const node = value as Record<string, unknown>
  if (node.type === "image") return true
  if (node.type === "text" && typeof node.text === "string" && node.text.trim()) return true
  return Object.values(node).some(hasArticleBody)
}

function initialRelatedLinks(article: EditorialArticle): EditorialRelatedLink[] {
  if (article.related_links.length) return article.related_links
  const legacy = [
    article.registration_url ? { label: "报名 / 查看链接", url: article.registration_url } : null,
    article.source_url ? { label: "查看原页面", url: article.source_url } : null,
  ].filter((link): link is EditorialRelatedLink => Boolean(link))
  return legacy.filter((link, index) => legacy.findIndex((item) => item.url === link.url) === index)
}

function SettingLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-foreground"><span className="mb-1.5 block text-[13px]">{children}</span></label>
}

function CoverCropDialog({
  coverUrl,
  open,
  transform,
  onOpenChange,
  onChange,
}: {
  coverUrl: string
  open: boolean
  transform: EditorialCoverTransform
  onOpenChange: (open: boolean) => void
  onChange: (transform: EditorialCoverTransform) => void
}) {
  const [ratio, setRatio] = useState("aspect-4/3")
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    focalX: number
    focalY: number
    width: number
    height: number
  } | null>(null)

  const imageAspect = imageSize ? imageSize.width / imageSize.height : 4 / 3
  const cropAspect = ratio === "aspect-video" ? 16 / 9 : ratio === "aspect-5/4" ? 5 / 4 : 4 / 3
  const frameScale = 4 - transform.zoom
  const maxFrameWidth = cropAspect >= imageAspect ? 100 : (cropAspect / imageAspect) * 100
  const maxFrameHeight = cropAspect >= imageAspect ? (imageAspect / cropAspect) * 100 : 100
  const frameWidth = maxFrameWidth * (frameScale / 3)
  const frameHeight = maxFrameHeight * (frameScale / 3)
  const frameInsetX = frameWidth / 200
  const frameInsetY = frameHeight / 200
  const frameFocalX = Math.max(frameInsetX, Math.min(1 - frameInsetX, transform.focalX))
  const frameFocalY = Math.max(frameInsetY, Math.min(1 - frameInsetY, transform.focalY))

  function clampFocal(value: number, inset: number) {
    return Math.max(inset, Math.min(1 - inset, value))
  }

  function startDraggingFrame(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      focalX: frameFocalX,
      focalY: frameFocalY,
      width: bounds.width,
      height: bounds.height,
    }
  }

  function dragFrame(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    onChange({
      ...transform,
      focalX: clampFocal(drag.focalX + (event.clientX - drag.startX) / drag.width, frameInsetX),
      focalY: clampFocal(drag.focalY + (event.clientY - drag.startY) / drag.height, frameInsetY),
    })
  }

  function stopDraggingFrame(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>调整列表封面构图</DialogTitle>
          <DialogDescription>详情页始终完整显示原图；这里的焦点与缩放只作用于所有列表缩略图。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2" aria-label="预览比例">
            {[
              ["aspect-4/3", "4:3"],
              ["aspect-video", "16:9"],
              ["aspect-5/4", "5:4"],
            ].map(([value, label]) => <Button key={value} type="button" variant={ratio === value ? "default" : "outline"} size="sm" onClick={() => setRatio(value)}>{label}</Button>)}
          </div>
          <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: imageAspect }} role="presentation">
            <img src={coverUrl} alt="列表封面构图预览" draggable={false} onLoad={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth && naturalHeight) setImageSize({ width: naturalWidth, height: naturalHeight }) }} onDragStart={(event) => event.preventDefault()} className="pointer-events-none size-full select-none object-cover" />
            {imageSize ? <div
              aria-label="拖动构图框调整视觉焦点"
              className="absolute -translate-1/2 cursor-grab touch-none border-2 border-dashed border-primary bg-primary/10 shadow-sm active:cursor-grabbing"
              role="group"
              tabIndex={0}
              style={{ left: `${frameFocalX * 100}%`, top: `${frameFocalY * 100}%`, width: `${frameWidth}%`, height: `${frameHeight}%` }}
              onPointerDown={startDraggingFrame}
              onPointerMove={dragFrame}
              onPointerUp={stopDraggingFrame}
              onPointerCancel={stopDraggingFrame}
            /> : <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">正在读取原图比例</span>}
          </div>
          <p className="text-xs text-muted-foreground">拖动构图框选择原图区域；图片本身不会被拖动。不同列表比例会共用这套构图。</p>
          <label className="block text-sm font-medium">取景框大小：{Math.round(frameScale / 3 * 100)}%<input className="mt-3 w-full accent-primary" type="range" min="1" max="3" step="0.01" value={frameScale} onChange={(event) => { const nextScale = Number(event.target.value); const nextWidth = maxFrameWidth * (nextScale / 3); const nextHeight = maxFrameHeight * (nextScale / 3); onChange({ ...transform, focalX: clampFocal(transform.focalX, nextWidth / 200), focalY: clampFocal(transform.focalY, nextHeight / 200), zoom: 4 - nextScale }) }} /></label>
          <div className="flex justify-between gap-3"><Button type="button" variant="ghost" size="sm" onClick={() => onChange(defaultEditorialCoverTransform)}><RotateCcwIcon data-icon="inline-start" />重置为居中</Button><Button type="button" onClick={() => onOpenChange(false)}>完成</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminEventEditorPage({ params }: Route.ComponentProps) {
  const navigate = useNavigate()
  const isNew = params.eventId === "new"
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [article, setArticle] = useState<EditorialArticle | null>(null)
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<"event" | "notice">("notice")
  const [summary, setSummary] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [coverTransform, setCoverTransform] = useState<EditorialCoverTransform>(defaultEditorialCoverTransform)
  const [body, setBody] = useState<Record<string, unknown>>(emptyDoc)
  const [fields, setFields] = useState<EventFields>(emptyFields)
  const [relatedLinks, setRelatedLinks] = useState<EditorialRelatedLink[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [preview, setPreview] = useState<EditorialArticle | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dirty, setDirty] = useState(isNew)

  useEffect(() => {
    if (isNew) return
    let active = true
    void getAdminCommunityPost(Number(params.eventId)).send().then((value) => {
      if (!active) return
      setArticle(value)
      setTitle(value.title)
      setKind(value.kind ?? "notice")
      setSummary(value.summary)
      setSourceUrl(value.source_url ?? "")
      setCoverUrl(value.cover_url ?? value.image_url ?? "")
      setCoverTransform(value.cover_transform)
      setBody((value.body_json as Record<string, unknown>) ?? emptyDoc)
      setRelatedLinks(initialRelatedLinks(value))
      setFields({
        name: value.name ?? "",
        contact: value.contact ?? "",
        startAt: toDateTimeLocal(value.start_at),
        endAt: toDateTimeLocal(value.end_at),
        venueName: value.venue_name ?? "",
        address: value.address ?? "",
        registrationUrl: value.registration_url ?? "",
        eventStatus: (value.event_status as EventFields["eventStatus"] | undefined) ?? "scheduled",
      })
      setDirty(false)
    }).catch((error) => {
      if (!active) return
      setLoadError(true)
      toast.error(adminErrorMessage(error))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isNew, params.eventId])

  function markDirty() { setDirty(true) }

  function payload(revision: number) {
    return {
      title,
      kind,
      summary,
      sourceUrl: sourceUrl || null,
      coverUrl: coverUrl || null,
      coverTransform,
      bodyJson: body,
      relatedLinks,
      revision,
      ...fields,
    }
  }

  async function persist(): Promise<EditorialArticle | null> {
    if (!title.trim()) { toast.error("请先填写文章标题"); return null }
    let current = article
    if (!current) {
      const created = await createAdminCommunityPost(title.trim(), kind).send()
      current = await getAdminCommunityPost(created.id).send()
      setArticle(current)
      navigate(`/admin/events/${created.id}`, { replace: true })
    }
    const result = await updateAdminCommunityPost(Number(current.id), payload(current.revision)).send()
    const next = {
      ...current,
      ...payload(result.revision),
      cover_url: coverUrl || null,
      cover_transform: coverTransform,
      related_links: relatedLinks,
      source_url: sourceUrl || null,
      revision: result.revision,
    }
    setArticle(next)
    setDirty(false)
    return next
  }

  async function save(status?: "publish" | "unpublish") {
    setSaving(true)
    try {
      const current = await persist()
      if (!current) return
      if (status) {
        const result = await setAdminCommunityPostStatus(Number(current.id), status, current.revision).send()
        setArticle({ ...current, status: result.status as EditorialArticle["status"], revision: result.revision })
      }
      toast.success(status === "publish" ? "文章已发布" : status === "unpublish" ? "文章已撤回" : "草稿已保存")
    } catch (error) { toast.error(adminErrorMessage(error)) } finally { setSaving(false) }
  }

  async function upload(file: File, usage: "cover" | "body") {
    const articleId = Number(article?.article_id)
    if (!articleId) { toast.error("请先保存草稿，再上传图片"); throw new Error("文章尚未创建") }
    const asset = await uploadEditorialAsset(articleId, file, usage, usage === "cover" ? `${title || "文章"}封面` : "正文图片").send()
    if (usage === "cover") {
      setCoverUrl(asset.public_path)
      setCoverTransform(defaultEditorialCoverTransform)
      markDirty()
    }
    return asset
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return
    setCoverUploading(true)
    try { await upload(file, "cover"); toast.success("封面已上传，列表构图已重置") } catch (error) { toast.error(adminErrorMessage(error)) } finally {
      setCoverUploading(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
    }
  }

  async function openPreview() {
    if (!article) { toast.error("请先保存草稿，再使用服务端预览"); return }
    setSaving(true)
    try {
      const result = await previewAdminCommunityPost(Number(article.id), payload(article.revision)).send()
      setPreview(result)
      setPreviewOpen(true)
    } catch (error) { toast.error(adminErrorMessage(error)) } finally { setSaving(false) }
  }

  function updateRelatedLink(index: number, key: keyof EditorialRelatedLink, value: string) {
    setRelatedLinks((current) => current.map((link, currentIndex) => currentIndex === index ? { ...link, [key]: value } : link))
    markDirty()
  }

  function moveRelatedLink(index: number, direction: -1 | 1) {
    setRelatedLinks((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    markDirty()
  }

  const bodyReady = hasArticleBody(body)
  const isPublished = article?.status === "published"
  const saveLabel = saving ? "保存中" : dirty ? "保存草稿" : "已保存"
  const statusOptions: Array<[EventFields["eventStatus"], string]> = [["scheduled", "已排期"], ["ongoing", "进行中"], ["ended", "已结束"], ["cancelled", "已取消"]]

  if (loading) return <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><LoaderCircleIcon className="mr-2 size-4 animate-spin" />正在打开文章编辑器</div>
  if (loadError) return <AdminEmptyState icon={FileTextIcon} title="无法打开文章" description="请返回文章工作台后重试。" />

  return <div className="-mx-4 -my-7 min-h-[calc(100svh-4rem)] bg-muted/15 sm:-mx-6 lg:-mx-8 lg:-my-9 xl:-mx-10">
    <header className="sticky top-16 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-3"><Link to="/admin/events"><Button variant="ghost" size="icon-sm" aria-label="返回文章工作台"><ArrowLeftIcon /></Button></Link><div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-medium">{title || "未命名文章"}</p><p className="mt-0.5 text-xs text-muted-foreground">{dirty ? "有未保存的更改" : isPublished ? `已发布 · ${formatPublishedAt(article?.published_at)}` : "草稿 · 所有更改已保存"}</p></div></div>
      <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2"><Button variant="ghost" size="sm" disabled={saving} onClick={() => void save()}><SaveIcon data-icon="inline-start" />{saveLabel}</Button><Button variant="outline" size="sm" disabled={saving} onClick={() => void openPreview()}><EyeIcon data-icon="inline-start" />预览</Button>{isPublished ? <Button variant="outline" size="sm" disabled={saving} onClick={() => void save("unpublish")}>撤回</Button> : <Button size="sm" disabled={saving || !title.trim()} onClick={() => void save("publish")}><SendIcon data-icon="inline-start" />发布</Button>}</div>
    </header>

    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="grid items-start gap-x-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <header className="min-w-0 lg:col-start-1">
          <div className="flex flex-wrap items-center gap-3"><select aria-label="文章类型" className={`${adminControlClass} w-auto`} value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); markDirty() }}><option value="notice">社区动态</option><option value="event">具体活动</option></select><span className="text-xs text-muted-foreground">{isNew ? "新建文章" : isPublished ? "已发布文章" : "草稿编辑中"}</span></div>
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="article-title" className="inline-flex items-center gap-2 text-base font-semibold">
                <span className="grid size-8 place-items-center rounded-md border bg-primary/10 text-primary"><FileTextIcon className="size-4" aria-hidden="true" /></span>
                文章标题
                <span className="text-sm font-medium text-muted-foreground">必填</span>
              </label>
              <span className="text-sm tabular-nums text-muted-foreground">{title.length} / 160</span>
            </div>
            <Input id="article-title" value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); markDirty() }} placeholder="为这篇文章写下一个清晰的标题" className="mt-3 h-auto rounded-none border-x-0 border-t-0 border-b-2 bg-transparent px-0 py-3 text-4xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/45 focus-visible:border-primary focus-visible:ring-0 sm:text-5xl" />
          </div>
          <div className="mt-7 rounded-xl border bg-background/70 p-4 shadow-xs sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="article-summary" className="inline-flex items-center gap-2 text-base font-semibold">
                <span className="grid size-8 place-items-center rounded-md border bg-muted text-muted-foreground"><AlignLeftIcon className="size-4" aria-hidden="true" /></span>
                文章导语
                <span className="text-sm font-medium text-muted-foreground">可选</span>
              </label>
              <span className="text-sm tabular-nums text-muted-foreground">{summary.length} / 1000</span>
            </div>
            <Textarea id="article-summary" value={summary} maxLength={1000} onChange={(event) => { setSummary(event.target.value); markDirty() }} placeholder="用一两句话概述文章亮点，让读者愿意继续阅读。" className="mt-4 min-h-28 resize-y border-0 bg-transparent p-0 text-lg/8 shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0 sm:text-xl/9" />
          </div>
        </header>

        <main className="mt-9 min-w-0 rounded-xl border bg-card/85 p-4 shadow-sm sm:p-6 lg:col-start-1 lg:row-start-2">
          <section aria-label="文章封面">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">文章封面</h2><p className="text-xs text-muted-foreground">详情页完整显示，列表按构图裁切。</p></div>
            <div className="overflow-hidden rounded-lg border bg-muted">{coverUrl ? <img src={coverUrl} alt="当前文章封面" className="h-auto w-full object-contain" /> : <div className="grid min-h-52 place-items-center gap-2 px-5 text-center text-sm text-muted-foreground"><ImageUpIcon className="size-6" /><span>给文章添加一张封面图</span></div>}</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadCover(event.target.files?.[0])} /><p className="text-xs text-muted-foreground">替换封面会重置列表缩放与焦点。</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={!coverUrl} onClick={() => setCropOpen(true)}><SlidersHorizontalIcon data-icon="inline-start" />调整列表封面构图</Button><Button type="button" variant="outline" size="sm" disabled={coverUploading} onClick={() => coverInputRef.current?.click()}>{coverUploading ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <ImageUpIcon data-icon="inline-start" />}{coverUrl ? "替换封面" : "上传封面"}</Button></div></div>
          </section>
          <section className="mt-9 border-t pt-8" aria-label="文章正文"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-semibold">正文</h2><p className="text-xs text-muted-foreground">正文图片始终按原始比例完整显示。</p></div><RichTextEditor variant="article" value={body} onChange={(next) => { setBody(next); markDirty() }} onUpload={(file) => upload(file, "body")} /></section>
          <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">{bodyReady ? "正文已有内容，可继续完善并保存。" : "从这里开始写作，完成后可在顶部保存或发布。"}</p>
        </main>

        <aside className="mt-8 min-w-0 rounded-xl border bg-card/85 p-5 shadow-sm lg:col-start-2 lg:row-start-2 lg:mt-9 lg:sticky lg:top-24">
          {kind === "event" ? <section aria-labelledby="event-settings-heading"><h2 id="event-settings-heading" className="text-base font-semibold">活动信息</h2><div className="mt-5 space-y-4"><SettingLabel>活动状态<select className={adminControlClass} value={fields.eventStatus} onChange={(event) => { setFields((current) => ({ ...current, eventStatus: event.target.value as EventFields["eventStatus"] })); markDirty() }}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></SettingLabel><SettingLabel>开始时间<Input type="datetime-local" value={fields.startAt} onChange={(event) => { setFields((current) => ({ ...current, startAt: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>结束时间<Input type="datetime-local" value={fields.endAt} onChange={(event) => { setFields((current) => ({ ...current, endAt: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>地点名称<Input value={fields.venueName} onChange={(event) => { setFields((current) => ({ ...current, venueName: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>详细地址<Input value={fields.address} onChange={(event) => { setFields((current) => ({ ...current, address: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>联系方式<Input value={fields.contact} onChange={(event) => { setFields((current) => ({ ...current, contact: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>主办方 / 发布者<Input value={fields.name} onChange={(event) => { setFields((current) => ({ ...current, name: event.target.value })); markDirty() }} /></SettingLabel></div></section> : null}
          <section className={kind === "event" ? "mt-6 border-t pt-5" : ""} aria-labelledby="links-settings-heading"><div className="flex items-center justify-between gap-3"><h2 id="links-settings-heading" className="text-base font-semibold">相关链接</h2><span className="text-xs text-muted-foreground">{relatedLinks.length}/20</span></div><p className="mt-1 text-xs/5 text-muted-foreground">站内链接以 / 开头；外部链接仅支持 HTTP(S)。</p><div className="mt-4 space-y-3">{relatedLinks.map((link, index) => <div key={`${index}-${link.url}`} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center gap-1"><p className="min-w-0 flex-1 text-xs text-muted-foreground">链接 {index + 1}</p><Button type="button" size="icon-sm" variant="ghost" aria-label="上移链接" disabled={index === 0} onClick={() => moveRelatedLink(index, -1)}><ChevronUpIcon /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label="下移链接" disabled={index === relatedLinks.length - 1} onClick={() => moveRelatedLink(index, 1)}><ChevronDownIcon /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label="删除链接" onClick={() => { setRelatedLinks((current) => current.filter((_, currentIndex) => currentIndex !== index)); markDirty() }}><Trash2Icon /></Button></div><Input className="mt-2" value={link.label} maxLength={80} placeholder="链接名称" onChange={(event) => updateRelatedLink(index, "label", event.target.value)} /><Input className="mt-2" value={link.url} maxLength={1000} placeholder="https:// 或 /站内路径" onChange={(event) => updateRelatedLink(index, "url", event.target.value)} /></div>)}</div><Button type="button" className="mt-4 w-full" variant="outline" size="sm" disabled={relatedLinks.length >= 20} onClick={() => { setRelatedLinks((current) => [...current, { label: "", url: "" }]); markDirty() }}><PlusIcon data-icon="inline-start" />添加链接</Button></section>
          <section className="mt-6 border-t pt-5"><h2 className="text-base font-semibold">发布设置</h2><div className="mt-4 space-y-4"><SettingLabel>原页面链接（来源）<Input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); markDirty() }} placeholder="https:// 或 /站内路径" /></SettingLabel><div className="rounded-lg bg-muted/40 p-3 text-xs"><div className="flex items-center gap-2 font-medium"><CheckCircle2Icon className={`size-4 ${isPublished ? "text-success" : "text-muted-foreground"}`} />{isPublished ? "已发布" : "草稿"}</div><p className="mt-1 text-muted-foreground">{isPublished ? `发布于 ${formatPublishedAt(article?.published_at)}` : "保存草稿不会公开文章。"}</p></div><div className="space-y-2 text-xs">{[[Boolean(title.trim()), "标题"], [Boolean(coverUrl), "封面"], [bodyReady || Boolean(sourceUrl), "正文或来源"]].map(([complete, label]) => <div key={label as string} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className={complete ? "text-success" : "text-muted-foreground"}>{complete ? "已完成" : "待补充"}</span></div>)}</div></div></section>
        </aside>
      </div>
    </div>

    {coverUrl ? <CoverCropDialog coverUrl={coverUrl} open={cropOpen} transform={coverTransform} onOpenChange={setCropOpen} onChange={(next) => { setCoverTransform(next); markDirty() }} /> : null}
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[90svh] max-w-6xl overflow-y-auto p-0"><DialogHeader className="border-b p-5"><DialogTitle>公开文章预览</DialogTitle><DialogDescription>使用与用户侧详情页相同的展示结构；预览不会保存草稿。</DialogDescription></DialogHeader>{preview ? <div className="p-6 sm:p-10"><CommunityPostDetail article={preview} /></div> : null}</DialogContent></Dialog>
  </div>
}
