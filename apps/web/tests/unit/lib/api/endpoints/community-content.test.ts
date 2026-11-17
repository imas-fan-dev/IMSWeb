import { beforeEach, describe, expect, it } from "vitest"
import {
  getCommunityContent,
  getAdminCommunityContent,
  updateAdminCommunityContent,
  uploadAdminCommunityContentImage,
} from "~/lib/api/endpoints/community-content"
import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { CSRF_HEADER_NAME } from "~/lib/api/request"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
const draft = {
  version: 1 as const,
  title: "社区",
  introduction: "",
  entries: [],
}
const content = { ...draft, updatedAt: null }
describe("community content endpoints", () => {
  beforeEach(() => setCsrfCookie("backoffice", "community-csrf"))
  it("reads the exact public empty response and rejects malformed success", async () => {
    const mock = installFetchMock()
      .mockResolvedValueOnce(Response.json(content))
      .mockResolvedValueOnce(Response.json({ ...content, extra: true }))
    expect(await getCommunityContent().send()).toEqual(content)
    expect(requestDetails(mock.mock.calls[0]).url).toContain(
      "/api/community/content"
    )
    await expect(getCommunityContent().send()).rejects.toMatchObject({
      code: "CONTRACT_VIOLATION",
    })
  })
  it("reads a snapshot and sends a revision-protected CSRF draft without timestamps", async () => {
    const mock = installFetchMock()
      .mockResolvedValueOnce(Response.json({ content, revision: "v1" }))
      .mockResolvedValueOnce(
        Response.json({ success: true, content, revision: "v2" })
      )
    expect(await getAdminCommunityContent().send()).toEqual({
      content,
      revision: "v1",
    })
    await updateAdminCommunityContent(draft, "v1").send()
    const details = requestDetails(mock.mock.calls[1])
    expect(details.method).toBe("PUT")
    expect(details.url).toContain("/api/admin/community-content")
    expect(details.headers.get(CSRF_HEADER_NAME)).toBe("community-csrf")
    expect(JSON.parse(details.body as string)).toEqual({
      content: draft,
      revision: "v1",
    })
  })
  it("uploads exactly the image multipart field with shared CSRF and retains canonical URL", async () => {
    const url = "/uploads/community-content/test.webp"
    const mock = installFetchMock().mockResolvedValue(
      Response.json({ success: true, url })
    )
    expect(
      await uploadAdminCommunityContentImage(
        new File(["image"], "test.png", { type: "image/png" })
      ).send()
    ).toEqual({ success: true, url })
    const details = requestDetails(mock.mock.calls[0])
    expect(details.url).toContain("/api/admin/community-content/images")
    expect(details.headers.get(CSRF_HEADER_NAME)).toBe("community-csrf")
    expect(details.body).toBeInstanceOf(FormData)
    expect(Array.from((details.body as FormData).keys())).toEqual(["image"])
  })
  it("parses conflict errors instead of accepting a failed save", async () => {
    installFetchMock().mockResolvedValue(
      Response.json({ error: "配置已更新" }, { status: 409 })
    )
    await expect(
      updateAdminCommunityContent(draft, "old").send()
    ).rejects.toMatchObject({ status: 409, payload: { error: "配置已更新" } })
  })
})
