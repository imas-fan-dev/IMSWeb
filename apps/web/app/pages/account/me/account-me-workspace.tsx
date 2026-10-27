import {
  ArrowLeftIcon,
  CircleAlertIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  UserRoundIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useSearchParams } from "react-router"

import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  getFudabaOwnerCard,
  getFudabaOwnerCards,
  getFudabaOwnerSeries,
  getPlatformProfile,
  hasPlatformSessionHint,
  type FudabaOwnerCard,
  type FudabaSeries,
  type PlatformAccountStatus,
  type PlatformProfile,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import { IS_APP_TARGET } from "~/lib/app-target"
import { CardWorkspace } from "./namecards/card-workspace"
import { ClaimEnvelopePanel } from "./claims/claim-envelope-panel"
import { FavoriteCollection } from "./favorites/favorite-collection"
import { apiMessage, isFeatureClosed } from "./account-me-model"
import { OfficeLocationWorkspace } from "./offices/office-location-workspace"
import { ProfileEditor } from "./profile/profile-editor"
import {
  ExchangePageSurface,
  useExchangeMapDialog,
  ExchangeMapReturnLink as NavigationLink,
} from "~/pages/community/exchange/components/exchange-page-surface"
import {
  isProfileWorkspaceSection,
  ProfileWorkspaceNavigation,
  type ProfileWorkspaceSection,
} from "./profile-workspace-navigation"

type WorkspacePhase = "idle" | "loading" | "ready" | "closed" | "error"

type WorkspaceState = {
  phase: WorkspacePhase
  profile: PlatformProfile | null
  accountStatus: PlatformAccountStatus | null
  writeEnabled: boolean
  series: FudabaSeries[]
  cards: FudabaOwnerCard[]
  error: string | null
}

const initialState: WorkspaceState = {
  phase: "idle",
  profile: null,
  accountStatus: null,
  writeEnabled: false,
  series: [],
  cards: [],
  error: null,
}

function AccountWorkspaceBackLink() {
  const embedded = useExchangeMapDialog()
  if (IS_APP_TARGET || embedded) return null
  return (
    <NavigationLink
      to="/account/me"
      className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      返回我的
    </NavigationLink>
  )
}

export type AccountMeWorkspaceProps = {
  section?: ProfileWorkspaceSection
  onLogout?: () => void
  sectionBasePath?: string
  initialCardId?: string
  initialOfficeId?: string
}

/**
 * Shared personal workspace for account pages and contextual map management.
 * Callers can select a section and an owned card or office explicitly.
 */
export function AccountMeWorkspace(props: AccountMeWorkspaceProps = {}) {
  const platform = usePlatformSession()
  const accountScope = platform.session?.account.id ?? platform.status

  return <ProfileWorkspace key={accountScope} {...props} platform={platform} />
}

function ProfileWorkspace({
  section,
  sectionBasePath,
  onLogout,
  initialCardId,
  initialOfficeId,
  platform,
}: AccountMeWorkspaceProps & {
  platform: ReturnType<typeof usePlatformSession>
}) {
  const embedded = useExchangeMapDialog()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<WorkspaceState>(initialState)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const workspaceGeneration = useRef(0)
  const detailGeneration = useRef(0)
  const closingNavigationRef = useRef(false)
  const selectionOperationGeneration = detailGeneration.current
  const requestedSection = searchParams.get("section")
  const requestedCardId = initialCardId ?? searchParams.get("card")
  const requestedOfficeId =
    initialOfficeId ?? searchParams.get("office") ?? undefined
  const accountSectionBasePath =
    sectionBasePath ??
    (location.pathname.startsWith("/account/me/") ? "/account/me" : undefined)
  const activeSection =
    section ??
    (isProfileWorkspaceSection(requestedSection) ? requestedSection : "profile")
  const profileAccountId = platform.session?.account.id
  const profileOperationGeneration = workspaceGeneration.current

  const loadWorkspace = useCallback(async () => {
    const generation = ++workspaceGeneration.current
    setState((current) => ({
      ...current,
      phase: "loading",
      error: null,
    }))
    try {
      const [profileResult, seriesResult, cardResult] = await Promise.all([
        getPlatformProfile().send(),
        getFudabaOwnerSeries().send(),
        getFudabaOwnerCards().send(),
      ])
      if (workspaceGeneration.current !== generation) return
      setState({
        phase: "ready",
        profile: profileResult.profile,
        accountStatus: profileResult.account.status,
        writeEnabled: profileResult.capabilities.fudabaWrite,
        series: seriesResult.items,
        cards: cardResult.items,
        error: null,
      })
      setCreating(false)
    } catch (error) {
      if (workspaceGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        phase: isFeatureClosed(error) ? "closed" : "error",
        error: isFeatureClosed(error)
          ? null
          : apiMessage(error, "制作人名片工作区暂时无法加载。"),
      }))
    }
  }, [])

  useEffect(() => {
    if (
      platform.status !== "authenticated" &&
      platform.status !== "restricted"
    ) {
      return
    }
    void loadWorkspace()
    return () => {
      workspaceGeneration.current += 1
      detailGeneration.current += 1
    }
  }, [loadWorkspace, platform.session?.account.id, platform.status])

  useEffect(() => {
    if (state.phase !== "ready") return
    if (closingNavigationRef.current) {
      closingNavigationRef.current = false
      return
    }
    detailGeneration.current += 1
    setCreating(false)
    setLoadingDetail(false)
    setSelectedCardId(activeSection === "namecards" ? requestedCardId : null)
  }, [state.phase, location.key, activeSection, requestedCardId])

  function syncCardQuery(cardId: string | null) {
    if (embedded) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (cardId) next.set("card", cardId)
      else next.delete("card")
      return next
    })
  }

  function closeCard() {
    detailGeneration.current += 1
    setCreating(false)
    setSelectedCardId(null)
    setLoadingDetail(false)
    closingNavigationRef.current = !embedded
    syncCardQuery(null)
  }

  function isProfileOperationCurrent(): boolean {
    return Boolean(
      profileAccountId &&
      workspaceGeneration.current === profileOperationGeneration
    )
  }

  function saveProfile(profile: PlatformProfile): boolean {
    if (!profileAccountId || !isProfileOperationCurrent()) return false
    setState((current) => ({ ...current, profile }))
    platform.acceptProfile(profileAccountId, profile)
    return true
  }

  async function reloadProfile(): Promise<PlatformProfile | null> {
    const result = await getPlatformProfile().send()
    if (!isProfileOperationCurrent()) return null
    setState((current) => ({
      ...current,
      profile: result.profile,
      accountStatus: result.account.status,
      writeEnabled: result.capabilities.fudabaWrite,
    }))
    return result.profile
  }

  const mapDialog = useExchangeMapDialog()

  function replaceCard(card: FudabaOwnerCard) {
    setState((current) => ({
      ...current,
      cards: current.cards.map((item) => (item.id === card.id ? card : item)),
    }))
  }

  async function loadCard(cardId: string) {
    const generation = ++detailGeneration.current
    setSelectedCardId(cardId)
    setCreating(false)
    setLoadingDetail(true)
    try {
      const result = await getFudabaOwnerCard(cardId).send()
      if (detailGeneration.current !== generation) return result.card
      replaceCard(result.card)
      return result.card
    } finally {
      if (detailGeneration.current === generation) setLoadingDetail(false)
    }
  }

  function createCard(
    card: FudabaOwnerCard,
    operation: number,
    workspace: number
  ) {
    if (workspaceGeneration.current !== workspace) return
    mapDialog?.changed?.()
    setState((current) => ({
      ...current,
      cards: [card, ...current.cards.filter((item) => item.id !== card.id)],
    }))
    if (detailGeneration.current !== operation) return
    setSelectedCardId(card.id)
    setCreating(false)
  }

  function deleteCard(cardId: string) {
    mapDialog?.changed?.()
    const cards = state.cards.filter((item) => item.id !== cardId)
    setState((current) => ({ ...current, cards }))
    setSelectedCardId(null)
    setCreating(false)
  }

  function closeWrites() {
    setState((current) => ({ ...current, writeEnabled: false }))
    setCreating(false)
  }

  const hasSessionHint = hasPlatformSessionHint()
  const waitingForSession =
    platform.status === "loading" ||
    (platform.status === "anonymous" && hasSessionHint)

  if (waitingForSession || state.phase === "loading") {
    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        aria-label="正在载入个人档案"
      >
        {accountSectionBasePath ? <AccountWorkspaceBackLink /> : null}
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-5 h-20 w-full" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Skeleton className="h-144 w-full" />
          <Skeleton className="h-176 w-full" />
        </div>
      </ExchangePageSurface>
    )
  }

  if (platform.status === "anonymous") {
    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        {accountSectionBasePath ? <AccountWorkspaceBackLink /> : null}
        <Empty className="min-h-96 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserRoundIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>请先登录平台帐号</EmptyTitle>
            <EmptyDescription>
              登录后可以维护制作人资料、双面名片与交换状态。
            </EmptyDescription>
          </EmptyHeader>
          <NavigationLink to="/account/login" className={buttonVariants()}>
            登录平台帐号
          </NavigationLink>
          <NavigationLink
            to="/community/exchange"
            className={buttonVariants({ variant: "outline" })}
          >
            返回交换事务所
          </NavigationLink>
        </Empty>
      </ExchangePageSurface>
    )
  }

  if (platform.status === "error") {
    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        {accountSectionBasePath ? <AccountWorkspaceBackLink /> : null}
        <Empty className="min-h-96 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>帐号状态暂时不可用</EmptyTitle>
            <EmptyDescription>
              请重新载入帐号状态后再打开名片工作区。
            </EmptyDescription>
          </EmptyHeader>
          <Button type="button" onClick={() => void platform.reload()}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            重新载入帐号
          </Button>
        </Empty>
      </ExchangePageSurface>
    )
  }

  if (state.phase !== "ready" || !state.profile) {
    const closed = state.phase === "closed"
    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        {accountSectionBasePath ? <AccountWorkspaceBackLink /> : null}
        <Empty className="min-h-96 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {closed ? (
                <LockKeyholeIcon aria-hidden="true" />
              ) : (
                <CircleAlertIcon aria-hidden="true" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {closed ? "个人档案尚未开放" : "个人档案暂时无法加载"}
            </EmptyTitle>
            <EmptyDescription>
              {closed
                ? "功能开放后，可以在这里维护制作人资料和双面名片。"
                : state.error || "请稍后重新载入。"}
            </EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap justify-center gap-2">
            {!closed ? (
              <Button type="button" onClick={() => void loadWorkspace()}>
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                重新载入
              </Button>
            ) : null}
            <NavigationLink
              to="/community/exchange"
              className={buttonVariants({ variant: "outline" })}
            >
              返回交换事务所
            </NavigationLink>
          </div>
        </Empty>
      </ExchangePageSurface>
    )
  }

  const restricted =
    platform.status === "restricted" || state.accountStatus === "restricted"
  // Profile fields are platform identity and only a restricted account freezes
  // them. Cards, offices, and claims are Fudaba content and also wait on the
  // exchange rollout switch, so the two surfaces need separate verdicts.
  const restrictedReason = "帐号当前受限，资料和名片保持可查看，但不能修改。"
  const profileReadOnly = restricted
  const profileReadOnlyReason = restricted ? restrictedReason : null
  const exchangeReadOnly = restricted || !state.writeEnabled
  const exchangeReadOnlyReason = restricted
    ? restrictedReason
    : !state.writeEnabled
      ? "名片与事务所编辑正在分阶段开放，当前保持只读。"
      : null
  const sectionReadOnlyReason =
    activeSection === "profile" ? profileReadOnlyReason : exchangeReadOnlyReason

  return (
    <ExchangePageSurface
      id="main-content"
      className={cn(
        "min-w-0",
        accountSectionBasePath &&
          !IS_APP_TARGET &&
          !embedded &&
          "lg:flex lg:flex-1 lg:flex-col"
      )}
      data-account-section-layout={
        accountSectionBasePath
          ? IS_APP_TARGET || embedded
            ? "stack"
            : "account"
          : undefined
      }
    >
      {accountSectionBasePath ? null : (
        <header className="relative border-b bg-muted/25">
          <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="max-w-2xl min-w-0">
              {!embedded ? (
                <NavigationLink
                  to="/community/exchange"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  名片交换事务所
                </NavigationLink>
              ) : null}
              {!embedded ? (
                <h1 className="mt-3 text-2xl font-semibold text-balance">
                  个人档案
                </h1>
              ) : null}
              <p className="mt-2 max-w-xl leading-7 text-muted-foreground">
                管理你的社区身份、交换名片、事务所与历史名片认领。
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{state.cards.length} 张名片</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="刷新个人档案"
                title="刷新"
                onClick={() => void loadWorkspace()}
              >
                <RefreshCwIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>
      )}

      <div
        className={cn(
          "mx-auto grid w-full min-w-0",
          accountSectionBasePath
            ? IS_APP_TARGET || embedded
              ? "max-w-3xl"
              : "max-w-3xl lg:max-w-7xl lg:flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]"
            : "max-w-7xl lg:grid-cols-[15rem_minmax(0,1fr)]"
        )}
      >
        <ProfileWorkspaceNavigation
          profile={state.profile}
          cardCount={state.cards.length}
          activeSection={activeSection}
          sectionBasePath={accountSectionBasePath}
          onLogout={onLogout}
          embedded={Boolean(embedded)}
        />

        <div
          className={cn(
            "min-w-0",
            accountSectionBasePath
              ? IS_APP_TARGET
                ? "px-(--app-safe-inline) py-5"
                : "px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
              : "px-4 py-8 sm:px-6 lg:px-8"
          )}
        >
          {accountSectionBasePath ? <AccountWorkspaceBackLink /> : null}
          {sectionReadOnlyReason ? (
            <Alert>
              <LockKeyholeIcon aria-hidden="true" />
              <AlertTitle>
                {restricted ? "帐号受限" : "编辑暂未开放"}
              </AlertTitle>
              <AlertDescription>{sectionReadOnlyReason}</AlertDescription>
            </Alert>
          ) : null}

          <div
            id="profile-workspace-section-profile"
            className={sectionReadOnlyReason ? "mt-6" : undefined}
            hidden={activeSection !== "profile"}
          >
            <ProfileEditor
              profile={state.profile}
              accountId={profileAccountId}
              readOnly={profileReadOnly}
              readOnlyReason={profileReadOnlyReason}
              onSaved={saveProfile}
              onReload={reloadProfile}
              isOperationCurrent={isProfileOperationCurrent}
              onWriteClosed={closeWrites}
            />
          </div>

          <section
            id="profile-workspace-section-namecards"
            className={sectionReadOnlyReason ? "mt-6" : undefined}
            aria-labelledby="profile-workspace-namecards-title"
            hidden={activeSection !== "namecards"}
          >
            <div className="border-b pb-5">
              <h2
                id="profile-workspace-namecards-title"
                className="text-xl font-semibold"
              >
                交换名片
              </h2>
              <p className="mt-2 text-sm/6 text-muted-foreground">
                管理双面名片素材、担当角色和公开交换状态。
              </p>
            </div>
            <div className="mt-6">
              <CardWorkspace
                active={activeSection === "namecards"}
                onClose={closeCard}
                cards={state.cards}
                selectedCardId={selectedCardId}
                creating={creating}
                loadingDetail={loadingDetail}
                profile={state.profile}
                series={state.series}
                readOnly={exchangeReadOnly}
                readOnlyReason={exchangeReadOnlyReason}
                onSelect={(cardId) => {
                  syncCardQuery(cardId)
                  void loadCard(cardId)
                }}
                onCreate={() => {
                  detailGeneration.current += 1
                  setCreating(true)
                  setSelectedCardId(null)
                  setLoadingDetail(false)
                }}
                onCreated={(card) =>
                  createCard(
                    card,
                    selectionOperationGeneration,
                    profileOperationGeneration
                  )
                }
                onSaved={(card) => {
                  replaceCard(card)
                  mapDialog?.changed?.()
                }}
                onDeleted={deleteCard}
                onReload={async (cardId) => {
                  const workspaceRequest = workspaceGeneration.current
                  const detailRequest = detailGeneration.current
                  const result = await getFudabaOwnerCard(cardId).send()
                  if (
                    workspaceGeneration.current !== workspaceRequest ||
                    detailGeneration.current !== detailRequest
                  ) {
                    throw new Error("当前名片已切换，请重新打开后重试。")
                  }
                  replaceCard(result.card)
                  return result.card
                }}
                onWriteClosed={closeWrites}
              />
            </div>
          </section>

          <section
            id="profile-workspace-section-favorites"
            className={sectionReadOnlyReason ? "mt-6" : undefined}
            aria-labelledby="profile-workspace-favorites-title"
            hidden={activeSection !== "favorites"}
          >
            <FavoriteCollection series={state.series} />
          </section>

          <div
            id="profile-workspace-section-offices"
            className={sectionReadOnlyReason ? "mt-6" : undefined}
            hidden={activeSection !== "offices"}
          >
            <OfficeLocationWorkspace
              initialOfficeId={requestedOfficeId}
              series={state.series}
              homeCity={state.profile.homeCity}
              readOnly={exchangeReadOnly}
              onWriteClosed={closeWrites}
            />
          </div>

          <div
            id="profile-workspace-section-claims"
            className={sectionReadOnlyReason ? "mt-6" : undefined}
            hidden={activeSection !== "claims"}
          >
            <ClaimEnvelopePanel readOnly={exchangeReadOnly} />
          </div>
        </div>
      </div>
    </ExchangePageSurface>
  )
}
