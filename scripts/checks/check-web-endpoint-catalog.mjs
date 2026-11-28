#!/usr/bin/env node

// Static field check: every API endpoint the Web client calls with a literal
// path must be resolvable by the browser-lane contract catalog. Without this,
// a new endpoint only surfaces as `unregistered request: GET /api/...` inside a
// Playwright run - which is how the sign-in consent change (#112) turned one
// new request into a red `main`, a follow-up fix PR and a blocked deploy.
//
// The check imports the real `resolveApiContract` from the Playwright fixtures
// instead of re-implementing its matching rules, so the catalog stays the single
// source of truth. Endpoints that were already uncatalogued when this guard was
// introduced live in `web-endpoint-catalog-baseline.json`; new ones fail, and an
// entry that starts resolving must be deleted, so that list can only shrink.
//
// Template-literal paths (`apiPath(`/cards/${id}`)`) are runtime values and stay
// with the dispatcher's runtime assertion.
import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const apiRoot = join(repositoryRoot, "apps/web/app/lib/api")
const catalogModule = join(
  repositoryRoot,
  "apps/web/tests/e2e/fixtures/api-contract-catalog.ts"
)
const baselineFile = join(
  repositoryRoot,
  "scripts/checks/web-endpoint-catalog-baseline.json"
)
const httpMethods = new Set(["Get", "Post", "Put", "Patch", "Delete"])
const wirePathPrefix = "/api/"

const webRequire = createRequire(join(repositoryRoot, "apps/web/package.json"))
const ts = (await import(
  pathToFileURL(webRequire.resolve("typescript")).href
)).default
const contractsPaths = await import(
  pathToFileURL(webRequire.resolve("@imsweb/contracts/paths")).href
)

async function clientModules(directory = apiRoot) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) return clientModules(full)
      return entry.isFile() && entry.name.endsWith(".ts") ? [full] : []
    })
  )
  return nested.flat().sort()
}

function staticText(expression) {
  if (!expression) return undefined
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  return undefined
}

function pathBuilder(expression) {
  if (!ts.isIdentifier(expression) || !expression.text.endsWith("Path")) {
    return undefined
  }
  const builder = contractsPaths[expression.text]
  return typeof builder === "function" ? builder : undefined
}

function endpointCalls(source, file) {
  const calls = []

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      httpMethods.has(node.expression.name.text)
    ) {
      const builderCall = node.arguments[0]
      if (
        builderCall &&
        ts.isCallExpression(builderCall) &&
        builderCall.arguments.length === 1
      ) {
        const builder = pathBuilder(builderCall.expression)
        const fragment = staticText(builderCall.arguments[0])
        if (builder && fragment !== undefined) {
          const path = builder(fragment)
          if (path.startsWith(wirePathPrefix)) {
            calls.push({
              key: `${node.expression.name.text.toUpperCase()} ${path}`,
              location: `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
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
      return endpointCalls(source, module.replace(`${apiRoot}/`, "app/lib/api/"))
    })
  )
  const unique = new Map()
  for (const call of perModule.flat()) {
    if (!unique.has(call.key)) unique.set(call.key, call)
  }
  return [...unique.values()].sort((left, right) =>
    left.key.localeCompare(right.key)
  )
}

function catalogResolves(resolveApiContract, key) {
  const [method, path] = key.split(" ")
  try {
    resolveApiContract(method, path)
    return true
  } catch {
    return false
  }
}

async function main() {
  const [calls, baseline, catalog] = await Promise.all([
    wireEndpointCalls(),
    readFile(baselineFile, "utf8").then(JSON.parse),
    import(pathToFileURL(catalogModule).href),
  ])

  if (calls.length < 50) {
    console.error(
      `check-web-endpoint-catalog: scanned only ${calls.length} endpoint call(s); the client modules moved or the scan broke`
    )
    return 1
  }

  const { resolveApiContract } = catalog
  if (typeof resolveApiContract !== "function") {
    console.error(
      "check-web-endpoint-catalog: the Playwright contract catalog must export resolveApiContract"
    )
    return 1
  }

  const allowed = new Set(baseline)
  const missing = calls.filter(
    (call) =>
      !allowed.has(call.key) && !catalogResolves(resolveApiContract, call.key)
  )
  const stale = baseline.filter((key) => catalogResolves(resolveApiContract, key))

  if (missing.length > 0) {
    console.error(
      "check-web-endpoint-catalog: new Web API endpoints are missing a contract catalog entry"
    )
    for (const call of missing) {
      console.error(`  - ${call.key} (${call.location})`)
    }
    console.error(
      "\nAdd them to apps/web/tests/e2e/fixtures/api-contract-catalog.ts (and a probe to" +
        " apps/web/tests/e2e/fixtures/test.ts when the browser lanes reach them)."
    )
  }

  if (stale.length > 0) {
    console.error(
      "check-web-endpoint-catalog: the baseline still lists endpoints the catalog resolves"
    )
    for (const key of stale) console.error(`  - ${key}`)
    console.error(
      `\nRemove them from ${baselineFile.replace(`${repositoryRoot}/`, "")}; the list may only shrink.`
    )
  }

  if (missing.length > 0 || stale.length > 0) return 1

  console.log(
    `endpoint catalog check passed: ${calls.length} literal endpoint call(s), ${baseline.length} known uncatalogued`
  )
  return 0
}

process.exitCode = await main()
