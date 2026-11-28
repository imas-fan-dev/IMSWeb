#!/usr/bin/env node

// Static field check: every locale must carry the same translation fields as
// the reference locale. This is the check that failed on `main` when the
// sign-in consent copy (#112) added six `common.auth.privacy.*` keys to
// `zh-CN` only: the English sign-in page silently fell back to Chinese text,
// and nothing local noticed until the Web unit suite ran in CI.
//
// The hook deliberately runs this as a field check instead of executing the
// Web unit suite: `apps/web/tests/unit/i18n/language.test.ts` still owns the
// same invariant inside the suite, and CI keeps running that suite.
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const resourcesModule = join(repositoryRoot, "apps/web/app/i18n/resources.ts")
const referenceLocale = "zh-CN"

function translationKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === "object" && child !== null
      ? translationKeys(child, path)
      : path
  })
}

async function main() {
  let module
  try {
    module = await import(pathToFileURL(resourcesModule).href)
  } catch (error) {
    console.error(
      `check-web-i18n-keys: cannot load ${resourcesModule}: ${error.message}`
    )
    return 1
  }

  const { resources } = module
  if (!resources || typeof resources !== "object") {
    console.error(
      "check-web-i18n-keys: resources.ts must export the `resources` map"
    )
    return 1
  }

  const reference = resources[referenceLocale]
  if (!reference) {
    console.error(
      `check-web-i18n-keys: ${referenceLocale} is the reference locale and must exist`
    )
    return 1
  }

  const expected = translationKeys(reference)
  const expectedSet = new Set(expected)
  const failures = []

  for (const [locale, tree] of Object.entries(resources)) {
    if (locale === referenceLocale) continue
    const actual = new Set(translationKeys(tree))
    const missing = expected.filter((key) => !actual.has(key))
    const extra = [...actual].filter((key) => !expectedSet.has(key))
    if (missing.length > 0) {
      failures.push(`${locale} is missing ${missing.length} field(s):`)
      for (const key of missing.slice(0, 20)) failures.push(`  - ${key}`)
      if (missing.length > 20) {
        failures.push(`  ... ${missing.length - 20} more`)
      }
    }
    if (extra.length > 0) {
      failures.push(`${locale} has ${extra.length} field(s) ${referenceLocale} lacks:`)
      for (const key of extra.slice(0, 20)) failures.push(`  - ${key}`)
      if (extra.length > 20) {
        failures.push(`  ... ${extra.length - 20} more`)
      }
    }
  }

  if (failures.length > 0) {
    console.error("check-web-i18n-keys: locale fields drifted")
    for (const line of failures) console.error(line)
    console.error(
      `\nAdd the field to every locale in apps/web/app/i18n/resources.ts (${expected.length} fields expected).`
    )
    return 1
  }

  console.log(
    `i18n field check passed: ${Object.keys(resources).length} locale(s) match ${referenceLocale} (${expected.length} fields)`
  )
  return 0
}

process.exitCode = await main()
