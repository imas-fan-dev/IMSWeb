import { useRequest } from "alova/client"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  MapPinnedIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  UsersRoundIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
  adminTextareaClass,
} from "~/pages/admin/components/admin-ui"
import {
  createCommunity,
  createRegion,
  moveItem,
  provinceOptions,
  seriesOptions,
} from "~/pages/admin/producer-map/producer-map-model"
import {
  getAdminProducerMapContent,
  updateAdminProducerMapContent,
  type ProducerMapAdminSnapshot,
  type ProducerMapCommunity,
  type ProducerMapContent,
  type ProducerMapRegion,
} from "~/shared/api"

function formatUpdateTime(value: string | null): string {
  if (!value) return "尚未保存过自定义配置"
  return `最近保存：${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`
}

function VisibilityControl({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium"
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      公开显示
    </label>
  )
}

function OrderActions({
  label,
  index,
  total,
  onMove,
  onRemove,
}: {
  label: string
  index: number
  total: number
  onMove: (offset: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`上移${label}`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`下移${label}`}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`删除${label}`}
        onClick={onRemove}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </div>
  )
}

function SeriesSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: ProducerMapRegion["series"]
  onChange: (value: ProducerMapRegion["series"]) => void
}) {
  return (
    <AdminField label="系列归属" htmlFor={id}>
      <select
        id={id}
        className={adminControlClass}
        value={value}
        onChange={(event) =>
          onChange(event.target.value as ProducerMapRegion["series"])
        }
      >
        {seriesOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </AdminField>
  )
}

function RegionEditor({
  region,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  region: ProducerMapRegion
  index: number
  total: number
  onChange: (region: ProducerMapRegion) => void
  onMove: (offset: number) => void
  onRemove: () => void
}) {
  const prefix = `producer-map-region-${index}`
  return (
    <AdminPanel
      title={region.name || `地区 ${index + 1}`}
      description={region.province}
      icon={MapPinnedIcon}
      action={
        <OrderActions
          label={region.name || `地区 ${index + 1}`}
          index={index}
          total={total}
          onMove={onMove}
          onRemove={onRemove}
        />
      }
      contentClassName="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <AdminField label="行政区" htmlFor={`${prefix}-province`}>
          <select
            id={`${prefix}-province`}
            className={adminControlClass}
            value={region.province}
            onChange={(event) =>
              onChange({
                ...region,
                province: event.target.value,
                name:
                  region.name === region.province
                    ? event.target.value
                    : region.name,
              })
            }
          >
            {provinceOptions.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="地区名称" htmlFor={`${prefix}-name`}>
          <input
            id={`${prefix}-name`}
            className={adminControlClass}
            maxLength={80}
            required
            value={region.name}
            onChange={(event) =>
              onChange({ ...region, name: event.target.value })
            }
          />
        </AdminField>
        <SeriesSelect
          id={`${prefix}-series`}
          value={region.series}
          onChange={(series) => onChange({ ...region, series })}
        />
        <AdminField label="显示状态">
          <VisibilityControl
            id={`${prefix}-enabled`}
            checked={region.enabled}
            onChange={(enabled) => onChange({ ...region, enabled })}
          />
        </AdminField>
      </div>
      <AdminField label="地区 ID" htmlFor={`${prefix}-id`}>
        <input
          id={`${prefix}-id`}
          className={adminControlClass}
          maxLength={80}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
          value={region.id}
          onChange={(event) => onChange({ ...region, id: event.target.value })}
        />
      </AdminField>
      <AdminField label="地区简介" htmlFor={`${prefix}-summary`}>
        <textarea
          id={`${prefix}-summary`}
          className={`${adminTextareaClass} min-h-28`}
          maxLength={1000}
          value={region.summary}
          onChange={(event) =>
            onChange({ ...region, summary: event.target.value })
          }
        />
      </AdminField>
      <div className="grid gap-5 lg:grid-cols-3">
        <AdminField label="联络信息" htmlFor={`${prefix}-contact`}>
          <input
            id={`${prefix}-contact`}
            className={adminControlClass}
            maxLength={240}
            value={region.contact}
            onChange={(event) =>
              onChange({ ...region, contact: event.target.value })
            }
          />
        </AdminField>
        <AdminField label="地区链接" htmlFor={`${prefix}-link`}>
          <input
            id={`${prefix}-link`}
            type="url"
            className={adminControlClass}
            maxLength={500}
            value={region.linkUrl || ""}
            onChange={(event) =>
              onChange({ ...region, linkUrl: event.target.value || null })
            }
          />
        </AdminField>
        <AdminField label="地区图片 URL" htmlFor={`${prefix}-image`}>
          <input
            id={`${prefix}-image`}
            className={adminControlClass}
            maxLength={500}
            value={region.imageUrl || ""}
            onChange={(event) =>
              onChange({ ...region, imageUrl: event.target.value || null })
            }
          />
        </AdminField>
      </div>
    </AdminPanel>
  )
}

function CommunityEditor({
  community,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  community: ProducerMapCommunity
  index: number
  total: number
  onChange: (community: ProducerMapCommunity) => void
  onMove: (offset: number) => void
  onRemove: () => void
}) {
  const prefix = `producer-map-community-${index}`
  return (
    <AdminPanel
      title={community.name || `社群 ${index + 1}`}
      description={community.platform || "未填写平台"}
      icon={UsersRoundIcon}
      action={
        <OrderActions
          label={community.name || `社群 ${index + 1}`}
          index={index}
          total={total}
          onMove={onMove}
          onRemove={onRemove}
        />
      }
      contentClassName="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <AdminField label="社群名称" htmlFor={`${prefix}-name`}>
          <input
            id={`${prefix}-name`}
            className={adminControlClass}
            maxLength={100}
            required
            value={community.name}
            onChange={(event) =>
              onChange({ ...community, name: event.target.value })
            }
          />
        </AdminField>
        <AdminField label="平台" htmlFor={`${prefix}-platform`}>
          <input
            id={`${prefix}-platform`}
            className={adminControlClass}
            maxLength={40}
            required
            value={community.platform}
            onChange={(event) =>
              onChange({ ...community, platform: event.target.value })
            }
          />
        </AdminField>
        <AdminField label="所属地区" htmlFor={`${prefix}-region`}>
          <select
            id={`${prefix}-region`}
            className={adminControlClass}
            value={community.region || ""}
            onChange={(event) =>
              onChange({ ...community, region: event.target.value || null })
            }
          >
            <option value="">全国 / 未指定</option>
            {provinceOptions.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="显示状态">
          <VisibilityControl
            id={`${prefix}-enabled`}
            checked={community.enabled}
            onChange={(enabled) => onChange({ ...community, enabled })}
          />
        </AdminField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <AdminField label="社群 ID" htmlFor={`${prefix}-id`}>
          <input
            id={`${prefix}-id`}
            className={adminControlClass}
            maxLength={80}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            value={community.id}
            onChange={(event) =>
              onChange({ ...community, id: event.target.value })
            }
          />
        </AdminField>
        <SeriesSelect
          id={`${prefix}-series`}
          value={community.series}
          onChange={(series) => onChange({ ...community, series })}
        />
      </div>
      <AdminField label="社群简介" htmlFor={`${prefix}-description`}>
        <textarea
          id={`${prefix}-description`}
          className={`${adminTextareaClass} min-h-24`}
          maxLength={600}
          value={community.description}
          onChange={(event) =>
            onChange({ ...community, description: event.target.value })
          }
        />
      </AdminField>
      <div className="grid gap-5 lg:grid-cols-3">
        <AdminField label="联络信息" htmlFor={`${prefix}-contact`}>
          <input
            id={`${prefix}-contact`}
            className={adminControlClass}
            maxLength={240}
            value={community.contact}
            onChange={(event) =>
              onChange({ ...community, contact: event.target.value })
            }
          />
        </AdminField>
        <AdminField label="社群链接" htmlFor={`${prefix}-link`}>
          <input
            id={`${prefix}-link`}
            type="url"
            className={adminControlClass}
            maxLength={500}
            value={community.linkUrl || ""}
            onChange={(event) =>
              onChange({ ...community, linkUrl: event.target.value || null })
            }
          />
        </AdminField>
        <AdminField label="联络图片 URL" htmlFor={`${prefix}-image`}>
          <input
            id={`${prefix}-image`}
            className={adminControlClass}
            maxLength={500}
            value={community.imageUrl || ""}
            onChange={(event) =>
              onChange({ ...community, imageUrl: event.target.value || null })
            }
          />
        </AdminField>
      </div>
    </AdminPanel>
  )
}

export function ProducerMapManager() {
  const {
    loading,
    error,
    send: refresh,
    onError,
    onSuccess,
  } = useRequest(getAdminProducerMapContent())
  const [draft, setDraft] = useState<ProducerMapContent | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  onError(() => undefined)
  onSuccess((event) => {
    const snapshot = event.data as ProducerMapAdminSnapshot
    setDraft(snapshot.content)
    setRevision(snapshot.revision)
    setDirty(false)
  })

  function change(update: (content: ProducerMapContent) => ProducerMapContent) {
    setDraft((current) => (current ? update(current) : current))
    setDirty(true)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    try {
      const result = await updateAdminProducerMapContent(draft, revision).send()
      setDraft(result.content)
      setRevision(result.revision)
      setDirty(false)
      toast.success("制作人地图已保存")
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "制作人地图保存失败"
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading && !draft) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        正在读取制作人地图配置
      </div>
    )
  }

  if (error || !draft) {
    return (
      <Alert variant="destructive">
        <AlertTitle>制作人地图配置读取失败</AlertTitle>
        <AlertDescription className="mt-2 flex flex-col items-start gap-4">
          <span>{error?.message || "请检查 API 与对象存储连接。"}</span>
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const usedProvinces = new Set(draft.regions.map((region) => region.province))
  const nextProvince = provinceOptions.find(
    (province) => !usedProvinces.has(province)
  )

  return (
    <form className="flex flex-col gap-8" onSubmit={save}>
      <AdminPageHeader
        eyebrow="COMMUNITY DIRECTORY"
        title="制作人地图配置"
        description={`${formatUpdateTime(draft.updatedAt)}。保存后公开地图与社群名录会立即使用新配置。`}
        actions={
          <>
            <Button
              variant="outline"
              render={
                <a href="/producer-map" target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              查看公开页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || saving}
              onClick={() => refresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              重新读取
            </Button>
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? (
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              保存更改
            </Button>
          </>
        }
      />

      <AdminPanel
        title="页面信息"
        description="公开页的标题、说明、名录名称与地图署名。"
        icon={MapPinnedIcon}
        contentClassName="space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="页面标题" htmlFor="producer-map-title">
            <input
              id="producer-map-title"
              className={adminControlClass}
              maxLength={80}
              required
              value={draft.title}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  title: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField label="英文副标题" htmlFor="producer-map-subtitle">
            <input
              id="producer-map-subtitle"
              className={adminControlClass}
              maxLength={120}
              value={draft.subtitle}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  subtitle: event.target.value,
                }))
              }
            />
          </AdminField>
        </div>
        <AdminField label="页面简介" htmlFor="producer-map-introduction">
          <textarea
            id="producer-map-introduction"
            className={`${adminTextareaClass} min-h-24`}
            maxLength={300}
            required
            value={draft.introduction}
            onChange={(event) =>
              change((content) => ({
                ...content,
                introduction: event.target.value,
              }))
            }
          />
        </AdminField>
        <div className="grid gap-5 lg:grid-cols-3">
          <AdminField label="名录标题" htmlFor="producer-map-directory-title">
            <input
              id="producer-map-directory-title"
              className={adminControlClass}
              maxLength={80}
              required
              value={draft.directoryTitle}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  directoryTitle: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField label="地图来源名称" htmlFor="producer-map-source-label">
            <input
              id="producer-map-source-label"
              className={adminControlClass}
              maxLength={100}
              required
              value={draft.mapSourceLabel}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  mapSourceLabel: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField label="地图来源链接" htmlFor="producer-map-source-url">
            <input
              id="producer-map-source-url"
              type="url"
              className={adminControlClass}
              maxLength={500}
              required
              value={draft.mapSourceUrl}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  mapSourceUrl: event.target.value,
                }))
              }
            />
          </AdminField>
        </div>
      </AdminPanel>

      <section className="space-y-4" aria-labelledby="producer-map-regions">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="producer-map-regions" className="text-lg font-semibold">
              地区资料
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.regions.length} 个地区，数组顺序用于筛选与管理展示。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!nextProvince}
            onClick={() => {
              if (!nextProvince) return
              change((content) => ({
                ...content,
                regions: [...content.regions, createRegion(nextProvince)],
              }))
            }}
          >
            <PlusIcon data-icon="inline-start" />
            添加地区
          </Button>
        </div>
        {draft.regions.map((region, index) => (
          <RegionEditor
            key={region.id}
            region={region}
            index={index}
            total={draft.regions.length}
            onChange={(next) =>
              change((content) => ({
                ...content,
                regions: content.regions.map((item, itemIndex) =>
                  itemIndex === index ? next : item
                ),
              }))
            }
            onMove={(offset) =>
              change((content) => ({
                ...content,
                regions: moveItem(content.regions, index, offset),
              }))
            }
            onRemove={() =>
              change((content) => ({
                ...content,
                regions: content.regions.filter(
                  (_, itemIndex) => itemIndex !== index
                ),
              }))
            }
          />
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="producer-map-communities">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="producer-map-communities" className="text-lg font-semibold">
              社群名录
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.communities.length} 个条目，顺序即公开页展示顺序。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={draft.communities.length >= 100}
            onClick={() =>
              change((content) => ({
                ...content,
                communities: [...content.communities, createCommunity()],
              }))
            }
          >
            <PlusIcon data-icon="inline-start" />
            添加社群
          </Button>
        </div>
        {draft.communities.map((community, index) => (
          <CommunityEditor
            key={community.id}
            community={community}
            index={index}
            total={draft.communities.length}
            onChange={(next) =>
              change((content) => ({
                ...content,
                communities: content.communities.map((item, itemIndex) =>
                  itemIndex === index ? next : item
                ),
              }))
            }
            onMove={(offset) =>
              change((content) => ({
                ...content,
                communities: moveItem(content.communities, index, offset),
              }))
            }
            onRemove={() =>
              change((content) => ({
                ...content,
                communities: content.communities.filter(
                  (_, itemIndex) => itemIndex !== index
                ),
              }))
            }
          />
        ))}
      </section>
    </form>
  )
}
