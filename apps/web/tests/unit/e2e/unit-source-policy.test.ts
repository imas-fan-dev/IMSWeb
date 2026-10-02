import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import * as ts from "typescript"
import { describe, expect, it } from "vitest"

const unitDirectory = resolve(process.cwd(), "tests/unit")

// File filter mirrors the unit Vitest include setting: directory tests/unit,
// then any {test,spec} file with a .ts or .tsx extension. Only collected test
// files are policed. Non-test helpers under support/ stay out of scope, and
// support/harness.tsx is the intended owner of the direct MemoryRouter import
// this policy funnels new tests toward.
const unitTestPattern = /\.(?:test|spec)\.(?:ts|tsx)$/

function isUnitTestFile(name: string) {
  return unitTestPattern.test(name)
}

async function unitTestNames(
  directory = unitDirectory,
  prefix = ""
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        return unitTestNames(join(directory, entry.name), name)
      }
      return entry.isFile() && isUnitTestFile(entry.name) ? [name] : []
    })
  )
  return nested.flat().sort()
}

function scriptKind(name: string) {
  return name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

async function unitTestSources() {
  const names = await unitTestNames()

  return Promise.all(
    names.map(async (name) => ({
      name,
      source: ts.createSourceFile(
        name,
        await readFile(join(unitDirectory, name), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        scriptKind(name)
      ),
    }))
  )
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

/**
 * Finds `vi.unstubAllGlobals()` calls, including computed and aliased member
 * access. Detection is AST-based, so this guard's own synthetic sources, which
 * only contain the spelling inside string literals, never count as a hit.
 */
function unstubAllGlobalsLines(source: ts.SourceFile) {
  const lines: number[] = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isDirect =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "vi" &&
        callee.name.text === "unstubAllGlobals"
      const isComputed =
        ts.isElementAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "vi" &&
        callee.argumentExpression !== undefined &&
        staticPropertyName(source, callee.argumentExpression) ===
          "unstubAllGlobals"
      if (isDirect || isComputed) {
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

/**
 * Lines of import declarations that pull the `MemoryRouter` value binding out
 * of `react-router`. Type-only imports, aliased type specifiers, other
 * modules, and the separate `createMemoryRouter` API do not count.
 */
function memoryRouterImportLines(source: ts.SourceFile) {
  const lines: number[] = []

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "react-router"
    ) {
      continue
    }
    const clause = statement.importClause
    if (!clause || clause.isTypeOnly || !clause.namedBindings) continue
    if (!ts.isNamedImports(clause.namedBindings)) continue

    const importsMemoryRouter = clause.namedBindings.elements.some(
      (element) =>
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === "MemoryRouter"
    )
    if (importsMemoryRouter) {
      lines.push(
        source.getLineAndCharacterOfPosition(statement.getStart()).line + 1
      )
    }
  }

  return lines
}

function importsMemoryRouterDirectly(source: ts.SourceFile) {
  return memoryRouterImportLines(source).length > 0
}

/**
 * Tests under `apps/web/tests/unit/` that already import `MemoryRouter`
 * directly when this policy landed. New tests use `renderPage` from
 * `tests/unit/support/harness` instead. Paths are relative to
 * `apps/web/tests/unit/`.
 *
 * This list is a migration ledger, not a permanent exemption: the liveness
 * test below fails when a listed file no longer imports `MemoryRouter`, so the
 * baseline only shrinks.
 */
const memoryRouterBaseline = new Set([
  "components/app/app-navigation-provider.test.tsx",
  "components/app/app-tab-bar.test.tsx",
  "components/app/app-top-bar.test.tsx",
  "components/community/namecard-upload-dialog.test.tsx",
  "components/editorial/community-post-detail.test.tsx",
  "components/navigation/navigation-link.test.tsx",
  "components/platform/platform-account-menu.test.tsx",
  "components/shared/admin-return-shortcut.test.tsx",
  "components/shared/site-header.test.tsx",
  "layouts/admin-layout.test.tsx",
  "layouts/app-layout.test.tsx",
  "layouts/public-layout.test.tsx",
  "pages/account/account-auth-app-layout.test.tsx",
  "pages/account/account-auth-page.test.tsx",
  "pages/account/account-me-page.test.tsx",
  "pages/account/account-me-section-page.test.tsx",
  "pages/account/account-security-page.test.tsx",
  "pages/admin/accounts/admin-accounts-page.test.tsx",
  "pages/admin/chronicle/admin-chronicle-page.test.tsx",
  "pages/admin/events/admin-events-page.test.tsx",
  "pages/admin/homepage/homepage-link-manager.test.tsx",
  "pages/admin/information/information-manager.test.tsx",
  "pages/admin/login/admin-login-page.test.tsx",
  "pages/admin/platform-email/admin-platform-email-page.test.tsx",
  "pages/admin/platform-oauth/admin-platform-oauth-page.test.tsx",
  "pages/admin/producer-map/producer-map-manager.test.tsx",
  "pages/admin/stories/components/story-manager.test.tsx",
  "pages/apps/apps-page.test.tsx",
  "pages/chronicle/chronicle-index-page.test.tsx",
  "pages/community/community-app-page.test.tsx",
  "pages/community/community-cards-page.test.tsx",
  "pages/community/community-exchange-app-page.test.tsx",
  "pages/community/community-exchange-map-section.test.tsx",
  "pages/community/community-office-page.test.tsx",
  "pages/community/community-page.test.tsx",
  "pages/community/exchange/community-exchange-me-page.test.tsx",
  "pages/community/exchange/community-exchange-session.test.tsx",
  "pages/community/exchange/components/exchange-mobile-navigation.test.tsx",
  "pages/community/exchange/me/profile-workspace-navigation.test.tsx",
  "pages/community/namecard-submission-page.test.tsx",
  "pages/events/event-detail-app-page.test.tsx",
  "pages/events/events-app-header.test.tsx",
  "pages/events/events-center.test.tsx",
  "pages/events/events-list.test.tsx",
  "pages/home/home-feed.test.tsx",
  "pages/home/home-sections.test.tsx",
  "pages/sites/site-detail-app-page.test.tsx",
  "pages/sites/site-detail-page.test.tsx",
  "pages/wiki/modern/story-page-app-layout.test.tsx",
  "pages/wiki/modern/story-page.test.tsx",
  "pages/wiki/modern/wiki-index-page.test.tsx",
  "pages/works/work-detail-app-layout.test.tsx",
  "pages/works/works-page.test.tsx",
])

function sourceFromText(text: string) {
  return ts.createSourceFile(
    "policy-example.test.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

describe("unit test source policy", () => {
  it("keeps global teardown in vitest.config.ts instead of vi.unstubAllGlobals()", async () => {
    const violations = (await unitTestSources()).flatMap(({ name, source }) =>
      unstubAllGlobalsLines(source).map((line) => `${name}:${line}`)
    )

    expect(violations).toEqual([])
  })

  it("detects vi.unstubAllGlobals behind property, computed, and aliased calls", () => {
    const source = sourceFromText(`
      afterEach(() => { vi.unstubAllGlobals() })
      vi["unstubAllGlobals"]()
      const method = "unstubAllGlobals"
      vi[method]()
      vi.clearAllMocks()
    `)

    expect(unstubAllGlobalsLines(source)).toHaveLength(3)
  })

  it("keeps direct MemoryRouter imports out of new unit tests", async () => {
    const violations = (await unitTestSources())
      .filter(({ name }) => !memoryRouterBaseline.has(name))
      .filter(({ source }) => importsMemoryRouterDirectly(source))
      .map(
        ({ name }) =>
          `${name}: import MemoryRouter from react-router directly; use renderPage from tests/unit/support/harness`
      )

    expect(violations).toEqual([])
  })

  it("keeps the MemoryRouter baseline live and shrinking", async () => {
    const directImporters = new Set(
      (await unitTestSources())
        .filter(({ source }) => importsMemoryRouterDirectly(source))
        .map(({ name }) => name)
    )
    const stale = [...memoryRouterBaseline]
      .filter((name) => !directImporters.has(name))
      .sort()

    expect(stale).toEqual([])
  })

  it("detects aliased value imports and ignores type-only or other-module imports", () => {
    const source = sourceFromText(`
      import { MemoryRouter } from "react-router"
      import { MemoryRouter as Router } from "react-router"
      import type { MemoryRouter } from "react-router"
      import { type MemoryRouter as TypeOnlyRouter } from "react-router"
      import { MemoryRouter as ReadonlyRouter } from "react-router-dom"
      import { createMemoryRouter } from "react-router"
      const element = <MemoryRouter />
    `)

    expect(memoryRouterImportLines(source)).toEqual([2, 3])
  })

  it("matches nested unit test source extensions", () => {
    const candidates = [
      "nested/example.test.ts",
      "nested/example.test.tsx",
      "nested/example.spec.tsx",
      "fixture.tsx",
      "support/harness.tsx",
      "example.test.js",
    ]

    expect(candidates.filter(isUnitTestFile)).toEqual(candidates.slice(0, 3))
  })
})
