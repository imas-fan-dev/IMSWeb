import { setImmediate } from "node:timers/promises"
import { expect, it } from "vitest"
import { reverseFudabaPlace, sendWithAbort } from "~/lib/api"
import { installFetchMock, requestFrom } from "@/tests/unit/support/api-client"

const point = { longitude: 121.47370123, latitude: 31.23041678 }
const response = {
  place: {
    id: "address.123",
    label: "人民广场",
    city: "上海市",
    address: "中华人民共和国上海市黄浦区200021",
    location: { ...point, precision: "exact" },
  },
  attribution: { text: "© Mapbox", url: "https://www.mapbox.com/about/maps/" },
}

it("exposes an authenticated same-origin Alova method and preserves the parsed DTO", async () => {
  const fetchMock = installFetchMock(async () => Response.json(response))
  expect(await reverseFudabaPlace(point).send()).toEqual(response)
  const request = requestFrom(...fetchMock.mock.calls[0]!)
  const url = new URL(request.url)
  expect(url.pathname).toBe("/api/community/exchange/places/reverse")
  expect(Object.fromEntries(url.searchParams)).toEqual({
    longitude: String(point.longitude),
    latitude: String(point.latitude),
  })
  expect(request.method).toBe("GET")
  expect(request.credentials).toBe("same-origin")
  expect(request.headers.has("X-CSRF-Token")).toBe(false)
})

it.each([
  { place: null, attribution: null },
  { ...response, place: { ...response.place, city: "", address: "某路 1 号" } },
  { ...response, place: { ...response.place, city: "上海市", address: "" } },
])("accepts empty or partial geocoding results: %j", async (payload) => {
  installFetchMock(async () => Response.json(payload))
  expect(await reverseFudabaPlace(point).send()).toEqual(payload)
})

it("rejects invalid coordinates and unknown query fields before sending", () => {
  const fetchMock = installFetchMock()
  expect(() => reverseFudabaPlace({ ...point, longitude: 181 })).toThrow()
  expect(() => reverseFudabaPlace({ ...point, latitude: NaN })).toThrow()
  expect(() => reverseFudabaPlace({ ...point, latitude: -91 })).toThrow()
  expect(() =>
    reverseFudabaPlace({ ...point, city: "上海" } as typeof point)
  ).toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
  { ...response, privateToken: "unexpected" },
  { ...response, place: { ...response.place, city: undefined } },
  {
    ...response,
    place: { ...response.place, location: { ...point, precision: "regional" } },
  },
  { ...response, attribution: { text: "© Mapbox", url: "not-a-url" } },
])("rejects malformed success contracts: %j", async (payload) => {
  installFetchMock(async () => Response.json(payload))
  await expect(reverseFudabaPlace(point).send()).rejects.toMatchObject({
    kind: "contract",
    code: "CONTRACT_VIOLATION",
  })
})

it.each([502, 200])("parses errors for HTTP status %s", async (status) => {
  const payload = { success: false, code: "FUDABA_PLACE_REVERSE_FAILED" }
  installFetchMock(async () => Response.json(payload, { status }))
  await expect(reverseFudabaPlace(point).send()).rejects.toMatchObject({
    kind: status === 200 ? "business" : "http",
    code: payload.code,
    payload,
  })
})

it.each([502, 200])(
  "rejects malformed error contracts for HTTP status %s",
  async (status) => {
    installFetchMock(async () =>
      Response.json({ success: false, code: 123 }, { status })
    )
    await expect(reverseFudabaPlace(point).send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
    })
  }
)

it("isolates concurrent reverse cancellation and refetches after completion", async () => {
  const transports: { signal: AbortSignal; release(): void }[] = []
  let admit!: () => void
  const admitted = new Promise<void>((resolve) => {
    admit = resolve
  })
  installFetchMock((input, init) => {
    const request = requestFrom(input, init)
    return new Promise<Response>((resolve, reject) => {
      transports.push({
        signal: request.signal,
        release: () => resolve(Response.json(response)),
      })
      request.signal.addEventListener(
        "abort",
        () => {
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true }
      )
      admit()
    })
  })
  const controller = new AbortController()
  const pending = sendWithAbort(
    reverseFudabaPlace(point),
    controller.signal
  ).then(
    () => "unexpected",
    () => "cancelled"
  )
  await admitted
  const independent = reverseFudabaPlace(point).send()
  await setImmediate()
  controller.abort()
  for (const transport of transports) transport.release()
  expect(await pending).toBe("cancelled")
  expect(await independent).toEqual(response)
  expect(transports).toHaveLength(2)
  expect(transports.filter(({ signal }) => signal.aborted)).toHaveLength(1)
  const fetchMock = installFetchMock(async () => Response.json(response))
  expect(await reverseFudabaPlace(point).send()).toEqual(response)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
