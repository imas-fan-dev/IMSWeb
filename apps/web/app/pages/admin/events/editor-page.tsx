import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { AdminEmptyState, adminControlClass } from "~/components/admin/admin-ui"
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

function SettingSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="border-b border-border/70 px-5 py-5 last:border-b-0"><h3 className="text-sm font-semibold tracking-tight">{title}</h3>{description ? <p className="mt-1 text-xs/5 text-muted-foreground">{description}</p> : null}<div className="mt-4 space-y-4">{children}</div></section>
}

function SettingLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-foreground"><span className="mb-1.5 block text-[13px]">{children}</span></label>
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
  const [body, setBody] = useState<Record<string, unknown>>(emptyDoc)
  const [fields, setFields] = useState<EventFields>(emptyFields)
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [preview, setPreview] = useState<EditorialArticle | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false)
  const [dirty, setDirty] = useState(isNew)

  useEffect(() => {
    if (isNew) return
    let active = true
    setLoading(true)
    void getAdminCommunityPost(Number(params.eventId)).send().then((value) => {
      if (!active) return
      setArticle(value)
      setTitle(value.title)
      setKind(value.kind ?? "notice")
      setSummary(value.summary)
      setSourceUrl(value.source_url ?? "")
      setCoverUrl(value.cover_url ?? value.image_url ?? "")
      setBody((value.body_json as Record<string, unknown>) ?? emptyDoc)
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

  function markDirty() {
    setDirty(true)
  }

  function payload(revision: number) {
    return {
      title,
      kind,
      summary,
      sourceUrl: sourceUrl || null,
      coverUrl: coverUrl || null,
      bodyJson: body,
      revision,
      ...fields,
    }
  }

  async function persist(): Promise<EditorialArticle | null> {
    if (!title.trim()) {
      toast.error("请先填写文章标题")
      return null
    }
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
    } catch (error) {
      toast.error(adminErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function upload(file: File, usage: "cover" | "body") {
    const articleId = Number(article?.article_id)
    if (!articleId) {
      toast.error("请先保存草稿，再上传图片")
      throw new Error("文章尚未创建")
    }
    const asset = await uploadEditorialAsset(articleId, file, usage, usage === "cover" ? `${title || "文章"}封面` : "正文图片").send()
    if (usage === "cover") {
      setCoverUrl(asset.public_path)
      markDirty()
    }
    return asset
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return
    setCoverUploading(true)
    try {
      await upload(file, "cover")
      toast.success("封面已上传")
    } catch (error) {
      toast.error(adminErrorMessage(error))
    } finally {
      setCoverUploading(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
    }
  }

  async function openPreview() {
    if (!article) {
      toast.error("请先保存草稿，再使用服务端预览")
      return
    }
    setSaving(true)
    try {
      const result = await previewAdminCommunityPost(Number(article.id), payload(article.revision)).send()
      setPreview(result)
      setPreviewOpen(true)
    } catch (error) {
      toast.error(adminErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const bodyReady = hasArticleBody(body)
  const isPublished = article?.status === "published"
  const saveLabel = saving ? "保存中" : dirty ? "保存草稿" : "已保存"

  if (loading) return <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><LoaderCircleIcon className="mr-2 size-4 animate-spin" />正在打开文章编辑器</div>
  if (loadError) return <AdminEmptyState icon={FileTextIcon} title="无法打开文章" description="请返回文章工作台后重试。" />

  return <div className="relative -mx-4 -my-7 min-h-[calc(100svh-4rem)] bg-[linear-gradient(180deg,var(--background)_0%,color-mix(in_oklch,var(--muted)_45%,transparent)_38rem,var(--background)_100%)] sm:-mx-6 lg:-mx-8 lg:-my-9 xl:-mx-10">
    <header className="sticky top-16 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-background/92 px-4 py-3 shadow-[0_1px_0_color-mix(in_oklch,var(--border)_70%,transparent)] backdrop-blur-xl sm:px-6 lg:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/admin/events"><Button variant="ghost" size="icon-sm" aria-label="返回文章工作台"><ArrowLeftIcon /></Button></Link>
        <div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-medium">{title || "未命名文章"}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-1.5 rounded-full ${dirty ? "bg-warning" : "bg-success"}`} />{dirty ? "有未保存的更改" : isPublished ? `已发布 · ${formatPublishedAt(article?.published_at)}` : "草稿 · 所有更改已保存"}</p></div>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save()}><SaveIcon data-icon="inline-start" />{saveLabel}</Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={() => void openPreview()}><EyeIcon data-icon="inline-start" />预览</Button>
        {isPublished ? <Button variant="outline" size="sm" disabled={saving} onClick={() => void save("unpublish")}>撤回</Button> : <Button size="sm" disabled={saving || !title.trim()} onClick={() => void save("publish")}><SendIcon data-icon="inline-start" />发布</Button>}
      </div>
    </header>

    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8 lg:py-10 xl:px-10">
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10">
        <main className="min-w-0 xl:pb-12">
          <article className="mx-auto w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-border/80 bg-background shadow-[0_20px_60px_rgb(15_23_42/0.08)]">
            <div className="flex h-1.5"><span className="flex-1 bg-franchise-765" /><span className="flex-1 bg-franchise-ml" /><span className="flex-1 bg-franchise-sidem" /><span className="flex-1 bg-franchise-sc" /></div>
            <div className="border-b border-border/70 bg-muted/25 px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-primary"><span className="grid size-7 place-items-center rounded-full bg-primary/10"><FileTextIcon className="size-3.5" /></span>ARTICLE STUDIO</div><span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">{isNew ? "新建文章" : isPublished ? "已发布文章" : "草稿编辑中"}</span></div>
              <p className="mt-3 text-sm text-muted-foreground">从标题、导语到正文，在同一张稿纸上完成文章编排。</p>
            </div>

            <div className="space-y-9 px-5 py-7 sm:px-8 sm:py-9">
              <section aria-label="文章标题"><div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold tracking-[0.12em] text-primary">01 / ARTICLE TITLE</p><p className="text-xs tabular-nums text-muted-foreground">{title.length} / 160</p></div><label className="sr-only" htmlFor="article-title">文章标题</label><Input id="article-title" value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); markDirty() }} placeholder="为这篇文章写下一个标题" className="mt-3 h-auto rounded-none border-x-0 border-t-0 border-b-2 border-border bg-transparent px-0 py-3 text-3xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/45 focus-visible:border-primary focus-visible:ring-0 sm:text-5xl" /></section>

              <section className="rounded-2xl border border-primary/10 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_6%,transparent),transparent_62%)] p-4 sm:p-5" aria-label="文章摘要"><div className="flex items-center justify-between gap-3"><label htmlFor="article-summary" className="text-sm font-semibold">文章导语 <span className="font-normal text-muted-foreground">（可选）</span></label><p className="text-xs tabular-nums text-muted-foreground">{summary.length} / 1000</p></div><Textarea id="article-summary" value={summary} maxLength={1000} onChange={(event) => { setSummary(event.target.value); markDirty() }} placeholder="用一两句话给读者一个想继续读下去的理由。" className="mt-3 min-h-28 resize-y border-0 bg-background/75 px-4 py-3 shadow-none focus-visible:ring-1" /></section>

              <section aria-label="文章封面"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-primary">02 / COVER IMAGE</p><h2 className="mt-1 text-lg font-semibold tracking-tight">文章封面</h2></div><p className="text-xs text-muted-foreground">推荐 16:9，会展示在文章列表和详情页。</p></div><div className="overflow-hidden rounded-2xl border border-border/80 bg-muted/30"><div className="group relative aspect-video bg-muted">{coverUrl ? <img src={coverUrl} alt="当前文章封面" className="size-full object-cover" /> : <div className="grid size-full place-items-center gap-2 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_11%,transparent),transparent_52%)] text-sm text-muted-foreground"><span className="grid size-12 place-items-center rounded-full border border-primary/15 bg-background/80 text-primary"><ImageUpIcon className="size-5" /></span><span>给文章添加一张封面图</span></div>}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-background/85 px-4 py-3"><p className="text-xs text-muted-foreground">{coverUrl ? "封面已就绪，可随时替换。" : "一张好封面能让文章在列表中更容易被发现。"}</p><input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadCover(event.target.files?.[0])} /><Button type="button" variant="outline" size="sm" disabled={coverUploading} onClick={() => coverInputRef.current?.click()}>{coverUploading ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <ImageUpIcon data-icon="inline-start" />}{coverUrl ? "替换封面" : "上传封面"}</Button></div></div></section>

              <section aria-label="文章正文"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-primary">03 / ARTICLE BODY</p><h2 className="mt-1 text-lg font-semibold tracking-tight">开始写作</h2></div><p className="text-xs text-muted-foreground">支持标题、列表、引用、链接和图片。</p></div><RichTextEditor variant="article" value={body} onChange={(next) => { setBody(next); markDirty() }} onUpload={(file) => upload(file, "body")} /></section>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-5 py-4 text-xs text-muted-foreground sm:px-8"><span>{bodyReady ? "正文已有内容，可继续完善并保存。" : "从这里开始写作，完成后可在右上角保存或发布。"}</span><span className="hidden sm:inline">内容会作为草稿保存，不会自动公开。</span></div>
          </article>
        </main>

        <aside className="min-w-0 xl:sticky xl:top-36">
          <div className="overflow-hidden rounded-[1.5rem] border border-border/80 bg-background/95 shadow-[0_16px_45px_rgb(15_23_42/0.1)] backdrop-blur-sm">
            <div className="border-b border-border/70 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_72%)] px-5 py-5"><p className="text-xs font-semibold tracking-[0.12em] text-primary">PUBLISHING PANEL</p><h2 className="mt-1 text-lg font-semibold tracking-tight">文章设置</h2><p className="mt-1 text-xs/5 text-muted-foreground">关键发布信息始终留在视线内。</p></div>
            <SettingSection title="发布信息"><div className="rounded-xl border border-primary/12 bg-primary/4 p-3.5"><div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-full ${isPublished ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}><CheckCircle2Icon className="size-4" /></span><p className="font-medium">{isPublished ? "已发布" : "草稿"}</p></div><p className="mt-2 text-xs text-muted-foreground">{isPublished ? `发布于 ${formatPublishedAt(article?.published_at)}` : "保存草稿不会公开文章。"}</p></div></SettingSection>
            <SettingSection title="文章属性"><SettingLabel>文章类型<select className={adminControlClass} value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); markDirty() }}><option value="notice">普通文章</option><option value="event">具体活动</option></select></SettingLabel><SettingLabel>原页面链接（可选）<Input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); markDirty() }} placeholder="https:// 或 /sites/..." /></SettingLabel>{kind === "event" ? <Button type="button" variant="outline" className="w-full" onClick={() => setEventDetailsOpen(true)}>编辑活动详情</Button> : null}</SettingSection>
            <SettingSection title="发布检查"><div className="space-y-2.5 text-xs">{[[Boolean(title.trim()), "标题"], [Boolean(coverUrl), "封面"], [bodyReady || Boolean(sourceUrl), "正文或来源"]].map(([complete, label]) => <div key={label as string} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className={`flex items-center gap-1 font-medium ${complete ? "text-success" : "text-muted-foreground"}`}>{complete ? <CheckCircle2Icon className="size-3.5" /> : null}{complete ? "已完成" : "待补充"}</span></div>)}</div></SettingSection>
          </div>
        </aside>
      </div>
    </div>

    <Dialog open={eventDetailsOpen} onOpenChange={setEventDetailsOpen}><DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto p-0"><DialogHeader className="border-b p-5"><DialogTitle>具体活动详情</DialogTitle><DialogDescription>这些结构化信息会随文章保存。设置完成后回到顶部保存或发布。</DialogDescription></DialogHeader><div className="grid gap-5 p-5 sm:grid-cols-2">{([['name', '主办方'], ['contact', '联系方式'], ['venueName', '地点名称'], ['address', '地址'], ['registrationUrl', '报名链接']] as const).map(([key, label]) => <SettingLabel key={key}>{label}<Input value={fields[key]} onChange={(event) => { setFields((current) => ({ ...current, [key]: event.target.value })); markDirty() }} /></SettingLabel>)}<SettingLabel>开始时间<Input type="datetime-local" value={fields.startAt} onChange={(event) => { setFields((current) => ({ ...current, startAt: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>结束时间<Input type="datetime-local" value={fields.endAt} onChange={(event) => { setFields((current) => ({ ...current, endAt: event.target.value })); markDirty() }} /></SettingLabel><SettingLabel>活动状态<select className={adminControlClass} value={fields.eventStatus} onChange={(event) => { setFields((current) => ({ ...current, eventStatus: event.target.value as EventFields["eventStatus"] })); markDirty() }}><option value="scheduled">已排期</option><option value="ongoing">进行中</option><option value="ended">已结束</option><option value="cancelled">已取消</option></select></SettingLabel></div><div className="flex justify-end border-t bg-muted/20 p-4"><Button type="button" onClick={() => setEventDetailsOpen(false)}>完成</Button></div></DialogContent></Dialog>

    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[90svh] max-w-5xl overflow-y-auto p-0"><DialogHeader className="border-b p-5"><DialogTitle>公开文章预览</DialogTitle><DialogDescription>使用与用户侧详情页相同的服务端正文渲染结果；预览不会保存草稿。</DialogDescription></DialogHeader>{preview ? <article className="mx-auto max-w-3xl p-6 sm:p-10"><p className="text-xs font-semibold tracking-[0.14em] text-primary">COMMUNITY ARTICLE</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{preview.title}</h1><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span>IMSWeb 社区编辑部</span><span>{formatPublishedAt(article?.published_at)}</span></div>{preview.summary ? <p className="mt-7 text-lg/8 text-muted-foreground">{preview.summary}</p> : null}{preview.cover_url ? <img src={preview.cover_url} alt="" className="mt-8 aspect-video w-full rounded-xl border object-cover" /> : null}{preview.body_html ? <div className="prose prose-neutral mt-10 max-w-none prose-headings:font-semibold prose-a:text-primary prose-img:rounded-xl prose-img:border dark:prose-invert" dangerouslySetInnerHTML={{ __html: preview.body_html }} /> : <div className="mt-10 rounded-xl border bg-muted/20 p-6 text-sm text-muted-foreground">当前文章没有富文本正文；公开页面会展示标题、封面和来源链接。</div>}</article> : null}</DialogContent></Dialog>
  </div>
}
