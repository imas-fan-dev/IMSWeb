import type { AdminOfficeReview } from "~/lib/api"

export const reviewStateLabels = {
  pending: "待审核",
  published: "已发布",
  rejected: "已拒绝",
}
export function officeOwnerLabel(item: AdminOfficeReview) {
  return (
    item.owner.email?.trim() || item.owner.displayName?.trim() || "用户信息缺失"
  )
}
export function officeReviewerLabel(item: AdminOfficeReview) {
  return item.reviewer
    ? item.reviewer.username?.trim() ||
        item.reviewer.displayName?.trim() ||
        "审核人员信息缺失"
    : "尚未审核"
}
export function userManagementHref(id: string) {
  return `/admin/platform/users?${new URLSearchParams({ field: "id", query: id, highlight: id })}`
}
