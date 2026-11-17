import { setImmediate } from "node:timers/promises"
import { expect, it } from "vitest"
import { getFudabaMapConfig, sendWithAbort } from "~/lib/api"
import { installFetchMock, requestFrom } from "@/tests/unit/support/api-client"

const config = {
  provider: "maplibre",
  search: { provider: "nominatim" },
  styleUrl: "/maps/exchange-test-style.json",
}

it.each(["main-first", "picker-first"])(
  "isolates live map-config transport cancellation (%s)",
  async (order) => {
    const transports: { signal: AbortSignal; release(): void }[] = []
    let aborted!: () => void
    const abortObserved = new Promise<void>((resolve) => {
      aborted = resolve
    })
    let admitted!: () => void
    const firstAdmission = new Promise<void>((resolve) => {
      admitted = resolve
    })
    installFetchMock((input, init) => {
      const request = requestFrom(input, init)
      expect(new URL(request.url).pathname).toBe(
        "/api/community/exchange/map/config"
      )
      return new Promise<Response>((resolve, reject) => {
        const signal = request.signal
        transports.push({
          signal,
          release: () => resolve(Response.json(config)),
        })
        signal.addEventListener(
          "abort",
          () => {
            aborted()
            reject(new DOMException("Aborted", "AbortError"))
          },
          { once: true }
        )
        admitted()
      })
    })
    const controller = new AbortController()
    // Attach both rejection handlers before any abort; this also observes the old shared cancellation.
    const settle = <T>(pending: Promise<T>) =>
      pending.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason })
      )
    const startMain = () => settle(getFudabaMapConfig().send())
    const startPicker = () =>
      settle(sendWithAbort(getFudabaMapConfig(), controller.signal))
    const first = order === "main-first" ? startMain() : startPicker()
    await firstAdmission
    const second = order === "main-first" ? startPicker() : startMain()
    // A turn boundary flushes asynchronous Alova admission without a timed sleep.
    await setImmediate()
    controller.abort()
    await abortObserved
    for (const transport of transports) transport.release()
    const main = await (order === "main-first" ? first : second)
    const picker = await (order === "main-first" ? second : first)
    expect(main).toEqual({ status: "fulfilled", value: config })
    expect(picker.status).toBe("rejected")
    expect(transports).toHaveLength(2)
    expect(transports.filter(({ signal }) => signal.aborted)).toHaveLength(1)
  }
)
