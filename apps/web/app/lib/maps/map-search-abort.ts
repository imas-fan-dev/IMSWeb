/** Abort a caller's wait without cancelling an SDK task shared by other views. */
export function awaitMapSearch<T>(
  pending: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("Search cancelled", "AbortError"))
    const cleanup = () => signal.removeEventListener("abort", abort)
    pending.then(
      (value) => {
        cleanup()
        if (signal.aborted) abort()
        else resolve(value)
      },
      (error: unknown) => {
        cleanup()
        if (signal.aborted) abort()
        else reject(error)
      }
    )
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
}
