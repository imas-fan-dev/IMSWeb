import { useCallback, useEffect, useState } from "react"

/**
 * 折叠状态是纯展示偏好：按账号隔离存在本地，换账号不会互相影响，也不需要为它
 * 加一条后端记录。读写失败（隐私模式、配额）一律降级为「都展开」。
 */
const STORAGE_KEY_PREFIX = "imsweb:namecard-groups-collapsed:v1"

/** 未登录时也要有个稳定作用域，避免折叠状态落到另一个账号的键上。 */
const ANONYMOUS_SCOPE = "anonymous"

export function collapsedGroupsStorageKey(accountId: string | null): string {
  return `${STORAGE_KEY_PREFIX}:${accountId ?? ANONYMOUS_SCOPE}`
}

function readCollapsedKeys(accountId: string | null): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(
      collapsedGroupsStorageKey(accountId)
    )
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((key): key is string => typeof key === "string")
    )
  } catch {
    return new Set()
  }
}

/** 只在真的变了才写回：挂载时把读到的东西原样再写一遍没有意义，还会覆盖别人写进同一键的值。 */
function writeCollapsedKeysIfChanged(
  accountId: string | null,
  keys: ReadonlySet<string>
): void {
  if (typeof window === "undefined") return
  const next = JSON.stringify([...keys])
  try {
    const storageKey = collapsedGroupsStorageKey(accountId)
    if (window.localStorage.getItem(storageKey) === next) return
    window.localStorage.setItem(storageKey, next)
  } catch {
    // 存不下就只保留内存状态；折叠是实现细节，不值得打断用户。
  }
}

/**
 * 当前账号下已折叠的分组键。
 *
 * 只在挂载时读一次本地存储：换账号由上层用账号作用域做 `key` 的 remount 负责
 * （`AccountMeWorkspace` 就是这样挂载 `ProfileWorkspace` 的），所以这里不必监听
 * `accountId` 变化去重读——那反而会把上一个账号的折叠态写进新账号的键。
 */
export function useCollapsedCardGroups(accountId: string | null): {
  collapsedKeys: ReadonlySet<string>
  toggleCollapsed: (key: string) => void
  /**
   * 只保留给定的分组键：不在集合里的折叠态一律忘记（结果相同时保持原引用）。
   * 编辑会话里的本地键（`local:N`）每会话都从 1 重号，调用方在会话边界上收窄一次，
   * 上一会话留下的折叠态就不会串到这一会话新建的分组上。
   */
  pruneCollapsedKeys: (keys: Iterable<string>) => void
} {
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() =>
    readCollapsedKeys(accountId)
  )

  useEffect(() => {
    writeCollapsedKeysIfChanged(accountId, collapsedKeys)
  }, [accountId, collapsedKeys])

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const pruneCollapsedKeys = useCallback((keys: Iterable<string>) => {
    const allowed = new Set(keys)
    setCollapsedKeys((current) => {
      const next = new Set([...current].filter((key) => allowed.has(key)))
      // 全都还在（子集）就没变：不换引用，也就不触发一次无意义的写回。
      return next.size === current.size ? current : next
    })
  }, [])

  return { collapsedKeys, toggleCollapsed, pruneCollapsedKeys }
}
