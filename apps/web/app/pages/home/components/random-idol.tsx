import {
  ArrowUpRightIcon,
  AlertCircleIcon,
  ShuffleIcon,
  UserRoundIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Button, buttonVariants } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import { safeWikiColor } from "~/pages/wiki/wiki-model"
import { getWikiRandomIdol, isApiError } from "~/lib/api"
import type { WikiRandomIdol } from "~/lib/api"

function idolStoryHref(idol: NonNullable<WikiRandomIdol["idol"]>) {
  return (
    "/story?agency=" +
    encodeURIComponent(idol.agency.name) +
    "&idol=" +
    encodeURIComponent(idol.name)
  )
}

export function RandomIdol() {
  const [requestVersion, setRequestVersion] = useState(0)
  const [request, setRequest] = useState<{
    data: WikiRandomIdol | null
    error: unknown
    loading: boolean
  }>({ data: null, error: null, loading: true })

  useEffect(() => {
    let active = true
    void getWikiRandomIdol()
      .send()
      .then((data) => {
        if (active) setRequest({ data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (active) {
          setRequest((current) => ({ ...current, error, loading: false }))
        }
      })
    return () => {
      active = false
    }
  }, [requestVersion])

  const selectedIdol = request.data?.idol ?? null
  const errorMessage = isApiError(request.error)
    ? request.error.message
    : "随机担当暂时无法加载"

  return (
    <section aria-labelledby="random-idol-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.78fr)] lg:px-8">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold text-primary">IDOL PICK</p>
          <h2 id="random-idol-heading" className="mt-2 text-2xl font-semibold">
            随机担当
          </h2>
          <p className="mt-4 max-w-xl text-sm/6 text-muted-foreground">
            从剧情站角色档案中邂逅一位新的担当。
          </p>
        </div>

        <div
          className="flex min-h-56 flex-col justify-between rounded-lg border bg-card p-4 sm:p-5"
          aria-live="polite"
          aria-busy={request.loading}
        >
          {request.loading && !selectedIdol ? (
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-3 py-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-40 max-w-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ) : request.error && !selectedIdol ? (
            <div className="flex min-h-40 flex-col items-center justify-center text-center">
              <AlertCircleIcon className="size-7 text-destructive" />
              <p className="mt-3 font-medium">{errorMessage}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                请稍后重新加载角色档案。
              </p>
            </div>
          ) : selectedIdol ? (
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-5">
              <div
                data-testid="random-idol-avatar"
                className="aspect-square overflow-hidden rounded-md border bg-muted"
                style={{
                  borderColor: safeWikiColor(
                    selectedIdol.color ?? selectedIdol.agency.color
                  ),
                }}
              >
                {selectedIdol.imageUrl ? (
                  <WikiTransformedImage
                    src={selectedIdol.imageUrl}
                    alt={`${selectedIdol.name}头像`}
                    transform={selectedIdol.imageTransform}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <UserRoundIcon
                      className="size-9 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="sr-only">暂无头像</span>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-center">
                <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span
                    data-testid="random-idol-agency-marker"
                    className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: safeWikiColor(
                          selectedIdol.agency.color
                        ),
                      }}
                      aria-hidden="true"
                    />
                    {selectedIdol.agency.iconUrl ? (
                      <WikiTransformedImage
                        src={selectedIdol.agency.iconUrl}
                        alt=""
                        transform={selectedIdol.agency.imageTransform}
                        className="absolute inset-0 bg-background p-1"
                        onError={(event) => {
                          event.currentTarget.hidden = true
                        }}
                      />
                    ) : null}
                  </span>
                  <span className="truncate">{selectedIdol.agency.name}</span>
                </p>
                <h3
                  className="mt-2 text-2xl font-semibold wrap-break-word"
                  style={{
                    color: safeWikiColor(
                      selectedIdol.color ?? selectedIdol.agency.color
                    ),
                  }}
                >
                  {selectedIdol.name}
                </h3>
              </div>
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center text-center">
              <UserRoundIcon className="size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">暂时没有可抽取的偶像</p>
              <p className="mt-1 text-sm text-muted-foreground">
                可在剧情站管理中启用偶像角色。
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {selectedIdol ? (
              <Link
                to={idolStoryHref(selectedIdol)}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                查看剧情档案
                <ArrowUpRightIcon data-icon="inline-end" />
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <Button
              type="button"
              className="w-full"
              disabled={request.loading}
              onClick={() => {
                setRequest((current) => ({
                  ...current,
                  error: null,
                  loading: true,
                }))
                setRequestVersion((current) => current + 1)
              }}
            >
              <ShuffleIcon data-icon="inline-start" />
              {request.loading
                ? "正在选择"
                : request.error
                  ? "重新加载"
                  : "随机选择"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
