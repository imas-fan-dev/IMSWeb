import { Badge } from "~/components/ui/badge"
import {
  NAMECARD_ADMIN_STATUS_LABELS,
  NAMECARD_REVIEW_LABELS,
} from "./namecard-status-labels"

// 配色留在本地，文案取自 `namecard-status-labels`。
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  published: {
    label: NAMECARD_ADMIN_STATUS_LABELS.published,
    className: "border-success/40 bg-success/10 text-success",
  },
  // The admin list still speaks the legacy vocabulary, where a published card
  // is reported as `approved`; both values mean the same thing here.
  approved: {
    label: NAMECARD_ADMIN_STATUS_LABELS.approved,
    className: "border-success/40 bg-success/10 text-success",
  },
  pending: {
    label: NAMECARD_ADMIN_STATUS_LABELS.pending,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  approving: {
    label: NAMECARD_ADMIN_STATUS_LABELS.approving,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  rejected: {
    label: NAMECARD_ADMIN_STATUS_LABELS.rejected,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  withdrawn: {
    label: NAMECARD_ADMIN_STATUS_LABELS.withdrawn,
    className: "border-border bg-muted text-muted-foreground",
  },
  draft: {
    label: NAMECARD_ADMIN_STATUS_LABELS.draft,
    className: "border-border bg-muted text-muted-foreground",
  },
  locked: {
    label: NAMECARD_ADMIN_STATUS_LABELS.locked,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  hidden: {
    label: NAMECARD_ADMIN_STATUS_LABELS.hidden,
    className: "border-border bg-muted text-muted-foreground",
  },
}

const REVIEW_STYLES: Record<string, { label: string; className: string }> = {
  pending: {
    label: NAMECARD_REVIEW_LABELS.pending,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  rejected: {
    label: NAMECARD_REVIEW_LABELS.rejected,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  locked: {
    label: NAMECARD_REVIEW_LABELS.locked,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

const FALLBACK_STYLE = "border-border bg-muted text-muted-foreground"

/** 把后台名片状态渲染成中文标签，用颜色区分「通过 / 待审核 / 驳回」。 */
export function NamecardStatusBadge({
  status,
  reviewStatus,
}: {
  status: string
  reviewStatus?: string | null
}) {
  // A published card keeps its public copy while a revision is decided, so the
  // revision outcome has to win over the card-level label.
  const review = reviewStatus ? REVIEW_STYLES[reviewStatus] : undefined
  const reviewed = status === "published" || status === "approved"
  const style = reviewed && review ? review : STATUS_STYLES[status]
  return (
    <Badge variant="outline" className={style?.className ?? FALLBACK_STYLE}>
      {style?.label ?? status}
    </Badge>
  )
}
