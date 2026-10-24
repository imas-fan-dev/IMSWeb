import { expect, it } from "vitest"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"

it("rejects immediately on abort without cancelling the shared operation", async () => {
  let settle!: (value: string) => void
  const shared = new Promise<string>((resolve) => {
    settle = resolve
  })
  const controller = new AbortController()
  const waiting = awaitMapSearch(shared, controller.signal)
  controller.abort()
  await expect(waiting).rejects.toMatchObject({ name: "AbortError" })
  settle("late result")
  await expect(shared).resolves.toBe("late result")
})

it("uses cached results and rejects pre-aborted callers", async () => {
  const controller = new AbortController()
  await expect(
    awaitMapSearch(Promise.resolve(42), controller.signal)
  ).resolves.toBe(42)
  controller.abort()
  await expect(
    awaitMapSearch(Promise.resolve(7), controller.signal)
  ).rejects.toMatchObject({ name: "AbortError" })
})
