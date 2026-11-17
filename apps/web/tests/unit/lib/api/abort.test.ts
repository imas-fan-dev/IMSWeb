import { expect, it, vi } from "vitest"
import { sendWithAbort } from "~/lib/api/abort"

it("does not send an already canceled request", async () => {
  const method = {
    send: vi.fn(async () => "result"),
    abort: vi.fn(async () => undefined),
  }
  const controller = new AbortController()
  controller.abort()
  await expect(sendWithAbort(method, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  })
  expect(method.send).not.toHaveBeenCalled()
})

it("cancels the running method and suppresses late results", async () => {
  let resolve!: (result: string) => void
  const method = {
    send: vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        })
    ),
    abort: vi.fn(async () => undefined),
  }
  const controller = new AbortController()
  const pending = sendWithAbort(method, controller.signal)
  controller.abort()
  expect(method.abort).toHaveBeenCalledOnce()
  resolve("late result")
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
})
