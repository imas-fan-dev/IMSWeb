import { useRequest } from "alova/client"
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  ImageIcon,
  InfoIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  MonitorIcon,
  MoveIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { cn } from "~/lib/utils"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"
import {
  AdminField,
  AdminPageHeader,
  AdminPanel,
  adminControlClass,
  adminTextareaClass,
} from "~/pages/admin/components/admin-ui"
import {
  getAdminAboutPageContent,
  uploadAboutHeroImage,
  uploadAboutMemberAvatar,
  updateAdminAboutPageContent,
} from "~/lib/api"
import type {
  AboutAdminSnapshot,
  AboutGroup,
  AboutPageContent,
  AboutPerson,
} from "~/lib/api"

function editorId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`
}

function formatUpdateTime(value: string | null): string {
  if (!value) return "尚未保存过自定义配置"
  return `最近保存：${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function previewColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function StringListEditor({
  label,
  values,
  maxItems,
  multiline = false,
  onChange,
}: {
  label: string
  values: string[]
  maxItems: number
  multiline?: boolean
  onChange: (values: string[]) => void
}) {
  return (
    <div className="space-y-3">
      {values.map((value, index) => (
        <div key={`${label}-${index}`} className="flex items-start gap-2">
          <span className="mt-3 w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {index + 1}
          </span>
          {multiline ? (
            <textarea
              className={`${adminTextareaClass} min-h-24`}
              aria-label={`${label} ${index + 1}`}
              maxLength={1000}
              required
              value={value}
              onChange={(event) => {
                const next = [...values]
                next[index] = event.target.value
                onChange(next)
              }}
            />
          ) : (
            <input
              className={adminControlClass}
              aria-label={`${label} ${index + 1}`}
              maxLength={120}
              required
              value={value}
              onChange={(event) => {
                const next = [...values]
                next[index] = event.target.value
                onChange(next)
              }}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`删除${label} ${index + 1}`}
            disabled={values.length === 1}
            onClick={() => onChange(values.filter((_, item) => item !== index))}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={values.length >= maxItems}
        onClick={() => onChange([...values, ""])}
      >
        <ListPlusIcon data-icon="inline-start" />
        添加{label}
      </Button>
    </div>
  )
}

function ImageUrlEditor({
  id,
  label,
  value,
  alt,
  portrait = false,
  showPreview = true,
  previewImageStyle,
  onChange,
}: {
  id: string
  label: string
  value: string | null
  alt: string
  portrait?: boolean
  showPreview?: boolean
  previewImageStyle?: CSSProperties
  onChange: (value: string | null) => void
}) {
  return (
    <AdminField
      label={label}
      htmlFor={id}
      description="支持 / 开头的站内路径或 http、https 链接；清空后隐藏图片"
    >
      <div className="flex items-start gap-4">
        {showPreview ? (
          <div
            className={
              portrait
                ? "flex h-56 w-40 shrink-0 items-end justify-center overflow-hidden rounded-md border bg-muted"
                : "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted"
            }
          >
            {value ? (
              <img
                src={value}
                alt={alt}
                style={previewImageStyle}
                className={
                  portrait
                    ? "size-full object-contain"
                    : "size-full object-cover"
                }
              />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            )}
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <ImageIcon
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={id}
            className={`${adminControlClass} pl-9`}
            maxLength={500}
            value={value || ""}
            onChange={(event) => onChange(event.target.value || null)}
          />
        </div>
      </div>
    </AdminField>
  )
}

function ColorEditor({
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
  const swatchValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"

  return (
    <AdminField
      label={label}
      htmlFor={id}
      description="使用六位十六进制颜色，例如 #B4E04B"
    >
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border bg-background p-1"
          value={swatchValue}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          aria-label={`${label}十六进制值`}
          className={adminControlClass}
          maxLength={7}
          pattern="#[0-9A-Fa-f]{6}"
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </AdminField>
  )
}

function VisualRangeEditor({
  id,
  label,
  value,
  min,
  max,
  suffix,
  description,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  suffix: string
  description: string
  onChange: (value: number) => void
}) {
  return (
    <AdminField label={label} htmlFor={id} description={description}>
      <div className="flex h-10 items-center gap-3">
        <input
          id={id}
          type="range"
          className="min-w-0 flex-1 accent-primary"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output
          htmlFor={id}
          className="w-16 shrink-0 rounded-md border bg-background px-2 py-1 text-center font-mono text-xs"
        >
          {value}
          {suffix}
        </output>
      </div>
    </AdminField>
  )
}

type HeroCompositionPatch = Pick<
  AboutPageContent,
  "heroImageScale" | "heroImageOffsetX" | "heroImageOffsetY"
>

type AboutPreviewMode = "desktop" | "mobile"

const aboutPreviewModes = [
  { value: "desktop", label: "桌面端", icon: MonitorIcon },
  { value: "mobile", label: "移动端", icon: SmartphoneIcon },
] as const

function HeroCompositionPreview({
  content,
  onChange,
}: {
  content: AboutPageContent
  onChange: (patch: HeroCompositionPatch) => void
}) {
  const [previewMode, setPreviewMode] = useState<AboutPreviewMode>("desktop")
  const dragStart = useRef<{
    pointerId: number
    x: number
    y: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const accentStart = previewColor(content.accentColorStart, "#B4E04B")
  const accentEnd = previewColor(content.accentColorEnd, "#E6F9E5")
  const isMobilePreview = previewMode === "mobile"

  function updatePosition(offsetX: number, offsetY: number) {
    onChange({
      heroImageScale: content.heroImageScale,
      heroImageOffsetX: clamp(Math.round(offsetX), -40, 40),
      heroImageOffsetY: clamp(Math.round(offsetY), -40, 40),
    })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: content.heroImageOffsetX,
      offsetY: content.heroImageOffsetY,
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    updatePosition(
      start.offsetX + ((event.clientX - start.x) / bounds.width) * 100,
      start.offsetY + ((event.clientY - start.y) / bounds.height) * 100
    )
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStart.current?.pointerId === event.pointerId) {
      dragStart.current = null
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1
    const movement = {
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
    }[event.key]
    if (!movement) return
    event.preventDefault()
    updatePosition(
      content.heroImageOffsetX + movement[0],
      content.heroImageOffsetY + movement[1]
    )
  }

  const titleGradient: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, ${accentStart}, ${accentEnd})`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
          <MoveIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-sm font-semibold">公开页构图预览</p>
        </div>
        <div className="relative rounded-lg bg-muted p-1">
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md border bg-background shadow-sm transition-transform duration-200 motion-reduce:transition-none",
              isMobilePreview && "translate-x-full"
            )}
          />
          <ToggleGroup
            aria-label="预览设备"
            value={[previewMode]}
            spacing={0}
            className="relative grid grid-cols-2"
            onValueChange={(values) => {
              const nextMode = values[0] as AboutPreviewMode | undefined
              if (nextMode) setPreviewMode(nextMode)
            }}
          >
            {aboutPreviewModes.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="min-w-20 bg-transparent px-3 text-muted-foreground hover:bg-transparent aria-pressed:bg-transparent aria-pressed:text-foreground data-[state=on]:bg-transparent"
              >
                <Icon data-icon="inline-start" aria-hidden="true" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <dl className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <div>
            <dt className="sr-only">预览比例</dt>
            <dd>{isMobilePreview ? "9:16" : "16:9"}</dd>
          </div>
          <div>
            <dt className="sr-only">缩放</dt>
            <dd>{content.heroImageScale}%</dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="重置角色构图"
          title="重置角色构图"
          onClick={() =>
            onChange({
              heroImageScale: 100,
              heroImageOffsetX: 0,
              heroImageOffsetY: 0,
            })
          }
        >
          <RotateCcwIcon aria-hidden />
        </Button>
      </div>

      <div className="overflow-auto bg-muted/30 p-3 sm:p-5">
        <div
          data-testid="about-hero-preview-canvas"
          data-preview-mode={previewMode}
          className={cn(
            "relative mx-auto w-full overflow-hidden bg-[#fcfcfa] shadow-sm transition-[width,aspect-ratio] duration-300 motion-reduce:transition-none",
            isMobilePreview
              ? "aspect-9/16 max-w-96"
              : "aspect-video max-w-7xl min-w-3xl"
          )}
        >
          <div
            role="group"
            tabIndex={0}
            aria-label="角色构图位置，可拖拽或使用方向键调整"
            data-testid="about-hero-composition-preview"
            className={cn(
              "group absolute inset-y-0 z-10 cursor-grab touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:cursor-grabbing",
              isMobilePreview ? "right-[-12%] w-[72%]" : "left-0 w-[44%]"
            )}
            onKeyDown={handleKeyDown}
            onPointerCancel={finishDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
          >
            <div className="pointer-events-none absolute inset-3 z-20 border border-dashed border-black/15 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            <span
              className={cn(
                "pointer-events-none absolute top-5 z-30 grid size-8 place-items-center rounded-md border border-black/10 bg-white/90 text-black/60 shadow-sm",
                isMobilePreview ? "right-16" : "left-5"
              )}
            >
              <MoveIcon className="size-4" aria-hidden />
            </span>
            {content.heroImageUrl ? (
              <img
                src={content.heroImageUrl}
                alt={`${content.heroImageAlt}构图预览`}
                draggable={false}
                className={cn(
                  "pointer-events-none size-full object-contain object-bottom select-none",
                  isMobilePreview && "opacity-20"
                )}
                style={{
                  transform: `translate(${content.heroImageOffsetX}%, ${content.heroImageOffsetY}%) scale(${content.heroImageScale / 100})`,
                  transformOrigin: "center bottom",
                }}
              />
            ) : (
              <div className="grid h-full place-items-center text-black/35">
                <ImageIcon className="size-8" aria-hidden />
              </div>
            )}
          </div>

          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col text-black",
              isMobilePreview ? "w-full px-6 py-8" : "w-[58%] p-[5%]"
            )}
          >
            <p
              className={cn(
                "font-semibold",
                isMobilePreview ? "text-3xl/tight" : "truncate text-2xl"
              )}
              style={titleGradient}
            >
              {content.siteName}
            </p>
            <p
              className={cn(
                "mt-1 text-black/45",
                isMobilePreview ? "text-sm" : "truncate text-xs"
              )}
            >
              {content.siteNameEn}
            </p>
            <div
              className={cn(
                "flex flex-col items-start",
                isMobilePreview ? "mt-8 gap-2" : "mt-[7%] gap-2"
              )}
            >
              {[content.welcome, ...content.manifesto]
                .slice(0, 4)
                .map((item) => (
                  <p
                    key={item}
                    className={cn(
                      "w-fit max-w-full px-3 py-1 text-sm font-medium",
                      isMobilePreview ? "leading-6" : "truncate"
                    )}
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${accentStart}99, ${accentEnd}55)`,
                    }}
                  >
                    {item}
                  </p>
                ))}
            </div>
            <p
              className={cn(
                "font-semibold italic",
                isMobilePreview ? "mt-8 text-right text-2xl" : "mt-[7%] text-sm"
              )}
              style={{ color: accentStart }}
            >
              Since{content.sinceYear}
            </p>
            <div
              className={cn(
                "mt-auto border-l-2 px-5 py-4",
                isMobilePreview ? "mb-4" : "mb-[3%]"
              )}
              style={{
                borderColor: accentStart,
                backgroundImage: `linear-gradient(110deg, ${accentEnd}99, ${accentStart}22)`,
              }}
            >
              <p
                className={cn(
                  "font-semibold",
                  isMobilePreview ? "text-lg" : "text-base"
                )}
              >
                {content.overviewTitle}
              </p>
              <p
                className={cn(
                  "mt-1 leading-relaxed text-black/55",
                  isMobilePreview
                    ? "line-clamp-3 text-sm"
                    : "line-clamp-2 text-xs"
                )}
              >
                {content.overview[0]}
              </p>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-40 grid h-1 grid-cols-6">
            <span className="bg-[#ff5b7f]" />
            <span className="bg-[#2f91df]" />
            <span className="bg-[#efaa19]" />
            <span className="bg-[#39a95b]" />
            <span className="bg-[#aa78df]" />
            <span className="bg-[#e64c34]" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(18rem,1fr)]">
        <VisualRangeEditor
          id="about-hero-image-scale"
          label="角色缩放"
          value={content.heroImageScale}
          min={60}
          max={160}
          suffix="%"
          description="调整角色相对画布的大小"
          onChange={(heroImageScale) =>
            onChange({
              heroImageScale,
              heroImageOffsetX: content.heroImageOffsetX,
              heroImageOffsetY: content.heroImageOffsetY,
            })
          }
        />
        <Collapsible className="border-t pt-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <CollapsibleTrigger
            type="button"
            className="group flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
            <span className="flex-1">精细位置</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              X {content.heroImageOffsetX}% · Y {content.heroImageOffsetY}%
            </span>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-2 sm:grid-cols-2">
            <VisualRangeEditor
              id="about-hero-image-offset-x"
              label="水平偏移"
              value={content.heroImageOffsetX}
              min={-40}
              max={40}
              suffix="%"
              description="负值向左，正值向右"
              onChange={(heroImageOffsetX) =>
                onChange({
                  heroImageScale: content.heroImageScale,
                  heroImageOffsetX,
                  heroImageOffsetY: content.heroImageOffsetY,
                })
              }
            />
            <VisualRangeEditor
              id="about-hero-image-offset-y"
              label="垂直偏移"
              value={content.heroImageOffsetY}
              min={-40}
              max={40}
              suffix="%"
              description="负值向上，正值向下"
              onChange={(heroImageOffsetY) =>
                onChange({
                  heroImageScale: content.heroImageScale,
                  heroImageOffsetX: content.heroImageOffsetX,
                  heroImageOffsetY,
                })
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

function PersonEditor({
  groupId,
  person,
  avatarFile,
  avatarUploading,
  uploadDisabled,
  onChange,
  onAvatarUpload,
  onRemove,
}: {
  groupId: string
  person: AboutPerson
  avatarFile: File | null
  avatarUploading: boolean
  uploadDisabled: boolean
  onChange: (person: AboutPerson) => void
  onAvatarUpload: (file: File | null) => void
  onRemove: () => void
}) {
  const prefix = `${groupId}-${person.id}`

  function update<Key extends keyof AboutPerson>(
    key: Key,
    value: AboutPerson[Key]
  ) {
    onChange({ ...person, [key]: value })
  }

  return (
    <div className="border-l-2 border-border pl-4 sm:pl-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold">
          {person.name || "新成员"}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2Icon data-icon="inline-start" />
          删除成员
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="名称" htmlFor={`${prefix}-name`}>
          <input
            id={`${prefix}-name`}
            className={adminControlClass}
            maxLength={80}
            required
            value={person.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </AdminField>
        <AdminField label="身份" htmlFor={`${prefix}-role`}>
          <input
            id={`${prefix}-role`}
            className={adminControlClass}
            maxLength={80}
            required
            value={person.role}
            onChange={(event) => update("role", event.target.value)}
          />
        </AdminField>
        <AdminField label="加入时间" htmlFor={`${prefix}-since`}>
          <input
            id={`${prefix}-since`}
            className={adminControlClass}
            maxLength={40}
            placeholder="Since 2026"
            value={person.since}
            onChange={(event) => update("since", event.target.value)}
          />
        </AdminField>
        <AdminField
          label="个人主页"
          htmlFor={`${prefix}-profile`}
          description="仅支持 http 或 https 链接"
        >
          <div className="relative">
            <ExternalLinkIcon
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id={`${prefix}-profile`}
              type="url"
              className={`${adminControlClass} pl-9`}
              maxLength={500}
              value={person.profileUrl || ""}
              onChange={(event) =>
                update("profileUrl", event.target.value || null)
              }
            />
          </div>
        </AdminField>
        <div className="flex items-start gap-4 sm:col-span-2">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
            {person.avatarUrl ? (
              <img
                src={person.avatarUrl}
                alt={`${person.name || "新成员"}头像预览`}
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <AdminImageUploadField
              id={`${prefix}-avatar-upload`}
              label="上传头像"
              description="支持 PNG、JPEG、WebP 或 AVIF，单张不超过 10MB；上传后请保存更改以发布。"
              file={avatarFile}
              disabled={uploadDisabled}
              uploading={avatarUploading}
              onSelect={onAvatarUpload}
            />
          </div>
        </div>
      </div>
      <AdminField
        label="简介"
        htmlFor={`${prefix}-description`}
        className="mt-4"
      >
        <textarea
          id={`${prefix}-description`}
          className={`${adminTextareaClass} min-h-24`}
          maxLength={500}
          value={person.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </AdminField>
    </div>
  )
}

function GroupEditor({
  group,
  canRemove,
  avatarUploads,
  uploadDisabled,
  onChange,
  onAvatarUpload,
  onRemove,
}: {
  group: AboutGroup
  canRemove: boolean
  avatarUploads: Record<string, MemberAvatarUploadState | undefined>
  uploadDisabled: boolean
  onChange: (group: AboutGroup) => void
  onAvatarUpload: (groupId: string, personId: string, file: File | null) => void
  onRemove: () => void
}) {
  function updatePerson(index: number, person: AboutPerson) {
    const people = [...group.people]
    people[index] = person
    onChange({ ...group, people })
  }

  function addPerson() {
    onChange({
      ...group,
      people: [
        ...group.people,
        {
          id: editorId("person"),
          name: "",
          role: "",
          description: "",
          since: "",
          profileUrl: null,
          avatarUrl: null,
        },
      ],
    })
  }

  return (
    <AdminPanel
      title={group.title || "新名单分组"}
      description={`${group.people.length} 位成员 · ${group.id}`}
      icon={InfoIcon}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2Icon data-icon="inline-start" />
          删除分组
        </Button>
      }
      contentClassName="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="分组标题" htmlFor={`${group.id}-title`}>
          <input
            id={`${group.id}-title`}
            className={adminControlClass}
            maxLength={80}
            required
            value={group.title}
            onChange={(event) =>
              onChange({ ...group, title: event.target.value })
            }
          />
        </AdminField>
        <AdminField label="英文副标题" htmlFor={`${group.id}-subtitle`}>
          <input
            id={`${group.id}-subtitle`}
            className={adminControlClass}
            maxLength={80}
            value={group.subtitle}
            onChange={(event) =>
              onChange({ ...group, subtitle: event.target.value })
            }
          />
        </AdminField>
      </div>

      {group.people.map((person, index) => (
        <PersonEditor
          key={person.id}
          groupId={group.id}
          person={person}
          avatarFile={
            avatarUploads[memberAvatarUploadKey(group.id, person.id)]?.file ||
            null
          }
          avatarUploading={
            avatarUploads[memberAvatarUploadKey(group.id, person.id)]
              ?.uploading || false
          }
          uploadDisabled={uploadDisabled}
          onChange={(next) => updatePerson(index, next)}
          onAvatarUpload={(file) => onAvatarUpload(group.id, person.id, file)}
          onRemove={() =>
            onChange({
              ...group,
              people: group.people.filter((item) => item.id !== person.id),
            })
          }
        />
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={group.people.length >= 24}
        onClick={addPerson}
      >
        <UserPlusIcon data-icon="inline-start" />
        添加成员
      </Button>
    </AdminPanel>
  )
}

export function meta() {
  return [{ title: "关于页配置 | IMSWeb" }]
}

interface MemberAvatarUploadState {
  file: File
  uploading: boolean
}

function memberAvatarUploadKey(groupId: string, personId: string): string {
  return `${groupId}/${personId}`
}

export function AboutManager() {
  const {
    loading,
    error,
    send: refresh,
    onError,
    onSuccess,
  } = useRequest(getAdminAboutPageContent())
  onError(() => undefined)
  const [draft, setDraft] = useState<AboutPageContent | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [memberAvatarUploads, setMemberAvatarUploads] = useState<
    Record<string, MemberAvatarUploadState | undefined>
  >({})
  const uploadingMemberAvatar = Object.values(memberAvatarUploads).some(
    (upload) => upload?.uploading
  )

  onSuccess((event) => {
    const snapshot = event.data as AboutAdminSnapshot
    setDraft(snapshot.content)
    setRevision(snapshot.revision)
    setDirty(false)
    setMemberAvatarUploads({})
  })

  function change(update: (content: AboutPageContent) => AboutPageContent) {
    setDraft((current) => (current ? update(current) : current))
    setDirty(true)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || uploadingHero || uploadingMemberAvatar) return
    setSaving(true)
    try {
      const result = await updateAdminAboutPageContent(draft, revision).send()
      setDraft(result.content)
      setRevision(result.revision)
      setDirty(false)
      toast.success("关于页已保存")
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "关于页保存失败"
      )
    } finally {
      setSaving(false)
    }
  }

  async function uploadHero(file: File | null) {
    setHeroFile(file)
    if (!file) return
    setUploadingHero(true)
    try {
      const result = await uploadAboutHeroImage(file).send()
      change((content) => ({ ...content, heroImageUrl: result.url }))
      setHeroFile(null)
      toast.success("角色主视觉已上传，请保存更改")
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : "角色主视觉上传失败"
      )
    } finally {
      setUploadingHero(false)
    }
  }

  async function uploadMemberAvatar(
    groupId: string,
    personId: string,
    file: File | null
  ) {
    const uploadKey = memberAvatarUploadKey(groupId, personId)
    if (!file) {
      setMemberAvatarUploads((current) => {
        const next = { ...current }
        delete next[uploadKey]
        return next
      })
      return
    }
    setMemberAvatarUploads((current) => ({
      ...current,
      [uploadKey]: { file, uploading: true },
    }))
    try {
      const result = await uploadAboutMemberAvatar(file).send()
      change((content) => ({
        ...content,
        groups: content.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                people: group.people.map((person) =>
                  person.id === personId
                    ? { ...person, avatarUrl: result.url }
                    : person
                ),
              }
            : group
        ),
      }))
      setMemberAvatarUploads((current) => {
        const next = { ...current }
        delete next[uploadKey]
        return next
      })
      toast.success("成员头像已上传，请保存更改")
    } catch (uploadError) {
      setMemberAvatarUploads((current) => ({
        ...current,
        [uploadKey]: { file, uploading: false },
      }))
      toast.error(
        uploadError instanceof Error ? uploadError.message : "成员头像上传失败"
      )
    }
  }

  if (loading && !draft) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        正在读取关于页配置
      </div>
    )
  }

  if (error || !draft) {
    return (
      <Alert variant="destructive">
        <AlertTitle>关于页配置读取失败</AlertTitle>
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

  return (
    <form className="flex flex-col gap-8" onSubmit={save}>
      <AdminPageHeader
        eyebrow="SITE PROFILE"
        title="关于页配置"
        description={`${formatUpdateTime(draft.updatedAt)}。修改将在保存后立即用于公开关于页。`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={
                loading || saving || uploadingHero || uploadingMemberAvatar
              }
              onClick={() => refresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              重新读取
            </Button>
            <Button
              type="submit"
              disabled={
                !dirty || saving || uploadingHero || uploadingMemberAvatar
              }
            >
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
        title="站点身份"
        description="公开页首屏的品牌名称、宣言与成立年份。"
        icon={InfoIcon}
        contentClassName="space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="站点名称" htmlFor="about-site-name">
            <input
              id="about-site-name"
              className={adminControlClass}
              maxLength={80}
              required
              value={draft.siteName}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  siteName: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField label="成立年份" htmlFor="about-since-year">
            <input
              id="about-since-year"
              type="number"
              className={adminControlClass}
              min={2005}
              max={2100}
              required
              value={draft.sinceYear}
              onChange={(event) =>
                change((content) => ({
                  ...content,
                  sinceYear: Number(event.target.value),
                }))
              }
            />
          </AdminField>
        </div>
        <AdminField label="英文说明" htmlFor="about-site-name-en">
          <input
            id="about-site-name-en"
            className={adminControlClass}
            maxLength={160}
            value={draft.siteNameEn}
            onChange={(event) =>
              change((content) => ({
                ...content,
                siteNameEn: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="欢迎语" htmlFor="about-welcome">
          <input
            id="about-welcome"
            className={adminControlClass}
            maxLength={120}
            required
            value={draft.welcome}
            onChange={(event) =>
              change((content) => ({
                ...content,
                welcome: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="站点简介" htmlFor="about-tagline">
          <textarea
            id="about-tagline"
            className={`${adminTextareaClass} min-h-24`}
            maxLength={240}
            required
            value={draft.tagline}
            onChange={(event) =>
              change((content) => ({
                ...content,
                tagline: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="站点宣言">
          <StringListEditor
            label="宣言"
            values={draft.manifesto}
            maxItems={8}
            onChange={(manifesto) =>
              change((content) => ({ ...content, manifesto }))
            }
          />
        </AdminField>
      </AdminPanel>

      <AdminPanel
        title="首屏主视觉"
        description="替换左侧角色图，并校准不同长宽比素材的缩放、位置与页面渐变。"
        icon={ImageIcon}
        contentClassName="flex flex-col gap-6"
      >
        <HeroCompositionPreview
          content={draft}
          onChange={(patch) => change((content) => ({ ...content, ...patch }))}
        />
        <AdminImageUploadField
          id="about-hero-image-upload"
          name="image"
          label="上传角色主视觉图"
          description="支持 PNG、JPEG、WebP 或 AVIF，单张不超过 10MB；上传后请保存更改以发布。"
          file={heroFile}
          disabled={saving}
          uploading={uploadingHero}
          onSelect={(file) => void uploadHero(file)}
        />
        <ImageUrlEditor
          id="about-hero-image"
          label="角色主视觉图链接"
          value={draft.heroImageUrl}
          alt={`${draft.heroImageAlt}预览`}
          showPreview={false}
          onChange={(heroImageUrl) =>
            change((content) => ({ ...content, heroImageUrl }))
          }
        />
        <AdminField
          label="角色图片替代文本"
          htmlFor="about-hero-image-alt"
          description="用于无障碍阅读和图片加载失败时的说明，不限制具体角色。"
        >
          <input
            id="about-hero-image-alt"
            className={adminControlClass}
            maxLength={120}
            required
            value={draft.heroImageAlt}
            onChange={(event) =>
              change((content) => ({
                ...content,
                heroImageAlt: event.target.value,
              }))
            }
          />
        </AdminField>
        <div className="grid gap-5 sm:grid-cols-2">
          <ColorEditor
            id="about-accent-color-start"
            label="渐变起始色"
            value={draft.accentColorStart}
            onChange={(accentColorStart) =>
              change((content) => ({ ...content, accentColorStart }))
            }
          />
          <ColorEditor
            id="about-accent-color-end"
            label="渐变结束色"
            value={draft.accentColorEnd}
            onChange={(accentColorEnd) =>
              change((content) => ({ ...content, accentColorEnd }))
            }
          />
        </div>
      </AdminPanel>

      <AdminPanel
        title="本站概要"
        description="介绍站点的目标、建设状态、招募与支持方式。"
        icon={InfoIcon}
        contentClassName="space-y-5"
      >
        <AdminField label="概要标题" htmlFor="about-overview-title">
          <input
            id="about-overview-title"
            className={adminControlClass}
            maxLength={80}
            required
            value={draft.overviewTitle}
            onChange={(event) =>
              change((content) => ({
                ...content,
                overviewTitle: event.target.value,
              }))
            }
          />
        </AdminField>
        <AdminField label="概要段落">
          <StringListEditor
            label="段落"
            values={draft.overview}
            maxItems={12}
            multiline
            onChange={(overview) =>
              change((content) => ({ ...content, overview }))
            }
          />
        </AdminField>
      </AdminPanel>

      {draft.groups.map((group, index) => (
        <GroupEditor
          key={group.id}
          group={group}
          canRemove={draft.groups.length > 1}
          avatarUploads={memberAvatarUploads}
          uploadDisabled={saving || uploadingHero}
          onChange={(next) =>
            change((content) => {
              const groups = [...content.groups]
              groups[index] = next
              return { ...content, groups }
            })
          }
          onAvatarUpload={(groupId, personId, file) =>
            void uploadMemberAvatar(groupId, personId, file)
          }
          onRemove={() =>
            change((content) => ({
              ...content,
              groups: content.groups.filter((item) => item.id !== group.id),
            }))
          }
        />
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={draft.groups.length >= 8}
        onClick={() =>
          change((content) => ({
            ...content,
            groups: [
              ...content.groups,
              {
                id: editorId("group"),
                title: "新名单分组",
                subtitle: "Group",
                people: [],
              },
            ],
          }))
        }
      >
        <PlusIcon data-icon="inline-start" />
        添加名单分组
      </Button>
    </form>
  )
}

export default AboutManager
