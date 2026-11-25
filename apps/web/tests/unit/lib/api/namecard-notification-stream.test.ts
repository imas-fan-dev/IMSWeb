import { afterEach, expect, it, vi } from "vitest"

import {
  receiveInboxChanges,
  receiveScanChanges,
} from "~/lib/api/namecard-notification-stream"

const { session } = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock("~/lib/api/endpoints/platform", () => ({
  getPlatformSession: () => ({ send: session, abort: async () => {} }),
}))

afterEach(() => {
  session.mockReset()
  vi.unstubAllGlobals()
})

it("reads split frames without treating heartbeat comments as inbox changes", async () => {
  const fetchMock = vi.fn(async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of [
          ": heart",
          "beat\n\nevent: inbox.",
          "changed\ndata: {}\n",
          "\nevent: other\ndata: {}\n\n",
        ]) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    })
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  const changed = vi.fn()
  await receiveInboxChanges("alice", new AbortController().signal, changed)
  expect(changed).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/community/exchange/me/notifications/stream",
    expect.objectContaining({
      credentials: "same-origin",
      headers: { Accept: "text/event-stream" },
    })
  )
})

it("opens the scan session stream and ignores inbox events and heartbeats", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        ": heartbeat\r\n\r\nevent: inbox.changed\r\ndata: {}\r\n\r\nevent: scan.changed\r\ndata: {}\r\n\r\n",
        { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }
      )
  )
  vi.stubGlobal("fetch", fetchMock)
  const changed = vi.fn()
  const token = "a".repeat(64)
  await receiveScanChanges(token, new AbortController().signal, changed)
  expect(changed).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/community/exchange/scan/sessions/${token}/stream`,
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" })
  )
})

it("leaves the REST fallback in charge when the stream returns 503", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 503 }))
  vi.stubGlobal("fetch", fetchMock)
  const changed = vi.fn()
  await receiveInboxChanges("alice", new AbortController().signal, changed)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(changed).not.toHaveBeenCalled()
  expect(session).not.toHaveBeenCalled()
})

it("probes the existing platform session once on 401 and does not endlessly replay", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
  vi.stubGlobal("fetch", fetchMock)
  session.mockResolvedValue({ account: { id: "alice" } })
  const changed = vi.fn()
  await receiveInboxChanges("alice", new AbortController().signal, changed)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(session).toHaveBeenCalledTimes(1)
  expect(changed).not.toHaveBeenCalled()
  session.mockResolvedValue({ account: { id: "bob" } })
  await receiveInboxChanges("alice", new AbortController().signal, changed)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
