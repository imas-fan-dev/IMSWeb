// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import {
  createAMapServiceProxy,
  localAMapServiceProxy,
  readLocalAMapCredentials,
} from "@/vite-amap-service-proxy"

const credentials = { apiKey: "a".repeat(32), securityJsCode: "b".repeat(32) }
const servers: Server[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
  directories
    .splice(0)
    .forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

async function serve(handler: ReturnType<typeof createAMapServiceProxy>) {
  const server = createServer((req, res) =>
    handler(req, res, () => res.end("not-proxied"))
  )
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("missing test server address")
  return `http://127.0.0.1:${address.port}`
}

it("forwards coordinate JSONP to the fixed REST host and injects the server-only security code", async () => {
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response("callback({status:1})", {
        headers: { "Content-Type": "application/javascript" },
      })
  )
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  const response = await fetch(
    `${origin}/_AMapService/v3/assistant/coordinate/convert?key=${credentials.apiKey}&locations=121.4,31.2&coordsys=gps&callback=callback`
  )
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("callback({status:1})")
  expect(response.headers.get("content-type")).toBe("application/javascript")
  const upstream = new URL(String(transport.mock.calls[0]![0]))
  expect(upstream.origin).toBe("https://restapi.amap.com")
  expect(upstream.pathname).toBe("/v3/assistant/coordinate/convert")
  expect(upstream.searchParams.get("locations")).toBe("121.4,31.2")
  expect(upstream.searchParams.get("callback")).toBe("callback")
  expect(upstream.searchParams.getAll("jscode")).toEqual([
    credentials.securityJsCode,
  ])
  expect(transport.mock.calls[0]![1]?.redirect).toBe("manual")
})

it("uses the SDK host for custom styles and passes unrelated paths through", async () => {
  const transport = vi.fn<typeof fetch>(async () => new Response("style"))
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  expect(
    await (
      await fetch(
        `${origin}/_AMapService/v4/map/styles?key=${credentials.apiKey}`
      )
    ).text()
  ).toBe("style")
  expect(new URL(String(transport.mock.calls[0]![0])).origin).toBe(
    "https://webapi.amap.com"
  )
  expect(await (await fetch(`${origin}/community/exchange`)).text()).toBe(
    "not-proxied"
  )
  expect(await (await fetch(`${origin}/_AMapService-other/path`)).text()).toBe(
    "not-proxied"
  )
  expect(transport).toHaveBeenCalledTimes(1)
})

it("accepts the real SDK's repeated matching key parameters and preserves its query", async () => {
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response('callback({"status":"1"})', {
        headers: { "Content-Type": "application/javascript" },
      })
  )
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  const query = new URLSearchParams([
    ["platform", "JS"],
    ["s", "rsv3"],
    ["key", credentials.apiKey],
    ["sdkversion", "2.0"],
    ["key", credentials.apiKey],
    ["s", "rsv3"],
    ["locations", "127.1,31.2"],
    ["coordsys", "gps"],
    ["callback", "callback"],
  ])
  const response = await fetch(
    `${origin}/_AMapService/v3/assistant/coordinate/convert?${query}`
  )
  expect(response.status).toBe(200)
  const upstream = new URL(String(transport.mock.calls[0]![0]))
  expect(upstream.searchParams.getAll("key")).toEqual([
    credentials.apiKey,
    credentials.apiKey,
  ])
  expect(upstream.searchParams.getAll("s")).toEqual(["rsv3", "rsv3"])
  expect(upstream.searchParams.get("platform")).toBe("JS")
  expect(upstream.searchParams.getAll("jscode")).toEqual([
    credentials.securityJsCode,
  ])
})

it("serves verified SDK JSONP as executable JavaScript while retaining nosniff", async () => {
  const payload =
    'jsonp_123({"status":"1","info":"ok","locations":"127.105,31.197"})'
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response(payload, {
        headers: { "Content-Type": "application/json;charset=UTF-8" },
      })
  )
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  const response = await fetch(
    `${origin}/_AMapService/v3/assistant/coordinate/convert?key=${credentials.apiKey}&callback=jsonp_123`
  )
  expect(response.headers.get("content-type")).toBe(
    "application/javascript; charset=utf-8"
  )
  expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  expect(await response.text()).toBe(payload)
})

it("preserves the JSON content type for unwrapped data and invalid JSONP callbacks", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('{"status":"0"}', {
        headers: { "Content-Type": "application/json" },
      })
    )
    .mockResolvedValueOnce(
      new Response('bad[0]({"status":"1"})', {
        headers: { "Content-Type": "application/json" },
      })
    )
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  for (const callback of ["callback", "bad[0]"]) {
    const response = await fetch(
      `${origin}/_AMapService/v3/test?key=${credentials.apiKey}&callback=${encodeURIComponent(callback)}`
    )
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  }
})

it("fails closed for missing credentials and rejects conflicting keys, caller codes and writes", async () => {
  const transport = vi.fn<typeof fetch>()
  const missing = await serve(createAMapServiceProxy(() => null, transport))
  expect((await fetch(`${missing}/_AMapService/v3/test`)).status).toBe(503)
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  for (const query of [
    "",
    "key=wrong",
    `key=${credentials.apiKey}&key=wrong`,
    `key=wrong&key=${credentials.apiKey}`,
    `key=${credentials.apiKey}&jscode=`,
    `key=${credentials.apiKey}&JSCODE=client-code`,
  ]) {
    const response = await fetch(`${origin}/_AMapService/v3/test?${query}`)
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain(credentials.securityJsCode)
  }
  const response = await fetch(
    `${origin}/_AMapService/v3/test?key=${credentials.apiKey}`,
    { method: "POST" }
  )
  expect(response.status).toBe(405)
  expect(response.headers.get("allow")).toBe("GET")
  expect(transport).not.toHaveBeenCalled()
})

it("keeps failed upstream URLs and redirects containing credentials out of browser responses", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(
      new Error(`upstream secret ${credentials.securityJsCode}`)
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          Location: `https://example.test/?jscode=${credentials.securityJsCode}`,
        },
      })
    )
  const origin = await serve(
    createAMapServiceProxy(() => credentials, transport)
  )
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(
      `${origin}/_AMapService/v3/test?key=${credentials.apiKey}`
    )
    expect(response.status).toBe(502)
    expect(response.headers.get("location")).toBeNull()
    expect(await response.text()).not.toContain(credentials.securityJsCode)
  }
})

it("reads only the private credential pair from Web .env.local and stays serve-only", () => {
  const directory = mkdtempSync(join(tmpdir(), "imsweb-amap-proxy-"))
  directories.push(directory)
  expect(readLocalAMapCredentials(directory)).toBeNull()
  writeFileSync(
    join(directory, ".env.local"),
    `IMS_DEV_AMAP_JS_API_KEY=${credentials.apiKey}\nIMS_DEV_AMAP_SECURITY_JS_CODE=${credentials.securityJsCode}\nIMS_API_ORIGIN=https://unused.example\n`
  )
  expect(readLocalAMapCredentials(directory)).toEqual(credentials)
  expect(process.env.IMS_DEV_AMAP_SECURITY_JS_CODE).not.toBe(
    credentials.securityJsCode
  )
  expect(localAMapServiceProxy(directory).apply).toBe("serve")
  writeFileSync(
    join(directory, ".env.local"),
    "IMS_DEV_AMAP_JS_API_KEY=invalid\n"
  )
  expect(readLocalAMapCredentials(directory)).toBeNull()
})
