import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { installFetchMock, jsonResponse } from "@/tests/unit/support/api-client"
import { invalidateNamecardCharacterCatalog } from "~/lib/api"
import {
  resetNamecardCharacterCatalogCache,
  useNamecardCharacterCatalog,
} from "~/lib/use-namecard-character-catalog"

const catalog = {
  agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
  categories: ["idol"],
  characters: [],
  units: [],
}

beforeEach(() => {
  resetNamecardCharacterCatalogCache()
})

afterEach(() => {
  resetNamecardCharacterCatalogCache()
})

describe("useNamecardCharacterCatalog", () => {
  it("reuses the API cache and reloads after invalidation without retaining an old successful promise", async () => {
    const updated = {
      ...catalog,
      agencies: [{ ...catalog.agencies[0], name: "更新企划" }],
    }
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(updated))
    const first = renderHook(() => useNamecardCharacterCatalog())
    await waitFor(() => expect(first.result.current.catalog).toEqual(catalog))
    first.unmount()
    const cached = renderHook(() => useNamecardCharacterCatalog())
    await waitFor(() => expect(cached.result.current.catalog).toEqual(catalog))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    cached.unmount()
    await invalidateNamecardCharacterCatalog()
    const fresh = renderHook(() => useNamecardCharacterCatalog())
    await waitFor(() => expect(fresh.result.current.catalog).toEqual(updated))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("shares one request between every picker on the page", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse(catalog)
    )

    const first = renderHook(() => useNamecardCharacterCatalog())
    const second = renderHook(() => useNamecardCharacterCatalog())

    await waitFor(() => {
      expect(first.result.current.catalog).toEqual(catalog)
    })
    await waitFor(() => {
      expect(second.result.current.catalog).toEqual(catalog)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.result.current.loading).toBe(false)
    expect(first.result.current.failed).toBe(false)
  })

  it("reports a failed load and retries after the cache is dropped", async () => {
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse(catalog))

    const first = renderHook(() => useNamecardCharacterCatalog())

    await waitFor(() => {
      expect(first.result.current.failed).toBe(true)
    })
    expect(first.result.current.catalog).toBeNull()
    expect(first.result.current.loading).toBe(false)

    resetNamecardCharacterCatalogCache()
    const second = renderHook(() => useNamecardCharacterCatalog())

    await waitFor(() => {
      expect(second.result.current.catalog).toEqual(catalog)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("stays idle while disabled and loads once enabled", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse(catalog)
    )

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNamecardCharacterCatalog(enabled),
      { initialProps: { enabled: false } }
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.catalog).toBeNull()

    rerender({ enabled: true })

    await waitFor(() => {
      expect(result.current.catalog).toEqual(catalog)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
