import { describe, expect, it } from "vitest"

import {
  appStyleSheetFiles,
  readStyleSheetFile,
} from "@/tests/unit/support/stylesheet-source"

/*
 * app.css is split across app/styles/*.css, and every style rule has to sit in
 * one of three named layers:
 *
 * - `base` for token declarations and element defaults,
 * - `components` for the material system and component classes,
 * - `overrides` for the rules that must win against a utility class.
 *
 * An unlayered author rule beats every layer, which is how the cascade used to
 * work here before the split. That is invisible in review and easy to recreate
 * by accident, so these three tests pin the shape instead of trusting it.
 */

const TAILWIND_IMPORTS = [
  "tailwindcss",
  "tw-animate-css",
  "shadcn/tailwind.css",
  "@fontsource-variable/geist",
]

const DOCUMENTED_LAYERS = ["base", "components", "overrides"]

/**
 * At-rules whose bodies are not style rules. `@keyframes` and `@property` do
 * not participate in the cascade, and `@theme` is consumed by Tailwind, so none
 * of them may be wrapped in a layer.
 */
const NON_CASCADING_AT_RULES = new Set([
  "custom-variant",
  "font-face",
  "keyframes",
  "-webkit-keyframes",
  "property",
  "theme",
])

type ParsedStylesheet = {
  layers: Set<string>
  unlayeredSelectors: string[]
  nestedNonCascadingAtRules: string[]
  nonCascadingAtRuleCount: number
}

function skipBlock(text: string, start: number) {
  let depth = 1
  let index = start

  while (index < text.length && depth > 0) {
    if (text[index] === "{") depth += 1
    else if (text[index] === "}") depth -= 1
    index += 1
  }

  return index
}

function parseStylesheet(source: string): ParsedStylesheet {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const layers = new Set<string>()
  const unlayeredSelectors: string[] = []
  const nestedNonCascadingAtRules: string[] = []
  const stack: { name: string; prelude: string }[] = []
  let nonCascadingAtRuleCount = 0
  let prelude = ""
  let index = 0

  const insideLayer = () => stack.some((frame) => frame.name === "layer")

  while (index < text.length) {
    const character = text[index]

    if (character === "{") {
      const head = prelude.trim()
      prelude = ""
      index += 1

      if (head.startsWith("@")) {
        const name = head.slice(1).split(/[\s(]/)[0].toLowerCase()

        if (name === "layer") {
          layers.add(head.slice("@layer".length).trim())
          stack.push({ name, prelude: head })
          continue
        }

        if (NON_CASCADING_AT_RULES.has(name)) {
          nonCascadingAtRuleCount += 1
          if (insideLayer()) nestedNonCascadingAtRules.push(name)
          index = skipBlock(text, index)
          continue
        }

        stack.push({ name, prelude: head })
        continue
      }

      if (!insideLayer()) unlayeredSelectors.push(head)
      index = skipBlock(text, index)
      continue
    }

    if (character === "}") {
      stack.pop()
      prelude = ""
      index += 1
      continue
    }

    if (character === ";") {
      const statement = prelude.trim()
      prelude = ""
      if (statement.startsWith("@layer")) {
        for (const name of statement.slice("@layer".length).split(",")) {
          layers.add(name.trim())
        }
      }
      index += 1
      continue
    }

    prelude += character
    index += 1
  }

  return {
    layers,
    unlayeredSelectors,
    nestedNonCascadingAtRules,
    nonCascadingAtRuleCount,
  }
}

const STYLE_SHEET_FILES = ["app.css", ...appStyleSheetFiles()]
const PARSED = new Map(
  STYLE_SHEET_FILES.map((file) => [
    file,
    parseStylesheet(readStyleSheetFile(file)),
  ])
)

describe("stylesheet entry", () => {
  it("imports the toolchain and the local files in cascade order", () => {
    const entry = readStyleSheetFile("app.css")

    for (const packageName of TAILWIND_IMPORTS) {
      expect(entry).toContain(`@import "${packageName}"`)
    }

    expect(appStyleSheetFiles()).toEqual([
      "styles/theme.css",
      "styles/glass.css",
      "styles/accessibility.css",
      "styles/media.css",
      "styles/app-shell.css",
    ])
  })

  it("declares the override layer after the Tailwind import", () => {
    const entry = readStyleSheetFile("app.css")

    expect(entry).toContain("@layer overrides;")
    // Tailwind declares theme, base, components and utilities inside its own
    // import, so a later declaration is what puts overrides above utilities.
    expect(entry.indexOf("@layer overrides;")).toBeGreaterThan(
      entry.indexOf('@import "tailwindcss"')
    )
  })
})

describe("stylesheet layering", () => {
  it("uses only the three documented layers", () => {
    const names = new Set<string>()

    for (const parsed of PARSED.values()) {
      for (const name of parsed.layers) names.add(name)
    }

    expect([...names].sort()).toEqual(DOCUMENTED_LAYERS)
  })

  it("holds every style rule inside a layer", () => {
    const offenders = [...PARSED].flatMap(([file, parsed]) =>
      parsed.unlayeredSelectors.map((selector) => `${file}: ${selector}`)
    )

    expect(offenders).toEqual([])
  })

  it("keeps non-cascading at-rules out of every layer", () => {
    const offenders = [...PARSED].flatMap(([file, parsed]) =>
      parsed.nestedNonCascadingAtRules.map((name) => `${file}: @${name}`)
    )

    expect(offenders).toEqual([])

    const found = [...PARSED.values()].reduce(
      (total, parsed) => total + parsed.nonCascadingAtRuleCount,
      0
    )
    expect(found).toBeGreaterThan(0)
  })
})
