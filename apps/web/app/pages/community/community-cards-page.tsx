import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImagesIcon,
  UploadIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
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
import { Skeleton } from "~/components/ui/skeleton"
import {
  addNamecardReaction,
  getNamecardPage,
  getNamecardReactions,
  uploadNamecard,
} from "~/shared/api/endpoints/community"
import type {
  Namecard,
  NamecardPage,
  NamecardReactions,
} from "~/shared/api/endpoints/community"

const QUICK_REACTIONS = ["❤️", "👍", "👏", "✨"] as const

export function meta() {
  return [{ title: "制作人名片墙 | IMSWeb" }]
}

function NamecardReactionBar({ cardId }: { cardId: number }) {
  const [reactions, setReactions] = useState<NamecardReactions>({})
  const [busy, setBusy] = useState<string | null>(null)

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
    setBusy(emoji)
    try {
      await addNamecardReaction(cardId, emoji).send()
      setReactions((current) => ({
        ...current,
        [emoji]: (current[emoji] ?? 0) + 1,
      }))
    } catch {
      toast.error("暂时无法添加反应")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="名片反应">
      {QUICK_REACTIONS.map((emoji) => (
        <Button
          key={emoji}
          type="button"
          size="xs"
          variant="outline"
          disabled={busy !== null}
          aria-label={`${emoji}，${reactions[emoji] ?? 0} 次反应`}
          onClick={() => void react(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
          {reactions[emoji] ?? 0}
        </Button>
      ))}
    </div>
  )
}

function NamecardItem({ card }: { card: Namecard }) {
  return (
    <Card className="h-full">
      <div className="grid grid-cols-2 gap-px bg-border">
        {[card.image1_url, card.image2_url].map((image, index) => (
          <a
            key={image}
            href={image}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <img
              src={image}
              alt={`制作人名片 ${card.id} ${index === 0 ? "正面" : "背面"}`}
              className="aspect-[3/2] w-full object-cover transition-transform hover:scale-[1.02]"
              loading="lazy"
            />
          </a>
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

  function chooseFile(file: File | undefined, side: "front" | "back") {
    if (!file) return
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
      <Button variant="ghost" size="sm" render={<Link to="/community" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        返回社区
      </Button>

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
              className="grid gap-5 md:grid-cols-2"
              onSubmit={(event) => void submit(event)}
            >
              <label className="grid gap-2 text-sm font-medium">
                名片正面
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    chooseFile(event.target.files?.[0], "front")
                  }
                  className="min-h-10 rounded-md border bg-background px-3 py-2 font-normal file:mr-3 file:border-0 file:bg-transparent file:font-medium"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                名片背面
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    chooseFile(event.target.files?.[0], "back")
                  }
                  className="min-h-10 rounded-md border bg-background px-3 py-2 font-normal file:mr-3 file:border-0 file:bg-transparent file:font-medium"
                />
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={uploading || !front || !back}>
                  <UploadIcon data-icon="inline-start" />
                  {uploading ? "正在上传" : "提交审核"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
