import { AdminImageUploadField } from "~/components/admin/admin-image-upload-field"
import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import { LucideIconPicker } from "~/components/lucide-icon-picker"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { resolveSafeMediaUrl, type CommunityContentEntry } from "~/lib/api"
export function CommunityEntryEditor({
  entry,
  index,
  count,
  busy,
  onMove,
  onDelete,
  onChange,
  onUpload,
}: {
  entry: CommunityContentEntry
  index: number
  count: number
  busy: boolean
  onMove: (offset: number) => void
  onDelete: () => void
  onChange: (patch: Partial<CommunityContentEntry>) => void
  onUpload: (file: File | null) => void
}) {
  return (
    <section
      aria-label={`入口 ${index + 1}`}
      className="min-w-0 space-y-4 rounded-lg border bg-background p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-medium">入口 {index + 1}</h2>
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          上移
        </Button>
        <Button
          variant="outline"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          下移
        </Button>
        <Button variant="outline" onClick={() => onDelete()}>
          删除
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["id", "入口 ID"],
            ["title", "名称"],
            ["href", "跳转地址"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-2">
            {label}
            <Input
              value={entry[key]}
              maxLength={key === "href" ? 500 : 80}
              onChange={(e) => onChange({ [key]: e.target.value })}
            />
          </label>
        ))}
        <div className="space-y-2">
          <label htmlFor={`community-icon-${index}`}>默认图标</label>
          <LucideIconPicker
            id={`community-icon-${index}`}
            value={entry.icon}
            onValueChange={(icon) => onChange({ icon })}
          />
        </div>
        <label className="block space-y-2 sm:col-span-2">
          说明
          <Textarea
            maxLength={300}
            value={entry.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </label>
        <label className="block space-y-2">
          展示范围
          <select
            className="h-11 w-full rounded-md border bg-background px-3"
            value={entry.audience}
            onChange={(e) =>
              onChange({
                audience: e.target.value as CommunityContentEntry["audience"],
              })
            }
          >
            <option value="all">全部</option>
            <option value="web">Web</option>
            <option value="app">App</option>
          </select>
        </label>
        <label className="block space-y-2">
          可用性
          <select
            className="h-11 w-full rounded-md border bg-background px-3"
            value={entry.availability}
            onChange={(e) =>
              onChange({
                availability: e.target
                  .value as CommunityContentEntry["availability"],
              })
            }
          >
            <option value="always">始终展示</option>
            <option value="exchange">交换功能开放时展示</option>
          </select>
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <Checkbox
          checked={entry.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
        显示入口
      </label>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          {entry.imageUrl ? (
            <img
              alt="入口图片预览"
              src={resolveSafeMediaUrl(entry.imageUrl) ?? undefined}
              className="size-10 object-contain"
            />
          ) : (
            <ConfigurableLucideIcon
              name={entry.icon}
              className="size-5"
              aria-hidden="true"
            />
          )}
        </span>
        <Button
          variant="outline"
          disabled={!entry.imageUrl}
          onClick={() => onChange({ imageUrl: null })}
        >
          清除图片
        </Button>
      </div>
      <AdminImageUploadField
        id={`community-image-${index}`}
        label="自定义图片"
        description="支持常用图片格式，最大 10 MB；图片替代默认图标。"
        disabled={busy}
        resetAfterSelect
        onSelect={(file) => void onUpload(file)}
      />
    </section>
  )
}
