import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react"

import { useMediaQuery } from "~/lib/use-media-query"
import {
  CARD_FLIP_INVERT_TRANSITION,
  cardFlipOffsetFromComputedStyle,
  cardFlipOffsetFromStyle,
  cardFlipTransform,
  cardFlipTransition,
  exceedsCardFlipOffsetLimit,
  flipOffsets,
  isCardFlipTransition,
  isNegligibleCardFlipOffset,
  type CardFlipOffset,
  type CardFlipRect,
} from "../card-grid-animation"
import { REDUCED_MOTION_QUERY } from "../card-manager-model"

/** 能位移的瓦片：`SortableCardTile` 的外层节点，`data-card-id` 是 FLIP 的身份。 */
const CARD_TILE_SELECTOR = '[data-testid="sortable-card-tile"][data-card-id]'

/**
 * 账本上的一笔：倒放用的位移量，加上**我们写进 `style.transform` 的那串原文**。
 *
 * 收尾判断「DOM 上这串还是不是我们写的」以**原文**为准，不反解——旧版反解在指数写法上判不
 * 出来，于是把账本丢掉、位移永久残留在瓦片上（见 `isOurAppliedFlip`）；`offset` 是同一笔位
 * 移的数值形态，用来认「同一笔、另一种写法」。
 */
type AppliedCardFlip = {
  offset: CardFlipOffset
  /** 原文；`""` 表示这一笔写的是「没有 transform」（近零位移的瞬时释放，见下面的每帧流程）。 */
  css: string
}

/**
 * DOM 上这串值还是不是我们写下去的那一笔。
 *
 * 先逐字比原文：正常情况下浏览器回读的就是我们写下的那串。但极小分量的**指数写法**
 * （`translate(235px, 9.04e-05px)`）逐字比不成——旧版就是这样把自己的值判成别人的、
 * 丢掉账本、把位移永久留在瓦片上（2026-11-17 用户反馈）。所以再给一层宽容：只要是**普通
 * `translate(xpx, ypx)`**（`cardFlipOffsetFromStyle` 认这个格式；dnd-kit 的 `translate3d`、
 * 反解出的 `matrix` 一律不认），且分量取整后与我们写下的同一笔位移相同，就算我们的。
 * 别的写法一律不认、也不动。
 */
function isOurAppliedFlip(
  transform: string,
  applied: AppliedCardFlip
): boolean {
  if (transform === applied.css) return true
  const parsed = cardFlipOffsetFromStyle(transform)
  if (!parsed) return false
  return cardFlipTransform(parsed) === cardFlipTransform(applied.offset)
}

/** 一次量测：相对容器的自然位置、每个瓦片此刻的位移，加上容器尺寸（幅值保护的参照）。 */
type GridMeasurement = {
  /** **自然位置**：`rect` 减掉瓦片此刻渲染用的位移，再换成相对容器坐标。 */
  rects: Map<string, CardFlipRect>
  /**
   * 瓦片**此刻渲染用的**位移（过渡走到一半时就是插值中的那一个）。写回倒放偏移时要加回去，
   * 否则布局挪走之后，倒放会把瓦片从它渲染的地方弹回上一个自然位置（见 `measureTiles`）。
   */
  visuals: Map<string, CardFlipOffset>
  rootWidth: number
  rootHeight: number
}

/**
 * 量这一刻的**自然位置**（不含任何变换、且以容器为原点），并记下每个瓦片**此刻渲染用的**位移。
 *
 * 1. **减掉位移，且读计算样式**：rAF 一到手就把内联 `transform` 摘掉、只留一条 180ms 的过渡，
 *    那之后 `cardFlipOffsetFromStyle`（读内联样式）会得到 `null`，而 `rect` 是**过渡半路**的
 *    渲染位置；把半路的位置当成自然位置写进基线，逐帧累加下去瓦片就越动越远、飞出网格
 *    （2026-11-17 用户反馈）。**插值中**的位移只有计算样式里有，所以这里读它——代价是每个瓦片
 *    每次提交一次 `getComputedStyle`；`appliedRef` 的账本因此只负责收尾清理。
 * 2. **视口坐标换成相对容器**：`getBoundingClientRect()` 是视口坐标，拖动靠近边缘时的自动
 *    滚动（或用户滚轮）会让整屏瓦片一起「位移」一整个滚动量 → 整列乱飞。减去容器原点、
 *    再加上容器自身的 `scrollLeft/scrollTop`，滚动就不再是布局变化。
 *
 * `width`/`height` 为 0 的瓦片（折叠、隐藏、还没布局）量不到有效盒子，直接跳过：既不写
 * 位移也不进基线，免得拿一个 0×0 的盒子算出假的自然位置。
 */
function measureTiles(root: HTMLElement): GridMeasurement {
  const rootRect = root.getBoundingClientRect()
  const scrollLeft = root.scrollLeft
  const scrollTop = root.scrollTop
  const rects = new Map<string, CardFlipRect>()
  const visuals = new Map<string, CardFlipOffset>()
  for (const tile of root.querySelectorAll<HTMLElement>(CARD_TILE_SELECTOR)) {
    const cardId = tile.dataset.cardId
    if (!cardId) continue
    const rect = tile.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    const visual = cardFlipOffsetFromComputedStyle(
      window.getComputedStyle(tile).transform
    )
    visuals.set(cardId, visual)
    rects.set(cardId, {
      left: rect.left - rootRect.left + scrollLeft - visual.dx,
      top: rect.top - rootRect.top + scrollTop - visual.dy,
      width: rect.width,
      height: rect.height,
    })
  }
  return {
    rects,
    visuals,
    rootWidth: rootRect.width,
    rootHeight: rootRect.height,
  }
}

/**
 * 多选拖动（批次 ≥ 2）时，落点 ghost 是那一刻**唯一**的位移来源：整批名片已经从列表里
 * 移出去（`draggedCardIds`），落点位置由一个真的 ghost 占住，`SortableContext` 的排序位移
 * 因此被关掉（`card-manager.tsx` 的 `NO_SHIFT_SORTING_STRATEGY`）。代价是 ghost 移动/展开
 * 时被顶开的瓦片会「直接插过去」，没有任何过渡——单张拖动有 dnd-kit 的位移，批量于是看起来
 * 比单张还生硬（用户 2026-11-17 反馈）。
 *
 * 这里补一段手写 FLIP，四条防线（前两条是修 2026-11-17「瓦片乱飞、松手还不归位」的两条
 * 成因，第三、四条是加固）：
 *
 * 1. **位移只认「此刻渲染用的那一个」**：自然位置 = `rect` 减掉**计算样式**里的平移量，写回
 *    倒放偏移时再把同一个量加回去。过渡途中内联 `transform` 已经摘掉、DOM 上只剩插值，反解
 *    内联样式会把「半路的渲染位置」当成自然位置；而只按自然位置倒放，会把过渡中的瓦片从它
 *    渲染的地方弹回上一个自然位置（最多一格）。`measureTiles` 的注释里有完整成因。
 * 2. **相对容器坐标**：`getBoundingClientRect()` 是视口坐标，不补偿滚动的话，拖动靠近边缘
 *    的自动滚动/滚轮会让每个瓦片都算出一份滚动量的位移 → 整列乱飞。
 * 3. **异常帧加固**：0 尺寸的瓦片跳过；一批里只要有一张位移超过容器两倍宽/高
 *    （`exceedsCardFlipOffsetLimit`），这一帧整批不写、改当新基线，宁可不动也不飞出容器。
 * 4. **写下的值取整、近零的干脆不写**：极小分量会被 CSSOM 序列化成指数写法
 *    （`9.04e-05`），旧版照原样拼字符串写下去，收尾时反解判不出来 → 账本被丢掉 → 位移永久
 *    残留在瓦片上（用户现场同一网格里另一张瓦片还留着 `235px`，于是压住了隔壁那张＝
 *    「ghost 叠在未选瓦片之上/之下」）。现在 `cardFlipTransform` 取整、
 *    `isNegligibleCardFlipOffset` 直接把近零位移挡在门外。
 *
 * 每帧流程：
 *
 * 1. 每次提交都量一遍（`active` 期间），量的是**自然位置**（减掉渲染用的位移、换成相对容器
 *    坐标）与那一份位移本身；
 * 2. 与上一次提交比出每个瓦片的位移量、再加上它此刻渲染用的位移；近零的跳过，其余的先设
 *    `transform: translate(dx, dy)`（`transition: none` 确保「倒着放」这一步不生动画）、
 *    把**我们写下的那串值**记进账本，下一帧再切到 `transform: none` + 我们的 `transition`；
 * 3. 收尾以账本上的原文为准：DOM 上那串还是我们写的形态才还原（判不出来就不动它，但账要划
 *    掉——那不是我们的残留；判得出就一定先还原再划账）；
 * 4. `active` 变假（落位/取消/整批不再拖动）或组件卸载时把写过的东西都还回去，不留内联残渣。
 *
 * 为什么是「每次提交」而不是「落点 ghost 的签名变了」：ghost 变位置只是布局变化的一种，
 * 整批移出列表、ghost 消失那一刻同样会顶开瓦片；守住「会话边界」（`active` 的上升沿建立
 * 基线、下降沿清理）比逐个签名去追更不容易漏，也不会把别的重排误判成拖拽动画。
 *
 * 单张拖动（批次 = 1）**不**进来：那一套位移与 `transition` 由 dnd-kit 的
 * `rectSortingStrategy` 写在同一批 DOM 上（`translate3d`），两套动画叠加必然打架，
 * 而单张的观感上一轮已经认可。
 */
export function useCardGridFlip({
  rootRef,
  enabled,
  active,
}: {
  /** 瓦片网格的容器（分组模式/经典模式的清单 `<nav>`）。 */
  rootRef: RefObject<HTMLElement | null>
  /** 只有编辑模式（拖拽可能发生）才量布局；只读模式一次也不量。 */
  enabled: boolean
  /** 多选拖动（批次 ≥ 2）进行中：会话边界就是它的上升沿与下降沿。 */
  active: boolean
}) {
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  /** 上一次提交量到的自然位置（会话开始时重建）。 */
  const rectsRef = useRef<Map<string, CardFlipRect> | null>(null)
  /**
   * 我们自己写下去、还没放回去的位移（瓦片 → 那一笔的位移量与原文）。**只用来收尾清理**
   * （任务结束/卸载时把我们写的内联样式还回去）：量自然位置走的是计算样式，过渡途中只有它
   * 才有插值。
   */
  const appliedRef = useRef<Map<HTMLElement, AppliedCardFlip>>(new Map())
  const frameRef = useRef<number | null>(null)
  const activeRef = useRef(false)

  /**
   * 还掉我们写过的内联样式。两种都按「是不是我们写的」判定再清：
   * 落位那一刻 React 会把 dnd-kit 自己的 `translate3d` / `transform 200ms ease` 写回同一个
   * 元素（那是它的收尾动画），照单全清会把那段动画掐掉、瓦片直接跳过去。
   */
  const releaseApplied = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    for (const [tile, applied] of appliedRef.current) {
      if (isOurAppliedFlip(tile.style.transform, applied)) {
        tile.style.removeProperty("transform")
      }
      if (isCardFlipTransition(tile.style.transition)) {
        tile.style.removeProperty("transition")
      }
    }
    appliedRef.current.clear()
  }, [])

  useLayoutEffect(() => {
    const previousActive = activeRef.current
    activeRef.current = active
    const root = rootRef.current

    if (!enabled || reduceMotion) {
      releaseApplied()
      rectsRef.current = null
      return
    }
    if (!active) {
      // 会话结束（落位、取消、或本来就没在拖）：清掉这一趟留下的内联位移。
      releaseApplied()
      return
    }
    if (!root) return

    const measured = measureTiles(root)
    const previous = rectsRef.current
    rectsRef.current = measured.rects
    // 会话的第一帧只建立基线：这一刻的重排（整批移出列表）不是「插入」，不动画。
    if (!previousActive || !previous) return

    const offsets = flipOffsets(previous, measured.rects)
    if (offsets.size === 0) return

    // 过渡还没走完的瓦片要钉在**它此刻渲染的位置**上：布局已经挪开，而它身上是插值中的那份
    // 位移，只按自然位置倒放（`flipOffsets`）等于把它从渲染处弹回上一个自然位置、正好丢掉
    // 插值量（最多一格）。加回同一份量，倒放的位置就还是它这一刻渲染的地方，动画从那儿接着走。
    for (const [cardId, offset] of offsets) {
      const visual = measured.visuals.get(cardId)
      if (!visual) continue
      offsets.set(cardId, {
        dx: offset.dx + visual.dx,
        dy: offset.dy + visual.dy,
      })
    }

    // 幅值保护：一张瓦片要挪出两倍容器尺寸，几乎一定是量错了（滚动没补偿净、过渡半路、
    // 布局抖动）。整批跳过——但这帧已经在上面更新过基线，所以它会成为新基线，下一次
    // 提交就是拿它比，不会一直撞上限、把动画彻底卡死。
    if (
      exceedsCardFlipOffsetLimit(
        offsets,
        measured.rootWidth,
        measured.rootHeight
      )
    ) {
      return
    }

    // 上一帧的回调还没跑就又来了一次提交：先撤掉它，这一帧结束时会**统一**把
    // `appliedRef` 里所有还停在倒放态的瓦片放回去——只处理本次的 `offsets` 会让上一次
    // 那批瓦片卡在位移上（有 transform、没过渡）。
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    const applied = appliedRef.current
    let wrote = false
    for (const tile of root.querySelectorAll<HTMLElement>(CARD_TILE_SELECTOR)) {
      const offset = offsets.get(tile.dataset.cardId ?? "")
      if (!offset) continue

      // 近零位移（量测噪声、过渡半路的浮点尾巴）不写、不记账：这一格本来就该待在自然位置，
      // 写下去只会在瓦片上留一串谁也认不出的内联样式（用户现场那 4 张残余就是这样来的）。
      if (isNegligibleCardFlipOffset(offset)) {
        const previousApplied = applied.get(tile)
        // 没写过、或写过的那笔已被别人接管（dnd-kit 的 `translate3d`）：什么都不碰。
        if (
          !previousApplied ||
          !isOurAppliedFlip(tile.style.transform, previousApplied)
        ) {
          if (previousApplied) applied.delete(tile)
          continue
        }
        // 写过一笔倒放态，而这笔量现在≈0 =「它一直在它该在的地方」：**瞬时**还回去。
        // 带上过渡会先把它画在倒放的位置、再滑回自然位置——一次平白无故的回弹；它其实一动
        // 没动（布局绕了一圈又回到原处），这一笔本来就是不该写的。
        tile.style.transition = CARD_FLIP_INVERT_TRANSITION
        tile.style.removeProperty("transform")
        // 原文记成空：过渡的收尾（换成我们的那条）交给下一帧的回调，与写位移那条路同一个。
        applied.set(tile, { offset, css: "" })
        wrote = true
        continue
      }

      tile.style.transition = CARD_FLIP_INVERT_TRANSITION
      const css = cardFlipTransform(offset)
      tile.style.transform = css
      // 记**回读**到的原文：逐字比的就是它（浏览器可能把写法改写掉）。
      applied.set(tile, { offset, css: tile.style.transform || css })
      wrote = true
    }

    // 这一帧一张都没写、账本也是空的：没什么可收尾的。反之（例如整批都成了近零位移、或本次
    // 位移的瓦片都已不在 DOM 上）仍要排一次收尾——刚撤掉的上一帧回调没人接手的话，那些瓦片
    // 会一直卡在倒放态上。
    if (!wrote && applied.size === 0) return

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      // 账本与 DOM 必须同步：放回去的、以及已被别的写入（例如落位时 dnd-kit 写回的
      // `translate3d`）接管的，都要从账上划掉；反过来说，**只要那串值还是我们写下的形态，
      // 就必须先还原再划账**——判不出来还照样划账，位移就永久留在瓦片上了。
      for (const [tile, previousApplied] of applied) {
        // 已经落位（或已被别的写入接管）的瓦片不动：只放回还停在倒放态的那批。
        if (isOurAppliedFlip(tile.style.transform, previousApplied)) {
          tile.style.transition = cardFlipTransition()
          tile.style.removeProperty("transform")
        }
        applied.delete(tile)
      }
    })
  })

  // 卸载（拖拽中退出编辑模式、切到经典模式、路由跳走）也要还回去：那时不会再有下一次
  // 提交了，不清就会把内联位移残留在 DOM 上。
  useEffect(() => {
    return () => releaseApplied()
  }, [releaseApplied])
}
