import type { ReactNode } from "react"

/**
 * 每个编辑模块都能单独控制「仅显示 / 编辑 / 不可见」。
 * `view` 用 fieldset 的原生 disabled 一次性冻结整块控件，
 * `contents` 让它不干扰外层 grid / flex 布局。
 */
export type CardModuleMode = "view" | "edit" | "hidden"

export type CardModuleKey =
  | "header"
  | "notices"
  | "media"
  | "identity"
  | "series"
  | "characters"
  | "bio"
  | "exchangeNote"
  | "exchangeMode"
  | "flags"
  | "visibility"
  | "credits"
  | "actions"

export type CardModuleModes = Partial<Record<CardModuleKey, CardModuleMode>>

export function CardModule({
  mode = "edit",
  children,
}: {
  mode?: CardModuleMode
  children: ReactNode
}) {
  if (mode === "hidden") return null
  if (mode === "view") {
    return (
      <fieldset disabled className="contents">
        {children}
      </fieldset>
    )
  }
  return <>{children}</>
}
