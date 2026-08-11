const STORAGE_KEY = "imsweb:namecard-submissions:v1"
const STORAGE_VERSION = 1

export type NamecardSubmissionReceipt = {
  id: number
  token: string
}

type StoredReceipts = {
  version: typeof STORAGE_VERSION
  submissions: NamecardSubmissionReceipt[]
}

function readReceipts(): StoredReceipts {
  if (typeof window === "undefined") {
    return { version: STORAGE_VERSION, submissions: [] }
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null"
    )
    if (
      parsed?.version !== STORAGE_VERSION ||
      !Array.isArray(parsed.submissions)
    ) {
      return { version: STORAGE_VERSION, submissions: [] }
    }

    return {
      version: STORAGE_VERSION,
      submissions: parsed.submissions.filter(
        (receipt: unknown): receipt is NamecardSubmissionReceipt =>
          typeof receipt === "object" &&
          receipt !== null &&
          "id" in receipt &&
          "token" in receipt &&
          Number.isInteger(receipt.id) &&
          Number(receipt.id) > 0 &&
          typeof receipt.token === "string" &&
          receipt.token.length >= 32
      ),
    }
  } catch {
    return { version: STORAGE_VERSION, submissions: [] }
  }
}

export function saveNamecardSubmissionReceipt(
  receipt: NamecardSubmissionReceipt
) {
  if (typeof window === "undefined") return
  const current = readReceipts().submissions.filter(
    (item) => item.id !== receipt.id
  )
  const next: StoredReceipts = {
    version: STORAGE_VERSION,
    submissions: [receipt, ...current].slice(0, 50),
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The one-time receipt remains visible so the user can still copy it.
  }
}

export function getNamecardSubmissionReceipt(id: number) {
  return readReceipts().submissions.find((receipt) => receipt.id === id) ?? null
}

export function namecardSubmissionManagePath(id: number, token?: string) {
  const path = `/community/cards/submissions/${id}`
  return token ? `${path}#token=${encodeURIComponent(token)}` : path
}
