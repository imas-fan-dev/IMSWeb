import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NAMECARD_REACTIONS } from "~/lib/api"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"

const assetDirectory = resolve("public/emoji/twemoji")
const manifest = JSON.parse(
  readFileSync(resolve(assetDirectory, "manifest.json"), "utf8")
) as {
  version: string
  license: string
  modified: boolean
  assets: { emoji: string; file: string; bytes: number; sha256: string }[]
}

describe("NamecardReactionEmoji", () => {
  it("matches the complete API allowlist and the pinned local SVG manifest", () => {
    expect(NAMECARD_REACTIONS).toHaveLength(46)
    expect(manifest.version).toBe("17.0.3")
    expect(manifest.license).toBe("CC-BY-4.0")
    expect(manifest.modified).toBe(false)
    expect(manifest.assets.map(({ emoji }) => emoji)).toEqual(
      NAMECARD_REACTIONS
    )
    expect(new Set(manifest.assets.map(({ file }) => file)).size).toBe(46)
    expect(
      readdirSync(assetDirectory)
        .filter((file) => file.endsWith(".svg"))
        .sort()
    ).toEqual(manifest.assets.map(({ file }) => file).sort())
    expect(
      readFileSync(resolve(assetDirectory, "LICENSE-GRAPHICS.txt"), "utf8")
    ).toContain("Attribution 4.0 International")
    expect(
      readFileSync(resolve(assetDirectory, "NOTICE.txt"), "utf8")
    ).toContain("17.0.3")

    for (const asset of manifest.assets) {
      expect(asset.file).toMatch(/^[a-f0-9-]+\.svg$/)
      const bytes = readFileSync(resolve(assetDirectory, asset.file))
      expect(bytes.byteLength).toBe(asset.bytes)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        asset.sha256
      )
      const svg = new DOMParser().parseFromString(
        bytes.toString("utf8"),
        "image/svg+xml"
      )
      expect(svg.querySelector("parsererror")).toBeNull()
      expect(svg.documentElement.tagName).toBe("svg")
    }
  })

  it.each(NAMECARD_REACTIONS)(
    "renders %s as a decorative 20px local image",
    (emoji) => {
      const asset = manifest.assets.find((entry) => entry.emoji === emoji)!
      const { container } = render(<NamecardReactionEmoji emoji={emoji} />)
      const image = container.querySelector("img")

      expect(image).toHaveAttribute("src", `/emoji/twemoji/${asset.file}`)
      expect(image).toHaveAttribute("width", "20")
      expect(image).toHaveAttribute("height", "20")
      expect(image).toHaveAttribute("alt", "")
      expect(image).toHaveAttribute("aria-hidden", "true")
      expect(image).toHaveAttribute("draggable", "false")
      expect(image).toHaveClass("size-5", "shrink-0")
      expect(image).not.toHaveClass("size-4", "md:size-5")
      expect(container.textContent).toBe("")
    }
  )

  it("uses compact responsive sizing for images and failed assets, and restores the default variant", () => {
    const emoji = NAMECARD_REACTIONS[0]
    const { container, rerender } = render(
      <NamecardReactionEmoji emoji={emoji} compact />
    )
    const image = container.querySelector("img")!
    expect(image).toHaveClass("size-4", "md:size-5", "shrink-0")
    expect(image).toHaveAttribute("src", "/emoji/twemoji/2764.svg")
    expect(image).toHaveAttribute("aria-hidden", "true")

    rerender(<NamecardReactionEmoji emoji={emoji} compact={false} />)
    expect(image).toHaveClass("size-5", "shrink-0")
    expect(image).not.toHaveClass("size-4", "md:size-5")

    rerender(<NamecardReactionEmoji emoji={emoji} compact />)
    fireEvent.error(image)
    const fallback = container.querySelector("svg")
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(fallback).toHaveClass(
      "lucide-smile",
      "size-4",
      "md:size-5",
      "shrink-0"
    )
    expect(fallback).toHaveAttribute("aria-hidden", "true")
    expect(container.textContent).toBe("")

    rerender(<NamecardReactionEmoji emoji={emoji} />)
    expect(fallback).toHaveClass("size-5", "shrink-0")
    expect(fallback).not.toHaveClass("size-4", "md:size-5")
  })

  it("keeps unknown compact input decorative with the same responsive fallback size", () => {
    const { container } = render(
      <NamecardReactionEmoji emoji="unknown" compact />
    )
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(container.querySelector("svg")).toHaveClass(
      "lucide-smile",
      "size-4",
      "md:size-5",
      "shrink-0"
    )
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(container.textContent).toBe("")
  })

  it("uses a stable Lucide fallback after an image error and can render a different asset", () => {
    const { container, rerender } = render(
      <NamecardReactionEmoji emoji={NAMECARD_REACTIONS[0]} />
    )
    fireEvent.error(container.querySelector("img")!)

    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(container.querySelector("svg")).toHaveClass(
      "lucide-smile",
      "size-5",
      "shrink-0"
    )
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(container.textContent).toBe("")
    rerender(<NamecardReactionEmoji emoji={NAMECARD_REACTIONS[0]} />)
    expect(container.querySelector("img")).not.toBeInTheDocument()

    rerender(<NamecardReactionEmoji emoji={NAMECARD_REACTIONS[1]} />)
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/emoji/twemoji/1f44d.svg"
    )
  })

  it.each(["", "unknown", "\u2764", "https://example.com/image.svg"])(
    "does not render unknown input %j as text or a remote resource",
    (emoji) => {
      const { container } = render(<NamecardReactionEmoji emoji={emoji} />)
      expect(container.querySelector("img")).not.toBeInTheDocument()
      expect(container.querySelector("svg")).toHaveClass(
        "lucide-smile",
        "size-5"
      )
      expect(container.textContent).toBe("")
    }
  )
})
