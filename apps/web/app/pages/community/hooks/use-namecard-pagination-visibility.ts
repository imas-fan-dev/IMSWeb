import { useLayoutEffect, useState } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"

const VISIBLE_ATTRIBUTE = "data-namecard-pagination-visible"

export function useNamecardPaginationVisibility() {
  // The navigation mounts only after the list request succeeds.
  const [navigation, setNavigation] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!IS_APP_TARGET || !navigation) return
    let active = true

    // The App shell owns fixed actions, so expose visibility there. The page
    // marker remains for local observers and tests.
    const shell = navigation.closest<HTMLElement>("[data-app-shell]")
    const shellAttribute = "data-namecard-pagination-visible"
    function markVisible(visible: boolean) {
      const node = navigation
      if (!active || !node?.isConnected) return
      node.toggleAttribute(VISIBLE_ATTRIBUTE, visible)
      shell?.toggleAttribute(shellAttribute, visible)
    }

    function measure() {
      if (!navigation) return
      const rect = navigation.getBoundingClientRect()
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      markVisible(visible)
    }
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (entry.target === navigation) {
                const visible =
                  entry.isIntersecting &&
                  entry.intersectionRect.width > 0 &&
                  entry.intersectionRect.height > 0
                markVisible(visible)
              }
            }
          })

    if (observer) {
      observer.observe(navigation)
      measure()
    } else {
      window.addEventListener("scroll", measure, true)
      window.addEventListener("resize", measure)
      measure()
    }

    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
      navigation.removeAttribute(VISIBLE_ATTRIBUTE)
      shell?.removeAttribute(shellAttribute)
    }
  }, [navigation])

  return setNavigation
}
