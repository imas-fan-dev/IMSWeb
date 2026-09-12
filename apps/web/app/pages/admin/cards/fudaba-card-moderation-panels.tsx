import {
  CheckIcon,
  ContactRoundIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { AdminEmptyState, AdminPanel } from "~/components/admin/admin-ui"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getAdminFudabaCardClaims,
  getAdminFudabaCardReviews,
  isApiError,
  reviewAdminFudabaCard,
  reviewAdminFudabaCardClaim,
  type FudabaAdminCardClaim,
  type FudabaRegisteredCardReview,
} from "~/lib/api"
import { useConfirmAction } from "~/pages/admin/hooks/use-confirm-action"
import { NavigationLink } from "~/components/navigation/navigation-link"

function staleReview(error: unknown) {
  return isApiError(error) && error.status === 409
}

function ModerationSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="正在载入审核队列">
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

export function RegisteredCardReviewPanel() {
  const [items, setItems] = useState<FudabaRegisteredCardReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setItems((await getAdminFudabaCardReviews().send()).items)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getAdminFudabaCardReviews()
      .send()
      .then((result) => {
        if (active) setItems(result.items)
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
  }, [])

  const approve = useConfirmAction<FudabaRegisteredCardReview>({
    onConfirm: async (item) => {
      try {
        await reviewAdminFudabaCard(item.card.id, {
          decision: "approve",
          expectedRevision: item.card.revision,
          note: "",
        }).send()
        setItems((current) =>
          current.filter((candidate) => candidate.card.id !== item.card.id)
        )
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
      }
    },
    getTitle: () => "通过注册名片审核",
    getDescription: (item) =>
      `${item.card.displayName} 的正反面将公开，并允许名片所有者摆放到地图名片墙。`,
    successMessage: (item) => `${item.card.displayName} 已通过审核`,
  })
  const reject = useConfirmAction<FudabaRegisteredCardReview>({
    onConfirm: async (item) => {
      try {
        await reviewAdminFudabaCard(item.card.id, {
          decision: "reject",
          expectedRevision: item.card.revision,
          note: "素材或资料未通过审核",
        }).send()
        setItems((current) =>
          current.filter((candidate) => candidate.card.id !== item.card.id)
        )
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
      }
    },
    getTitle: () => "驳回注册名片",
    getDescription: (item) =>
      `${item.card.displayName} 将退回名片所有者，修改后可以再次送审。`,
    successMessage: (item) => `${item.card.displayName} 已驳回`,
  })
  const busy = approve.submitting || reject.submitting

  return (
    <>
      <AdminPanel
        title="注册用户投稿"
        description="审核通过后可公开并用于地图名片墙摆放"
        icon={ContactRoundIcon}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            刷新
          </Button>
        }
      >
        {loading ? (
          <ModerationSkeleton />
        ) : error ? (
          <AdminEmptyState
            icon={ContactRoundIcon}
            title="无法读取注册名片队列"
            description="请刷新后重试。"
          />
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.card.id}
                className="overflow-hidden rounded-lg border"
              >
                <div className="grid grid-cols-2 gap-px bg-border">
                  {[item.card.frontImageUrl, item.card.backImageUrl].map(
                    (image, index) => (
                      <NavigationLink
                        key={`${item.card.id}-${index}`}
                        href={image}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={image}
                          alt={`${item.card.displayName}${index === 0 ? "正面" : "背面"}`}
                          className="aspect-3/2 w-full bg-muted object-contain"
                        />
                      </NavigationLink>
                    )
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="font-medium">{item.card.displayName}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.owner.displayName} · 版本 {item.card.revision}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.card.favoriteIdols.map((idol) => (
                      <Badge key={idol.id} variant="outline">
                        {idol.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={(event) =>
                        approve.requestAction(item, event.currentTarget)
                      }
                    >
                      {approve.submitting &&
                      approve.target?.card.id === item.card.id ? (
                        <LoaderCircleIcon
                          data-icon="inline-start"
                          className="animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : (
                        <CheckIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      )}
                      通过
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={(event) =>
                        reject.requestAction(item, event.currentTarget)
                      }
                    >
                      <XIcon data-icon="inline-start" aria-hidden="true" />
                      驳回
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CheckIcon}
            title="没有待审核注册名片"
            description="新的注册用户投稿会显示在这里。"
          />
        )}
      </AdminPanel>
      <ConfirmActionDialog
        open={approve.open}
        onOpenChange={approve.onOpenChange}
        title={approve.title}
        description={approve.description}
        submitting={approve.submitting}
        onConfirm={() => void approve.confirmAction()}
        confirmLabel="确认通过"
        variant="default"
        icon={CheckIcon}
      />
      <ConfirmActionDialog
        open={reject.open}
        onOpenChange={reject.onOpenChange}
        title={reject.title}
        description={reject.description}
        submitting={reject.submitting}
        onConfirm={() => void reject.confirmAction()}
        confirmLabel="确认驳回"
        variant="default"
        icon={XIcon}
      />
    </>
  )
}

export function CardClaimReviewPanel() {
  const [items, setItems] = useState<FudabaAdminCardClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setItems((await getAdminFudabaCardClaims().send()).items)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getAdminFudabaCardClaims()
      .send()
      .then((result) => {
        if (active) setItems(result.items)
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
  }, [])

  const approve = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (item) => {
      try {
        await reviewAdminFudabaCardClaim(item.id, {
          decision: "approve",
          expectedRevision: item.revision,
          note: "已核对历史名片与申请资料",
        }).send()
        setItems((current) =>
          current.filter((candidate) => candidate.id !== item.id)
        )
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
      }
    },
    getTitle: () => "通过旧名片认领",
    getDescription: (item) =>
      `历史名片 #${item.legacyCardId} 将绑定给 ${item.claimant.displayName}，并成为可管理的注册名片。`,
    successMessage: (item) => `历史名片 #${item.legacyCardId} 已完成认领`,
  })
  const reject = useConfirmAction<FudabaAdminCardClaim>({
    onConfirm: async (item) => {
      try {
        await reviewAdminFudabaCardClaim(item.id, {
          decision: "reject",
          expectedRevision: item.revision,
          note: "无法确认历史名片归属",
        }).send()
        setItems((current) =>
          current.filter((candidate) => candidate.id !== item.id)
        )
      } catch (reviewError) {
        if (staleReview(reviewError)) await refresh()
        throw reviewError
      }
    },
    getTitle: () => "驳回旧名片认领",
    getDescription: (item) =>
      `历史名片 #${item.legacyCardId} 将保持未认领，不会绑定到申请帐号。`,
    successMessage: (item) => `历史名片 #${item.legacyCardId} 的认领已驳回`,
  })
  const busy = approve.submitting || reject.submitting

  return (
    <>
      <AdminPanel
        title="旧名片认领"
        description="核对公开旧名片、申请帐号和担当信息"
        icon={ShieldCheckIcon}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            刷新
          </Button>
        }
      >
        {loading ? (
          <ModerationSkeleton />
        ) : error ? (
          <AdminEmptyState
            icon={ShieldCheckIcon}
            title="无法读取认领队列"
            description="请刷新后重试。"
          />
        ) : items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-lg border"
              >
                <div className="grid grid-cols-2 gap-px bg-border">
                  {[
                    item.legacyCard.frontImageUrl,
                    item.legacyCard.backImageUrl,
                  ].map((image, index) => (
                    <NavigationLink
                      key={`${item.id}-${index}`}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={image}
                        alt={`历史名片 #${item.legacyCardId}${index === 0 ? "正面" : "背面"}`}
                        className="aspect-3/2 w-full bg-muted object-contain"
                      />
                    </NavigationLink>
                  ))}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="font-medium">
                      历史名片 #{item.legacyCardId}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      申请人 {item.claimant.displayName} · 版本 {item.revision}
                    </p>
                  </div>
                  {item.message ? (
                    <p className="text-sm text-muted-foreground">
                      {item.message}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {item.favoriteIdols.map((idol) => (
                      <Badge key={idol.id} variant="outline">
                        {idol.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={(event) =>
                        approve.requestAction(item, event.currentTarget)
                      }
                    >
                      {approve.submitting && approve.target?.id === item.id ? (
                        <LoaderCircleIcon
                          data-icon="inline-start"
                          className="animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : (
                        <CheckIcon
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      )}
                      通过
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={(event) =>
                        reject.requestAction(item, event.currentTarget)
                      }
                    >
                      <XIcon data-icon="inline-start" aria-hidden="true" />
                      驳回
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={CheckIcon}
            title="没有待审核认领"
            description="用户提交的旧名片认领会显示在这里。"
          />
        )}
      </AdminPanel>
      <ConfirmActionDialog
        open={approve.open}
        onOpenChange={approve.onOpenChange}
        title={approve.title}
        description={approve.description}
        submitting={approve.submitting}
        onConfirm={() => void approve.confirmAction()}
        confirmLabel="确认认领"
        variant="default"
        icon={ShieldCheckIcon}
      />
      <ConfirmActionDialog
        open={reject.open}
        onOpenChange={reject.onOpenChange}
        title={reject.title}
        description={reject.description}
        submitting={reject.submitting}
        onConfirm={() => void reject.confirmAction()}
        confirmLabel="确认驳回"
        variant="default"
        icon={XIcon}
      />
    </>
  )
}
