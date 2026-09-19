import { useEffect, useMemo, useState } from "react"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { toast } from "sonner"

import { RichTextEditor } from "~/components/editorial/rich-text-editor"
import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
} from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  createAdminEditorialChronicle,
  getAdminEditorialChronicle,
  setAdminEditorialStatus,
  updateAdminEditorialChronicle,
  uploadEditorialAsset,
  type EditorialArticle,
} from "~/lib/api"
import { getLiveEvents, type LiveEvent } from "~/lib/api"
import type { Route } from "./+types/editor-page"

const emptyDoc = { type: "doc", content: [] } as Record<string, unknown>

export default function AdminChronicleEditorPage({
  params,
}: Route.ComponentProps) {
  const navigate = useNavigation()
  const isNew = params.entryId === "new"
  const [article, setArticle] = useState<EditorialArticle | null>(null)
  const [title, setTitle] = useState("")
  const [sourceType, setSourceType] = useState<"official" | "community">(
    "official"
  )
  const [summary, setSummary] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [body, setBody] = useState(emptyDoc)
  const [datePrecision, setDatePrecision] = useState<"year" | "month" | "day">(
    "day"
  )
  const [occurredOn, setOccurredOn] = useState("")
  const [endedOn, setEndedOn] = useState("")
  const [location, setLocation] = useState("")
  const [timelineOrder, setTimelineOrder] = useState("0")
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [liveMonth, setLiveMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  )
  const [liveSearch, setLiveSearch] = useState("")
  const [selectedLive, setSelectedLive] = useState<LiveEvent | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    let active = true
    void getAdminEditorialChronicle(Number(params.entryId))
      .send()
      .then((value) => {
        if (!active) return
        setArticle(value)
        setTitle(value.title)
        setSourceType(value.source_type ?? "official")
        setSummary(value.summary)
        setCoverUrl(value.cover_url ?? "")
        setBody((value.body_json as Record<string, unknown>) ?? emptyDoc)
        setDatePrecision(value.date_precision ?? "day")
        setOccurredOn(value.occurred_on ?? "")
        setEndedOn(value.ended_on ?? "")
        setLocation(value.location ?? "")
        setTimelineOrder(String(value.timeline_order ?? 0))
        if (value.live_source_id) {
          const [year = "0", month = "0", day = "0"] = (
            value.live_date ?? "0-0-0"
          ).split("-")
          setSelectedLive({
            id: value.live_source_id,
            year: Number(year),
            month: Number(month),
            day: Number(day),
            title: value.live_title ?? "",
            time: value.live_time ?? "",
            location: value.live_location ?? "",
            detailUrl: value.live_detail_url ?? undefined,
            franchises: value.live_franchises ?? [],
            brandCodes: value.live_brand_codes ?? [],
          })
        }
      })
      .catch((error) => toast.error(adminErrorMessage(error)))
    return () => {
      active = false
    }
  }, [isNew, params.entryId])

  useEffect(() => {
    let active = true
    void getLiveEvents([liveMonth])
      .send()
      .then((events) => {
        if (active) setLiveEvents(events)
      })
      .catch(() => {
        if (active) setLiveEvents([])
      })
    return () => {
      active = false
    }
  }, [liveMonth])

  const filteredLiveEvents = useMemo(
    () =>
      liveEvents.filter((event) =>
        event.title.toLowerCase().includes(liveSearch.trim().toLowerCase())
      ),
    [liveEvents, liveSearch]
  )

  function applyLive(event: LiveEvent) {
    setSelectedLive(event)
    if (!title.trim()) setTitle(event.title)
    if (!occurredOn)
      setOccurredOn(
        `${event.year}-${String(event.month).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`
      )
    if (!location) setLocation(event.location)
  }

  async function upload(file: File) {
    const id = Number(article?.article_id ?? article?.id)
    if (!id) throw new Error("请先保存文章标题")
    return uploadEditorialAsset(id, file, "body", "编年史图片").send()
  }

  async function save(nextStatus?: "publish" | "unpublish" | "archive") {
    setSaving(true)
    try {
      let current = article
      if (!current) {
        const created = await createAdminEditorialChronicle(
          title,
          sourceType
        ).send()
        current = await getAdminEditorialChronicle(created.id).send()
        setArticle(current)
        navigate(`/admin/chronicle/${created.id}`, { replace: true })
      }
      const result = await updateAdminEditorialChronicle(Number(current.id), {
        title,
        summary,
        coverUrl: coverUrl || null,
        bodyJson: body,
        revision: current.revision,
        occurredOn,
        endedOn: endedOn || null,
        datePrecision,
        sourceType,
        location: location || null,
        timelineOrder: Number(timelineOrder),
        liveSourceId: selectedLive?.id ?? null,
        liveTitle: selectedLive?.title ?? null,
        liveDate: selectedLive
          ? `${selectedLive.year}-${selectedLive.month}-${selectedLive.day}`
          : null,
        liveTime: selectedLive?.time ?? null,
        liveLocation: selectedLive?.location ?? null,
        liveDetailUrl: selectedLive?.detailUrl ?? null,
        liveFranchises: selectedLive?.franchises ?? [],
        liveBrandCodes: selectedLive?.brandCodes ?? [],
      }).send()
      setArticle({
        ...current,
        title,
        summary,
        cover_url: coverUrl || null,
        body_json: body,
        revision: result.revision,
        occurred_on: occurredOn,
        ended_on: endedOn || null,
        date_precision: datePrecision,
        source_type: sourceType,
        location,
        timeline_order: Number(timelineOrder),
      })
      if (nextStatus)
        await setAdminEditorialStatus(
          "chronicle",
          Number(current.id),
          nextStatus,
          result.revision
        ).send()
      toast.success(nextStatus === "publish" ? "编年史已发布" : "草稿已保存")
      if (nextStatus) navigate("/admin/chronicle")
    } catch (error) {
      toast.error(adminErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <AdminPageHeader
        eyebrow="EDITORIAL CMS"
        title={isNew ? "新建编年史" : "编辑编年史"}
        description="记录官方或同好组织在过去发生的活动，Live 关联字段后续可从选择器补充。"
        actions={
          <NavigationLink href="/admin/chronicle">
            <Button variant="outline">返回列表</Button>
          </NavigationLink>
        }
      />
      <AdminPanel
        title="文章内容"
        description="发布编年史必须填写年份和来源类型。"
      >
        <div className="grid gap-5">
          <AdminField label="标题">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </AdminField>
          <AdminField label="摘要">
            <Textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </AdminField>
          <AdminField label="封面地址（可选）">
            <Input
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
            />
          </AdminField>
          <AdminField label="正文">
            <RichTextEditor value={body} onChange={setBody} onUpload={upload} />
          </AdminField>
        </div>
      </AdminPanel>
      <AdminPanel
        title="Live 关联（可选）"
        description="Live 接口不可用时不影响手工保存；选择后会保存快照，不会随上游自动变化。"
      >
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <AdminField label="月份">
            <Input
              type="month"
              value={liveMonth}
              onChange={(event) => setLiveMonth(event.target.value)}
            />
          </AdminField>
          <AdminField label="按标题筛选">
            <Input
              value={liveSearch}
              onChange={(event) => setLiveSearch(event.target.value)}
              placeholder="输入 Live 标题"
            />
          </AdminField>
        </div>
        <div className="mt-4 grid gap-2">
          {filteredLiveEvents.slice(0, 12).map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => applyLive(event)}
              className={`rounded-lg border p-3 text-left text-sm transition hover:border-primary ${selectedLive?.id === event.id ? "border-primary bg-primary/5" : ""}`}
            >
              <span className="font-medium">{event.title}</span>
              <span className="mt-1 block text-muted-foreground">
                {event.year}-{event.month}-{event.day} ·{" "}
                {event.location || "地点待补充"}
              </span>
            </button>
          ))}
          {!filteredLiveEvents.length ? (
            <p className="text-sm text-muted-foreground">
              该月份没有匹配的 Live，仍可手工填写。
            </p>
          ) : null}
        </div>
      </AdminPanel>
      <AdminPanel
        title="时间轴字段"
        description="官方和民间内容会进入不同泳道。"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="来源类型">
            <select
              className={adminControlClass}
              value={sourceType}
              onChange={(event) =>
                setSourceType(event.target.value as typeof sourceType)
              }
            >
              <option value="official">官方</option>
              <option value="community">民间</option>
            </select>
          </AdminField>
          <AdminField label="日期精度">
            <select
              className={adminControlClass}
              value={datePrecision}
              onChange={(event) =>
                setDatePrecision(event.target.value as typeof datePrecision)
              }
            >
              <option value="year">年</option>
              <option value="month">月</option>
              <option value="day">日</option>
            </select>
          </AdminField>
          <AdminField label="发生日期">
            <Input
              type={datePrecision === "day" ? "date" : "text"}
              placeholder={
                datePrecision === "year"
                  ? "2026"
                  : datePrecision === "month"
                    ? "2026-08"
                    : "2026-08-18"
              }
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </AdminField>
          <AdminField label="结束日期（可选）">
            <Input
              type="date"
              value={endedOn}
              onChange={(event) => setEndedOn(event.target.value)}
            />
          </AdminField>
          <AdminField label="地点">
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </AdminField>
          <AdminField label="同日排序">
            <Input
              type="number"
              min="0"
              value={timelineOrder}
              onChange={(event) => setTimelineOrder(event.target.value)}
            />
          </AdminField>
        </div>
      </AdminPanel>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={() => void save()}>
          保存草稿
        </Button>
        <Button
          disabled={saving || !title.trim() || !occurredOn}
          onClick={() => void save("publish")}
        >
          发布
        </Button>
        {article?.status === "published" ? (
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => void save("unpublish")}
          >
            撤回
          </Button>
        ) : null}
      </div>
    </div>
  )
}
