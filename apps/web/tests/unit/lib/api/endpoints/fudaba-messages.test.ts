import { waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { installFetchMock } from "@/tests/unit/support/api-client"
import type { FudabaMessage } from "~/lib/api"
import { getFudabaPrivateMessage } from "~/lib/api/endpoints/fudaba/messages"

const note: FudabaMessage = {
  id: "note",
  office: {
    id: "office",
    slug: "office",
    name: "事务所",
    status: "active",
    isOpen: true,
  },
  authorAccountId: "author",
  authorName: "作者",
  content: "原文",
  color: "rose",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  contentRevision: 0,
  moderationRevision: 0,
  hiddenByOffice: false,
  hiddenByAdmin: false,
  placement: {
    pinnedAt: "2026-10-13T00:00:00.000Z",
    x: 800,
    y: 450,
    rotation: 0,
    zIndex: 1,
    revision: 0,
    updatedAt: "2026-10-13T00:00:00.000Z",
  },
  capabilities: {
    canEdit: true,
    canMove: true,
    canDestroy: true,
    canModerateOffice: false,
    canModerateAdmin: false,
  },
}

describe("private message request cancellation", () => {
  it("keeps a reopened reader request alive when the previous reader aborts", async () => {
    const requests: {
      resolve: (response: Response) => void
      signal: AbortSignal | null | undefined
    }[] = []
    installFetchMock(
      (input, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal =
            init?.signal ??
            (input instanceof Request ? input.signal : undefined)
          requests.push({ resolve, signal })
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        })
    )
    const previousReader = getFudabaPrivateMessage(note.id)
    const previousResult = previousReader
      .send()
      .catch((error: unknown) => error)
    await waitFor(() => expect(requests).toHaveLength(1))
    const currentReader = getFudabaPrivateMessage(note.id)
    const currentResult = currentReader.send()
    await waitFor(() => expect(requests).toHaveLength(2))
    previousReader.abort()
    await previousResult
    expect(requests[1].signal?.aborted).toBe(false)
    requests[1].resolve(Response.json({ success: true, message: note }))
    await expect(currentResult).resolves.toEqual({
      success: true,
      message: note,
    })
  })
})
