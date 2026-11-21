import { refreshNamecardUnread } from "~/lib/use-namecard-unread"

/**
 * 名片册 / 交换历史发生变化时广播的窗口事件。
 *
 * 扫码交换由对方提交，出示方这边没有任何本地写请求，所以只能在轮询到
 * `committed` 时主动通知已挂载的列表重新取数；通知方与监听方都不需要
 * 知道对方是谁，页面自己决定要不要刷新。
 */
export const NAMECARD_DATA_CHANGED_EVENT = "ims:namecard-data-changed"

/**
 * 一次交换落定后调用：广播数据变更，并顺手刷新未读数（收下的名片通常会
 * 附带一条通知）。没有 `window` 的预渲染环境里静默跳过。
 */
export function notifyNamecardDataChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(NAMECARD_DATA_CHANGED_EVENT))
  void refreshNamecardUnread()
}
