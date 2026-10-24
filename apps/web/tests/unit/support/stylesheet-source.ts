import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const APP_ROOT = resolve(process.cwd(), "app")
const ENTRY_FILE = "app.css"

/**
 * The entry stylesheet’s local `@import` targets, as `app/`-relative paths in
 * cascade order.
 *
 * Parsed from the entry rather than listed here, so a future split keeps every
 * caller honest instead of silently reading a stale set of files.
 */
export function appStyleSheetFiles(): string[] {
  const files = [
    ...readStyleSheetFile(ENTRY_FILE).matchAll(/@import\s+"\.\/([^"]+)"/g),
  ].map((match) => match[1])

  if (files.length === 0) {
    throw new Error(
      `${ENTRY_FILE} declares no local @import, so no stylesheet can be read`
    )
  }

  return files
}

/** One stylesheet’s source, resolved against `app/`. */
export function readStyleSheetFile(relativePath: string): string {
  return readFileSync(resolve(APP_ROOT, relativePath), "utf8")
}

/**
 * The entry stylesheet plus every local import, joined in cascade order.
 *
 * Assertions that slice a rule body or a keyframe block out of the source keep
 * working across the split, because each rule is carried over with its own
 * braces and indentation intact.
 */
export function readAppStylesheet(): string {
  return [
    readStyleSheetFile(ENTRY_FILE),
    ...appStyleSheetFiles().map((file) => readStyleSheetFile(file)),
  ].join("\n")
}
