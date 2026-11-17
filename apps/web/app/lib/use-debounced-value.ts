import { useEffect, useState } from "react"

/**
 * Trails `value` by `delay` milliseconds, restarting the timer on every change.
 * Search boxes use it so typing drives one request per pause instead of one per
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
