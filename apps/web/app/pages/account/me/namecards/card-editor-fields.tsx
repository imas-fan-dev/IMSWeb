import {
  FileImageIcon,
  ImageOffIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  UploadIcon,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { toast } from "sonner"

import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import { SeriesMultiSelect } from "~/components/community/series-multi-select"
import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import type {
  FudabaCardFields,
  FudabaCardMediaSide,
  FudabaSeries,
} from "~/lib/api"
import {
  NAMECARD_PRODUCTION_YEAR_MAX,
  NAMECARD_PRODUCTION_YEAR_MIN,
} from "@imsweb/contracts/fudaba/runtime"

import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import { CreditsEditor } from "./card-credits-editor"
import { useOwnerCardMedia } from "./use-owner-card-media"

export function useObjectUrl(file: File | null) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null
  )

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") return
    const url = URL.createObjectURL(file)
    let disposed = false
    queueMicrotask(() => {
      if (!disposed) setPreview({ file, url })
    })
    return () => {
      disposed = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  return preview?.file === file ? preview.url : null
}

export function CardPreview({
  frontUrl,
  backUrl,
  title,
  renderUpload,
}: {
  frontUrl: string | null
  backUrl: string | null
  title: string
  renderUpload?: (side: FudabaCardMediaSide) => ReactNode
}) {
  const front = useOwnerCardMedia(frontUrl)
  const back = useOwnerCardMedia(backUrl)
  return (
    <Tabs defaultValue="front" className="min-w-0">
      <TabsList className="w-full" aria-label="名片预览面">
        <TabsTrigger value="front">正面预览</TabsTrigger>
        <TabsTrigger value="back">背面预览</TabsTrigger>
      </TabsList>
      {(
        [
          ["front", front, frontUrl, "正面"],
          ["back", back, backUrl, "背面"],
        ] as const
      ).map(([side, media, source, label]) => (
        <TabsContent key={side} value={side} className="group relative mt-3">
          {media.src ? (
            <CoverImagePreview
              key={media.src}
              src={media.src}
              alt={`${title || "新名片"}${label}`}
              previewLabel="名片"
              className="aspect-3/2 w-full border bg-muted"
              imageClassName="object-contain"
            />
          ) : (
            <div className="flex aspect-3/2 w-full items-center justify-center border bg-muted/40 text-muted-foreground">
              <div className="flex flex-col items-center gap-2 text-sm">
                <ImageOffIcon aria-hidden="true" />
                {source
                  ? media.failed
                    ? "图片加载失败"
                    : "加载图片"
                  : `尚未选择${label}图片`}
                {media.failed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={media.retry}
                  >
                    重试加载
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {renderUpload?.(side)}
        </TabsContent>
      ))}
    </Tabs>
  )
}

const PRODUCTION_YEAR_MIN = NAMECARD_PRODUCTION_YEAR_MIN
const PRODUCTION_YEAR_MAX = NAMECARD_PRODUCTION_YEAR_MAX
const PRODUCTION_YEARS = Array.from(
  { length: PRODUCTION_YEAR_MAX - PRODUCTION_YEAR_MIN + 1 },
  (_, index) => String(PRODUCTION_YEAR_MAX - index)
)
const PRODUCTION_MONTHS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
)
const PRODUCTION_DAYS = Array.from({ length: 31 }, (_, index) =>
  String(index + 1).padStart(2, "0")
)

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; every part is optional but the year. */
function splitMadeOn(value: string | null) {
  const [year = "", month = "", day = ""] = (value ?? "").split("-")
  return { year, month: year ? month : "", day: year && month ? day : "" }
}

function joinMadeOn(year: string, month: string, day: string): string | null {
  if (!year) return null
  if (!month) return year
  if (!day) return `${year}-${month}`
  return `${year}-${month}-${day}`
}

const EXCHANGE_MODE_OPTIONS = [
  { value: "auto", label: "自动交换", hint: "对方确认后立即交换" },
  { value: "manual", label: "手动确认", hint: "需要你逐张确认交换请求" },
  { value: "none", label: "不参与交换", hint: "只在名片墙展示" },
] as const

export function CardFields({
  draft,
  series,
  disabled,
  onChange,
}: {
  draft: FudabaCardFields
  series: FudabaSeries[]
  disabled: boolean
  onChange: (draft: FudabaCardFields) => void
}) {
  const { catalog, loading, failed } = useNamecardCharacterCatalog()
  const madeOn = splitMadeOn(draft.madeOn)

  useEffect(() => {
    if (failed) {
      toast.error("担当角色目录载入失败，请稍后重试")
    }
  }, [failed])

  function patch(next: Partial<FudabaCardFields>) {
    onChange({ ...draft, ...next })
  }

  return (
    <FieldGroup>
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-producer-name">
            制作人名称
          </FieldLabel>
          <Input
            id="exchange-card-producer-name"
            value={draft.producerName}
            maxLength={80}
            required
            disabled={disabled}
            onChange={(event) => patch({ producerName: event.currentTarget.value })}
          />
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-producer-reading">
            制作人名读音
          </FieldLabel>
          <Input
            id="exchange-card-producer-reading"
            value={draft.producerReading ?? ""}
            maxLength={80}
            disabled={disabled}
            placeholder="例：シェイシェイ"
            onChange={(event) => {
              const value = event.currentTarget.value
              patch({ producerReading: value ? value : null })
            }}
          />
          <FieldDescription>
            仅可使用日文假名与英文字母，用于按读音排序。
          </FieldDescription>
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-group-name">团体名称</FieldLabel>
          <Input
            id="exchange-card-group-name"
            value={draft.groupName ?? ""}
            maxLength={80}
            disabled={disabled}
            placeholder="以团体名义投稿时填写"
            onChange={(event) => {
              const value = event.currentTarget.value
              patch({ groupName: value ? value : null })
            }}
          />
        </Field>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="exchange-card-made-on-year">制作时间</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Select
              value={madeOn.year || undefined}
              disabled={disabled}
              onValueChange={(value) => {
                const year = String(value ?? "")
                patch({
                  madeOn: year
                    ? joinMadeOn(year, madeOn.month, madeOn.day)
                    : null,
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-year" className="w-full">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {PRODUCTION_YEARS.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year} 年
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={madeOn.month || undefined}
              disabled={disabled || !madeOn.year}
              onValueChange={(value) => {
                const month = String(value ?? "")
                patch({
                  madeOn: joinMadeOn(madeOn.year, month, month ? madeOn.day : ""),
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-month" className="w-full">
                <SelectValue placeholder="月份" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {PRODUCTION_MONTHS.map((month) => (
                    <SelectItem key={month} value={month}>
                      {Number(month)} 月
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={madeOn.day || undefined}
              disabled={disabled || !madeOn.month}
              onValueChange={(value) => {
                const day = String(value ?? "")
                patch({
                  madeOn: joinMadeOn(madeOn.year, madeOn.month, day),
                })
              }}
            >
              <SelectTrigger id="exchange-card-made-on-day" className="w-full">
                <SelectValue placeholder="日" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {PRODUCTION_DAYS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {Number(day)} 日
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <FieldDescription>可以只填到年份或月份。</FieldDescription>
        </Field>
      </FieldGroup>

      <SeriesMultiSelect
        id="exchange-card-series"
        series={series}
        selectedCodes={draft.seriesCodes}
        disabled={disabled}
        onChange={(seriesCodes) => patch({ seriesCodes })}
      />

      <CharacterMultiSelect
        id="exchange-card-characters"
        catalog={catalog}
        loading={loading}
        selectedIds={draft.favoriteCharacterIds}
        disabled={disabled || loading}
        onChange={(favoriteCharacterIds) => patch({ favoriteCharacterIds })}
      />

      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor="exchange-card-exchange-mode">交换方式</FieldLabel>
        <Select
          value={draft.exchangeMode}
          disabled={disabled}
          onValueChange={(value) =>
            patch({ exchangeMode: String(value) as FudabaCardFields["exchangeMode"] })
          }
        >
          <SelectTrigger id="exchange-card-exchange-mode" className="w-full sm:max-w-sm">
            <SelectValue>
              {EXCHANGE_MODE_OPTIONS.find(
                (option) => option.value === draft.exchangeMode
              )?.label ?? draft.exchangeMode}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {EXCHANGE_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {EXCHANGE_MODE_OPTIONS.find((option) => option.value === draft.exchangeMode)
            ?.hint ?? ""}
        </FieldDescription>
      </Field>

      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-is-original"
            checked={draft.isOriginal}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ isOriginal: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-is-original">原创作品</FieldLabel>
            <FieldDescription>画面由自己绘制。</FieldDescription>
          </div>
        </Field>
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-made-with-ai"
            checked={draft.madeWithAi}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ madeWithAi: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-made-with-ai">
              使用 AI 生成
            </FieldLabel>
            <FieldDescription>会在名片上标注。</FieldDescription>
          </div>
        </Field>
        <Field orientation="horizontal" data-disabled={disabled || undefined}>
          <Checkbox
            id="exchange-card-visible"
            checked={draft.visible}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ visible: checked === true })}
          />
          <div className="min-w-0">
            <FieldLabel htmlFor="exchange-card-visible">公开名片</FieldLabel>
            <FieldDescription>审核通过后出现在名片墙。</FieldDescription>
          </div>
        </Field>
      </FieldGroup>

      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor="exchange-card-bio">名片简介</FieldLabel>
        <Textarea
          id="exchange-card-bio"
          value={draft.bio}
          maxLength={2000}
          disabled={disabled}
          className="min-h-24 resize-y"
          onChange={(event) => patch({ bio: event.currentTarget.value })}
        />
      </Field>

      <Field data-disabled={disabled || undefined}>
        <FieldLabel htmlFor="exchange-card-trade-note">交换说明</FieldLabel>
        <Textarea
          id="exchange-card-trade-note"
          value={draft.tradeNote}
          maxLength={1000}
          disabled={disabled}
          className="min-h-20 resize-y"
          onChange={(event) => patch({ tradeNote: event.currentTarget.value })}
        />
      </Field>

      <CreditsEditor
        credits={draft.credits}
        disabled={disabled}
        onChange={(credits) => patch({ credits })}
      />
    </FieldGroup>
  )
}

export function CardImageFields({
  mode,
  side: selectedSide,
  frontFile,
  backFile,
  disabled,
  saving,
  preparingSide,
  uploadingSide,
  onBrowse,
  onSelect,
  onUpload,
}: {
  side?: FudabaCardMediaSide
  mode: "create" | "replace"
  frontFile: File | null
  backFile: File | null
  disabled: boolean
  saving: boolean
  preparingSide: FudabaCardMediaSide | null
  uploadingSide: FudabaCardMediaSide | null
  onBrowse?: Partial<Record<FudabaCardMediaSide, () => void | Promise<void>>>
  onSelect: (file: File | null, side: FudabaCardMediaSide) => void
  onUpload?: (side: FudabaCardMediaSide) => void
}) {
  return (
    <FieldGroup className="grid gap-5">
      {(
        [
          ["front", "正面", frontFile],
          ["back", "背面", backFile],
        ] as const
      )
        .filter(([side]) => !selectedSide || side === selectedSide)
        .map(([side, label, file]) => (
          <Field key={side} data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`exchange-card-${side}`}>
              名片{label}
            </FieldLabel>
            <FileUploadControl
              id={`exchange-card-${side}`}
              compact
              accept="image/*"
              emptyTitle={
                mode === "create" ? `选择名片${label}` : `选择新的名片${label}`
              }
              emptyDetail="图片文件 · 不超过 8 MiB"
              fileKind={`名片${label}`}
              file={file}
              disabled={disabled}
              preparing={preparingSide === side}
              uploading={mode === "create" ? saving : uploadingSide === side}
              required={mode === "create"}
              selectedIcon={FileImageIcon}
              emptyIcon={ImageUpIcon}
              onBrowse={onBrowse?.[side]}
              onSelect={(nextFile) => onSelect(nextFile, side)}
            />
            {mode === "replace" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={disabled || !file}
                onClick={() => onUpload?.(side)}
              >
                {uploadingSide === side ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <UploadIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {uploadingSide === side ? "正在上传" : `替换${label}`}
              </Button>
            ) : null}
          </Field>
        ))}
    </FieldGroup>
  )
}
