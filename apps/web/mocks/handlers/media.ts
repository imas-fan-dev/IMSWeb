import {
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
} from "@imsweb/contracts/paths"
import { http, HttpResponse } from "msw"

import coverImage from "../assets/cover.webp?inline"
import squareImage from "../assets/square.webp?inline"

/**
 * Placeholder media, committed to the repository.
 *
 * Fixture payloads carry the media URLs the real API returns, and those only
 * resolve while the API and its object storage are running. Answering them with
 * a real file keeps a mocked page from rendering as a grid of broken images and
 * preserves the one property a layout depends on: whether a slot is landscape
 * or square.
 *
 * Two files is the whole set. `cover` fills object-storage uploads and story
 * images, `square` fills wiki group icons and idol avatars. Both are generated
 * placeholders rather than real artwork, so nothing licensed enters the tree.
 *
 * They are imported `?inline` rather than by URL because the bytes have to be
 * readable without a dev server: a plain asset import resolves to a
 * dev-server path, which is exactly what a unit test cannot fetch.
 */
const ASSETS = {
  cover: coverImage,
  square: squareImage,
} as const

type AssetKind = keyof typeof ASSETS

function bytesOf(dataUri: string): ArrayBuffer {
  const binary = atob(dataUri.slice(dataUri.indexOf(",") + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function placeholderImage(kind: AssetKind): Response {
  return HttpResponse.arrayBuffer(bytesOf(ASSETS[kind]), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "no-store",
    },
  })
}

/**
 * The image surfaces the API serves from its own origin.
 *
 * `/uploads` is object storage, while `/icon` and `/image` carry wiki entity
 * artwork (`packages/contracts/src/paths.ts`). All three are proxied to the API
 * in development, so with no backend behind them they fail outright. The
 * wildcard also absorbs the dynamic segments the real routes declare.
 *
 * The one shape worth naming is the idol avatar at
 * `/image/:agency/:idol/icon.webp` (`apps/api/src/domains/content/wiki/
 * service.ts`), which is square where every other `/image` path is a landscape
 * story image. It is declared ahead of the `/image` catch-all because MSW takes
 * the first handler that matches, which keeps the distinction visible in the
 * route table instead of hidden in a URL parse.
 *
 * Chronicle photos are the same public-assets prefix as the app bundle, so that
 * handler names the whole `/assets/images/eventchronicle` subtree. A wildcard on
 * `/assets` alone would swallow the bundle's own JavaScript.
 */
export const mediaHandlers = [
  http.get(`${PUBLIC_UPLOADS_PATH_PREFIX}/*`, () => placeholderImage("cover")),
  http.get(`${ICON_PATH_PREFIX}/*`, () => placeholderImage("square")),
  http.get(`${IMAGE_PATH_PREFIX}/:agency/:idol/icon.webp`, () =>
    placeholderImage("square")
  ),
  http.get(`${IMAGE_PATH_PREFIX}/*`, () => placeholderImage("cover")),
  http.get(`${PUBLIC_ASSETS_PATH_PREFIX}/images/eventchronicle/*`, () =>
    placeholderImage("cover")
  ),
]
