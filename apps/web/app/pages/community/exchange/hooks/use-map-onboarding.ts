import { useCallback, useEffect, useState } from "react"

const key = "ims:exchange-map-guide:v1"
let dismissed = false

export function useMapOnboarding(ready: boolean, covered: boolean) {
  const [step, setStep] = useState<number | null>(null)
  const [seen, setSeen] = useState(() => {
    try {
      return dismissed || localStorage.getItem(key) === "done"
    } catch {
      return dismissed
    }
  })
  useEffect(() => {
    if (!ready || covered || seen) return
    const timer = setTimeout(() => setStep(0), 600)
    return () => clearTimeout(timer)
  }, [ready, covered, seen])
  const finish = useCallback(() => {
    dismissed = true
    setSeen(true)
    setStep(null)
    try {
      localStorage.setItem(key, "done")
    } catch {
      // The current run still remembers the explicit dismissal.
    }
  }, [])
  return { step, setStep, finish, seen, replay: () => setStep(0) }
}
