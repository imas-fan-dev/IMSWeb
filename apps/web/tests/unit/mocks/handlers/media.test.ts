import {
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
} from "@imsweb/contracts/paths"
import { getResponse } from "msw"
import { describe, expect, it } from "vitest"

import coverImage from "@/mocks/assets/cover.webp?inline"
import squareImage from "@/mocks/assets/square.webp?inline"
import { mediaHandlers } from "@/mocks/handlers/media"

const ORIGIN = "http://ims.test"

/**
 * Relative handler paths resolve against a base URL. In the browser
 * `setupWorker` supplies the page origin; a test has to pass it explicitly.
 */
const RESOLUTION_CONTEXT = { baseUrl: ORIGIN }

function getMedia(path: string): Promise<Response | undefined> {
  return getResponse(
    mediaHandlers,
    new Request(new URL(path, ORIGIN)),
    RESOLUTION_CONTEXT
  )
}

/**
 * Decoded here rather than through the handler's own helper, so a bug in that
 * helper cannot make this test agree with it.
 */
function inlineBytes(dataUri: string): number {
  return atob(dataUri.slice(dataUri.indexOf(",") + 1)).length
}

const SQUARE_BYTES = inlineBytes(squareImage)
const COVER_BYTES = inlineBytes(coverImage)

/**
 * These are the prefixes the API serves images from
 * (`apps/api/src/domains/delivery/media/routes.ts` and
 * `apps/api/src/domains/content/wiki/media/routes.ts`). Each case uses a real
 * URL shape rather than a bare prefix, so a handler that stopped covering the
 * nested segment would fail.
 */
describe("media mock handlers", () => {
  it("commits two distinct images of a real size", () => {
    expect(SQUARE_BYTES).toBeGreaterThan(512)
    expect(COVER_BYTES).toBeGreaterThan(SQUARE_BYTES)
  })

  it.each([
    {
      what: "an object-storage upload",
      path: `${PUBLIC_UPLOADS_PATH_PREFIX}/events/summer/poster.webp`,
      bytes: COVER_BYTES,
    },
    {
      what: "a wiki group icon",
      path: `${ICON_PATH_PREFIX}/wiki-groups/1.webp`,
      bytes: SQUARE_BYTES,
    },
    {
      what: "an idol avatar",
      path: `${IMAGE_PATH_PREFIX}/765PRO/%E5%A4%A9%E6%B5%B7%E6%98%A5%E9%A6%99/icon.webp`,
      bytes: SQUARE_BYTES,
    },
    {
      what: "a story image",
      path: `${IMAGE_PATH_PREFIX}/765PRO/%E5%A4%A9%E6%B5%B7%E6%98%A5%E9%A6%99/100.webp`,
      bytes: COVER_BYTES,
    },
    {
      what: "a chronicle activity photo",
      path: `${PUBLIC_ASSETS_PATH_PREFIX}/images/eventchronicle/events/used/activity-1/a.webp`,
      bytes: COVER_BYTES,
    },
  ])("answers $what with the committed asset", async ({ path, bytes }) => {
    const response = await getMedia(path)

    expect(response, `no mocked response for ${path}`).toBeDefined()
    expect(response?.headers.get("content-type")).toBe("image/webp")
    expect((await response?.arrayBuffer())?.byteLength).toBe(bytes)
  })

  it("leaves an unrelated path to the network", async () => {
    expect(await getMedia("/brand/about.webp")).toBeUndefined()
  })

  it("does not swallow the app bundle under the same prefix", async () => {
    expect(
      await getMedia(`${PUBLIC_ASSETS_PATH_PREFIX}/index-abc123.js`)
    ).toBeUndefined()
    expect(
      await getMedia(`${PUBLIC_ASSETS_PATH_PREFIX}/index-abc123.css`)
    ).toBeUndefined()
  })
})
