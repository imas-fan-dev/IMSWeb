import { startTransition, StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { HydratedRouter } from "react-router/dom"

/**
 * Starts the development mock worker.
 *
 * `VITE_IMS_MOCK_API` is read through `import.meta.env`, which Vite replaces
 * with a literal at build time. A build without the flag collapses this branch
 * to `false` and drops the dynamic import, so no mock code reaches production.
 *
 * The await matters: registering a Service Worker is asynchronous, and the
 * first render issues the requests it is meant to answer.
 */
async function startMockApi(): Promise<void> {
  if (import.meta.env.VITE_IMS_MOCK_API !== "1") return

  const { worker } = await import("../mocks/browser")
  await worker.start()
}

startMockApi().then(() => {
  // 扫码交换离线队列：装上 `online` 监听并尝试重放一次上次没提交成功的交换。
  // 动态引入让队列与 API 客户端离开首屏 hydration 的关键路径。
  void import("~/lib/namecards/scan-exchange-queue").then((queue) =>
    queue.startScanExchangeReplay()
  )

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    )
  })
})
