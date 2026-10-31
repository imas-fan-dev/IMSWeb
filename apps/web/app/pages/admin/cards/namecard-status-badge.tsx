import { Badge } from "~/components/ui/badge"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  published: {
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
