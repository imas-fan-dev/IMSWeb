// @vitest-environment node

import { EventEmitter } from "node:events"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import type {
  MinimalPluginContextWithoutEnvironment,
  ViteDevServer,
} from "vite"
import { afterEach, describe, expect, it, vi } from "vitest"

import { contractsFingerprint } from "@/vite-contracts-cache"
import { localContractsOptimizer } from "@/vite-contracts"

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

const hookContext = {
  error(error: unknown): never {
    throw new Error(String(error))
  },
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  meta: {
    rollupVersion: "test",
    rolldownVersion: "test",
    viteVersion: "test",
    watchMode: true,
  },
} satisfies MinimalPluginContextWithoutEnvironment

const directories: string[] = []
function outputDirectory() {
  const workspace = mkdtempSync(join(tmpdir(), "imsweb-contracts-cache-"))
  directories.push(workspace)
  const directory = join(workspace, "packages/contracts/dist")
  mkdirSync(directory, { recursive: true })
  for (const name of ["esm/index.js", "esm/paths.js", "cjs/index.js"]) {
    mkdirSync(dirname(join(directory, name)), { recursive: true })
    writeFileSync(join(directory, name), "exports.ready = true")
  }
  return directory
}
afterEach(() => {
  vi.useRealTimers()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe("contracts dependency cache", () => {
  it("changes the key for new runtime exports even when package paths and timestamps stay unchanged", () => {
    const directory = outputDirectory()
    const file = join(directory, "messages.js")
    writeFileSync(file, "exports.scene = undefined")
    const previous = contractsFingerprint(directory)
    const timestamp = statSync(file)
    writeFileSync(file, "exports.scene = { safeParse() {} }")
    utimesSync(file, timestamp.atime, timestamp.mtime)
    const current = contractsFingerprint(directory)
    expect(current).not.toBe(previous)
    utimesSync(file, new Date(), new Date())
    writeFileSync(
      join(directory, "messages.d.ts"),
      "export declare const scene: unknown"
    )
    expect(contractsFingerprint(directory)).toBe(current)
  })

  it("merges batch build writes into one restart and disposes pending work when closing", async () => {
    vi.useFakeTimers()
    const directory = outputDirectory()
    writeFileSync(join(directory, "messages.js"), "exports.scene = undefined")
    const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
    const restart = vi.fn().mockResolvedValue(undefined)
    const plugin = localContractsOptimizer(join(directory, "../../.."))
    if (
      typeof plugin.configureServer !== "function" ||
      typeof plugin.closeBundle !== "function"
    )
      throw new Error("Expected server lifecycle hooks")
    plugin.configureServer.call(hookContext, {
      watcher,
      restart,
      config: { logger: { error: vi.fn() } },
    } as unknown as ViteDevServer)
    expect(watcher.add).toHaveBeenCalledWith(directory)
    watcher.emit("all", "change", join(directory, "messages.js"))
    watcher.emit("all", "change", join(directory, "messages.d.ts"))
    watcher.emit("all", "change", join(directory, "..", "other.js"))
    await vi.advanceTimersByTimeAsync(500)
    expect(restart).not.toHaveBeenCalled()
    writeFileSync(
      join(directory, "scene.js"),
      "exports.scene = { safeParse() {} }"
    )
    watcher.emit("all", "add", join(directory, "scene.js"))
    await vi.advanceTimersByTimeAsync(200)
    writeFileSync(
      join(directory, "messages.js"),
      "exports.layout = { safeParse() {} }"
    )
    watcher.emit("all", "change", join(directory, "messages.js"))
    watcher.emit("all", "unlink", join(directory, "obsolete.js"))
    await vi.advanceTimersByTimeAsync(1199)
    expect(restart).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(restart).toHaveBeenCalledExactlyOnceWith(true)
    writeFileSync(join(directory, "messages.js"), "exports.layout = undefined")
    watcher.emit("all", "change", join(directory, "messages.js"))
    plugin.closeBundle.call({} as never)
    await vi.advanceTimersByTimeAsync(6000)
    expect(restart).toHaveBeenCalledExactlyOnceWith(true)
    expect(watcher.listenerCount("all")).toBe(0)
  })
  it("waits for subsequent output events when a clean build removes a file during fingerprinting", async () => {
    vi.useFakeTimers()
    const directory = outputDirectory()
    const file = join(directory, "messages.js")
    writeFileSync(file, "exports.scene = undefined")
    const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
    const restart = vi.fn().mockResolvedValue(undefined)
    const error = vi.fn()
    const plugin = localContractsOptimizer(join(directory, "../../.."))
    if (
      typeof plugin.configureServer !== "function" ||
      typeof plugin.closeBundle !== "function"
    )
      throw new Error("Expected server lifecycle hooks")
    plugin.configureServer.call(hookContext, {
      watcher,
      restart,
      config: { logger: { error } },
    } as unknown as ViteDevServer)
    writeFileSync(file, "exports.scene = { safeParse() {} }")
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("Output was removed by a clean build"), {
        code: "ENOENT",
      })
    })
    watcher.emit("all", "change", file)
    await vi.advanceTimersByTimeAsync(1200)
    expect(restart).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    watcher.emit("all", "add", file)
    await vi.advanceTimersByTimeAsync(1200)
    expect(restart).toHaveBeenCalledExactlyOnceWith(true)
    plugin.closeBundle.call({} as never)
  })
})
