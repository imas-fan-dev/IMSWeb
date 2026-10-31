/** The pin tip, rather than the centre of its touch target, is the picked point. */
export function createPointPickerMarker(disabled: boolean) {
  const element = document.createElement("div")
  element.dataset.mapPointPicker = ""
  element.className =
    "h-12 w-11 touch-none cursor-grab select-none text-primary active:cursor-grabbing"
  element.setAttribute("role", "img")
  element.setAttribute("aria-label", "已选位置，可拖动调整")
  element.title = "拖动浮标调整位置，也可点击地图重新选点"
  if (disabled) {
    element.classList.add("pointer-events-none", "opacity-60")
  }
  element.innerHTML = `<svg aria-hidden="true" width="44" height="48" viewBox="0 0 36 48" class="drop-shadow-md"><path d="M18 47C14 41 3 28 3 18a15 15 0 1 1 30 0c0 10-11 23-15 29Z" fill="var(--background)" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="18" r="5" fill="currentColor"/></svg>`
  return element
}
