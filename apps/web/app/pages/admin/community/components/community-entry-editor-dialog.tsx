import { AdminImageUploadField } from "~/components/admin/admin-image-upload-field"
import { ConfigurableLucideIcon } from "~/components/lucide-icon"
import { LucideIconPicker } from "~/components/lucide-icon-picker"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { resolveSafeMediaUrl, type CommunityContentEntry } from "~/lib/api"
import { useEffect, useRef, useState } from "react"
import { XIcon } from "lucide-react"
import { AdminField } from "~/components/admin/admin-ui"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog"
import { uploadAdminCommunityContentImage } from "~/lib/api"
import {
  audienceLabel,
  availabilityLabel,
  validateCandidate,
} from "../community-model"
const audienceOptions = Object.entries(audienceLabel)
const availabilityOptions = Object.entries(availabilityLabel)

export function CommunityEntryEditorDialog({
  initial,
  originalId,
  entries,
  onConfirm,
  onCancel,
  returnFocus,
}: {
  initial: CommunityContentEntry
  originalId: string | null
  entries: CommunityContentEntry[]
  onConfirm: (entry: CommunityContentEntry) => void
  onCancel: () => void
  returnFocus: () => HTMLElement | null
}) {
  const [entry, setEntry] = useState(() => ({ ...initial }))
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const session = useRef({
    token: Symbol(),
    sequence: 0,
    active: true,
    pending: false,
  })
  useEffect(() => {
    const current = session.current
    current.active = true
    return () => {
      current.active = false
    }
  }, [])
  function onChange(patch: Partial<CommunityContentEntry>) {
    setEntry((current) => ({ ...current, ...patch }))
    setError("")
  }
  async function onUpload(file: File | null) {
    const current = session.current
    if (!file || current.pending) return
    const token = current.token
    const sequence = ++current.sequence
    const valid = () =>
      session.current.active &&
      session.current.token === token &&
      session.current.sequence === sequence
    current.pending = true
    setUploading(true)
    setError("")
    try {
      const { url } = await uploadAdminCommunityContentImage(file).send()
      if (valid()) setEntry((value) => ({ ...value, imageUrl: url }))
    } catch {
      if (valid()) setError("图片上传失败，请检查格式和大小后重试。")
    } finally {
      if (valid()) {
        current.pending = false
        setUploading(false)
      }
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !session.current.pending) onCancel()
      }}
    >
      <DialogContent
        layout="pinned"
        showCloseButton={false}
        className="sm:max-w-3xl"
        finalFocus={returnFocus}
      >
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (session.current.pending) return
            const message = validateCandidate(entry, entries, originalId)
            if (message) setError(message)
            else onConfirm(entry)
          }}
        >
          <DialogHeader className="pr-11">
            <DialogTitle>
              {originalId === null ? "新增入口" : "编辑入口"}
            </DialogTitle>
            <DialogDescription>
              完成编辑后，使用页面“保存配置”统一保存。
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 max-sm:size-11"
                aria-label="关闭入口编辑器"
                disabled={uploading}
              />
            }
          >
            <XIcon />
          </DialogClose>
          <DialogBody>
            <fieldset
              disabled={uploading}
              className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
            >
              {error && (
                <p
                  role="alert"
                  className="col-span-full text-sm wrap-anywhere text-destructive"
                >
                  {error}
                </p>
              )}
              <div className="min-w-0 space-y-4">
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
                      className="h-10"
                      maxLength={key === "href" ? 500 : 80}
                      onChange={(e) => onChange({ [key]: e.target.value })}
                    />
                  </label>
                ))}
                <label className="block space-y-2">
                  说明
                  <Textarea
                    className="font-sans"
                    maxLength={300}
                    value={entry.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                  />
                </label>
                <AdminField label="展示范围" htmlFor="community-audience">
                  <Select
                    value={entry.audience}
                    onValueChange={(value) =>
                      value &&
                      onChange({
                        audience: value as CommunityContentEntry["audience"],
                      })
                    }
                  >
                    <SelectTrigger
                      id="community-audience"
                      className="w-full data-[size=default]:h-10"
                    >
                      <SelectValue>{audienceLabel[entry.audience]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {audienceOptions.map(([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="min-h-11"
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>
                <AdminField label="可用性" htmlFor="community-availability">
                  <Select
                    value={entry.availability}
                    onValueChange={(value) =>
                      value &&
                      onChange({
                        availability:
                          value as CommunityContentEntry["availability"],
                      })
                    }
                  >
                    <SelectTrigger
                      id="community-availability"
                      className="w-full data-[size=default]:h-10"
                    >
                      <SelectValue>
                        {availabilityLabel[entry.availability]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availabilityOptions.map(([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="min-h-11"
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>
                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    checked={entry.enabled}
                    onCheckedChange={(enabled) => onChange({ enabled })}
                  />
                  显示入口
                </label>
              </div>
              <div className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="community-icon">默认图标</label>
                  <LucideIconPicker
                    id="community-icon"
                    value={entry.icon}
                    onValueChange={(icon) => onChange({ icon })}
                  />
                </div>
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
                    type="button"
                    variant="outline"
                    disabled={!entry.imageUrl}
                    onClick={() => onChange({ imageUrl: null })}
                  >
                    清除图片
                  </Button>
                </div>
                <AdminImageUploadField
                  id="community-image"
                  label="自定义图片"
                  description="支持常用图片格式，最大 10 MB；图片替代默认图标。"
                  disabled={uploading}
                  uploading={uploading}
                  resetAfterSelect
                  onSelect={(file) => void onUpload(file)}
                />
              </div>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={onCancel}
            >
              取消
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading
                ? "正在上传"
                : originalId === null
                  ? "添加入口"
                  : "完成编辑"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
