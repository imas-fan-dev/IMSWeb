export const USER_LOCATION_HINT_DURATION = 3500

/** Both renderers anchor the hint to the actual user marker, not a control. */
export function createUserLocationMarker() {
  const element = document.createElement("span")
  element.className = "z-10 block size-4"
  const dot = document.createElement("span")
  dot.className =
    "relative block size-4 rounded-full border-[3px] border-white bg-primary shadow-md ring-2 ring-primary/30"
  dot.setAttribute("role", "img")
  dot.setAttribute("aria-label", "您的当前位置")
  element.append(dot)
  let timer: ReturnType<typeof setTimeout> | undefined
  let hint: HTMLSpanElement | undefined

  function dismissHint() {
    clearTimeout(timer)
    timer = undefined
    hint?.remove()
    hint = undefined
  }

  function showHint() {
    dismissHint()
    hint = document.createElement("span")
    hint.className =
      "pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 rounded-lg border bg-background px-3 py-2 text-xs whitespace-nowrap text-foreground shadow-sm"
    hint.setAttribute("aria-hidden", "true")
    hint.textContent = "已回到您的位置"
    const pointer = document.createElement("span")
    pointer.className =
      "absolute top-full left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b bg-background"
    hint.append(pointer)
    dot.append(hint)
    timer = setTimeout(dismissHint, USER_LOCATION_HINT_DURATION)
  }

  return { element, showHint, dismissHint }
}
