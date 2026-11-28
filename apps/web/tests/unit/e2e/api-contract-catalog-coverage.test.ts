import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import * as contractsPaths from "@imsweb/contracts/paths"
import * as ts from "typescript"
import { describe, expect, it } from "vitest"

import { resolveApiContract } from "../../e2e/fixtures/api-contract-catalog"
import uncatalogued from "./api-contract-catalog-coverage.gaps.json"

// Every endpoint the Web API client calls must be resolvable by
// `resolveApiContract`, otherwise the browser lanes only discover it as
// `unregistered request: GET /api/...` minutes into a Playwright run, after the
// page under test has already loaded. That is how the sign-in consent change
// (#112) turned a one-line API addition into a red `main`, a second fix PR and
// a blocked tag deploy.
//
// The scan is deliberately static: it reads the API client modules, takes the
// literal path a builder such as `apiPath("/privacy-policy")` produces, and asks
// the catalog to resolve it. Template literals and builders with computed
// arguments stay out of scope - they carry runtime identifiers, so no static
// rule can name every path they produce.
const apiRoot = resolve(process.cwd(), "app/lib/api")
const httpMethods = new Set(["Get", "Post", "Put", "Patch", "Delete"])
const wirePathPrefix = "/api/"
const sourcePattern = /\.ts$/

type EndpointCall = {
  /** `METHOD /path`, the identity the catalog and the baseline both use. */
  key: string
  /** Repository-relative module that issues the call. */
  file: string
  line: number
}

async function clientModules(directory = apiRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) return clientModules(full)
      return entry.isFile() && sourcePattern.test(entry.name) ? [full] : []
    })
  )
  return nested.flat().sort()
}

function staticText(expression: ts.Expression | undefined) {
  if (!expression) return null
  if (ts.isStringLiteral(expression)) return expression.text
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  return null
}

function pathBuilder(expression: ts.Expression) {
  if (!ts.isIdentifier(expression) || !expression.text.endsWith("Path")) {
    return null
  }
  const builder = (contractsPaths as Record<string, unknown>)[expression.text]
  return typeof builder === "function"
    ? (builder as (fragment: string) => string)
    : null
}

function endpointCalls(source: ts.SourceFile, file: string): EndpointCall[] {
  const calls: EndpointCall[] = []

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      httpMethods.has(node.expression.name.text)
    ) {
      const builderCall = node.arguments[0]
      if (builderCall && ts.isCallExpression(builderCall)) {
        const builder = pathBuilder(builderCall.expression)
        const fragment = staticText(builderCall.arguments[0])
        if (
          builder &&
          fragment !== null &&
          builderCall.arguments.length === 1
        ) {
          const path = builder(fragment)
          if (path.startsWith(wirePathPrefix)) {
            calls.push({
              key: `${node.expression.name.text.toUpperCase()} ${path}`,
              file,
              line:
                source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return calls
}

async function wireEndpointCalls() {
  const modules = await clientModules()
  const perModule = await Promise.all(
    modules.map(async (module) => {
      const source = ts.createSourceFile(
        module,
        await readFile(module, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      )
      return endpointCalls(
        source,
        module.replace(`${apiRoot}/`, "app/lib/api/")
      )
    })
  )
  const unique = new Map<string, EndpointCall>()
  for (const call of perModule.flat()) {
    if (!unique.has(call.key)) unique.set(call.key, call)
  }
  return [...unique.values()].sort((left, right) =>
    left.key.localeCompare(right.key)
  )
}

function catalogResolves(key: string) {
  const [method, path] = key.split(" ")
  try {
    resolveApiContract(method, path)
    return true
  } catch {
    return false
  }
}

describe("e2e contract catalog coverage", () => {
  it("keeps the static scan pointed at the API client modules", async () => {
    // A refactor that moves the client modules would otherwise make this guard
    // pass by scanning nothing.
    const calls = await wireEndpointCalls()
    expect(calls.length).toBeGreaterThan(50)
  })

  it("requires a catalog entry for every newly wired endpoint", async () => {
    const calls = await wireEndpointCalls()
    const allowed = new Set<string>(uncatalogued)
    const missing = calls.filter(
      (call) => !allowed.has(call.key) && !catalogResolves(call.key)
    )

    expect(
      missing.map((call) => `${call.key} (${call.file}:${call.line})`)
    ).toEqual([])
  })

  it("drops baseline entries that the catalog now resolves", async () => {
    // The baseline records debt; leaving a resolved entry behind would let a
    // later regression hide inside it.
    const relocated = uncatalogued.filter((key) => catalogResolves(key))

    expect(relocated).toEqual([])
  })
})
