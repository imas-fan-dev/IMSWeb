/**
 * Sending window for a scheduled station message.
 *
 * Zod-free on purpose: the API validates the schedule against these bounds at
 * runtime, so it must not pull the schema entrypoint (and its Zod dependency)
 * just to read two numbers.
 */

/** How far ahead a send may be queued. */
export const ADMIN_STATION_MESSAGE_MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;

/** Shortest lead time accepted for a scheduled send. */
export const ADMIN_STATION_MESSAGE_MIN_LEAD_MS = 60 * 1000;
