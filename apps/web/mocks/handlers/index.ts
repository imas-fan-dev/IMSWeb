import type { RequestHandler } from "msw"

import { mediaHandlers } from "./media"
import { publicHandlers } from "./public"

/**
 * Every request the development mock worker can answer.
 *
 * A request with no matching handler falls through to the network, so the
 * surface can grow one page at a time without breaking the pages that are
 * already covered.
 */
export const mockHandlers: RequestHandler[] = [
  ...publicHandlers,
  ...mediaHandlers,
]
