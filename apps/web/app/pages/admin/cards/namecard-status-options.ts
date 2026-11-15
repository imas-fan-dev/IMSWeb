import {
  NAMECARD_ADMIN_STATUS_LABELS,
} from "~/components/community/namecard-status-labels"

/**
 * 名片状态的统一词汇表。
 *
 * 筛选下拉（审核页、管理页）与状态选择（管理窗）用的是同一组值，只差两处：
 * 筛选需要一个「全部状态」占位，管理窗的「已隐藏」要说明它是用户自己删掉的形态。
 * 文案本身取自 `namecard-status-labels`，这里只保留下拉的取值与顺序。
 */
export const NAMECARD_STATUS_FILTERS = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: NAMECARD_ADMIN_STATUS_LABELS.pending },
  { value: "published", label: NAMECARD_ADMIN_STATUS_LABELS.published },
  { value: "rejected", label: NAMECARD_ADMIN_STATUS_LABELS.rejected },
  { value: "locked", label: NAMECARD_ADMIN_STATUS_LABELS.locked },
  { value: "hidden", label: NAMECARD_ADMIN_STATUS_LABELS.hidden },
] as const

export const NAMECARD_STATUS_OPTIONS = [
  { value: "pending", label: NAMECARD_ADMIN_STATUS_LABELS.pending },
  { value: "published", label: NAMECARD_ADMIN_STATUS_LABELS.published },
  // 拥有者自己删除的形态，不是管理员的处置结果。
  { value: "hidden", label: "已隐藏（用户删除态）" },
  { value: "rejected", label: NAMECARD_ADMIN_STATUS_LABELS.rejected },
  { value: "locked", label: NAMECARD_ADMIN_STATUS_LABELS.locked },
] as const
