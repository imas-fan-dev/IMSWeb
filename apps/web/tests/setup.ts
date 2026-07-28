import * as matchers from "@testing-library/jest-dom/matchers"
import { cleanup } from "@testing-library/react"
import { invalidateCache } from "alova"
import { afterEach, expect } from "vitest"

expect.extend(matchers)

afterEach(async () => {
  cleanup()
  await invalidateCache()
})
