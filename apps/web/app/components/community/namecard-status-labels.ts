import type {
  NamecardLifecycleStatus,
  NamecardReviewStatus,
} from "@imsweb/contracts/namecards"

/**
 * 名片状态词表的唯一来源。
 *
 * 后台和属主看的是同一批状态值，但读者不同：后台按审核处置结果措辞
 * （待审核 / 已通过），属主按自己的名片现在是什么样措辞（审核中 / 已公开）。
 * 两套措辞都留在这里，别处只引用，改文案时只改一处。
 */
export const NAMECARD_ADMIN_STATUS_LABELS: Record<
  NamecardLifecycleStatus | "approved",
  string
> = {
  draft: "未提交",
  pending: "待审核",
  approving: "待审核",
  published: "已通过",
  // 后台列表还在用历史口径的 `approved`，与 `published` 同义。
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
  locked: "已锁定",
  hidden: "已隐藏",
}

/** 属主口径：说清这张名片对外的公开状态。 */
export const NAMECARD_OWNER_STATUS_LABELS: Record<
  NamecardLifecycleStatus,
  string
> = {
  draft: "草稿",
  pending: "审核中",
  approving: "发布处理中",
  published: "已公开",
  hidden: "已隐藏",
  rejected: "已驳回",
  withdrawn: "已撤回",
  locked: "已锁定",
}

/** 已发布名片的待审版本复核结果。 */
export const NAMECARD_REVIEW_LABELS: Record<NamecardReviewStatus, string> = {
  pending: "复审中",
  rejected: "复审驳回",
  locked: "复审违规",
}
