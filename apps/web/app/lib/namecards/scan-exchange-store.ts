/**
 * 扫码交换离线队列的 IndexedDB 持久层。
 *
 * 只做「一行记录怎么落盘」这一件事：读写失败一律静默降级（返回空 / false），
 * 队列语义（状态迁移、重放）在 `scan-exchange-queue` 里。
 *
 * 记录里带着一次性令牌与幂等锚点 `clientExchangeId`，所以库与 store 名固定，
 * 换名等于丢掉用户本地的待重放交换。
 */

const DATABASE_NAME = "imsweb.namecard-scan-queue"
const DATABASE_VERSION = 1

/** 与任务约定一致：store 名固定为 `scan-exchanges`。 */
const STORE_NAME = "scan-exchanges"

export type ScanExchangeQueueStatus = "pending" | "failed" | "expired"

export interface ScanExchangeQueueEntry {
  /** 本地记录 ID（队列自身的键，不是交换 ID）。 */
  id: string
  /** 二维码里的令牌；重放沿用，后端按一次性规则消费。 */
  token: string
  /** 入队时生成、重放沿用的幂等锚点。 */
  clientExchangeId: string
  /** 我这次交出的名片编号。 */
  giveCardNumbers: number[]
  createdAt: string
  /** 会话到期时间；扫码端拿不到时为 null。 */
  expiresAt: string | null
  status: ScanExchangeQueueStatus
  error: string | null
  attempts: number
  lastAttemptAt: string | null
}

/**
 * 队列的持久化接口。生产实现是 IndexedDB；单元测试用内存实现替换，
 * jsdom 没有 `indexedDB`，所以这层必须是唯一碰浏览器存储的地方。
 */
export interface ScanExchangeStore {
  readAll: () => Promise<ScanExchangeQueueEntry[]>
  read: (id: string) => Promise<ScanExchangeQueueEntry | null>
  /** `false` 表示没有落盘（无 IndexedDB / 事务失败）。 */
  write: (entry: ScanExchangeQueueEntry) => Promise<boolean>
  /** `false` 表示没删成（同样是存储不可用）。 */
  remove: (id: string) => Promise<boolean>
}

let databasePromise: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  if (databasePromise) return databasePromise
  const { promise, resolve } = Promise.withResolvers<IDBDatabase | null>()
  databasePromise = promise
  let request: IDBOpenDBRequest
  try {
    request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  } catch {
    // 隐私模式 / 存储被禁用：直接停在降级态，调用方拿到空队列。
    resolve(null)
    return promise
  }
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => resolve(null)
  request.onblocked = () => resolve(null)
  databasePromise = promise
  return databasePromise
}

function isQueueStatus(value: unknown): value is ScanExchangeQueueStatus {
  return value === "pending" || value === "failed" || value === "expired"
}

/**
 * 从 IndexedDB 里读回来的值不可信（旧版本留下的行、外部改动），
 * 形状不对就整行丢掉，不让一条坏记录拖垮重放。
 */
function toEntry(value: unknown): ScanExchangeQueueEntry | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const giveCardNumbers = record.giveCardNumbers
  if (typeof record.id !== "string" || !record.id) return null
  if (typeof record.token !== "string" || !record.token) return null
  if (typeof record.clientExchangeId !== "string" || !record.clientExchangeId)
    return null
  if (!Array.isArray(giveCardNumbers)) return null
  if (!giveCardNumbers.every((item) => typeof item === "number")) return null
  if (typeof record.createdAt !== "string" || !record.createdAt) return null
  if (record.expiresAt !== null && typeof record.expiresAt !== "string")
    return null
  if (!isQueueStatus(record.status)) return null
  if (record.error !== null && typeof record.error !== "string") return null
  if (typeof record.attempts !== "number") return null
  if (record.lastAttemptAt !== null && typeof record.lastAttemptAt !== "string")
    return null
  return {
    id: record.id,
    token: record.token,
    clientExchangeId: record.clientExchangeId,
    giveCardNumbers: [...giveCardNumbers],
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    status: record.status,
    error: record.error,
    attempts: record.attempts,
    lastAttemptAt: record.lastAttemptAt,
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  const { promise, resolve } = Promise.withResolvers<T | null>()
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => resolve(null)
  return promise
}

async function readAll(): Promise<ScanExchangeQueueEntry[]> {
  const database = await openDatabase()
  if (!database) return []
  let request: IDBRequest<unknown[]>
  try {
    request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll()
  } catch {
    return []
  }
  const rows = await requestResult(request)
  if (!rows) return []
  return rows
    .map(toEntry)
    .filter((entry): entry is ScanExchangeQueueEntry => entry !== null)
}

async function read(id: string): Promise<ScanExchangeQueueEntry | null> {
  const database = await openDatabase()
  if (!database) return null
  let request: IDBRequest<unknown>
  try {
    request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(id)
  } catch {
    return null
  }
  return toEntry(await requestResult(request))
}

/** 写入并等事务落定；`false` 代表没写成（调用方据此提示「没存下来」）。 */
async function write(entry: ScanExchangeQueueEntry): Promise<boolean> {
  const database = await openDatabase()
  if (!database) return false
  const { promise, resolve } = Promise.withResolvers<boolean>()
  let transaction: IDBTransaction
  try {
    transaction = database.transaction(STORE_NAME, "readwrite")
  } catch {
    return false
  }
  transaction.oncomplete = () => resolve(true)
  transaction.onerror = () => resolve(false)
  transaction.onabort = () => resolve(false)
  try {
    transaction.objectStore(STORE_NAME).put(entry)
  } catch {
    resolve(false)
  }
  return promise
}

async function remove(id: string): Promise<boolean> {
  const database = await openDatabase()
  if (!database) return false
  const { promise, resolve } = Promise.withResolvers<boolean>()
  let transaction: IDBTransaction
  try {
    transaction = database.transaction(STORE_NAME, "readwrite")
  } catch {
    return false
  }
  transaction.oncomplete = () => resolve(true)
  transaction.onerror = () => resolve(false)
  transaction.onabort = () => resolve(false)
  try {
    transaction.objectStore(STORE_NAME).delete(id)
  } catch {
    resolve(false)
  }
  return promise
}

/** 默认（也是唯一的生产）实现：没有 IndexedDB 时全部降级为空操作。 */
export const scanExchangeStore: ScanExchangeStore = {
  readAll,
  read,
  write,
  remove,
}
