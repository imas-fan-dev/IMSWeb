import type { NamecardCardShare } from "~/lib/api"

/**
 * 分享页的状态区文案（prd R1/R2 原文，不做演绎）。
 *
 * 页面组件只读这里返回的 `message` 与 `action`，所以四种状态 × 登录与否 × 已拥有的
 * 组合都能脱离 DOM 断言；【交换】按钮的文案固定 disabled（本期不开放交换）。
 */

/** 单卡分享的接口状态；非法 / 不存在的 slug 由接口直接回 404。 */
export type CardShareState = NamecardCardShare["state"]

/** 状态文案后面的入口。 */
export interface ShareStatusAction {
  kind: "login" | "manage"
  label: string
}

export interface ShareStatus {
  /** 状态区的一行文案。 */
  message: string
  action: ShareStatusAction | null
}

/** 【交换】按钮的文案：按钮永远渲染，本期固定 disabled。 */
export const SHARE_EXCHANGE_SOON = "交换功能即将开放"

/** 分享按钮上方的文案：`向你分享了 X 张名片`（X = 这次分享里可预览的名片张数）。 */
export function shareCountDescription(count: number): string {
  return `向你分享了 ${count} 张名片`
}

/** 单卡分享 404（不存在 / 未认领 / 下架）时页面整页渲染的文案。 */
export const CARD_SHARE_UNAVAILABLE_MESSAGE = "这张名片当前不开放交换"

/** 快速清单分享 404（找不到这位制作人）时页面整页渲染的文案。 */
export const QUICK_SHARE_MISSING_MESSAGE = "找不到这位制作人"

const LOGIN_REQUIRED_MESSAGE = "登录后才能交换"
const LOGIN_ACTION: ShareStatusAction = { kind: "login", label: "去登录" }
const MANAGE_ACTION: ShareStatusAction = { kind: "manage", label: "去名片管理" }

/** 单卡分享：接口状态优先，`available` 再按登录 / 是否已拥有分叉。 */
export function cardShareStatus({
  state,
  loggedIn,
  collected,
}: {
  state: CardShareState
  loggedIn: boolean
  /** 浏览者名片册里是否已经有这张卡（接口的逐卡 `collected`）。 */
  collected: boolean
}): ShareStatus {
  if (state === "own-card") {
    return { message: "这是你自己的名片", action: MANAGE_ACTION }
  }
  if (state === "not-accepting") {
    return { message: "这张名片不接受交换", action: null }
  }
  if (!loggedIn) {
    return { message: LOGIN_REQUIRED_MESSAGE, action: LOGIN_ACTION }
  }
  if (collected) {
    return { message: "你已经拥有这张名片", action: null }
  }
  return { message: SHARE_EXCHANGE_SOON, action: null }
}

/**
 * 快速清单分享：**只有全部已拥有**才换文案；部分已拥有照旧（已拥有的卡在预览里带角标，
 * 交换落地时跳过它们）。
 */
export function quickShareStatus({
  loggedIn,
  allCollected,
}: {
  loggedIn: boolean
  allCollected: boolean
}): ShareStatus {
  if (allCollected) {
    return { message: "你已经拥有这些名片", action: null }
  }
  if (!loggedIn) {
    return { message: LOGIN_REQUIRED_MESSAGE, action: LOGIN_ACTION }
  }
  return { message: SHARE_EXCHANGE_SOON, action: null }
}
