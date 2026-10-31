import { expect, it, vi } from "vitest"
import { createMapboxRasterSource } from "~/lib/api"

const config = {
  provider: "mapbox" as const,
  accessToken: "pk.public-test-token",
  styleUrl: "mapbox://styles/owner/published-style",
}
it("requests retina pixels without changing the tile's coordinate or published style zoom", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response("image", { headers: { "content-type": "image/png" } })
    )
  vi.stubGlobal("fetch", fetch)
  const source = createMapboxRasterSource(
    config,
    new AbortController().signal,
    2
  )
  await source(213, 110, 8)
  expect(fetch.mock.calls[0]![0].pathname).toBe(
    "/styles/v1/owner/published-style/tiles/256/8/213/110@2x"
  )
})

it("uses official published-style raster tiles, wraps world copies and shares bounded view-local requests without portal credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(new Blob(["image"]), {
      headers: { "content-type": "image/png" },
    })
  )
  vi.stubGlobal("fetch", fetch)
  const source = createMapboxRasterSource(config, new AbortController().signal)
  const [a, b] = await Promise.all([source(-1, 2, 3), source(7, 2, 3)])
  expect(a).toBe(b)
  expect(fetch).toHaveBeenCalledOnce()
  const [url, request] = fetch.mock.calls[0]!
  expect(url.pathname).toBe("/styles/v1/owner/published-style/tiles/256/3/7/2")
  expect(url.searchParams.get("access_token")).toBe(config.accessToken)
  expect(request).toMatchObject({ credentials: "omit", redirect: "error" })
  expect(request.headers).toBeUndefined()
})
it("does not retain failed requests or leak vendor bodies and aborts before requesting a tile", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("private vendor diagnostic", { status: 403 })
    )
    .mockResolvedValueOnce(
      new Response("image", { headers: { "content-type": "image/png" } })
    )
  vi.stubGlobal("fetch", fetch)
  const controller = new AbortController(),
    source = createMapboxRasterSource(config, controller.signal)
  await expect(source(1, 1, 3)).rejects.toMatchObject({
    kind: "authorization",
    message: "海外地图未获授权，请联系管理员检查 Mapbox Token 和发布样式。",
  })
  await expect(source(1, 1, 3)).resolves.toBeInstanceOf(Blob)
  controller.abort()
  await expect(source(2, 1, 3)).rejects.toMatchObject({ name: "AbortError" })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it("keeps a newer tile cached when an older evicted request fails late", async () => {
  let rejectOld: (error: Error) => void = () => {}
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response("image", { headers: { "content-type": "image/png" } })
      )
    )
  fetch.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject
      })
  )
  vi.stubGlobal("fetch", fetch)
  const source = createMapboxRasterSource(config, new AbortController().signal)
  const old = expect(source(0, 0, 7)).rejects.toMatchObject({
    kind: "resource",
  })
  for (let x = 1; x <= 64; x++) await source(x, 0, 7)
  const replacement = await source(0, 0, 7)
  rejectOld(new Error("private vendor diagnostic"))
  await old
  expect(await source(0, 0, 7)).toBe(replacement)
  expect(fetch).toHaveBeenCalledTimes(66)
})
