import { test as base } from "@playwright/test"

import { ApiDispatcher } from "./api-dispatcher"

export { expect } from "@playwright/test"
export type { ApiDispatcher } from "./api-dispatcher"

let activeApi: ApiDispatcher | undefined

export const api = new Proxy({} as ApiDispatcher, {
  get(_target, property) {
    if (!activeApi) {
      throw new Error("Playwright API dispatcher is not active for this test")
    }
    const value = activeApi[property as keyof ApiDispatcher]
    return typeof value === "function" ? value.bind(activeApi) : value
  },
})

export const test = base.extend<{ api: ApiDispatcher }>({
  api: [
    async ({ baseURL, context }, run) => {
      if (!baseURL)
        throw new Error("Playwright API dispatcher requires baseURL")
      const dispatcher = new ApiDispatcher(baseURL)
      await dispatcher.install(context)
      if (activeApi) {
        await dispatcher.dispose()
        throw new Error(
          "Playwright API dispatcher fixtures cannot overlap in one worker"
        )
      }
      activeApi = dispatcher

      const failures: unknown[] = []
      try {
        await run(dispatcher)
      } catch (error) {
        failures.push(error)
      } finally {
        activeApi = undefined
        try {
          await dispatcher.dispose()
        } catch (error) {
          failures.push(error)
        }
        try {
          dispatcher.assertSatisfied()
        } catch (error) {
          failures.push(error)
        }
      }

      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Playwright test and API dispatcher teardown both failed"
        )
      }
    },
    { auto: true },
  ],
})
