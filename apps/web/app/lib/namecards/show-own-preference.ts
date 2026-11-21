/**
 * 【显示我的名片】的账号级记忆。
 *
 * 只记住这一个开关；【显示隐藏名片】每次进入都回到关闭。键按账号隔离，
 * 换账号后读到的自然是该账号自己的值。
 */

const SHOW_OWN_KEY_PREFIX = "imsweb.namecard-album.show-own."

/** SSR / 预渲染环境没有 `localStorage`，所有读写都必须先过这一关。 */
function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function showOwnStorageKey(accountId: string): string {
  return `${SHOW_OWN_KEY_PREFIX}${accountId}`
}

/** 没有存储或没有账号时默认关闭。 */
export function readShowOwn(accountId: string | null): boolean {
  if (!accountId) return false
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(showOwnStorageKey(accountId)) === "true"
  } catch {
    return false
  }
}

export function writeShowOwn(accountId: string | null, value: boolean) {
  if (!accountId) return
  const store = storage()
  if (!store) return
  try {
    store.setItem(showOwnStorageKey(accountId), value ? "true" : "false")
  } catch {
    // 存储被禁用（隐私模式 / 配额）时静默失效，开关本身仍然可用。
  }
}
