import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FileImageIcon,
  ImageUpIcon,
  ImagesIcon,
  PlusIcon,
  UploadIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { FileUploadControl } from "~/components/shared/file-upload-control"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Skeleton } from "~/components/ui/skeleton"
import {
  addNamecardReaction,
  getNamecardPage,
  getNamecardReactions,
  NAMECARD_REACTIONS,
  uploadNamecard,
} from "~/shared/api"
import type { Namecard, NamecardPage, NamecardReactions } from "~/shared/api"

const NAMECARD_REACTION_SET = new Set<string>(NAMECARD_REACTIONS)
const SESSION_REACTION_LIMIT = 10

export function meta() {
  return [{ title: "制作人名片墙 | IMSWeb" }]
}

function NamecardReactionBar({ cardId }: { cardId: number }) {
  const [reactions, setReactions] = useState<NamecardReactions>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const sessionCounts = useRef(new Map<string, number>())

  useEffect(() => {
    let active = true
    void getNamecardReactions(cardId)
      .send()
      .then((next) => {
        if (active) setReactions(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [cardId])

  async function react(emoji: string) {
    if (busy !== null) return
    const sessionCount = sessionCounts.current.get(emoji) ?? 0
    if (sessionCount >= SESSION_REACTION_LIMIT) {
      toast.error("这个反应点得太多了")
      return
    }

    setBusy(emoji)
    try {
      await addNamecardReaction(cardId, emoji).send()
      sessionCounts.current.set(emoji, sessionCount + 1)
      setReactions((current) => ({
        ...current,
        [emoji]: (current[emoji] ?? 0) + 1,
      }))
      setPickerOpen(false)
    } catch {
      toast.error("暂时无法添加反应")
    } finally {
      setBusy(null)
    }
  }

  const activeReactions = Object.entries(reactions).filter(
    ([emoji, count]) => count > 0 && NAMECARD_REACTION_SET.has(emoji)
  )

  return (
    <div className="flex min-h-6 flex-wrap gap-1.5" aria-label="名片反应">
      {activeReactions.map(([emoji, count]) => (
        <Button
          key={emoji}
          type="button"
          size="xs"
          variant="outline"
          disabled={busy !== null}
          aria-label={`${emoji}，${count} 次反应`}
          onClick={() => void react(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
          {count}
        </Button>
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              aria-label="添加反应"
              disabled={busy !== null}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-64 sm:w-80">
          <PopoverTitle className="mb-2">选择反应</PopoverTitle>
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
            {NAMECARD_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                size="icon"
                variant={reactions[emoji] ? "secondary" : "ghost"}
                className="text-base"
                disabled={busy !== null}
                aria-label={`${emoji}，添加反应`}
                onClick={() => void react(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function NamecardItem({ card }: { card: Namecard }) {
  return (
    <Card className="h-full">
      <div className="grid grid-cols-2 gap-px bg-border">
        {[card.image1_url, card.image2_url].map((image, index) => (
          <CoverImagePreview
            key={image}
            src={image}
            alt={`制作人名片 ${card.id} ${index === 0 ? "正面" : "背面"}`}
            previewLabel="名片"
            className="aspect-3/2 w-full rounded-none bg-muted"
            imageClassName="transition-transform group-hover:scale-[1.02]"
          />
        ))}
      </div>
      <CardHeader>
        <CardTitle>制作人名片 #{card.id}</CardTitle>
        <CardDescription>
          {card.created_at ? `提交于 ${card.created_at}` : "社区公开名片"}
        </CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto">
        <NamecardReactionBar cardId={card.id} />
      </CardFooter>
    </Card>
  )
}

export default function CommunityCardsPage() {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<NamecardPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let active = true
    void getNamecardPage(page)
      .send()
      .then((next) => {
        if (active) setResult(next)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page])

  function changePage(nextPage: number) {
    setLoading(true)
    setError(false)
    setPage(nextPage)
  }

  function chooseFile(file: File | null, side: "front" | "back") {
    if (!file) {
      if (side === "front") setFront(null)
      else setBack(null)
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件")
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("每张名片图片不能超过 3 MiB")
      return
    }
    if (side === "front") setFront(file)
    else setBack(file)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!front || !back) {
      toast.error("请同时选择名片正面和背面")
      return
    }
    setUploading(true)
    const form = event.currentTarget
    try {
      const response = await uploadNamecard(front, back).send()
      toast.success(response.msg)
      setFront(null)
      setBack(null)
      form.reset()
    } catch {
      toast.error("名片上传失败，请检查图片后重试")
    } finally {
      setUploading(false)
    }
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-6 py-12">
      <Link
        to="/community"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        返回社区
      </Link>

      <header className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
          Producer cards
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          制作人名片墙
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          浏览制作人公开提交的双面名片，并用表情留下回应。新投稿将在运营审核后显示。
        </p>
      </header>

      <section className="mt-10" aria-label="公开名片">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <ImagesIcon aria-hidden="true" />
            <AlertTitle>暂时无法读取名片墙</AlertTitle>
            <AlertDescription>请稍后刷新页面重试。</AlertDescription>
          </Alert>
        ) : null}

        {!loading && !error && result?.list.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImagesIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>还没有公开名片</EmptyTitle>
              <EmptyDescription>
                你可以提交第一张双面制作人名片。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!loading && !error && result?.list.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {result.list.map((card) => (
                <NamecardItem key={card.id} card={card} />
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {page} / {Math.max(result.totalPage, 1)} 页，共{" "}
                {result.total} 张
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= result.totalPage}
                onClick={() => changePage(page + 1)}
              >
                下一页
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <section className="mt-14" aria-labelledby="namecard-upload-title">
        <Card>
          <CardHeader>
            <CardTitle id="namecard-upload-title">提交制作人名片</CardTitle>
            <CardDescription>
              请分别上传正面和背面。每张不超过 3 MiB，图片会转换为 WebP
              并进入审核队列。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => void submit(event)}
            >
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field data-disabled={uploading || undefined}>
                  <FieldLabel htmlFor="namecard-front">名片正面</FieldLabel>
                  <FileUploadControl
                    id="namecard-front"
                    accept="image/*"
                    emptyTitle="选择名片正面"
                    emptyDetail="图片文件 · 不超过 3 MiB"
                    fileKind="名片正面"
                    file={front}
                    uploading={uploading}
                    required
                    selectedIcon={FileImageIcon}
                    emptyIcon={ImageUpIcon}
                    onSelect={(file) => chooseFile(file, "front")}
                  />
                </Field>
                <Field data-disabled={uploading || undefined}>
                  <FieldLabel htmlFor="namecard-back">名片背面</FieldLabel>
                  <FileUploadControl
                    id="namecard-back"
                    accept="image/*"
                    emptyTitle="选择名片背面"
                    emptyDetail="图片文件 · 不超过 3 MiB"
                    fileKind="名片背面"
                    file={back}
                    uploading={uploading}
                    required
                    selectedIcon={FileImageIcon}
                    emptyIcon={ImageUpIcon}
                    onSelect={(file) => chooseFile(file, "back")}
                  />
                </Field>
              </FieldGroup>
              <Button
                type="submit"
                className="self-start"
                disabled={uploading || !front || !back}
              >
                <UploadIcon data-icon="inline-start" />
                {uploading ? "正在上传" : "提交审核"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
