import { Badge } from "~/components/ui/badge"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  published: {
    label: "已通过",
    className: "border-success/40 bg-success/10 text-success",
  },
  // The admin list still speaks the legacy vocabulary, where a published card
  // is reported as `approved`; both values mean the same thing here.
  approved: {
    label: "已通过",
    className: "border-success/40 bg-success/10 text-success",
  },
  pending: {
    label: "待审核",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  approving: {
    label: "待审核",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  rejected: {
    label: "已驳回",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  withdrawn: {
    label: "已撤回",
    className: "border-border bg-muted text-muted-foreground",
  },
  draft: {
    label: "未提交",
    className: "border-border bg-muted text-muted-foreground",
  },
  locked: {
    label: "已锁定",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  hidden: {
    label: "已隐藏",
    className: "border-border bg-muted text-muted-foreground",
  },
}

const REVIEW_STYLES: Record<string, { label: string; className: string }> = {
  pending: {
    label: "复审中",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  rejected: {
    label: "复审驳回",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  locked: {
    label: "复审违规",
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
