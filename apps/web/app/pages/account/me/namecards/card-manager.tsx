import { DndContext, DragOverlay } from "@dnd-kit/core"
import {
  rectSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable"
import { NAMECARD_PROFILE_GROUP_LIMIT } from "@imsweb/contracts/namecards/runtime"
import { FileImageIcon, PlusIcon } from "lucide-react"
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import type { FudabaOwnerCard, NamecardCardLayout } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"
import { cn } from "~/lib/utils"
import {
  applyLayout,
  buildCardGroups,
  buildDraftCardGroups,
  canCreateCardGroup,
  cardGroupKey,
  cardGroupSortableId,
  cardSettingsToPatches,
  collectCardSettings,
  DEFAULT_CARD_GROUP_KEY,
  effectiveCardVisible,
  effectiveExchangeMode,
  flattenCardGroups,
  isCardSelectable,
  quickCardIdSet,
  sortCardsByCreatedAtDesc,
  type CardGroupView,
  type CardManagerCardPatches,
  type DraftCardGroup,
} from "./card-manager-model"
import { cardTileGridClassName } from "./card-tile"
import { CardBulkActions } from "./components/card-bulk-actions"
import { CardDragLayer } from "./components/card-drag-layer"
import {
  CardDragGhostSlots,
  CardDragGhostStack,
} from "./components/card-drag-ghost"
import { CardGroupSection } from "./components/card-group-section"
import {
  CardManagerModeToggle,
  CardManagerToolbar,
  type CardManagerViewMode,
} from "./components/card-manager-toolbar"
import { SortableCardTile } from "./components/sortable-card-tile"
import { useCardGridFlip } from "./hooks/use-card-grid-flip"
import { useCardManagerDraft } from "./hooks/use-card-manager-draft"
import { useCardManagerDrag } from "./hooks/use-card-manager-drag"
import { useCardManagerSave } from "./hooks/use-card-manager-save"
import { useCardMarquee } from "./hooks/use-card-marquee"
import { useCollapsedCardGroups } from "./hooks/use-collapsed-card-groups"

/**
 * 卡片网格的「不位移」排序策略：多选拖动（批次 ≥ 2）时它就位——因为那一刻整批名片已经从
 * 列表里移出去、落点位置由一个真的 ghost 占住了，位移的唯一来源必须是 ghost。
 * 两套位移叠加的表现就是「瓦片前后各有一处空白」、列表错位甚至溢出（2026-11-17 用户实测）。
 *
 * 单张拖动仍用 `rectSortingStrategy`：那种情况下不插 ghost，让出的空位由 dnd-kit 负责。
 */
const NO_SHIFT_SORTING_STRATEGY: SortingStrategy = () => null

/** 长按提示在本会话里提示过没有；按 `sessionStorage` 记（刷新还在、关掉标签页就忘）。 */
const LONG_PRESS_HINT_STORAGE_KEY = "imsweb:namecard-long-press-hint:v1"

/** 存储不可用（隐私模式/SSR）时的兜底：同一次页面加载里仍然只提示一次。 */
let longPressHintShownInMemory = false

/**
 * 进入/退出编辑时工具栏高度会变（多出保存/退出、批量区），仅仅保留 scrollTop 会让
 * 视野里换一批卡。这里记录「滚动区顶部第一张可见名片 + 它的相对偏移」，切换后按同一偏移还原。
 */
let editAnchorCardId: string | null = null
let editAnchorOffset = 0

/** 通过函数改滚动位置：直接把 `scrollTop` 写到 props 派生的元素上会被 hooks 规则拦下。 */
function scrollElementBy(element: HTMLElement, delta: number) {
  element.scrollTop += delta
}

function rememberEditAnchor(scroller: HTMLElement | null) {
  if (!scroller) return
  const scrollerTop = scroller.getBoundingClientRect().top
  const firstVisible = Array.from(
    document.querySelectorAll<HTMLElement>("[data-card-id]")
  ).find((tile) => tile.getBoundingClientRect().bottom > scrollerTop)
  if (!firstVisible) return
  editAnchorCardId = firstVisible.dataset.cardId ?? null
  editAnchorOffset = firstVisible.getBoundingClientRect().top - scrollerTop
}

/**
 * 编辑模式切换时要在「文档滚动」与「清单容器滚动」之间换算位置。
 * 记录在模块级：同一时刻只有一个名片管理器实例，且写 ref 会触发
 * `react-hooks/immutability`（把「上一状态」塞进 ref 被判为修改 hook 参数）。
 */
/**
 * 进入编辑模式的第一次长按提示一次「长按拖动可调整顺序」（设计 §11：两个长按手势不叠加，
 * 进编辑后要让用户知道下一次长按是拖动）。
 *
 * 只用 `sessionStorage`，**不用** `localStorage`：这是「这次会话还没见过」的提示，不是永久设置。
 * 存储不可用（隐私模式）时退回模块级标记——同一次页面加载里仍然只提示一次。
 */
function longPressHintAlreadyShown() {
  try {
    return window.sessionStorage.getItem(LONG_PRESS_HINT_STORAGE_KEY) !== null
  } catch {
    return longPressHintShownInMemory
  }
}

function markLongPressHintShown() {
  try {
    window.sessionStorage.setItem(LONG_PRESS_HINT_STORAGE_KEY, "1")
  } catch {
    longPressHintShownInMemory = true
  }
}

function announceLongPressHint() {
  if (longPressHintAlreadyShown()) return
  markLongPressHintShown()
  toast("长按拖动可调整顺序")
}

/**
 * 属主名片管理器：工具栏 + 批量操作 + 分组 + 瓦片。
 *
 * 只读模式的分组与顺序以服务端归一后的布局为准（§4.1）；编辑模式改的是**布局草稿**
 * （`useCardManagerDraft` 里的 `layoutDraft`），拖拽与建组都先落草稿，点保存才整份提交。
 * 分组模式下每个分组有组头与折叠；经典模式**不渲染组头**，瓦片按名片创建时间降序
 * （`sortCardsByCreatedAtDesc`，与分组顺序无关，也不写进布局）。
 *
 * 拖拽只在**分组模式**里开（§7.3）：经典模式没有分组落点，展平列表里的落点含义不明确，
 * 所以那一侧只保留勾选与批量操作。拖动期间不起 View Transition（设计 §10.1），落位后由
 * React 按新顺序直接渲染。
 */
export function CardManager({
  cards,
  layout,
  accountId,
  selectedCardId,
  readOnly,
  shareHandle,
  onSelect,
  onCreate,
  onLayoutSaved,
  onDirtyChange,
  scrollContainerRef,
}: {
  cards: FudabaOwnerCard[]
  /** 服务端归一后的布局；读失败时为 `null`，退化成「只有默认分组」。 */
  layout: NamecardCardLayout | null
  /** 折叠状态按账号隔离存在本地。 */
  accountId: string | null
  selectedCardId: string | null
  readOnly: boolean
  /** 分享链接里的 handle（公开主页地址或数字编号）。 */
  shareHandle: string
  onSelect: (cardId: string) => void
  onCreate: () => void
  /**
   * 保存成功后把服务端归一后的布局与**只含差异**的卡片字段写回上层；
   * 上层用函数式合并套到最新列表上，请求在飞期间新建/删除的卡不受影响。
   */
  onLayoutSaved: (
    layout: NamecardCardLayout,
    patches: CardManagerCardPatches
  ) => void
  /** 草稿有没有未保存改动；上层用它决定「刷新/重载前先确认」。 */
  onDirtyChange?: (dirty: boolean) => void
  /** 拖拽边缘滚动作用的页面级滚动容器（App 目标提供）。 */
  scrollContainerRef?: { readonly current: HTMLElement | null }
}) {
  const [mode, setMode] = useState<CardManagerViewMode>("grouped")
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmQuickJoin, setConfirmQuickJoin] = useState(false)
  /**
   * 待命名分组：某个「新建分组」入口按下后，草稿里**立刻**插出的那个空标题分组的 key
   * （它就是那个区域的身份）。同一时刻只留一个——开始新的就把上一个未命名的丢掉；`null`
   * 表示当前没有待命名分组。
   */
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null)
  /**
   * 移动端批量区是不是展开着（默认折叠）。不持久化：每次进编辑模式都回到折叠
   * （`startEditing` 里重置），也不进 `localStorage`。
   */
  const [bulkExpanded, setBulkExpanded] = useState(false)
  /** 桌面（`min-width: 1024px`，与账号工作区同一处断点）：标题行/控件区的分叉。 */
  const desktop = useDesktopAccountWorkspace()
  /** 瓦片清单容器：批量插入的 FLIP（`useCardGridFlip`）要在它里面量瓦片位置。 */
  const cardGridRef = useRef<HTMLElement | null>(null)
  /** 管理器根节点：判断「焦点/指针是不是还在这一块里面」。 */
  const sectionRef = useRef<HTMLElement | null>(null)
  /**
   * 这一拍有没有指针按在管理器里（点卡片、拖卡片、点放置区都会先按下去再失焦）。
   * 待命名分组的空标题失焦要靠它区分「还在操作」与「真的离开了」。
   */
  const pointerInsideRef = useRef(false)
  /** 保存成功后焦点要交回的「编辑模式」按钮（设计 §11）。 */
  const editButtonRef = useRef<HTMLButtonElement | null>(null)
  /** 只有真的保存落地才交回焦点：退出编辑、放弃改动不算。 */
  const focusEditButtonAfterSaveRef = useRef(false)

  const draft = useCardManagerDraft({ cards, layout })
  const { collapsedKeys, toggleCollapsed, pruneCollapsedKeys } =
    useCollapsedCardGroups(accountId)
  // 解构出稳定的引用：`draft` 每次渲染都是新对象，直接读成员会让 useCallback
  // 每帧都换新（依赖告警也来自这里）。
  const {
    editing,
    hasChanges,
    resetDraft,
    startEditing: beginEditing,
    selectedCardIds,
    toggleSelected,
  } = draft

  // 编辑模式切换后，按锚点把「同一张名片」放回滚动区里的同一相对位置。
  useLayoutEffect(() => {
    const id = editAnchorCardId
    if (!id) return
    editAnchorCardId = null
    const scroller =
      scrollContainerRef?.current ??
      document.querySelector<HTMLElement>("[data-namecards-scroller]")
    if (!scroller) return
    const tile = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
    if (!tile) return
    const delta =
      tile.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      editAnchorOffset
    if (Math.abs(delta) > 1) scrollElementBy(scroller, delta)
  }, [editing, scrollContainerRef])

  /**
   * 退出 / 重置编辑会话：折叠态收窄到**服务端已保存的分组**。新建分组用的 `local:N`
   * 键每会话都从 1 重号，上一会话留下的折叠态不清掉，这一会话新建的组会一出生就折叠着。
   */
  const endEditingSession = useCallback(
    (nextLayout: NamecardCardLayout | null) => {
      rememberEditAnchor(
        scrollContainerRef?.current ??
          document.querySelector<HTMLElement>("[data-namecards-scroller]")
      )
      if (nextLayout) {
        pruneCollapsedKeys(nextLayout.groups.map((group) => group.id))
      }
      // 待命名分组随会话一起收尾：它要么已经命名、要么被放弃，key 不能漏到下一次会话。
      setPendingGroupKey(null)
      resetDraft(nextLayout)
    },
    [pruneCollapsedKeys, resetDraft, scrollContainerRef]
  )

  const save = useCardManagerSave({
    source: {
      buildRequest: draft.buildRequest,
      quickCount: draft.quickCardNumbers.length,
      limit: draft.limit,
      hasChanges: draft.hasChanges,
    },
    onSaved: (saved) => {
      // 布局响应不带批量字段，所以把请求里那份差异交给上层合并（不要用卡片快照整份覆盖）。
      const patches = cardSettingsToPatches(
        collectCardSettings(cards, draft.cardSettings)
      )
      endEditingSession(saved)
      onLayoutSaved(saved, patches)
      focusEditButtonAfterSaveRef.current = true
    },
  })

  // 保存落地后焦点回工具栏的「编辑模式」按钮（§11）：必须等这一次提交渲染完——编辑中那一支
  // 渲染的是保存/退出，退出后才轮到「编辑模式」按钮出现在 DOM 里。
  useEffect(() => {
    if (editing || !focusEditButtonAfterSaveRef.current) return
    focusEditButtonAfterSaveRef.current = false
    editButtonRef.current?.focus()
  }, [editing])

  useEffect(() => {
    onDirtyChange?.(draft.hasChanges)
  }, [draft.hasChanges, onDirtyChange])

  /** 编辑模式下的布局草稿渲染结构；不在编辑模式时为 `null`。 */
  const draftGroups = useMemo<DraftCardGroup[] | null>(
    () =>
      draft.layoutDraft ? buildDraftCardGroups(cards, draft.layoutDraft) : null,
    [cards, draft.layoutDraft]
  )
  const readGroups = useMemo(
    () => buildCardGroups(cards, layout),
    [cards, layout]
  )
  const groups: readonly CardGroupView[] = draftGroups ?? readGroups
  const flatCards = useMemo(() => flattenCardGroups(groups), [groups])
  /**
   * 经典模式的瓦片顺序：按名片创建时间降序（2026-11-17 用户口径更正）。它是一条派生顺序，
   * 与分组顺序无关、也不写进布局；缺创建时间时回退是确定的（见 `sortCardsByCreatedAtDesc`）。
   */
  const classicCards = useMemo(
    () => sortCardsByCreatedAtDesc(flatCards),
    [flatCards]
  )
  /** 可勾选的卡（`published`）：框选只把这一批收进选择集。 */
  const selectableCardIdSet = useMemo(
    () => new Set(cards.filter(isCardSelectable).map((card) => card.id)),
    [cards]
  )
  // 角标跟草稿走：加入/移出与改交换模式立刻反映到瓦片上，不必等保存。
  const quickCardIds = useMemo(
    () => quickCardIdSet(cards, draft.quickCardNumbers),
    [cards, draft.quickCardNumbers]
  )

  // 布局读不到时不许进编辑模式：保存会把 `groups: []` / `defaultCardNumbers: []` 整份
  // 覆盖到服务端，清空用户已有的分组与顺序，而且 `limit` 未知、超限阻断也失效。
  // 只读账号同理（工具栏按钮已被禁用，这里再守一道，长按入口也走同一个函数）。
  const editDisabledReason =
    layout === null ? "读不到名片布局，刷新页面后再试。" : null
  const startEditing = useCallback((): boolean => {
    if (readOnly || layout === null) return false
    rememberEditAnchor(
      scrollContainerRef?.current ??
        document.querySelector<HTMLElement>("[data-namecards-scroller]")
    )
    // 每次进编辑模式都从「没有待命名分组、批量区折叠」开始：退出/切换模式时会丢掉这个区域，
    // 状态也就跟着会话一起重置，不必再用 effect 去追状态。
    setPendingGroupKey(null)
    setBulkExpanded(false)
    // 上一会话留下的 `local:N` 折叠态会串到这一会话新建的分组上，进来先清掉。
    pruneCollapsedKeys(layout.groups.map((group) => group.id))
    // 经典模式没有分组界面（建组、拖拽都在分组视图里），所以点「编辑模式」先自动切回分组：
    // 一次交互完成。切换只是视图状态，不碰草稿，也就不会把会话标脏。
    // 进入编辑直接提交 DOM 和滚动补偿，避免 View Transition 先显示读模式的列表快照。
    flushSync(() => {
      setMode((current) => (current === "classic" ? "grouped" : current))
      beginEditing()
    })
    return true
  }, [beginEditing, layout, pruneCollapsedKeys, readOnly, scrollContainerRef])

  /**
   * 移动端长按瓦片进编辑（§7.1），并**默认勾选触发这一次长按的那张瓦片**（用户 2026-11-17
   * 追加）。进不去时（只读、布局读失败）什么都不做也不提示——那会让用户以为手势生效了却看不到
   * 任何变化。
   *
   * 勾选这张卡的口径与勾选框一致（R3：只有整卡 `published` 可勾选/可拖拽）：不可勾选的卡只进
   * 编辑模式、不硬勾。它只是**默认值**，用户随后照样能取消或改选。
   *
   * 「哪张瓦片」由长按回调自己带着（每张瓦片各挂一个回调，等价于用事件目标的
   * `closest('[data-card-id]')` 反查），不做坐标反查——坐标在滚动/缩放后并不可靠。
   */
  const startEditingByLongPress = useCallback(
    (card: FudabaOwnerCard) => {
      if (!startEditing()) return
      if (isCardSelectable(card) && !selectedCardIds.has(card.id)) {
        toggleSelected(card.id)
      }
      announceLongPressHint()
    },
    [selectedCardIds, startEditing, toggleSelected]
  )

  /** 拖拽、建组、折叠只发生在分组模式；经典模式是**创建时间降序**的平铺视图。 */
  const layoutEditing = editing && mode === "grouped"
  const canAddGroup = canCreateCardGroup(draft.layoutDraft?.groups ?? [])

  const drag = useCardManagerDrag({
    scrollerRef: scrollContainerRef,
    cards,
    groups: draftGroups ?? [],
    // 指针追踪只在「编辑模式的分组视图」里挂着（拖着卡片才需要落点几何）。
    enabled: layoutEditing,
    selectedCardIds: draft.selectedCardIds,
    onMoveCards: draft.moveCards,
    onReorderCardGroups: draft.reorderCardGroups,
  })

  /**
   * 批量插入时的瓦片位移（手写 FLIP）。多选拖动那一刻没有 dnd-kit 的排序位移
   * （`NO_SHIFT_SORTING_STRATEGY`），被顶开的瓦片得自己动起来：会话边界就是
   * 「整批真的在拖」（`draggedCardIds`）。
   */
  useCardGridFlip({
    rootRef: cardGridRef,
    enabled: layoutEditing,
    active: drag.draggedCardIds.size > 0,
  })

  /**
   * 鼠标框选（§8）：只在编辑模式、只对鼠标/笔生效，起点必须是列表空白处。结果是一条整份
   * 的选择集（替换 / Shift 追加已经在 hook 里算好），所以工具栏计数、批量按钮与保存链路
   * 都按平时那条路走。
   */
  const marquee = useCardMarquee({
    enabled: editing,
    isSelectableCardId: (cardId) => selectableCardIdSet.has(cardId),
    selectedCardIds,
    onSelectionChange: draft.setSelectedCards,
  })

  /**
   * 一步新建（§7.2）：点下入口**立刻**在锚点分组下方插出一个真实的分组区域（组头是聚焦的
   * 标题输入框、下面是空放置区，已可接收拖入的卡片）。上一个还没命名的按同一条规则丢掉。
   */
  function startPendingGroup(afterKey: string) {
    setPendingGroupKey(draft.startPendingCardGroup(pendingGroupKey, afterKey))
  }

  /**
   * 待命名分组的标题落地（回车/失焦/`Esc`）：非空即命名；空标题丢掉这一组，组内卡片退回
   * 默认分组（纯草稿，不丢数据）。
   */
  function settlePendingGroup(title: string) {
    if (pendingGroupKey) {
      draft.commitPendingCardGroupTitle(pendingGroupKey, title)
    }
    setPendingGroupKey(null)
  }

  /**
   * 待命名分组的组头**空标题失焦**：只有焦点真的离开这块管理器、而且这一拍没有指针落在里面
   * 时才丢弃这一组。点一张卡片准备把它拖进来、按在放置区上都会先让输入框失焦——那一刻丢掉
   * 分组，用户就再也拖不进来了（同一个浏览器里点按钮是否让按钮拿到焦点还不一样）。
   */
  function handlePendingTitleBlur(relatedTarget: EventTarget | null) {
    const pressedInside = pointerInsideRef.current
    pointerInsideRef.current = false
    if (pressedInside) return
    const insideSection =
      relatedTarget instanceof Node &&
      sectionRef.current?.contains(relatedTarget)
    if (insideSection) return
    settlePendingGroup("")
  }

  function changeMode(next: CardManagerViewMode) {
    // 防御性清理：待命名分组只存在于编辑会话（编辑模式里没有这个 toggle），切模式时不该留着它的 key。
    setPendingGroupKey(null)
    // 用函数式更新读取「当前」模式：View Transition 会把提交推迟到回调里，
    // 同一帧内连点两下时闭包里的 `mode` 还是旧值，闭包守卫会误判。
    applyLayout(() => setMode((current) => (current === next ? current : next)))
  }

  function toggleGroup(key: string) {
    applyLayout(() => toggleCollapsed(key))
  }

  /** 退出编辑（§7.1）：有未保存改动时先确认，没有就直接清选择并退出。 */
  const exitEditing = useCallback(() => {
    if (save.saving) return
    if (hasChanges) {
      setConfirmDiscard(true)
      return
    }
    endEditingSession(layout)
  }, [endEditingSession, hasChanges, layout, save.saving])

  // `Esc` 退出编辑（§7.1）。任何弹框打开或正在保存时都不响应，免得和
  // AlertDialog 自己的 Esc 处理打架、或在半路写请求时把草稿丢掉。
  useEffect(() => {
    if (!editing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (confirmDiscard || confirmQuickJoin || save.overLimit || save.saving) {
        return
      }
      exitEditing()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    confirmDiscard,
    confirmQuickJoin,
    editing,
    exitEditing,
    save.overLimit,
    save.saving,
  ])

  /**
   * 加入快速清单（§8）：选中里有 `manual`/`none` 时先弹确认，确认后把它们改成
   * 自动交换再一并加入；取消则整批不加入。
   */
  function addSelectedToQuickList() {
    if (draft.quickJoinNeedsAutoCount > 0) {
      setConfirmQuickJoin(true)
      return
    }
    draft.addSelectionToQuickList()
  }

  function confirmAddToQuickList() {
    draft.applyCardSettings(draft.selectedCardIds, { exchangeMode: "auto" })
    draft.addSelectionToQuickList()
    setConfirmQuickJoin(false)
  }

  const renderTile = (card: FudabaOwnerCard) => (
    <SortableCardTile
      key={card.id}
      // 可拖拽资格与可勾选一致（§8）：整卡 `published`、在编辑模式的分组视图里。
      draggable={layoutEditing && isCardSelectable(card)}
      // 长按进编辑只在还进得去的时候挂（只读账号、布局读失败时连监听都不装，免得长按
      // 被白白吞掉）；编辑模式里由瓦片自己关掉（`SortableCardTile`）。
      onLongPress={
        readOnly || layout === null
          ? undefined
          : () => startEditingByLongPress(card)
      }
      card={card}
      inQuickExchange={quickCardIds.has(card.id)}
      hidden={!effectiveCardVisible(card, draft.cardSettings)}
      exchangeMode={effectiveExchangeMode(card, draft.cardSettings)}
      selected={selectedCardId === card.id}
      editing={editing}
      checked={draft.selectedCardIds.has(card.id)}
      onSelect={() => {
        if (editing) draft.toggleSelected(card.id)
        else onSelect(card.id)
      }}
    />
  )

  /**
   * 多选拖动（批次 ≥ 2）时的落点 ghost：那一批名片已经整体移出列表
   * （`drag.draggedCardIds`），所以在落点下标处插一个合集 ghost 占住位置。
   * `preview.index` 的口径与 `moveCards` 一致（**整批移出之后**的列表下标，解析落点时
   * 已经按同一份列表算过），所以 ghost 插在哪儿、松手就落在哪儿，不再需要夹取。
   *
   * 未展开时是一摞真实缩略图（占 1 格），停顿后展开成 N 个瓦片副本（占 N 格）。
   */
  function renderDropGhost(
    groupKey: string
  ): { index: number; nodes: ReactNode; cells: number } | null {
    const preview = drag.cardDropPreview
    if (!preview || preview.groupKey !== groupKey) return null
    const cards = drag.activeCards
    if (!cards.length) return null
    return {
      index: preview.index,
      // 插进 keyed 的瓦片数组里，所以自己也得有 key（一个分组里最多一个落点 ghost）。
      nodes: preview.expanded ? (
        <CardDragGhostSlots key="drop-ghost" cards={cards} />
      ) : (
        <CardDragGhostStack key="drop-ghost" cards={cards} />
      ),
      cells: preview.expanded ? cards.length : 1,
    }
  }

  /**
   * 分组放置区里的瓦片。
   *
   * 单张拖动沿用 dnd-kit 的排序位移（`rectSortingStrategy`），这里只渲染真实瓦片。
   * 多选拖动时整批名片已经移出列表、落点位置由 ghost 占住（`renderDropGhost`），
   * 因此换成**不位移**的策略：ghost 是那一刻唯一的位移来源，两套叠加必然错位
   * （2026-11-17 用户实测「瓦片前后各有一处空白」、列表错位甚至溢出）。
   */
  function renderGroupTiles(
    visibleCards: readonly FudabaOwnerCard[],
    ghost: { index: number; nodes: ReactNode } | null
  ): ReactNode {
    const tiles: ReactNode[] = visibleCards.map(renderTile)
    if (ghost) tiles.splice(ghost.index, 0, ghost.nodes)
    return layoutEditing ? (
      <SortableContext
        items={visibleCards.map((card) => card.id)}
        strategy={ghost ? NO_SHIFT_SORTING_STRATEGY : rectSortingStrategy}
      >
        {tiles}
      </SortableContext>
    ) : (
      tiles
    )
  }

  // 分组模式保留组头与折叠；经典模式只换容器，瓦片顺序按创建时间降序（`classicCards`）。
  // 两种模式共用一个具名容器：e2e 与读屏都靠「我的名片清单」找到整个列表。
  const groupedGroups = draftGroups ?? readGroups
  /** 到上限时每个「新建分组」入口都要把原因讲出来，不能静默失效。 */
  const createGroupDisabledReason = canAddGroup
    ? null
    : `最多 ${NAMECARD_PROFILE_GROUP_LIMIT} 个分组`
  // 待命名分组不挂拖动把手（它随时可能被整组丢掉），所以也不进分组排序的 items。
  const groupSortableIds = layoutEditing
    ? groupedGroups
        .filter(
          (group) =>
            group.title !== null && cardGroupKey(group) !== pendingGroupKey
        )
        .map((group) => cardGroupSortableId(cardGroupKey(group)))
    : []

  const cardList =
    mode === "grouped" ? (
      <nav
        ref={cardGridRef}
        className="mt-4 flex flex-col gap-6"
        aria-label="我的名片清单"
        onPointerDown={marquee.onPointerDown}
      >
        <SortableContext
          items={groupSortableIds}
          strategy={verticalListSortingStrategy}
        >
          {groupedGroups.map((group) => {
            const key = cardGroupKey(group)
            const named = group.title !== null
            // 这一组就是「点了新建分组、标题还没填」的那个：组头是空输入框（自动聚焦），
            // 下面的放置区已经是合法落点。
            const pending = pendingGroupKey === key
            // 多选拖动中整批名片已经离开每一张列表（`draggedCardIds`），落点由 ghost 占位。
            const visibleCards = group.cards.filter(
              (card) => !drag.draggedCardIds.has(card.id)
            )
            const ghost = renderDropGhost(key)
            return (
              <Fragment key={key}>
                <CardGroupSection
                  group={group}
                  // 计数就是这一刻真的渲染出来的瓦片数（拖动中批次已整体移出）。
                  tileCount={visibleCards.length}
                  // 落点 ghost 也和真实瓦片一样撑起放置区，所以有它时不该再出空分组提示。
                  ghostCount={ghost?.cells ?? 0}
                  collapsed={collapsedKeys.has(key)}
                  onToggleCollapsed={() => toggleGroup(key)}
                  editing={layoutEditing}
                  pendingTitle={pending}
                  onDiscardPendingTitle={
                    pending ? () => settlePendingGroup("") : undefined
                  }
                  onPendingTitleBlur={
                    pending ? handlePendingTitleBlur : undefined
                  }
                  onRename={
                    named
                      ? (title) => {
                          if (pending) settlePendingGroup(title)
                          else draft.renameCardGroup(key, title)
                        }
                      : undefined
                  }
                  onRemove={
                    // 删组不是破坏性操作：组内名片退回默认分组，且只是草稿，没保存就还在。
                    // 待命名分组不给删除入口（它还没定名字，回车/失焦/Esc 就是「放弃」）。
                    named && !pending
                      ? () => draft.removeCardGroup(key)
                      : undefined
                  }
                  onCreateGroup={
                    pending ? undefined : () => startPendingGroup(key)
                  }
                  createGroupDisabledReason={createGroupDisabledReason}
                >
                  {renderGroupTiles(visibleCards, ghost)}
                </CardGroupSection>
              </Fragment>
            )
          })}
        </SortableContext>
      </nav>
    ) : (
      <nav
        ref={cardGridRef}
        className={cn("mt-4", cardTileGridClassName)}
        aria-label="我的名片清单"
        onPointerDown={marquee.onPointerDown}
      >
        {classicCards.map(renderTile)}
      </nav>
    )

  /** 编辑模式下才需要 dnd 上下文（落点、Overlay、读屏播报都在里面）。 */
  /**
   * 滚动容器由页面提供（`scrollContainerRef`）：iOS/Android 在触摸手势里会**限流
   * document 的滚动**（实测 246 帧只前进 69px），内层 `overflow-y: auto` 容器不受限。
   * 容器必须包住**标题行 + 控件 + 清单**，否则标题会被挤出滚动区、看起来像整块吸顶。
   */
  const dndList = editing ? (
    <DndContext {...drag.dnd}>
      {cardList}
      <DragOverlay>
        {drag.activeCards.length ? (
          <CardDragLayer cards={drag.activeCards} />
        ) : null}
      </DragOverlay>
    </DndContext>
  ) : (
    cardList
  )

  return (
    <section
      ref={sectionRef}
      aria-labelledby="owned-card-list-title"
      // 指针落在管理器里（点卡片、拖卡片、点放置区）时先记一笔：待命名分组的空标题失焦要
      // 靠它区分「还在继续操作」与「真的离开了这一块」。
      onPointerDownCapture={() => {
        pointerInsideRef.current = true
      }}
      onPointerUpCapture={() => {
        pointerInsideRef.current = false
      }}
      onPointerCancelCapture={() => {
        pointerInsideRef.current = false
      }}
    >
      {/*
        保存结果的常驻播报区（§11）：`toast` 只能被看得见的人看见，读屏要靠这里。拖拽移动的
        播报由 dnd-kit 自己的 live region 负责，它随编辑模式一起卸载，撑不起保存结果。
        区域常驻（内容随状态变化）才会被稳定播报，所以不按 `save.status` 收放。

        `role="status"` 自带 `aria-live="polite"` + `aria-atomic`，所以**不写**这两个属性：
        base-ui 的 `markOthers` 会把带 `aria-live` 的元素**连同它的整条祖先链**排除在
        `aria-hidden` 之外，写上去会让弹窗打开时被隐藏的元素从「一个共同的祖先」变成
        「逐个兄弟节点」——真实读屏看到的结果一样，但会让别处「祖先被隐藏、子元素仍按名字
        匹配」的用例读到空名字（`account-me-workspace.test.tsx` 就是这么挂的）。
      */}
      <p
        role="status"
        data-testid="card-manager-save-status"
        className="sr-only"
      >
        {save.status}
      </p>
      {/* 标题行：**不吸顶**。移动端把「分组/经典」toggle 放在这一行（桌面在控件区左侧）。 */}
      <div
        data-testid="card-manager-title-row"
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
        <div className="min-w-0">
          <h2 id="owned-card-list-title" className="text-base font-medium">
            我的名片
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} 张名片
          </p>
        </div>
        {!desktop && cards.length && !draft.editing ? (
          <CardManagerModeToggle mode={mode} onModeChange={changeMode} />
        ) : null}
      </div>

      {cards.length ? (
        /*
          工具栏 + 批量区整块吸顶（标题行不吸顶）：往下滚时动作按钮与选择集始终在手边。
          偏移沿用账号页既有约定——网页端是吸顶的站点页头（`h-16`），App 端是它自己的
          标题栏内边距（`--app-header-inset`）。`z-30` 压在页头（`z-40`）之下。
        */
        <div
          data-testid="card-manager-controls"
          className={cn(
            "sticky z-30 mt-3 bg-background py-2",
            IS_APP_TARGET ? "top-0" : "top-16"
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-2",
              desktop && !draft.editing ? "justify-between" : "justify-end"
            )}
          >
            {desktop && !draft.editing ? (
              <CardManagerModeToggle mode={mode} onModeChange={changeMode} />
            ) : null}
            <CardManagerToolbar
              readOnly={readOnly}
              onCreate={onCreate}
              editing={draft.editing}
              onStartEditing={startEditing}
              onExitEditing={exitEditing}
              selectedCount={draft.selectedCards.length}
              selectableCount={draft.selectableCount}
              onSelectAll={draft.selectAll}
              onClearSelection={draft.clearSelection}
              onSave={save.save}
              saving={save.saving}
              canSave={draft.hasChanges && !save.saving}
              editDisabledReason={editDisabledReason}
              editButtonRef={editButtonRef}
              shareHandle={shareHandle}
              quickCount={draft.quickCardNumbers.length}
            />
          </div>

          {draft.editing ? (
            <CardBulkActions
              selectedCount={draft.selectedCards.length}
              quickCount={draft.quickCardNumbers.length}
              limit={draft.limit}
              skippedGroupCardCount={draft.selectedGroupCardCount}
              collapsible={!desktop}
              collapsed={!bulkExpanded}
              onToggleCollapsed={() => setBulkExpanded((current) => !current)}
              onSetVisibility={(visible) =>
                draft.applyCardSettings(draft.selectedCardIds, { visible })
              }
              onSetExchangeMode={(exchangeMode) =>
                draft.applyCardSettings(draft.selectedCardIds, { exchangeMode })
              }
              onQuickAdd={addSelectedToQuickList}
              onQuickRemove={draft.removeSelectionFromQuickList}
            />
          ) : null}
        </div>
      ) : (
        <div
          data-testid="card-manager-controls"
          className="mt-3 flex justify-end"
        >
          <Button
            type="button"
            size="sm"
            disabled={readOnly}
            onClick={onCreate}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建名片
          </Button>
        </div>
      )}

      {/*
        鼠标框选（§8）的矩形：固定定位（视口坐标，与瓦片矩形同一坐标系），
        `pointer-events-none` 不抢指针，`aria-hidden` 对读屏没有意义。
      */}
      {marquee.rect ? (
        <div
          data-testid="card-marquee"
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-sm border border-primary/60 bg-primary/10"
          style={{
            left: marquee.rect.left,
            top: marquee.rect.top,
            width: marquee.rect.width,
            height: marquee.rect.height,
          }}
        />
      ) : null}

      {/*
        控件区与列表之间那个全宽虚线的「新建分组」照旧保留：它按**原先的行为**插在默认分组
        之后（待命名的分组区域落在默认分组下方）。与每个分组底部的入口共用同一条规则——
        同一时刻只有一个待命名分组，所以它自己也按老样子在待命名时收起。
      */}
      {layoutEditing && pendingGroupKey === null ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full border-dashed"
          disabled={!canAddGroup}
          title={createGroupDisabledReason ?? undefined}
          onClick={() => startPendingGroup(DEFAULT_CARD_GROUP_KEY)}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          新建分组
        </Button>
      ) : null}

      {cards.length ? (
        // 只读模式不挂 `DndContext`：没有拖拽可做，页面结构也就和改造前逐字一致
        // （dnd-kit 的钩子在context 之外是安全的空实现，见 `SortableCardTile`）。
        dndList
      ) : (
        <Empty className="mt-4 min-h-44 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileImageIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有交换名片</EmptyTitle>
            <EmptyDescription>
              {readOnly
                ? "名片创建开放后，可以在这里建立双面名片。"
                : "建立第一张双面名片，保存后会先进入草稿状态。"}
            </EmptyDescription>
          </EmptyHeader>
          {!readOnly ? (
            <Button type="button" variant="outline" onClick={onCreate}>
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              新建名片
            </Button>
          ) : null}
        </Empty>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的改动？</AlertDialogTitle>
            <AlertDialogDescription>
              退出编辑模式后，本次的分组、顺序、批量改动与快速清单调整都会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => {
                endEditingSession(layout)
                setConfirmDiscard(false)
              }}
            >
              放弃改动
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmQuickJoin} onOpenChange={setConfirmQuickJoin}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>先改成自动确认？</AlertDialogTitle>
            <AlertDialogDescription>
              {`已选名片中有 ${draft.quickJoinNeedsAutoCount} 张不是自动交换，加入快速交换清单前会把它们改为自动确认。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmAddToQuickList}>
              确认加入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {save.overLimit ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) save.dismissOverLimit()
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {`快速交换最多 ${save.overLimit.limit} 张`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {`当前 ${save.overLimit.count} 张，请先移出一些名片再保存。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction type="button" onClick={save.dismissOverLimit}>
                返回调整
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
