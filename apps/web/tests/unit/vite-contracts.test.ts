// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { EventEmitter } from "node:events"
import { dirname, join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { contractsDigest, watchContracts } from "../../vite-contracts"

const roots: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "imsweb-contracts-"))
  roots.push(root)
  mkdirSync(join(root, "fudaba"))
  writeFileSync(join(root, "fudaba", "map-delivery.js"), "exports.version = 1")
  for (const probe of ["esm/index.js", "esm/paths.js", "cjs/index.js"]) {
    mkdirSync(join(root, dirname(probe)), { recursive: true })
    writeFileSync(join(root, probe), "exports.ready = true")
  }
  return root
}

it("invalidates prebundled contracts when nested runtime bytes change, not timestamps or declarations", () => {
  const root = fixture()
  const first = contractsDigest(root)
  writeFileSync(
    join(root, "fudaba", "map-delivery.d.ts"),
    "export type Version = 2"
  )
  expect(contractsDigest(root)).toBe(first)
  writeFileSync(join(root, "fudaba", "map-delivery.js"), "exports.version = 2")
  expect(contractsDigest(root)).not.toBe(first)
})

it("coalesces dist rebuilds, ignores unchanged bytes and detaches on close", async () => {
  vi.useFakeTimers()
  const root = fixture()
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const restart = vi.fn(async () => {})
  const cleanup = watchContracts(root, watcher, restart, vi.fn())
  expect(watcher.add).toHaveBeenCalledWith(root)
  const file = join(root, "fudaba", "map-delivery.js")
  watcher.emit("all", "change", file)
  await vi.advanceTimersByTimeAsync(500)
  expect(restart).not.toHaveBeenCalled()
  writeFileSync(file, "exports.version = 2")
  watcher.emit("all", "change", file)
  watcher.emit("all", "add", join(root, "index.js"))
  await vi.advanceTimersByTimeAsync(1500)
  expect(restart).toHaveBeenCalledExactlyOnceWith(true)
  cleanup()
  writeFileSync(file, "exports.version = 3")
  watcher.emit("all", "change", file)
  await vi.advanceTimersByTimeAsync(1500)
  expect(restart).toHaveBeenCalledOnce()
  expect(watcher.listenerCount("all")).toBe(0)
})

it("never overlaps restarts and re-runs once after the settle interval", async () => {
  vi.useFakeTimers()
  const root = fixture()
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const pending: Array<() => void> = []
  const restart = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        pending.push(resolve)
      })
  )
  const cleanup = watchContracts(root, watcher, restart, vi.fn())
  const file = join(root, "fudaba", "map-delivery.js")
  writeFileSync(file, "exports.version = 2")
  watcher.emit("all", "change", file)
  await vi.advanceTimersByTimeAsync(1500)
  expect(restart).toHaveBeenCalledOnce()
  // A second build lands while the first restart is still running; restarting
  // again here is what wedged the dev server into never answering documents.
  writeFileSync(file, "exports.version = 3")
  watcher.emit("all", "change", file)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(restart).toHaveBeenCalledOnce()
  pending[0]?.()
  await vi.advanceTimersByTimeAsync(6_000)
  expect(restart).toHaveBeenCalledTimes(2)
  pending[1]?.()
  await vi.advanceTimersByTimeAsync(6_000)
  cleanup()
})

it("waits for a complete dist before restarting, then restarts once", async () => {
  vi.useFakeTimers()
  const root = fixture()
  // The contracts build clears dist before rewriting it; Vite's scanner reads
  // esm/index.js during re-optimization and dies if it is missing.
  rmSync(join(root, "esm", "index.js"))
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const restart = vi.fn(async () => {})
  const cleanup = watchContracts(root, watcher, restart, vi.fn())
  const file = join(root, "fudaba", "map-delivery.js")
  writeFileSync(file, "exports.version = 2")
  watcher.emit("all", "change", file)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(restart).not.toHaveBeenCalled()
  writeFileSync(join(root, "esm", "index.js"), "exports.ready = true")
  await vi.advanceTimersByTimeAsync(3_000)
  expect(restart).toHaveBeenCalledExactlyOnceWith(true)
  cleanup()
})
