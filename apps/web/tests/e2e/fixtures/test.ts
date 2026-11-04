import { test as base } from "@playwright/test"
import { fudabaSeriesListSchema } from "@imsweb/contracts/fudaba"
import {
  namecardNotificationListResponseSchema,
  type NamecardNotification,
} from "@imsweb/contracts/fudaba/card-claims"
import {
  myPlatformAccountsSchema,
  wallInsightsSchema,
} from "@imsweb/contracts/namecards"
import { apiPath, exchangePath, platformApiPath } from "@imsweb/contracts/paths"

import { ApiDispatcher } from "./api-dispatcher"

/**
 * The shell asks for the recipient's unread count on every navigation, so any
 * spec that signs in would otherwise fail on an unregistered request it never
 * cared about. Specs that assert the inbox register their own expectation.
 */
function installInboxProbe(
  dispatcher: ApiDispatcher,
  inbox: NamecardNotification[],
) {
  dispatcher.expect({
    method: "GET",
    path: exchangePath("/me/notifications"),
    responses: { 200: namecardNotificationListResponseSchema },
    times: { min: 0, max: 1_000 },
    handle: () => ({
      status: 200,
      json: {
        items: inbox,
        unread: inbox.filter((item) => item.readAt === null).length,
      },
    }),
  })
}

/**
 * 名片墙顶部的进度面板是独立请求，页面一打开就会发；给它一个中性兜底，
 * 免得每个只关心墙体的 spec 都要自己登记。
 */
function installWallInsightsProbe(dispatcher: ApiDispatcher) {
  dispatcher.expect({
    method: "GET",
    path: apiPath("/cards/wall-insights"),
    responses: { 200: wallInsightsSchema },
    times: { min: 0, max: 1_000 },
    fallback: true,
    handle: () => ({
      status: 200,
      json: {
        guestTotal: 0,
        ownerless: 0,
        ownerlessMissingSeries: 0,
        claimed: 0,
        claimsPending: 0,
        supplemented: 0,
        supplementsPending: 0,
        contributors: [],
        viewer: null,
      },
    }),
  })
}

/** 个人资料页的平台账号编辑器会单独取目录；默认给空目录。 */
function installPlatformAccountsProbe(dispatcher: ApiDispatcher) {
  dispatcher.expect({
    method: "GET",
    path: platformApiPath("/me/accounts"),
    responses: { 200: myPlatformAccountsSchema },
    times: { min: 0, max: 1_000 },
    fallback: true,
    handle: () => ({ status: 200, json: { catalog: [], entries: [] } }),
  })
}

/**
 * The wall detail dialog resolves series names and colours for the cards it
 * shows, so any spec that opens it would otherwise fail on this request.
 */
function installSeriesProbe(dispatcher: ApiDispatcher) {
  dispatcher.expect({
    method: "GET",
    path: exchangePath("/series"),
    responses: { 200: fudabaSeriesListSchema },
    times: { min: 0, max: 1_000 },
    fallback: true,
    handle: () => ({ status: 200, json: { items: [] } }),
  })
}

export { expect } from "@playwright/test"
export type { ApiDispatcher } from "./api-dispatcher"

export type ApiTestOptions = {
  apiOrigins: string[]
  mapGuide: "seen" | "new"
  /** The inbox the shell's unread probe answers with; specs that read it set this. */
  inboxNotifications: NamecardNotification[]
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

export const test = base.extend<
  { api: ApiDispatcher; mapGuideSetup: void } & ApiTestOptions
>({
  apiOrigins: [[], { option: true }],
  mapGuide: ["seen", { option: true }],
  mapGuideSetup: [
    async ({ context, mapGuide }, run) => {
      if (mapGuide === "seen")
        await context.addInitScript(() => {
          localStorage.setItem("ims:exchange-map-guide:v1", "done")
        })
      await run()
    },
    { auto: true },
  ],
  inboxNotifications: [[], { option: true }],
  api: [
    async ({ apiOrigins, baseURL, context, inboxNotifications }, run) => {
      if (!baseURL)
        throw new Error("Playwright API dispatcher requires baseURL")
      const dispatcher = new ApiDispatcher(baseURL, apiOrigins)
      await dispatcher.install(context)
      installInboxProbe(dispatcher, inboxNotifications)
      installSeriesProbe(dispatcher)
      installWallInsightsProbe(dispatcher)
      installPlatformAccountsProbe(dispatcher)
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
