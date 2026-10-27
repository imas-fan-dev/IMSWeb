import { test as base } from "@playwright/test"
import { namecardNotificationListResponseSchema } from "@imsweb/contracts/fudaba/card-claims"
import { exchangePath } from "@imsweb/contracts/paths"

import { ApiDispatcher } from "./api-dispatcher"

/**
 * The shell asks for the recipient's unread count on every navigation, so any
 * spec that signs in would otherwise fail on an unregistered request it never
 * cared about. Specs that assert the inbox register their own expectation.
 */
function installInboxProbe(dispatcher: ApiDispatcher) {
  dispatcher.expect({
    method: "GET",
    path: exchangePath("/me/notifications"),
    responses: { 200: namecardNotificationListResponseSchema },
    times: { min: 0, max: 1_000 },
    handle: () => ({
      status: 200,
      json: { items: [], unread: 0 },
    }),
  })
}

export { expect } from "@playwright/test"
export type { ApiDispatcher } from "./api-dispatcher"

export type ApiTestOptions = {
  apiOrigins: string[]
}

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

export const test = base.extend<{ api: ApiDispatcher } & ApiTestOptions>({
  apiOrigins: [[], { option: true }],
  api: [
    async ({ apiOrigins, baseURL, context }, run) => {
      if (!baseURL)
        throw new Error("Playwright API dispatcher requires baseURL")
      const dispatcher = new ApiDispatcher(baseURL, apiOrigins)
      await dispatcher.install(context)
      installInboxProbe(dispatcher)
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
