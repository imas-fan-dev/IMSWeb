import { useEffect, useState, type RefObject } from "react"

export function useWallImage(
  source: string,
  container: RefObject<HTMLDivElement | null>
) {
  const [state, setState] = useState({
    source: "",
    phase: "loading" as "loading" | "ready" | "error",
  })
  useEffect(() => {
    const image = container.current?.querySelector("img")
    if (!image) return
    let alive = true
    const load = () => {
      void (image.decode?.() ?? Promise.resolve()).then(
        () => {
          if (alive)
            setState({ source, phase: image.naturalWidth ? "ready" : "error" })
        },
        () => {
          if (alive) setState({ source, phase: "error" })
        }
      )
    }
    const error = () => {
      if (alive) setState({ source, phase: "error" })
    }
    image.addEventListener("load", load)
    image.addEventListener("error", error)
    if (image.complete) void Promise.resolve().then(load)
    return () => {
      alive = false
      image.removeEventListener("load", load)
      image.removeEventListener("error", error)
    }
  }, [source, container])
  function retry() {
    const image = container.current?.querySelector("img")
    if (!image) return
    setState({ source, phase: "loading" })
    image.src = source
  }
  return {
    ready: state.source === source && state.phase === "ready",
    error: state.source === source && state.phase === "error",
    retry,
  }
}
