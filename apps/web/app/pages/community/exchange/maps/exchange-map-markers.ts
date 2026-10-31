import type { FudabaMapOfficeGroup } from "./exchange-map-model"

export function createClusterMarker(count: number) {
  const marker = document.createElement("button")
  marker.type = "button"
  marker.className =
    "z-1 flex size-11 items-center justify-center rounded-full border-2 border-background bg-primary text-sm font-semibold text-primary-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  marker.setAttribute("aria-label", `${count} 个区域点，放大查看`)
  marker.textContent = String(count)
  return marker
}

export function createOfficeGroupMarker(
  group: FudabaMapOfficeGroup,
  selected: boolean
) {
  const marker = document.createElement("button")
  marker.type = "button"
  marker.className =
    "z-1 flex h-11 min-w-11 items-center justify-center overflow-hidden rounded-lg border-2 border-background bg-background px-2 text-sm font-semibold text-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  marker.dataset.mapOfficeGroup = group.key
  marker.setAttribute("aria-pressed", String(selected))
  marker.setAttribute(
    "aria-label",
    `${group.offices.map((office) => office.name).join("、")}，${group.offices.length} 个事务所`
  )
  if (selected) marker.classList.add("ring-3", "ring-primary/60")
  const count = document.createElement("span")
  count.textContent = String(group.offices.length)
  marker.append(count)
  const strip = document.createElement("span")
  strip.className = "absolute inset-x-0 bottom-0 flex h-1"
  strip.setAttribute("aria-hidden", "true")
  for (const color of group.colors.slice(0, 6)) {
    const segment = document.createElement("span")
    segment.className = "h-full flex-1"
    segment.style.backgroundColor = color
    strip.append(segment)
  }
  marker.append(strip)
  return marker
}
