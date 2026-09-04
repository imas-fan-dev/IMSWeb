import type { CSSProperties } from "react"

function channel(value: string) {
  return Number.parseInt(value, 16) / 255
}

function linear(value: number) {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4)
}

export function platformOAuthButtonStyle(color: string): CSSProperties {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color : "#111827"
  const red = linear(channel(normalized.slice(1, 3)))
  const green = linear(channel(normalized.slice(3, 5)))
  const blue = linear(channel(normalized.slice(5, 7)))
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const blackContrast = (luminance + 0.05) / 0.05
  const whiteContrast = 1.05 / (luminance + 0.05)
  return {
    backgroundColor: normalized,
    borderColor: blackContrast >= whiteContrast ? "#111111" : normalized,
    color: blackContrast >= whiteContrast ? "#111111" : "#ffffff",
  }
}
