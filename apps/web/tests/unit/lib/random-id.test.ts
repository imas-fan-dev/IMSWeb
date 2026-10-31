import { expect, it, vi } from "vitest"
import { createRandomId } from "~/lib/random-id"

it("uses the native UUID method when available", () => {
  const randomUUID = vi.fn(() => "fdd58077-247a-4d31-82e3-0ec025d1e409")
  const getRandomValues = vi.fn()
  vi.stubGlobal("crypto", { randomUUID, getRandomValues })
  expect(createRandomId()).toBe("fdd58077-247a-4d31-82e3-0ec025d1e409")
  expect(getRandomValues).not.toHaveBeenCalled()
})

it("uses a fresh 128-bit cryptographic value without requiring a secure context", () => {
  let sequence = 0
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(++sequence))
  vi.stubGlobal("crypto", { getRandomValues })
  const first = createRandomId(),
    second = createRandomId()
  expect(first).toMatch(/^[\da-f]{32}$/)
  expect(second).not.toBe(first)
  expect(getRandomValues.mock.calls[0]?.[0]).toHaveLength(16)
  expect(getRandomValues.mock.calls[1]?.[0]).not.toBe(
    getRandomValues.mock.calls[0]?.[0]
  )
})

it("fails closed when the browser has no cryptographic random source", () => {
  vi.stubGlobal("crypto", undefined)
  expect(() => createRandomId()).toThrow("当前浏览器不支持安全随机标识")
})
