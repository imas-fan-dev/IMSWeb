import {
  commitCardShare,
  commitQuickExchange,
  commitScanSession,
  isApiError,
} from "~/lib/api"
import { createRandomId } from "~/lib/random-id"

import { notifyNamecardDataChanged } from "./data-refresh"
import {
  scanExchangeStore,
  type ScanExchangeQueueEntry,
  type ScanExchangeQueueStatus,
  type ScanExchangeQueueTarget,
} from "./scan-exchange-store"

export type {
  ScanExchangeQueueEntry,
  ScanExchangeQueueStatus,
  ScanExchangeQueueTarget,
}

/** 入队后展示的那句话：面板与离线提示共用。 */
export const SCAN_EXCHANGE_QUEUED_MESSAGE = "已保存到本地，联网后自动重试"

/** 没拿到后端文案时的兜底（网络断在写请求上）。 */
const QUEUE_FAILED_MESSAGE = "网络请求失败"

export interface ScanExchangeQueueInput {
  /** 重放目标：一次性令牌 / 单卡分享 / 快速清单。 */
  target: ScanExchangeQueueTarget
  /** 入队这一轮的幂等锚点，重放沿用。 */
  clientExchangeId: string
  giveCardNumbers: readonly number[]
  /** 扫码端通常拿不到会话到期时间，留空即可。 */
  expiresAt?: string | null
}

export interface ScanExchangeStatusPatch {
  status: ScanExchangeQueueStatus
  error?: string | null
  attempts?: number
  lastAttemptAt?: string | null
}

/**
 * 一次失败的处置：
 * - `retry`：断网 / 超时 / 5xx / 打不通，值得稍后原样重放；
 * - `expired`：业务 4xx（二维码已被消费或过期），再试多少次都是这句；
 * - `auth`：未登录或权限不足，先留着，等用户登录后再重放。
 */
export type ScanExchangeFailureDisposition = "retry" | "expired" | "auth"

export function classifyScanExchangeFailure(
  failure: unknown
): ScanExchangeFailureDisposition {
  // 非 `ApiError` 说明请求在客户端就断了（或响应不可解析），
  // 但幂等锚点让重放安全，宁可按网络类处理也不丢这次交换。
  if (!isApiError(failure)) return "retry"
  const status = failure.status ?? 0
  if (failure.kind === "network" || failure.kind === "aborted") return "retry"
  if (status === 401 || status === 403) return "auth"
  if (status >= 500) return "retry"
  if (status >= 400) return "expired"
  // 解析 / 契约类异常：请求发出去了但结果不可信，留给重放。
  return "retry"
}

/** 扫码面板只在这类失败上入队；取消与业务错误都不入队。 */
export function isRetryableScanExchangeFailure(failure: unknown): boolean {
  return classifyScanExchangeFailure(failure) === "retry"
}

function failureMessage(failure: unknown): string {
  if (isApiError(failure)) return failure.message
  if (failure instanceof Error && failure.message) return failure.message
  return QUEUE_FAILED_MESSAGE
}

/** 落盘并返回入队行；存储不可用时返回 null（调用方据此走失败态）。 */
async function enqueue(
  input: ScanExchangeQueueInput
): Promise<ScanExchangeQueueEntry | null> {
  const entry: ScanExchangeQueueEntry = {
    id: createRandomId(),
    token: input.target.kind === "token" ? input.target.token : "",
    target: input.target,
    clientExchangeId: input.clientExchangeId,
    giveCardNumbers: [...input.giveCardNumbers],
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    status: "pending",
    error: null,
    attempts: 0,
    lastAttemptAt: null,
  }
  const stored = await scanExchangeStore.write(entry)
  return stored ? entry : null
}

/** 本机全部待重放记录，按入队时间倒序。 */
async function list(): Promise<ScanExchangeQueueEntry[]> {
  const entries = await scanExchangeStore.readAll()
  return entries.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  )
}

async function remove(id: string): Promise<void> {
  await scanExchangeStore.remove(id)
}

async function markStatus(
  id: string,
  patch: ScanExchangeStatusPatch
): Promise<void> {
  const entry = await scanExchangeStore.read(id)
  if (!entry) return
  await scanExchangeStore.write({
    ...entry,
    status: patch.status,
    error: patch.error === undefined ? entry.error : patch.error,
    attempts: patch.attempts ?? entry.attempts,
    lastAttemptAt:
      patch.lastAttemptAt === undefined
        ? entry.lastAttemptAt
        : patch.lastAttemptAt,
  })
}

/** 正在重放的记录：同一个 `id` 不会同时发两次请求。 */
const entriesInFlight = new Set<string>()

let replayAllInFlight: Promise<void> | null = null

async function recordFailure(
  entry: ScanExchangeQueueEntry,
  failure: unknown
): Promise<void> {
  const disposition = classifyScanExchangeFailure(failure)
  // 未登录不是这条交换的错：保持原状，登录后（下一次启动 / online）再试。
  if (disposition === "auth") return
  const lastAttemptAt = new Date().toISOString()
  if (disposition === "expired") {
    await markStatus(entry.id, {
      status: "expired",
      error: failureMessage(failure),
      lastAttemptAt,
    })
    return
  }
  await markStatus(entry.id, {
    status: "failed",
    error: failureMessage(failure),
    attempts: entry.attempts + 1,
    lastAttemptAt,
  })
}

/**
 * 重放一条记录：成功即删除并广播数据变更；失败按处置结果落状态。
 *
 * `clientExchangeId` 与二维码令牌都沿用入队时那份，所以同一轮重放多少次
 * 都只会产生一笔交换。
 */
async function replay(id: string): Promise<void> {
  if (entriesInFlight.has(id)) return
  entriesInFlight.add(id)
  try {
    const entry = await scanExchangeStore.read(id)
    if (!entry || entry.status === "expired") return
    try {
      const input = {
        clientExchangeId: entry.clientExchangeId,
        giveCardNumbers: entry.giveCardNumbers,
      }
      const target = entry.target
      await (target.kind === "token"
        ? commitScanSession(target.token, input)
        : target.kind === "card-share"
          ? commitCardShare(target.slug, input)
          : commitQuickExchange(target.handle, input))
      await remove(id)
      notifyNamecardDataChanged()
    } catch (failure) {
      await recordFailure(entry, failure)
    }
  } finally {
    entriesInFlight.delete(id)
  }
}

/**
 * 依次重放 pending / failed 记录。
 *
 * 并发调用共享同一个 promise（不会重复提交）；离线时直接跳过，
 * 留给 `online` 事件或用户手点重试。
 */
async function replayAll(): Promise<void> {
  if (replayAllInFlight) return replayAllInFlight
  if (typeof navigator !== "undefined" && navigator.onLine === false) return
  const run = (async () => {
    const entries = await list()
    for (const entry of entries) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break
      if (entry.status !== "pending" && entry.status !== "failed") continue
      await replay(entry.id)
    }
  })()
  replayAllInFlight = run.finally(() => {
    replayAllInFlight = null
  })
  return replayAllInFlight
}

/** 队列的对外接口；存储不可用时全部静默降级。 */
export const scanExchangeQueue = {
  enqueue,
  list,
  remove,
  markStatus,
  replay,
  replayAll,
}

let replayInstalled = false

function installOnlineReplay(): void {
  if (typeof window === "undefined" || replayInstalled) return
  replayInstalled = true
  window.addEventListener("online", () => {
    void replayAll()
  })
}

/**
 * 安装 `online` 监听并立刻重放一次。
 *
 * App 启动（`entry.client`）调一次；监听只装一份，重复调用只多跑一次重放。
 */
export function startScanExchangeReplay(): void {
  installOnlineReplay()
  void replayAll()
}

// 模块安装即挂上 `online` 监听：从任意入口引入队列都能拿到断网恢复后的自动重放。
installOnlineReplay()
