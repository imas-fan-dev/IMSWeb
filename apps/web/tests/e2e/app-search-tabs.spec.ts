import { expect, test } from "./fixtures/test"
import {
  exerciseUnifiedSearch,
  installUnifiedSearchApis,
} from "./fixtures/exchange-search"

test("App DOM search separates offices and places while retaining its input @app-iphone @app-android @app-landscape", async ({
  api,
  page,
}, info) => {
  const queries = await installUnifiedSearchApis(api)
  await exerciseUnifiedSearch(page, info, true)
  expect(queries).toContain("上海")
})
