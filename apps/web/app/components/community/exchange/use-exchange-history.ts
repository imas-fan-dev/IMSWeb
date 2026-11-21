import { useCallback, useEffect, useRef, useState } from "react"

import type { NamecardExchangeHistoryEntry } from "~/lib/api"
import { getExchangeHistory } from "~/lib/api"
import { NAMECARD_DATA_CHANGED_EVENT } from "~/lib/namecards/data-refresh"
import {
  scanExchangeQueue,
  type ScanExchangeQueueEntry,
} from "~/lib/namecards/scan-exchange-queue"

/** 服务端一页 10 条：面板不高，翻页比滚动更接近通知列表的手感。 */
export const EXCHANGE_HISTORY_PAGE_SIZE = 10

export interface ExchangeHistoryState {
  /** 服务端记录（当前页，时间倒序）。 */
  server: NamecardExchangeHistoryEntry[]
  /** 本机待重放 / 已失效的扫码交换（时间倒序，固定置顶）。 */
  local: ScanExchangeQueueEntry[]
  page: number
  totalPage: number
  loading: boolean
  failed: boolean
  setPage: (page: number) => void
  reload: () => void
  /** 单项重放；完成后刷新服务端与本机两份数据。 */
  retryLocal: (id: string) => Promise<void>
  removeLocal: (id: string) => Promise<void>
}

/**
 * 交换记录面板的数据：服务端分页 + 本机队列合并。
 *
 * 分页只翻服务端；本机条目始终在顶部（它们是最新的失败/待重放），
 * 翻页不改变它们的数量。成功重放会广播 `NAMECARD_DATA_CHANGED_EVENT`，
 * 面板跟着重取，不需要重放方知道谁在看。
 */
export function useExchangeHistory(): ExchangeHistoryState {
  const [page, setPage] = useState(1)
  const [server, setServer] = useState<NamecardExchangeHistoryEntry[]>([])
  const [local, setLocal] = useState<ScanExchangeQueueEntry[]>([])
  const [totalPage, setTotalPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const generation = useRef(0)

  /** 查询指纹：翻页或手动重整时在渲染期清掉上一页，别在 effect 里同步 setState。 */
  const queryKey = `${reload}|${page}`
  const [loadedKey, setLoadedKey] = useState(queryKey)
  if (loadedKey !== queryKey) {
    setLoadedKey(queryKey)
    setLoading(true)
    setFailed(false)
    setServer([])
  }

  // 本机队列与分页无关：打开与重整时各读一次，重放成功另有广播兜底。
  useEffect(() => {
    let cancelled = false
    void scanExchangeQueue.list().then((entries) => {
      if (!cancelled) setLocal(entries)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    const current = ++generation.current
    getExchangeHistory({ page, size: EXCHANGE_HISTORY_PAGE_SIZE })
      .send()
      .then((payload) => {
        if (generation.current !== current) return
        setServer(
          [...payload.list].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          )
        )
        setTotalPage(Math.max(1, payload.totalPage))
        setLoading(false)
      })
      .catch(() => {
        if (generation.current !== current) return
        setServer([])
        setTotalPage(1)
        setFailed(true)
        setLoading(false)
      })
    return () => {
      generation.current += 1
    }
  }, [page, reload])

  // 队列在别处重放成功时（online 事件 / App 启动）也要换成最新的两份数据。
  useEffect(() => {
    const handleDataChanged = () => setReload((current) => current + 1)
    window.addEventListener(NAMECARD_DATA_CHANGED_EVENT, handleDataChanged)
    return () =>
      window.removeEventListener(NAMECARD_DATA_CHANGED_EVENT, handleDataChanged)
  }, [])

  const retryLocal = useCallback(async (id: string) => {
    await scanExchangeQueue.replay(id)
    // 成功会广播事件；失败也要刷新，把累加后的 `attempts` / 错误文案画出来。
    setReload((current) => current + 1)
  }, [])

  const removeLocal = useCallback(async (id: string) => {
    await scanExchangeQueue.remove(id)
    setLocal(await scanExchangeQueue.list())
  }, [])

  return {
    server,
    local,
    page,
    totalPage,
    loading,
    failed,
    setPage,
    reload: () => setReload((current) => current + 1),
    retryLocal,
    removeLocal,
  }
}
