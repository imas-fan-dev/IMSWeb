import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import process from "node:process"
import console from "node:console"
import { verifyReadingScroll } from "./verify-exchange-side-geometry.mjs"

const [beforePath, afterPath] = process.argv.slice(2)
assert(
  beforePath && afterPath,
  "Usage: node verify-exchange-reading-scroll.mjs <before-json> <after-json>"
)
const nodes = (path) => {
  const result = []
  function visit(node) {
    if (node.attributes) result.push(node.attributes)
    for (const child of node.children ?? []) visit(child)
  }
  visit(JSON.parse(readFileSync(path, "utf8")))
  return result
}
verifyReadingScroll(nodes(beforePath), nodes(afterPath))
console.log(
  "PASS fixed essential rows and fully exposed footer after intentional reading scroll; inspect and tap actual visible controls separately"
)
