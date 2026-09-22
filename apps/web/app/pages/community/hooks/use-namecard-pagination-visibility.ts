import { useLayoutEffect, useState } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"

const VISIBLE_ATTRIBUTE = "data-namecard-pagination-visible"

export function useNamecardPaginationVisibility() {
  // The navigation mounts only after the list request succeeds.
  const [navigation, setNavigation] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!IS_APP_TARGET || !navigation) return
    let active = true

    function markVisible(visible: boolean) {
      if (active && navigation?.isConnected) {
        navigation.toggleAttribute(VISIBLE_ATTRIBUTE, visible)
      }
    }

    function measure() {
      if (!navigation) return
      const rect = navigation.getBoundingClientRect()
      markVisible(
        rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          rect.right > 0 &&
          rect.left < window.innerWidth
      )
    }

    measure()
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (entry.target === navigation) {
                markVisible(
                  entry.isIntersecting &&
                    entry.intersectionRect.width > 0 &&
                    entry.intersectionRect.height > 0
                )
              }
            }
          })

    if (observer) {
      observer.observe(navigation)
    } else {
      window.addEventListener("scroll", measure, true)
      window.addEventListener("resize", measure)
    }

    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
      navigation.removeAttribute(VISIBLE_ATTRIBUTE)
    }
  }, [navigation])

  return setNavigation
}
