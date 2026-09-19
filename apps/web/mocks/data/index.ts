/**
 * Contract-typed domain factories, shared by the development mock server, the
 * unit tests, and (later) the Playwright API dispatcher.
 *
 * Each module beside this barrel is a hand-written instance of one
 * `@imsweb/contracts` response shape. `schema-conformance.ts` is what keeps
 * those instances honest when a contract moves, and it is deliberately not
 * re-exported here: it is a test-side helper, not mock data.
 */
export * from "./about"
export * from "./chronicle"
export * from "./community"
export * from "./editorial"
export * from "./events"
export * from "./fudaba"
export * from "./homepage-links"
export * from "./information"
export * from "./live"
export * from "./namecards"
export * from "./platform"
export * from "./producer-map"
export * from "./recommendations"
export * from "./site-packages"
export * from "./wiki"
