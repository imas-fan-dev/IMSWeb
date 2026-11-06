import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import type { Plugin } from "vite"

const require = createRequire(import.meta.url)

/** MSW's own default worker URL, so the client needs no extra configuration. */
const WORKER_SCRIPT_PATH = "/mockServiceWorker.js"

/**
 * Serves the MSW worker script while `vite dev` runs.
 *
 * `msw/mockServiceWorker.js` is a public subpath of the installed package, so
 * the script the browser registers always belongs to the installed `msw`
 * version. `npx msw init` would instead copy that file into `public/`, where it
 * becomes a committed third-party artifact that drifts from the library on the
 * next `msw` upgrade; MSW reports exactly that mismatch at `worker.start()`.
 *
 * This runs in development only. Mocks are a development affordance, and a
 * production build never registers the worker.
 */
export function mockWorkerScriptPlugin(): Plugin {
  return {
    name: "imsweb-mock-worker-script",
    apply: "serve",
    configureServer(server) {
      const scriptPath = require.resolve("msw/mockServiceWorker.js")

      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== WORKER_SCRIPT_PATH) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader("content-type", "text/javascript")
        response.setHeader("cache-control", "no-store")
        response.end(readFileSync(scriptPath))
      })
    },
  }
}
