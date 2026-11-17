import { describe, expect, it } from "vitest"
import { adminCatalogSchema } from "@imsweb/contracts/catalog"
import { createAdminCatalog } from "@/mocks/data/catalog"

describe("catalog fixtures", () => {
  it("conforms without changing wire data", () => {
    const data = createAdminCatalog()
    expect(adminCatalogSchema.parse(data)).toEqual(data)
  })
})
