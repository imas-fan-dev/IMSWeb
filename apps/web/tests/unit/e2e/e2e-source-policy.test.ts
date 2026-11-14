import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import * as ts from "typescript"
import { describe, expect, it } from "vitest"

const e2eDirectory = resolve(process.cwd(), "tests/e2e")
const e2eSpecPattern = /\.(?:spec|test)\.(?:[cm]?[jt]sx?)$/

function isE2ESpecFile(name: string) {
  return e2eSpecPattern.test(name)
}

async function e2eSpecNames(
  directory = e2eDirectory,
  prefix = ""
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        return e2eSpecNames(join(directory, entry.name), name)
      }
      return entry.isFile() && isE2ESpecFile(entry.name) ? [name] : []
    })
  )
  return nested.flat().sort()
}

function scriptKind(name: string) {
  if (/\.(?:[cm]?tsx|jsx)$/.test(name)) return ts.ScriptKind.TSX
  if (/\.(?:[cm]?js)$/.test(name)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

async function e2eSources() {
  const names = await e2eSpecNames()

  return Promise.all(
    names.map(async (name) => ({
      name,
      source: ts.createSourceFile(
        name,
        await readFile(join(e2eDirectory, name), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        scriptKind(name)
      ),
    }))
  )
}

function fixedWaitLines(source: ts.SourceFile) {
  const lines: number[] = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const method = calledMethodName(source, callee)
      const text = callee.getText(source).replaceAll(/\s/g, "")
      const isTimer =
        (method === "setTimeout" || method === "setInterval") &&
        (ts.isIdentifier(callee) ||
          /^(?:window|globalThis|self)(?:\.|\[)/.test(text))
      const isElapsedClock =
        method === "now" && /(?:^|\.)(?:Date|performance)(?:\.|\[)/.test(text)
      if (method === "waitForTimeout" || isTimer || isElapsedClock) {
        lines.push(
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        )
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return lines
}

function importsTestFrom(source: ts.SourceFile, moduleName: string) {
  return source.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName ||
      statement.importClause?.isTypeOnly ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      return false
    }

    return statement.importClause.namedBindings.elements.some(
      (element) =>
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === "test"
    )
  })
}

type DirectApiRoute = {
  line: number
  matcher: string
}

function staticPropertyName(
  source: ts.SourceFile,
  expression: ts.Expression,
  seen = new Set<string>()
): string | null {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text
  }
  if (ts.isIdentifier(expression) && !seen.has(expression.text)) {
    const initializer = variableInitializer(source, expression.text)
    if (initializer) {
      seen.add(expression.text)
      return staticPropertyName(source, initializer, seen)
    }
  }
  return null
}

function calledMethodName(source: ts.SourceFile, expression: ts.Expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression
  ) {
    return staticPropertyName(source, expression.argumentExpression)
  }
  return null
}

function variableInitializer(source: ts.SourceFile, name: string) {
  let initializer: ts.Expression | undefined

  function visit(node: ts.Node) {
    if (
      !initializer &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      initializer = node.initializer
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return initializer
}

function propertyNameText(name: ts.PropertyName) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text
  }
  return null
}

function objectPropertyInitializer(
  source: ts.SourceFile,
  expression: ts.Expression,
  property: string,
  seen: Set<string>
): ts.Expression | undefined {
  let target = expression
  if (ts.isIdentifier(target) && !seen.has(target.text)) {
    const initializer = variableInitializer(source, target.text)
    if (!initializer) return undefined
    seen.add(target.text)
    target = initializer
  }
  if (!ts.isObjectLiteralExpression(target)) return undefined
  const member = target.properties.find(
    (candidate) =>
      (ts.isPropertyAssignment(candidate) ||
        ts.isShorthandPropertyAssignment(candidate)) &&
      propertyNameText(candidate.name) === property
  )
  if (member && ts.isPropertyAssignment(member)) return member.initializer
  if (member && ts.isShorthandPropertyAssignment(member)) {
    return variableInitializer(source, member.name.text)
  }
  return undefined
}

function staticMatcherText(
  source: ts.SourceFile,
  expression: ts.Expression,
  seen = new Set<string>()
): string | null {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression) ||
    ts.isRegularExpressionLiteral(expression)
  ) {
    return expression.getText(source)
  }
  if (ts.isTemplateExpression(expression)) {
    const parts = [
      expression.head.text,
      ...expression.templateSpans.flatMap((span) => [
        staticMatcherText(source, span.expression, new Set(seen)),
        span.literal.text,
      ]),
    ]
    return parts.some((part) => part === null) ? null : parts.join("")
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticMatcherText(source, expression.left, new Set(seen))
    const right = staticMatcherText(source, expression.right, new Set(seen))
    return left === null || right === null ? null : `${left}${right}`
  }
  if (ts.isIdentifier(expression) && !seen.has(expression.text)) {
    const initializer = variableInitializer(source, expression.text)
    if (initializer) {
      seen.add(expression.text)
      return staticMatcherText(source, initializer, seen)
    }
    return null
  }
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      ts.isNewExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === "URL" &&
      (expression.name.text === "href" || expression.name.text === "origin")
    ) {
      const path = expression.expression.arguments?.[0]
      return path ? staticMatcherText(source, path, new Set(seen)) : null
    }
    const initializer = objectPropertyInitializer(
      source,
      expression.expression,
      expression.name.text,
      new Set(seen)
    )
    return initializer
      ? staticMatcherText(source, initializer, new Set(seen))
      : null
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression
  ) {
    const property = staticPropertyName(
      source,
      expression.argumentExpression,
      new Set(seen)
    )
    const initializer = property
      ? objectPropertyInitializer(
          source,
          expression.expression,
          property,
          new Set(seen)
        )
      : undefined
    return initializer
      ? staticMatcherText(source, initializer, new Set(seen))
      : null
  }
  if (
    ts.isNewExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "RegExp"
  ) {
    const parts = (expression.arguments ?? []).map((argument) =>
      staticMatcherText(source, argument, new Set(seen))
    )
    return parts.some((part) => part === null) ? null : parts.join("")
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression.getText(source)
  }
  return null
}

function targetsApi(source: ts.SourceFile, matcher: ts.Expression | undefined) {
  if (!matcher) return true
  const text = staticMatcherText(source, matcher)
  return text === null || text.replaceAll("\\", "").includes("/api")
}

function directApiRoutes(source: ts.SourceFile) {
  const routes: DirectApiRoute[] = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const method = calledMethodName(source, node.expression)
      const isApiRoute =
        method === "route" && targetsApi(source, node.arguments[0])
      const isHarRoute = method === "routeFromHAR"
      if (!isApiRoute && !isHarRoute) {
        ts.forEachChild(node, visit)
        return
      }
      routes.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        matcher: isHarRoute
          ? "routeFromHAR"
          : node.arguments[0]!.getText(source),
      })
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return routes
}

function sourceFromText(text: string) {
  return ts.createSourceFile(
    "policy-example.spec.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
}

describe("E2E source policy", () => {
  it("uses observable conditions or controlled clocks instead of fixed waits", async () => {
    const violations = (await e2eSources()).flatMap(({ name, source }) =>
      fixedWaitLines(source).map((line) => `${name}:${line}`)
    )

    expect(violations).toEqual([])
  })

  it("detects fixed waits hidden behind elapsed-time polling", () => {
    const source = sourceFromText(`
      await expect.poll(() => page.evaluate(() => performance.now())).toBeGreaterThan(100)
      await expect.poll(() => page.evaluate(() => Date.now())).toBeGreaterThan(100)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
      await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 100)))
      await page.evaluate(() => globalThis.setTimeout(callback, 100))
      await page.evaluate(() => setInterval(callback, 100))
    `)

    expect(fixedWaitLines(source)).toHaveLength(6)
  })

  it("matches nested Playwright spec and test source extensions", () => {
    const candidates = [
      "nested/example.spec.tsx",
      "nested/example.test.mts",
      "example.spec.cjs",
      "example.test.jsx",
      "fixture.ts",
      "example.test.md",
    ]

    expect(candidates.filter(isE2ESpecFile)).toEqual(candidates.slice(0, 4))
  })

  it("installs the automatic API fixture in every E2E spec", async () => {
    const violations = (await e2eSources()).flatMap(({ name, source }) => {
      const reasons: string[] = []
      if (!importsTestFrom(source, "./fixtures/test")) {
        reasons.push(`${name}: missing ./fixtures/test value import`)
      }
      if (importsTestFrom(source, "@playwright/test")) {
        reasons.push(`${name}: imports test directly from @playwright/test`)
      }
      return reasons
    })

    expect(violations).toEqual([])
  })

  it("keeps JSON API routes behind the dispatcher", async () => {
    const sources = await e2eSources()
    const routes = sources.flatMap(({ name, source }) =>
      directApiRoutes(source).map((route) => ({ name, ...route }))
    )
    const violations = routes.map(
      ({ name, line, matcher }) => `${name}:${line} (${matcher})`
    )

    expect(violations).toEqual([])
  })

  it("detects API route aliases, variables, computed calls, regexes, and HARs", () => {
    const bypasses = [
      `const alias = page; alias.route("**/api/**", handler)`,
      `const matcher = "**/api/**"; context.route(matcher, handler)`,
      `page["route"]("**/api/**", handler)`,
      `const method = "route"; page[method]("**/api/**", handler)`,
      `const matchers = { api: "**/api/**" }; page.route(matchers.api, handler)`,
      `function register(page, matcher) { page.route(matcher, handler) } register(page, "**/api/**")`,
      String.raw`page.route(/\/api\//, handler)`,
      `page.routeFromHAR("api.har")`,
    ]

    for (const bypass of bypasses) {
      expect(directApiRoutes(sourceFromText(bypass)), bypass).toHaveLength(1)
    }
  })
})
