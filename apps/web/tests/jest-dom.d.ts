import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"

declare global {
  namespace Chai {
    // Vitest 4 derives its matcher surface from this declaration-merged interface.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Assertion extends TestingLibraryMatchers<unknown, void> {}
  }
}

export {}
