import * as matchers from "@testing-library/jest-dom/matchers"
import { cleanup } from "@testing-library/react"
import { invalidateCache } from "alova"
import { afterEach, expect } from "vitest"

import { i18n } from "~/i18n/config"
import { defaultLanguage } from "~/i18n/resources"

expect.extend(matchers)

afterEach(async () => {
  cleanup()
  await invalidateCache()
  await i18n.changeLanguage(defaultLanguage)
})
