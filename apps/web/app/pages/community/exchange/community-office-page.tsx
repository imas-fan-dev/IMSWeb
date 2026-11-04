import { getFudabaWallScene, type FudabaSceneResponse } from "~/lib/api"
import { useWallLayoutIndex } from "./use-wall-layout-index"
import { LocateMyCards } from "./locate-my-cards"
import { wallLayoutIntersects, wallItemKey } from "./wall-scene-layout"
import { MessageComposer, MessageReader } from "./wall-message-dialog"
import { MessagePaper } from "./wall-message-note"
import {
  placeFudabaMessage,
  type FudabaMessage,
  type FudabaPublicMessage,
} from "~/lib/api"
import { CardInteractionScope } from "~/pages/community/exchange/components/exchange-card-interactions"
import { ExchangeDataRevision } from "./components/exchange-page-surface"
import {
  ArrowLeftIcon,
  Building2Icon,
  CheckIcon,
  EyeIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderCircleIcon,
  LogInIcon,
  MapPinIcon,
  PencilRulerIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { usePlatformSession } from "~/components/platform/platform-session-provider"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  deleteFudabaCardPlacement,
  getFudabaWall,
  getFudabaOwnerCards,
  getFudabaSeries,
  getPlatformProfile,
  isApiError,
  saveFudabaCardPlacement,
  type FudabaCardPlacement,
  type FudabaOfficeDetail,
  type FudabaOwnerCard,
  type FudabaPlacedCard,
  type FudabaSeries,
  type FudabaV2WallResponse,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  ExchangeCard,
  PlacedCardWall,
  SeriesBadge,
} from "~/pages/community/exchange/components/exchange-components"
import type { WallPlacement } from "~/pages/community/exchange/components/exchange-card-wall"
import { ExchangeManagementDialog } from "./components/exchange-management-dialog"
import type { WallBounds, WallFocus } from "./wall-viewport"
import {
  ExchangePageSurface,
  useExchangeMapDialog,
  ExchangeMapReturnLink as NavigationLink,
} from "./components/exchange-page-surface"

function wallLoadBounds(viewport: WallBounds): WallBounds {
  const bufferX = (viewport[2] - viewport[0]) / 4
  const bufferY = (viewport[3] - viewport[1]) / 4
  return [
    Math.max(-1_000_000, viewport[0] - bufferX),
    Math.max(-1_000_000, viewport[1] - bufferY),
    Math.min(1_000_000, viewport[2] + bufferX),
    Math.min(1_000_000, viewport[3] + bufferY),
  ]
}

function containsViewport(loaded: WallBounds, viewport: WallBounds) {
  return (
    loaded[0] <= viewport[0] &&
    loaded[1] <= viewport[1] &&
    loaded[2] >= viewport[2] &&
    loaded[3] >= viewport[3]
  )
}

type DetailPhase = "loading" | "ready" | "closed" | "missing" | "error"

type DetailState = {
  phase: DetailPhase
  office: FudabaOfficeDetail | null
  series: FudabaSeries[]
  error: string | null
}

type WallEditorState = {
  phase: "idle" | "loading" | "ready" | "error"
  cards: FudabaOwnerCard[]
  writeEnabled: boolean
}

const initialState: DetailState = {
  phase: "loading",
  office: null,
  series: [],
  error: null,
}

const initialWallEditorState: WallEditorState = {
  phase: "idle",
  cards: [],
  writeEnabled: false,
}

function detailFailure(error: unknown): Pick<DetailState, "phase" | "error"> {
  if (isApiError(error) && error.status === 404) {
    return error.payload === "Not Found"
      ? { phase: "closed", error: null }
      : { phase: "missing", error: null }
  }
  if (isApiError(error) && (error.status === 401 || error.status === 403)) {
    return {
      phase: "error",
      error: "平台帐号会话无法验证，请刷新登录状态后重试。",
    }
  }
  return {
    phase: "error",
    error: error instanceof Error ? error.message : "事务所暂时无法加载",
  }
}

export function meta() {
  return [
    { title: "交换事务所 | IMSWeb" },
    {
      name: "description",
      content: "浏览制作人名片交换事务所与公开名片墙。",
    },
  ]
}

function CommunityOfficePageContent() {
  const { officeSlug } = useParams()
  const embedded = useExchangeMapDialog()
  const dataRevision = useContext(ExchangeDataRevision)
  const platform = usePlatformSession()
  const [state, setState] = useState<DetailState>(initialState)
  const [wallEditor, setWallEditor] = useState<WallEditorState>(
    initialWallEditorState
  )
  const [wallEditing, setWallEditing] = useState(false)
  const [selectedOwnerCardId, setSelectedOwnerCardId] = useState<string | null>(
    null
  )
  const [pendingCardIds, setPendingCardIds] = useState(() => new Set<string>())
  const [confirmedPlacements, setConfirmedPlacements] = useState(
    () => new Map<string, FudabaCardPlacement>()
  )
  const layoutIndex = useWallLayoutIndex(
    officeSlug,
    platform.session?.account.id
  )
  const layoutIndexRef = useRef(layoutIndex)
  useEffect(() => {
    layoutIndexRef.current = layoutIndex
  }, [layoutIndex])
  const sceneCache = useRef<
    { bounds: WallBounds; result: FudabaSceneResponse }[]
  >([])
  const [wallInfo, setWallInfo] = useState<FudabaV2WallResponse | null>(null)
  const [wallView, setWallView] = useState("wall")
  const [region, setRegion] = useState<WallBounds>([0, 0, 1600, 900])
  const [wallFocus, setWallFocus] = useState<WallFocus | null>(null)
  const [preparedFocus, setPreparedFocus] = useState<WallFocus | null>(null)
  if (layoutIndex.ready && preparedFocus !== wallFocus)
    setPreparedFocus(wallFocus)
  const officeLoadScope = useRef<string | null>(null)

  const loadedBounds = useRef<WallBounds | null>(null)
  const [knownOwnedPlacements, setKnownOwnedPlacements] = useState(
    () => new Set<string>()
  )
  const [wallLoading, setWallLoading] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const wallSnapshot = useRef<FudabaV2WallResponse | null>(null)
  useEffect(() => {
    wallSnapshot.current = wallInfo
  }, [wallInfo])

  const sceneGeneration = useRef(0)
  const activeSceneRequest = useRef<
    | ReturnType<typeof getFudabaWall>
    | ReturnType<typeof getFudabaWallScene>
    | null
  >(null)
  const wallQuery = useRef<WallBounds>([-400, -225, 2000, 1125])
  const onRegionChange = useCallback((bounds: WallBounds) => {
    setSceneError(null)
    setRegion((current) =>
      current.every((value, index) => Math.abs(value - bounds[index]) < 0.1)
        ? current
        : bounds
    )
  }, [])
  const requestGeneration = useRef(0)
  const editorGeneration = useRef(0)
  const pendingCardIdsRef = useRef(new Set<string>())

  const [messageEditor, setMessageEditor] = useState<{
    note?: FudabaMessage
  } | null>(null)
  const [messageReader, setMessageReader] = useState<
    FudabaPublicMessage | FudabaMessage | null
  >(null)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [pendingMessageIds, setPendingMessageIds] = useState(new Set<string>())
  const messageSessionGeneration = useRef(0)
  const messageIdentity = useRef<string | null>(null)
  const refreshMessageIdentity = useRef(false)
  const pendingMessages = useRef(new Set<string>())
  const [searchParams] = useSearchParams()
  const loadOffice = useCallback(async () => {
    if (!officeSlug) {
      setState({ ...initialState, phase: "missing" })
      return
    }
    const currentScope = `${officeSlug}:${platform.session?.account.id ?? "public"}`
    const sameScope = officeLoadScope.current === currentScope
    if (sameScope) void layoutIndexRef.current.reload()
    officeLoadScope.current = currentScope
    const generation = ++requestGeneration.current
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    loadedBounds.current = null
    sceneCache.current = []
    setWallLoading(false)
    setState((current) => ({
      ...current,
      phase: sameScope && current.phase === "ready" ? "ready" : "loading",
      error: null,
    }))
    try {
      const [officeResult, seriesResult] = await Promise.allSettled([
        getFudabaWallScene(officeSlug, { bbox: [0, 0, 1600, 900] }).send(),
        getFudabaSeries().send(),
      ])
      if (requestGeneration.current !== generation) return
      if (officeResult.status === "rejected") throw officeResult.reason
      layoutIndexRef.current.upsert(officeResult.value.layouts)
      setWallInfo(officeResult.value)
      setState({
        phase: "ready",
        office: officeResult.value.office,
        series:
          seriesResult.status === "fulfilled" ? seriesResult.value.items : [],
        error: null,
      })
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({ ...current, ...detailFailure(error) }))
    }
  }, [officeSlug, platform.session?.account.id])

  useEffect(() => {
    void loadOffice()
    return () => {
      requestGeneration.current += 1
    }
  }, [loadOffice, dataRevision])

  useEffect(() => {
    if (platform.status !== "authenticated") {
      editorGeneration.current += 1
      setWallEditor(initialWallEditorState)
      setWallEditing(false)
      return
    }

    const generation = ++editorGeneration.current
    setWallEditor((current) => ({ ...current, phase: "loading" }))
    void Promise.all([
      getFudabaOwnerCards().send(),
      getPlatformProfile().send(),
    ])
      .then(([cardResult, profileResult]) => {
        if (editorGeneration.current !== generation) return
        setWallEditor({
          phase: "ready",
          cards: cardResult.items,
          writeEnabled:
            profileResult.account.status === "active" &&
            profileResult.capabilities.fudabaWrite,
        })
      })
      .catch(() => {
        if (editorGeneration.current !== generation) return
        setWallEditor({ phase: "error", cards: [], writeEnabled: false })
        setWallEditing(false)
      })

    return () => {
      editorGeneration.current += 1
    }
  }, [platform.session?.account.id, platform.status])

  const readWall = useCallback(
    async (bounds: WallBounds, notifyErrors = true) => {
      if (!officeSlug) return null
      const generation = ++sceneGeneration.current
      activeSceneRequest.current?.abort()
      setWallLoading(true)
      setSceneError(null)
      wallQuery.current = bounds
      const cached = sceneCache.current.find((entry) =>
        entry.bounds.every((value, index) => value === bounds[index])
      )
      const source = cached?.result ?? wallSnapshot.current
      if (cached) {
        setWallInfo(cached.result)
        setState((current) => ({ ...current, office: cached.result.office }))
      }
      const layoutMap = new Map(
        layoutIndexRef.current.items.map((item) => [wallItemKey(item), item])
      )
      const visible = (
        kind: "card" | "message",
        id: string,
        placement: FudabaCardPlacement
      ) =>
        wallLayoutIntersects(
          layoutMap.get(`${kind}:${id}`) ?? {
            placement,
            width: kind === "card" ? 240 : 242,
            height: kind === "card" ? 160 : 277,
          },
          bounds
        )
      const cards = new Map<string, FudabaPlacedCard>(
        (source?.office.cards ?? [])
          .filter((card) => visible("card", card.id, card.placement))
          .map((card) => [card.id, card])
      )
      const messages = new Map<string, FudabaPublicMessage>(
        (source?.messages ?? [])
          .filter((note) => visible("message", note.id, note.placement))
          .map((note) => [note.id, note])
      )
      const manageable = new Set(source?.manageableCardIds ?? [])
      const seen = new Set<string>(),
        cursors = new Set<string>()
      let cursor: string | undefined
      let result: FudabaSceneResponse
      try {
        do {
          const method = getFudabaWallScene(officeSlug, {
            bbox: bounds,
            cursor,
          })
          activeSceneRequest.current = method
          result = await method.send()
          if (generation !== sceneGeneration.current) return null
          for (const card of result.office.cards) {
            cards.set(card.id, card)
            seen.add(`card:${card.id}`)
          }
          for (const note of result.messages) {
            messages.set(note.id, note)
            seen.add(`message:${note.id}`)
          }
          for (const id of result.manageableCardIds) manageable.add(id)
          layoutIndexRef.current.upsert(result.layouts)
          const office = { ...result.office, cards: [...cards.values()] }
          setWallInfo({
            ...result,
            office,
            messages: [...messages.values()],
            manageableCardIds: [...manageable],
          })
          setState((current) => ({ ...current, office }))
          cursor = result.pageInfo.hasNextPage
            ? (result.pageInfo.nextCursor ?? undefined)
            : undefined
          if (result.pageInfo.hasNextPage && (!cursor || cursors.has(cursor)))
            throw new Error("墙面暂时无法完整载入，请重试。")
          if (cursor) cursors.add(cursor)
        } while (cursor)
        for (const id of cards.keys())
          if (!seen.has(`card:${id}`)) cards.delete(id)
        for (const id of messages.keys())
          if (!seen.has(`message:${id}`)) messages.delete(id)
        const removed = new Set(
          layoutIndexRef.current.items
            .filter(
              (item) =>
                wallLayoutIntersects(item, bounds) &&
                !seen.has(wallItemKey(item))
            )
            .map(wallItemKey)
        )
        layoutIndexRef.current.remove(removed)
        const office = { ...result.office, cards: [...cards.values()] }
        const complete = {
          ...result,
          office,
          messages: [...messages.values()],
          manageableCardIds: [...manageable],
        }
        sceneCache.current = [
          { bounds, result: complete },
          ...sceneCache.current
            .filter(
              (entry) =>
                !entry.bounds.every((value, index) => value === bounds[index])
            )
            .map((entry) => ({
              ...entry,
              result: {
                ...entry.result,
                office: {
                  ...entry.result.office,
                  cards: entry.result.office.cards.filter(
                    (card) => !removed.has(`card:${card.id}`)
                  ),
                },
                messages: entry.result.messages.filter(
                  (note) => !removed.has(`message:${note.id}`)
                ),
              },
            })),
        ].slice(0, 3)
        loadedBounds.current = bounds
        setWallInfo(complete)
        setMessageReader((current) =>
          current ? (messages.get(current.id) ?? null) : null
        )
        setState((current) => ({ ...current, office }))
        return office
      } catch (error) {
        if (generation === sceneGeneration.current) {
          const message =
            error instanceof Error
              ? error.message
              : "墙面暂时无法载入，请重试。"
          setSceneError(message)
          if (notifyErrors) toast.error(message)
        }
        return null
      } finally {
        if (generation === sceneGeneration.current) setWallLoading(false)
      }
    },
    [officeSlug]
  )

  useEffect(() => {
    if (
      state.phase !== "ready" ||
      (loadedBounds.current && containsViewport(loadedBounds.current, region))
    )
      return
    const bounds = wallLoadBounds(region)
    const timer = window.setTimeout(() => {
      void readWall(bounds)
    }, 180)
    return () => {
      window.clearTimeout(timer)
      sceneGeneration.current += 1
      activeSceneRequest.current?.abort()
    }
  }, [region, state.phase, readWall])

  useEffect(
    () => () => {
      sceneGeneration.current += 1
      activeSceneRequest.current?.abort()
    },
    [officeSlug]
  )

  const seriesMap = useMemo(
    () => new Map(state.series.map((item) => [item.code, item])),
    [state.series]
  )

  const eligibleOwnerCards = useMemo(
    () =>
      wallEditor.cards.filter((card) => card.publicationStatus === "published"),
    [wallEditor.cards]
  )
  const placedCardIds = useMemo(() => {
    const cardIds = new Set(state.office?.cards.map((card) => card.id) ?? [])
    for (const cardId of confirmedPlacements.keys()) cardIds.add(cardId)
    for (const cardId of knownOwnedPlacements) cardIds.add(cardId)
    return cardIds
  }, [confirmedPlacements, knownOwnedPlacements, state.office?.cards])
  const unplacedOwnerCards = useMemo(
    () => eligibleOwnerCards.filter((card) => !placedCardIds.has(card.id)),
    [eligibleOwnerCards, placedCardIds]
  )
  const canEditWall =
    platform.status === "authenticated" &&
    wallEditor.phase === "ready" &&
    wallEditor.writeEnabled &&
    Boolean(state.office?.isOpen)
  const canEditMixedWall =
    canEditWall ||
    Boolean(wallInfo?.capabilities.canArrangeWall) ||
    Boolean(wallInfo?.messages.some((message) => message.capabilities.canMove))
  const hasOwnedPlacedCard = Boolean(
    state.office?.cards.some((card) => card.viewerOwned)
  )

  useEffect(() => {
    setSelectedOwnerCardId((current) => {
      if (current && unplacedOwnerCards.some((card) => card.id === current)) {
        return current
      }
      return unplacedOwnerCards[0]?.id ?? null
    })
  }, [unplacedOwnerCards])

  useEffect(() => {
    if (!canEditMixedWall) setWallEditing(false)
  }, [canEditMixedWall])

  useEffect(() => {
    setConfirmedPlacements(new Map())
    setKnownOwnedPlacements(new Set())
  }, [officeSlug, platform.session?.account.id])

  useEffect(() => {
    const owned = state.office?.cards.filter((card) => card.viewerOwned) ?? []
    if (!owned.length) return
    setKnownOwnedPlacements((current) => {
      if (owned.every((card) => current.has(card.id))) return current
      return new Set([...current, ...owned.map((card) => card.id)])
    })
  }, [state.office?.cards])

  function markCardPending(cardId: string, pending: boolean) {
    const next = new Set(pendingCardIdsRef.current)
    if (pending) next.add(cardId)
    else next.delete(cardId)
    pendingCardIdsRef.current = next
    setPendingCardIds(next)
  }

  function replacePlacement(cardId: string, placement: FudabaCardPlacement) {
    sceneCache.current = []
    layoutIndexRef.current.upsert(
      layoutIndexRef.current.items
        .filter((item) => item.kind === "card" && item.id === cardId)
        .map((item) => ({
          ...item,
          placement: { ...item.placement, ...placement },
        }))
    )

    setState((current) => {
      if (!current.office) return current
      return {
        ...current,
        office: {
          ...current.office,
          cards: current.office.cards.map((card) =>
            card.id === cardId ? { ...card, placement } : card
          ),
        },
      }
    })
  }

  function rememberConfirmedPlacement(
    cardId: string,
    placement: FudabaCardPlacement
  ) {
    setConfirmedPlacements((current) => {
      const next = new Map(current)
      next.set(cardId, placement)
      return next
    })
  }

  function forgetConfirmedPlacement(cardId: string) {
    setConfirmedPlacements((current) => {
      if (!current.has(cardId)) return current
      const next = new Map(current)
      next.delete(cardId)
      return next
    })
  }

  function previewPlacement(cardId: string, placement: WallPlacement) {
    setState((current) => {
      if (!current.office) return current
      return {
        ...current,
        office: {
          ...current.office,
          cards: current.office.cards.map((card) =>
            card.id === cardId
              ? {
                  ...card,
                  placement: { ...card.placement, ...placement },
                }
              : card
          ),
        },
      }
    })
  }

  const refreshOfficeDetail = useCallback(
    async (cardId?: string) => {
      if (!officeSlug) return null
      if (!cardId) {
        const office = await readWall(wallQuery.current, false)
        if (!office) throw new Error("墙面暂时无法重新载入。")
        return office
      }
      const generation = ++sceneGeneration.current
      activeSceneRequest.current?.abort()
      setWallLoading(false)
      const method = getFudabaWallScene(officeSlug, { item: `card:${cardId}` })
      activeSceneRequest.current = method
      const result = await method.send()
      if (generation !== sceneGeneration.current) return null
      layoutIndexRef.current.upsert(result.layouts)
      sceneCache.current = []
      loadedBounds.current = null
      setWallInfo((current) => ({
        ...result,
        messages: current?.messages ?? [],
        manageableCardIds: [
          ...new Set([
            ...(current?.manageableCardIds ?? []),
            ...result.manageableCardIds,
          ]),
        ],
      }))
      setState((current) => ({
        ...current,
        phase: "ready",
        office: {
          ...result.office,
          cards: [
            ...(current.office?.cards.filter((card) => card.id !== cardId) ??
              []),
            ...result.office.cards.filter((card) => card.id === cardId),
          ],
        },
        error: null,
      }))
      return result.office
    },
    [officeSlug, readWall]
  )

  async function handlePlacementFailure(error: unknown, fallback: string) {
    if (
      isApiError(error) &&
      error.status === 409 &&
      error.code === "FUDABA_CARD_PLACEMENT_IN_USE"
    ) {
      toast.error("这张名片已有交换记录，暂时不能从事务所移除。")
      return
    }
    if (isApiError(error) && error.status === 409) {
      try {
        await refreshOfficeDetail()
        toast.error("名片墙已在其他页面更新，当前布局已重新载入。")
      } catch {
        toast.error(
          "名片墙已在其他页面更新，但最新布局暂时无法载入，请重新加载页面。"
        )
      }
      return
    }
    if (isApiError(error) && error.status === 404) {
      setWallEditor((current) => ({ ...current, writeEnabled: false }))
      setWallEditing(false)
    }
    toast.error(error instanceof Error ? error.message : fallback)
  }

  async function savePlacement(
    cardId: string,
    previous: FudabaCardPlacement,
    placement: WallPlacement
  ) {
    const office = state.office
    if (!office || pendingCardIdsRef.current.has(cardId)) return
    markCardPending(cardId, true)
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    setWallLoading(false)
    const pageGeneration = requestGeneration.current
    try {
      const result = await saveFudabaCardPlacement(office.id, cardId, {
        ...placement,
        layoutVersion: 1,
        expectedRevision: previous.revision,
      }).send()
      if (pageGeneration !== requestGeneration.current) return
      replacePlacement(cardId, result.placement)
      loadedBounds.current = null
    } catch (error) {
      if (pageGeneration !== requestGeneration.current) return
      replacePlacement(cardId, previous)
      await handlePlacementFailure(error, "名片位置暂时无法保存。")
    } finally {
      markCardPending(cardId, false)
    }
  }

  async function addSelectedCard() {
    const office = state.office
    const card = unplacedOwnerCards.find(
      (item) => item.id === selectedOwnerCardId
    )
    if (!office || !card || pendingCardIdsRef.current.has(card.id)) return
    const maximumZIndex = Math.max(
      wallInfo?.wall.maxZIndex ?? 0,
      ...office.cards.map((item) => item.placement.zIndex),
      ...Array.from(
        confirmedPlacements.values(),
        (placement) => placement.zIndex
      )
    )
    markCardPending(card.id, true)
    const pageGeneration = requestGeneration.current
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    setWallLoading(false)
    try {
      const result = await saveFudabaCardPlacement(office.id, card.id, {
        layoutVersion: 1,
        x: Math.round((region[0] + region[2]) / 2),
        y: Math.round((region[1] + region[3]) / 2),
        rotation: 0,
        zIndex: Math.min(2_147_483_000, maximumZIndex + 1),
        expectedRevision: null,
      }).send()
      if (pageGeneration !== requestGeneration.current) return
      rememberConfirmedPlacement(card.id, result.placement)
      setKnownOwnedPlacements((current) => new Set([...current, card.id]))
      setWallFocus({
        x: result.placement.x,
        y: result.placement.y,
        key: Date.now(),
      })
      setWallView("wall")
      setWallEditing(true)
      try {
        const refreshedOffice = await refreshOfficeDetail(card.id)
        if (!refreshedOffice?.cards.some((item) => item.id === card.id)) {
          toast.warning("名片已放到墙上，但最新墙面暂时无法重新载入。")
          return
        }
        sceneCache.current = []
        forgetConfirmedPlacement(card.id)
      } catch {
        toast.warning("名片已放到墙上，但最新墙面暂时无法重新载入。")
        return
      }
      toast.success("名片已放到墙上。")
    } catch (error) {
      if (pageGeneration !== requestGeneration.current) return
      await handlePlacementFailure(error, "名片暂时无法放到墙上。")
    } finally {
      markCardPending(card.id, false)
    }
  }

  async function removeCard(card: FudabaPlacedCard) {
    const office = state.office
    if (!office || pendingCardIdsRef.current.has(card.id)) return
    markCardPending(card.id, true)
    const pageGeneration = requestGeneration.current
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    setWallLoading(false)
    try {
      await deleteFudabaCardPlacement(
        office.id,
        card.id,
        card.placement.revision
      ).send()
      if (pageGeneration !== requestGeneration.current) return
      layoutIndexRef.current.remove(new Set([`card:${card.id}`]))
      sceneCache.current = []
      setKnownOwnedPlacements((current) => {
        const next = new Set(current)
        next.delete(card.id)
        return next
      })
      forgetConfirmedPlacement(card.id)
      setWallInfo((current) =>
        current
          ? {
              ...current,
              office: {
                ...current.office,
                cards: current.office.cards.filter(
                  (item) => item.id !== card.id
                ),
              },
              wall: {
                ...current.wall,
                total: Math.max(0, current.wall.total - 1),
              },
            }
          : current
      )
      setState((current) => {
        if (!current.office) return current
        return {
          ...current,
          office: {
            ...current.office,
            cards: current.office.cards.filter((item) => item.id !== card.id),
          },
        }
      })
      toast.success("名片已从墙上移除。")
    } catch (error) {
      if (pageGeneration !== requestGeneration.current) return
      await handlePlacementFailure(error, "名片暂时无法移除。")
    } finally {
      markCardPending(card.id, false)
    }
  }

  const requestedMessageId = searchParams.get("message")
  useEffect(() => {
    const messageId = requestedMessageId
    if (!officeSlug || !messageId) return
    let alive = true
    const request = getFudabaWallScene(officeSlug, {
      item: "message:" + messageId,
    })
    void request
      .send()
      .then((result) => {
        if (!alive) return
        const note = result.messages[0]
        if (!note) return
        setWallFocus({
          x: note.placement.x,
          y: note.placement.y,
          key: Date.now(),
        })
        setFocusedMessageId(note.id)
        setWallView("wall")
      })
      .catch(() => {
        if (alive) toast.error("留言暂时无法定位，可能已被隐藏或销毁。")
      })
    return () => {
      alive = false
      request.abort()
    }
  }, [officeSlug, requestedMessageId])
  useEffect(() => {
    const identity = JSON.stringify([
      officeSlug,
      platform.session?.account.id,
      platform.status,
    ])
    if (messageIdentity.current === null) {
      messageIdentity.current = identity
      return
    }
    if (messageIdentity.current !== identity) {
      messageIdentity.current = identity
      messageSessionGeneration.current++
      setMessageEditor(null)
      setMessageReader(null)
      setFocusedMessageId(null)
      pendingMessages.current.clear()
      setPendingMessageIds(new Set())
      loadedBounds.current = null
      refreshMessageIdentity.current = true
    }
    if (refreshMessageIdentity.current && state.phase === "ready") {
      refreshMessageIdentity.current = false
      void readWall(wallQuery.current, false)
    }
  }, [
    officeSlug,
    platform.session?.account.id,
    platform.status,
    state.phase,
    readWall,
  ])
  function handleMessageSaved(
    note: FudabaMessage,
    created: boolean,
    height = 277
  ) {
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    setWallLoading(false)
    loadedBounds.current = null

    sceneCache.current = []
    layoutIndexRef.current.upsert([
      {
        kind: "message",
        id: note.id,
        placement: note.placement,
        width: 242,
        height,
        layoutVersion: 1,
        color: note.color,
        contentRevision: note.contentRevision,
      },
    ])

    setWallInfo((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages.filter((item) => item.id !== note.id),
              note,
            ],
            wall: {
              ...current.wall,
              total: current.wall.total + (created ? 1 : 0),
              maxZIndex: Math.max(
                current.wall.maxZIndex,
                note.placement.zIndex
              ),
            },
          }
        : current
    )
    if (created) {
      // Focus the new note without passing a scale, so the viewport keeps the
      // current zoom; the note is editable right away.
      setWallFocus({
        x: note.placement.x,
        y: note.placement.y,
        key: Date.now(),
      })
      setFocusedMessageId(note.id)
      setWallView("wall")
      if (note.capabilities.canMove) setWallEditing(true)
      loadedBounds.current = null
    }
    toast.success(created ? "便签已贴到墙上。" : "留言已更新。")
  }
  async function saveMessagePlacement(
    note: FudabaPublicMessage,
    previous: FudabaCardPlacement,
    placement: WallPlacement
  ) {
    if (pendingMessages.current.has(note.id)) return
    pendingMessages.current.add(note.id)
    setPendingMessageIds(new Set(pendingMessages.current))
    // Discard any scene read that started before this move: its snapshot still
    // carries the old placement and would otherwise land after the save and
    // silently revert the note.
    sceneGeneration.current += 1
    activeSceneRequest.current?.abort()
    setWallLoading(false)
    const generation = requestGeneration.current
    const actorGeneration = messageSessionGeneration.current
    const update = (value: FudabaCardPlacement) =>
      setWallInfo((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === note.id ? { ...item, placement: value } : item
              ),
            }
          : current
      )
    update({ ...previous, ...placement })
    try {
      const result = await placeFudabaMessage(note.id, {
        ...placement,
        layoutVersion: 1,
        expectedRevision: previous.revision,
      }).send()
      if (
        generation === requestGeneration.current &&
        actorGeneration === messageSessionGeneration.current
      ) {
        sceneCache.current = []
        layoutIndexRef.current.upsert(
          layoutIndexRef.current.items
            .filter((item) => item.kind === "message" && item.id === note.id)
            .map((item) => ({ ...item, placement: result.message.placement }))
        )
        update(result.message.placement)
        setWallInfo((current) =>
          current
            ? {
                ...current,
                wall: {
                  ...current.wall,
                  maxZIndex: Math.max(
                    current.wall.maxZIndex,
                    result.message.placement.zIndex
                  ),
                },
              }
            : current
        )
        loadedBounds.current = null
      }
    } catch (error) {
      if (
        generation === requestGeneration.current &&
        actorGeneration === messageSessionGeneration.current
      ) {
        update(previous)
        toast.error(
          error instanceof Error ? error.message : "留言位置暂时无法保存。"
        )
        if (isApiError(error) && error.status === 409)
          await readWall(wallQuery.current)
      }
    } finally {
      if (actorGeneration === messageSessionGeneration.current) {
        pendingMessages.current.delete(note.id)
        setPendingMessageIds(new Set(pendingMessages.current))
      }
    }
  }
  if (state.phase === "loading") {
    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      >
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-6 aspect-16/5 w-full" />
        <Skeleton className="mt-8 h-12 w-2/3" />
        <Skeleton className="mt-8 min-h-96 w-full" />
      </ExchangePageSurface>
    )
  }

  if (state.phase !== "ready" || !state.office) {
    let title = "事务所暂时无法加载"
    let description = state.error || "请稍后重新加载。"
    if (state.phase === "closed") {
      title = "社区交换区尚未开放"
      description = "事务所完成公开审核后会在这里显示。"
    } else if (state.phase === "missing") {
      title = "未找到这个事务所"
      description = "链接可能已失效，或者事务所已停止公开。"
    }

    return (
      <ExchangePageSurface
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        <Empty className="min-h-96 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap justify-center gap-2">
            {state.phase === "error" ? (
              <Button type="button" onClick={() => void loadOffice()}>
                <RefreshCwIcon aria-hidden="true" />
                重新加载
              </Button>
            ) : null}
            <NavigationLink
              to="/community/exchange"
              className={buttonVariants({ variant: "outline" })}
            >
              返回事务所列表
            </NavigationLink>
          </div>
        </Empty>
      </ExchangePageSurface>
    )
  }

  const office = state.office
  const wallMutationPending = pendingCardIds.size > 0

  return (
    <ExchangePageSurface id="main-content">
      {!embedded ? (
        <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <NavigationLink
            to="/community/exchange"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeftIcon aria-hidden="true" />
            返回事务所列表
          </NavigationLink>
        </div>
      ) : null}

      <section
        className={cn(
          "mt-4 border-y bg-background",
          embedded && "mt-0 border-t-0"
        )}
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {office.coverUrl ? (
            <div
              className={cn(
                "aspect-16/5 max-h-96 min-h-48 w-full overflow-hidden border-x bg-muted",
                embedded && "aspect-5/1 max-h-44 min-h-28"
              )}
            >
              <img
                src={office.coverUrl}
                alt={`${office.name}封面`}
                className="size-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex aspect-16/5 max-h-96 min-h-48 w-full items-center justify-center overflow-hidden border-x bg-muted/50",
                embedded && "aspect-5/1 max-h-44 min-h-28"
              )}
            >
              <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
              <Building2Icon
                className="size-12 text-muted-foreground/60"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      </section>

      <div
        className={cn(
          "mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
          embedded && "py-5"
        )}
      >
        <header className="border-b pb-8">
          {platform.status === "authenticated" ||
          platform.status === "restricted" ? (
            <div className="mb-5">
              <ExchangeManagementDialog
                section="offices"
                officeId={office.id}
              />
            </div>
          ) : null}
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="max-w-3xl min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    office.isOpen
                      ? "bg-success/20 text-success-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {office.isOpen ? "开放交换" : "暂未开放"}
                </Badge>
                <SeriesBadge codes={office.seriesCodes} series={seriesMap} />
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-balance">
                {office.name}
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                {office.intro || "事务所暂未填写介绍。"}
              </p>
            </div>
            <dl className="grid min-w-64 grid-cols-2 gap-x-6 gap-y-3 border-y py-4 text-sm lg:border-y-0 lg:border-l lg:py-1 lg:pl-6">
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPinIcon className="size-3.5" aria-hidden="true" />
                  地址
                </dt>
                <dd className="mt-1 font-medium">{office.address}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <EyeIcon className="size-3.5" aria-hidden="true" />
                  访问
                </dt>
                <dd className="mt-1 font-medium">
                  {office.visitorCount.toLocaleString("zh-CN")}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="pt-8" aria-labelledby="office-card-wall-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="office-card-wall-title" className="text-xl font-semibold">
                事务所名片墙
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {wallInfo?.wall.total ?? office.cards.length} 个公开物件
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {wallInfo?.capabilities.canCreateMessage ? (
                <Button type="button" onClick={() => setMessageEditor({})}>
                  贴便签留言
                </Button>
              ) : null}
              {platform.status === "authenticated" ? (
                <NavigationLink
                  to="/community/exchange/me?section=messages"
                  className={buttonVariants({ variant: "outline" })}
                >
                  我的留言
                </NavigationLink>
              ) : null}
              {platform.status === "authenticated" ? (
                <LocateMyCards
                  key={`${officeSlug}:${platform.session?.account.id ?? ""}`}
                  items={layoutIndex.items}
                  ready={layoutIndex.ready}
                  onLocate={(item) => {
                    setWallFocus({
                      x: item.placement.x,
                      y: item.placement.y,
                      key: Date.now(),
                      cardId: item.id,
                    })
                    setFocusedMessageId(null)
                    setWallView("wall")
                  }}
                />
              ) : null}
              {platform.status === "anonymous" ? (
                <NavigationLink
                  to="/account/login"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <LogInIcon aria-hidden="true" />
                  登录后布置
                </NavigationLink>
              ) : null}
              {platform.status === "restricted" ? (
                <Badge variant="secondary">帐号受限，仅可浏览</Badge>
              ) : null}
              {platform.status === "authenticated" &&
              wallEditor.phase === "loading" ? (
                <Button type="button" variant="outline" disabled>
                  <LoaderCircleIcon
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  载入我的名片
                </Button>
              ) : null}
              {platform.status === "authenticated" &&
              wallEditor.phase === "error" ? (
                <NavigationLink
                  to="/account/me/namecards"
                  className={buttonVariants({ variant: "outline" })}
                >
                  管理我的名片
                </NavigationLink>
              ) : null}
              {canEditMixedWall &&
              (eligibleOwnerCards.length > 0 ||
                hasOwnedPlacedCard ||
                wallInfo?.capabilities.canArrangeWall ||
                wallInfo?.messages.some(
                  (message) => message.capabilities.canMove
                )) ? (
                <Button
                  type="button"
                  variant={wallEditing ? "secondary" : "default"}
                  disabled={wallMutationPending}
                  onClick={() => {
                    // Entering edit mode keeps the current camera and zoom;
                    // only switch to the wall tab if another tab is showing.
                    if (!wallEditing && wallView !== "wall")
                      setWallView("wall")
                    setWallEditing((current) => !current)
                  }}
                >
                  {wallEditing ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <PencilRulerIcon aria-hidden="true" />
                  )}
                  {wallEditing ? "完成布置" : "布置名片墙"}
                </Button>
              ) : null}
              {canEditMixedWall &&
              eligibleOwnerCards.length === 0 &&
              !hasOwnedPlacedCard ? (
                <NavigationLink
                  to="/account/me/namecards"
                  className={buttonVariants({ variant: "outline" })}
                >
                  创建可公开名片
                </NavigationLink>
              ) : null}
              {platform.status === "authenticated" &&
              wallEditor.phase === "ready" &&
              (!wallEditor.writeEnabled || !office.isOpen) ? (
                <Badge variant="secondary">当前仅可浏览</Badge>
              ) : null}
            </div>
          </div>

          {wallEditing ? (
            <div className="mt-5 flex flex-col gap-3 border-y bg-muted/30 py-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <span
                  id="fudaba-wall-card-select-label"
                  className="mb-1.5 block text-xs font-medium"
                >
                  放置名片
                </span>
                <Select
                  value={selectedOwnerCardId ?? ""}
                  disabled={
                    unplacedOwnerCards.length === 0 || wallMutationPending
                  }
                  onValueChange={(value) =>
                    setSelectedOwnerCardId(String(value ?? "") || null)
                  }
                >
                  <SelectTrigger
                    className="w-full bg-background"
                    aria-labelledby="fudaba-wall-card-select-label"
                  >
                    <SelectValue placeholder="没有可放置的名片">
                      {unplacedOwnerCards.find(
                        (card) => card.id === selectedOwnerCardId
                      )?.producerName ?? "没有可放置的名片"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {unplacedOwnerCards.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.producerName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <NavigationLink
                  to="/account/me/namecards"
                  className={buttonVariants({ variant: "outline" })}
                >
                  管理名片
                </NavigationLink>
                <Button
                  type="button"
                  disabled={!selectedOwnerCardId || wallMutationPending}
                  onClick={() => void addSelectedCard()}
                >
                  <PlusIcon aria-hidden="true" />
                  放到墙上
                </Button>
              </div>
            </div>
          ) : null}

          {(wallInfo?.wall.total ?? office.cards.length) || wallEditing ? (
            <Tabs value={wallView} onValueChange={setWallView} className="mt-5">
              <TabsList aria-label="名片墙视图">
                <TabsTrigger value="wall">
                  <LayoutGridIcon aria-hidden="true" />
                  墙面
                </TabsTrigger>
                <TabsTrigger value="list">
                  <ListIcon aria-hidden="true" />
                  列表
                </TabsTrigger>
              </TabsList>
              <TabsContent value="wall" className="mt-3">
                {!layoutIndex.ready ? (
                  <div
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    {layoutIndex.phase === "error" ? (
                      <>
                        <span>{layoutIndex.error}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void layoutIndex.reload()}
                        >
                          重试准备占位
                        </Button>
                      </>
                    ) : (
                      <span>
                        正在准备墙面占位… 已准备 {layoutIndex.items.length}{" "}
                        个物件
                      </span>
                    )}
                  </div>
                ) : null}
                <PlacedCardWall
                  loadError={sceneError}
                  onRetryLoad={() => void readWall(wallQuery.current)}
                  layoutItems={layoutIndex.items}
                  layoutBounds={region}
                  cards={office.cards}
                  messages={wallInfo?.messages ?? []}
                  canArrangeWall={wallInfo?.capabilities.canArrangeWall}
                  focusedMessageId={focusedMessageId}
                  pendingMessageIds={pendingMessageIds}
                  onReadMessage={setMessageReader}
                  onMessagePlacementCommit={(note, previous, placement) =>
                    void saveMessagePlacement(note, previous, placement)
                  }
                  total={wallInfo?.wall.total}
                  maxZIndex={wallInfo?.wall.maxZIndex}
                  focus={preparedFocus}
                  onRegionChange={onRegionChange}
                  editing={wallEditing}
                  onEditingChange={(editing) => {
                    if (canEditMixedWall) setWallEditing(editing)
                  }}
                  pendingCardIds={pendingCardIds}
                  onPlacementPreview={previewPlacement}
                  onPlacementCommit={(cardId, previous, placement) =>
                    void savePlacement(cardId, previous, placement)
                  }
                  onRemove={(card) => void removeCard(card)}
                />
              </TabsContent>
              <TabsContent value="list" className="mt-3">
                <p className="mb-3 text-sm text-muted-foreground">
                  当前观察区域内的名片
                </p>
                {office.cards.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {office.cards.map((card) => (
                      <div key={card.id} className="space-y-2">
                        <div>
                          <ExchangeCard card={card} series={seriesMap} />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setWallFocus({
                              x: card.placement.x,
                              y: card.placement.y,
                              key: Date.now(),
                            })
                            setWallView("wall")
                          }}
                        >
                          在墙上定位
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="border-y py-12 text-center text-sm text-muted-foreground">
                    当前区域暂无名片
                  </p>
                )}
                {wallInfo?.messages.length ? (
                  <div className="mt-6 flex flex-wrap gap-6">
                    {wallInfo.messages.map((note) => (
                      <div key={note.id} className="space-y-2">
                        <button
                          type="button"
                          className="relative w-60.5 text-left"
                          style={{
                            height:
                              layoutIndex.items.find(
                                (item) =>
                                  item.kind === "message" && item.id === note.id
                              )?.height ?? 277,
                          }}
                          aria-label={`阅读全文：${note.authorName}`}
                          onClick={() => setMessageReader(note)}
                        >
                          <MessagePaper message={note} />
                        </button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setWallFocus({
                              x: note.placement.x,
                              y: note.placement.y,
                              key: Date.now(),
                            })
                            setFocusedMessageId(note.id)
                            setWallView("wall")
                          }}
                        >
                          在墙上定位留言
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </TabsContent>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-live="polite"
              >
                {wallLoading ? (
                  <span className="text-sm text-muted-foreground">
                    载入墙面…
                  </span>
                ) : null}
                <Button
                  variant="outline"
                  disabled={wallLoading || wallMutationPending}
                  onClick={() => void readWall(wallQuery.current)}
                >
                  刷新墙面
                </Button>
              </div>
            </Tabs>
          ) : (
            <Empty className="mt-5 min-h-64 border-y">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGridIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>名片墙还是空的</EmptyTitle>
                <EmptyDescription>
                  公开名片与留言便签会显示在这里。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>
      {messageEditor ? (
        <MessageComposer
          officeId={office.id}
          center={{
            x: (region[0] + region[2]) / 2,
            y: (region[1] + region[3]) / 2,
          }}
          note={messageEditor.note}
          onClose={() => setMessageEditor(null)}
          onSaved={(note, height) =>
            handleMessageSaved(note, !messageEditor.note, height)
          }
        />
      ) : null}
      {messageReader ? (
        <MessageReader
          key={messageReader.id}
          note={messageReader}
          canManage={wallInfo?.capabilities.canManageMessages}
          onClose={() => setMessageReader(null)}
          onEdit={(note) => {
            setMessageReader(null)
            setMessageEditor({ note })
          }}
          onChanged={(id) => {
            setMessageReader(null)
            if (id)
              setWallInfo((current) =>
                current
                  ? {
                      ...current,
                      messages: current.messages.filter(
                        (note) => note.id !== id
                      ),
                      wall: {
                        ...current.wall,
                        total: Math.max(
                          0,
                          current.wall.total -
                            (current.messages.some((note) => note.id === id)
                              ? 1
                              : 0)
                        ),
                      },
                    }
                  : current
              )
            sceneCache.current = []
            if (id) layoutIndexRef.current.remove(new Set([`message:${id}`]))
            else void layoutIndexRef.current.reload()
            void readWall(wallQuery.current)
          }}
        />
      ) : null}
    </ExchangePageSurface>
  )
}

export default function CommunityOfficePage() {
  return (
    <CardInteractionScope>
      <CommunityOfficePageContent />
    </CardInteractionScope>
  )
}
