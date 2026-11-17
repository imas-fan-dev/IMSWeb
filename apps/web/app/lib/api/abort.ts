interface AbortableMethod<Response> {
  send(): Promise<Response>
  abort(): Promise<void>
}

/** Start before wiring abort: Alova queues cancellation only after send(). */
export async function sendWithAbort<Response>(
  method: AbortableMethod<Response>,
  signal: AbortSignal
): Promise<Response> {
  signal.throwIfAborted()
  const pending = method.send()
  const abort = () => {
    void method.abort().catch(() => undefined)
  }
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  try {
    const result = await pending
    signal.throwIfAborted()
    return result
  } finally {
    signal.removeEventListener("abort", abort)
  }
}
