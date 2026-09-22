import { render } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"

import { i18n } from "~/i18n/config"
import { defaultNamespace } from "~/i18n/resources"

/**
 * Pins a test to the application's real i18n instance and namespace.
 *
 * Use it as `render(<Subject />, { wrapper: I18nTestProvider })`.
 */
export function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  )
}

/**
 * Renders one page inside a `MemoryRouter`, defaulting to `/`.
 *
 * Deliberately wraps nothing else: page tests that need an extra provider
 * compose it around `ui` themselves, and `vi.mock(...)` stays in the test file
 * because it is hoisted and bound to that file's scope.
 */
export function renderPage(
  ui: ReactElement,
  options: { route?: string } = {}
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
  )
}
