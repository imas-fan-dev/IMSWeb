import { useDroppable } from "@dnd-kit/core"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import {
  cardGroupDropId,
  cardGroupHeading,
  cardGroupKey,
  cardGroupSortableId,
  cardGroupViewTransitionName,
  DEFAULT_CARD_GROUP_LABEL,
  type CardGroupView,
} from "../card-manager-model"
import { cardTileGridClassName } from "../card-tile"
import { CardGroupTitleInput } from "./card-group-title-input"

/**
 * 一个分组：组头 + 放置区（瓦片网格）。
 *
 * 有标题的分组：组头始终渲染（折叠后也保留），右侧的折叠按钮在非编辑模式也可用。
 * 默认分组（`title === null`）**不渲染组头**——没有标题可显示，折叠与计数也就没有落点，
 * 只给 section 一个无障碍名称（组内瓦片靠自身网格排列）。瓦片由调用方传入。
 *
 * 编辑模式（§7.2/§7.3）：
 * - 组头多一个拖动把手（只拖分组本身，不拖卡片）与重命名输入框、删除按钮；
 * - 放置区注册成 dnd-kit 的 droppable，卡片拖到空处即落到该分组末尾；
 * - 放置区还挂 `data-card-group-key={key}`：落点判定按指针几何实测 DOM（`useCardManagerDrag`
 *   的 `readDropPointerGroups`），靠它把放置区与分组键对起来（折叠时整块不渲染，因此
 *   折叠的分组天然没有落点）；
 * - **折叠的分组不接受落点**：收起时整块放置区不渲染，也就没有可命中的落点
 *   （比「落点自动展开」更好测，也不会让用户误以为卡片进了别处）；
 * - 组内一张卡都没有时给一块虚线提示区，否则空的放置区量不出尺寸、拖不进去。
 *   空判定用调用方传的 `tileCount`（当前渲染出来的瓦片数）与 `ghostCount`（拖动中的落点
 *   ghost 占的格子数）：编辑模式里 `children` 外面永远裹着一层 `SortableContext`，
 *   `Children.count(children)` 恒为 1，数它等于永不渲染落点。
 */
export function CardGroupSection({
  group,
  tileCount,
  ghostCount = 0,
  collapsed,
  onToggleCollapsed,
  children,
  editing = false,
  onRename,
  onRemove,
  onCreateGroup,
  createGroupDisabledReason,
  pendingTitle = false,
  onDiscardPendingTitle,
  onPendingTitleBlur,
}: {
  group: CardGroupView
  /**
   * 该组当前有几张瓦片。空分组要它有 0 才知道该把虚线落点提示画出来——
   * 见文件头的说明。
   */
  tileCount: number
  /**
   * 落点 ghost 占的格子数（拖动中才有）：它和真实瓦片一样能撑起放置区，
   * 所以有它的时候即使瓦片数是 0 也不该画空分组提示（那会平白多出一块）。
   */
  ghostCount?: number
  /** 默认分组忽略它：没有组头就没有折叠控件。 */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** 放置区里的瓦片；折叠时整块不渲染。 */
  children: ReactNode
  /** 编辑模式：渲染拖动把手、重命名输入框与删除按钮，并把放置区注册成落点。 */
  editing?: boolean
  /** 重命名提交（标题已去首尾空白、1–40 字）。 */
  onRename?: (title: string) => void
  /** 删除分组（组内卡片退回默认分组）。 */
  onRemove?: () => void
  /**
   * 编辑模式：该分组**底部**那个全宽虚线的「新建分组」入口（含默认分组）。点它会在本组
   * 下方插出一个待命名的分组区域并聚焦标题输入框（§7.2）。
   */
  onCreateGroup?: () => void
  /** 不能新建分组时给出的原因（达到上限）；有值时按钮禁用并把原因挂在 `title` 上。 */
  createGroupDisabledReason?: string | null
  /**
   * **待命名分组**（§7.2「一步新建」）：区域已经真的存在，但标题还没填。组头就是那个**空**的
   * 标题输入框（placeholder「输入分组名称」、自动聚焦），提交前不做任何事；提交空标题或 `Esc`
   * 由调用方丢弃这一组。
   */
  pendingTitle?: boolean
  /** 待命名分组的空标题提交（回车）/ `Esc`：调用方丢弃这一组（卡片退回默认分组）。 */
  onDiscardPendingTitle?: () => void
  /**
   * 待命名分组**空标题失焦**：把「焦点去了哪儿」交给调用方，由它判断是不是真的离开了这块区域
   * （点卡片/拖卡片都会先失焦，那时不该把这一组丢掉）。
   */
  onPendingTitleBlur?: (relatedTarget: EventTarget | null) => void
}) {
  const key = cardGroupKey(group)
  const cardsId = `card-group-cards-${key}`
  const heading = cardGroupHeading(group)
  const label = heading ?? DEFAULT_CARD_GROUP_LABEL
  const dropId = cardGroupDropId(key)

  // 钩子无条件调用：不在编辑模式时两个都禁用，读屏与测试里不会多出可拖拽节点。
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    disabled: !editing,
  })
  // 默认分组永远第一、不可拖动，所以它只当放置区，不参与分组排序；待命名分组还没定下名字，
  // 也不给拖动把手（它随时可能被整组丢掉）。
  const canSortGroup = editing && heading !== null && !pendingTitle
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardGroupSortableId(key),
    disabled: !canSortGroup,
  })

  const dropAreaClassName = cn(
    cardTileGridClassName,
    editing &&
      isOver &&
      "rounded-lg outline-2 outline-offset-4 outline-primary/60"
  )
  const emptyHint =
    editing && tileCount + ghostCount === 0 ? (
      <p className="col-span-full flex min-h-20 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground/80">
        把名片拖到这里
      </p>
    ) : null
  /**
   * 组底的「新建分组」（§7.2）：全宽虚线，点它在这一组下方插出待命名的分组区域。
   * 每个分组（含默认分组）各有一个，靠 `aria-label` 带上组名才分得清。
   */
  const createGroupButton =
    editing && onCreateGroup ? (
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full border-dashed"
        disabled={Boolean(createGroupDisabledReason)}
        title={createGroupDisabledReason ?? undefined}
        aria-label={`在「${label}」下方新建分组`}
        onClick={onCreateGroup}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        新建分组
      </Button>
    ) : null

  if (heading === null) {
    return (
      <section aria-label={label} data-testid="card-group" className="min-w-0">
        <div
          id={cardsId}
          ref={setDropRef}
          data-card-group-key={key}
          className={dropAreaClassName}
        >
          {emptyHint}
          {children}
        </div>
        {createGroupButton}
      </section>
    )
  }

  const headingId = `card-group-heading-${key}`

  return (
    <section
      ref={setSortRef}
      // 编辑模式下组头是输入框（没有 `h3` 可指），区域名称改用 `aria-label`，
      // 否则 `aria-labelledby` 会指向一个不存在的节点、整块分组失去无障碍名称。
      aria-labelledby={editing ? undefined : headingId}
      aria-label={editing ? label : undefined}
      data-testid="card-group"
      className={cn("min-w-0", isDragging && "opacity-50")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        className="flex min-w-0 items-center gap-2 border-b pb-2"
        style={{ viewTransitionName: cardGroupViewTransitionName(group) }}
      >
        {canSortGroup ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            // `attributes`/`listeners` 只挂在把手上：卡片拖动、点击瓦片都不受影响。
            {...attributes}
            {...listeners}
            aria-label={`拖动排序：${label}`}
            className="-ml-1.5 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editing && onRename ? (
            <CardGroupTitleInput
              key={key}
              label={pendingTitle ? "新分组名称" : "分组名称"}
              placeholder={pendingTitle ? "输入分组名称" : undefined}
              value={pendingTitle ? "" : label}
              autoFocus={pendingTitle}
              onSubmit={onRename}
              onCancel={pendingTitle ? onDiscardPendingTitle : undefined}
              onEmptyBlur={pendingTitle ? onPendingTitleBlur : undefined}
            />
          ) : (
            <h3 id={headingId} className="truncate text-sm font-medium">
              {label}
            </h3>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">
            {`${tileCount} 张`}
          </span>
        </div>
        {editing && onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`删除分组：${label}`}
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : cardsId}
          aria-label={`${collapsed ? "展开" : "折叠"}${label}`}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" />
          ) : (
            <ChevronDownIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      {collapsed ? null : (
        <div
          id={cardsId}
          ref={setDropRef}
          data-card-group-key={key}
          className={cn("mt-3", dropAreaClassName)}
        >
          {emptyHint}
          {children}
        </div>
      )}
      {createGroupButton}
    </section>
  )
}
