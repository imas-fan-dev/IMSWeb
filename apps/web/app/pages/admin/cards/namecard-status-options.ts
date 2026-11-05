/**
 * 名片状态的统一词汇表。
 *
 * 筛选下拉（审核页、管理页）与状态选择（管理窗）用的是同一组值，只差两处：
 * 筛选需要一个「全部状态」占位，管理窗的「已隐藏」要说明它是用户自己删掉的形态。
 * 两份都从这里取，改文案时只改一处。
 */
export const NAMECARD_STATUS_FILTERS = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "published", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "已锁定" },
  { value: "hidden", label: "已隐藏" },
] as const

export const NAMECARD_STATUS_OPTIONS = [
  { value: "pending", label: "待审核" },
  { value: "published", label: "已通过" },
  // 拥有者自己删除的形态，不是管理员的处置结果。
  { value: "hidden", label: "已隐藏（用户删除态）" },
  { value: "rejected", label: "已驳回" },
  { value: "locked", label: "已锁定" },
] as const
