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

const FALLBACK_STYLE = "border-border bg-muted text-muted-foreground"

/** 把后台名片状态渲染成中文标签，用颜色区分「通过 / 待审核 / 驳回」。 */
export function NamecardStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status]
  return (
    <Badge variant="outline" className={style?.className ?? FALLBACK_STYLE}>
      {style?.label ?? status}
    </Badge>
  )
}

/**
 * 名片拥有者看到的是另一套说法：审核通过叫「已公开」，被驳回叫「未通过」，
 * 已发布但新版本在复核时提示「更新审核中」。
 */
const OWNER_STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  published: { label: "已公开", className: "border-success/40 bg-success/10 text-success" },
  approved: { label: "已公开", className: "border-success/40 bg-success/10 text-success" },
  pending: { label: "审核中", className: "border-warning/40 bg-warning/10 text-warning" },
  approving: { label: "审核中", className: "border-warning/40 bg-warning/10 text-warning" },
  rejected: {
    label: "未通过",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  locked: {
    label: "已锁定",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  withdrawn: { label: "已撤回", className: "border-border bg-muted text-muted-foreground" },
  draft: { label: "未提交", className: "border-border bg-muted text-muted-foreground" },
  hidden: { label: "已隐藏", className: "border-border bg-muted text-muted-foreground" },
}

export function NamecardOwnerStatusBadge({
  status,
  reviewing = false,
}: {
  status: string
  /** 已公开的名片提交了新版本、正在复核。 */
  reviewing?: boolean
}) {
  const style = OWNER_STATUS_STYLES[status]
  const active = reviewing && (status === "published" || status === "approved")
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "border-warning/40 bg-warning/10 text-warning"
          : (style?.className ?? FALLBACK_STYLE)
      }
    >
      {active ? "更新审核中" : (style?.label ?? status)}
    </Badge>
  )
}
