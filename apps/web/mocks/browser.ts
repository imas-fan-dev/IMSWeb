import { setupWorker } from "msw/browser"

import { mockHandlers } from "./handlers"

/**
 * The development mock worker.
 *
 * Started from `app/entry.client.tsx` when `VITE_IMS_MOCK_API=1`. It intercepts
 * at the network layer, so it also reaches requests that never pass through
 * alova, including `<img>` loads.
 */
export const worker = setupWorker(...mockHandlers)
