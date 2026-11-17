import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { StoryCoverAssetDialog } from "~/pages/admin/stories/components/story-cover-asset-dialog"

describe("StoryCoverAssetDialog", () => {
  beforeEach(() => {
    setCsrfCookie("backoffice", "story-cover-asset-test")
  })

  it("previews and saves the full-image presentation policy", async () => {
    const fetchMock = installFetchMock().mockResolvedValue(
      Response.json({
        status: "success",
        asset: {
          id: 12,
          agencyId: 6,
          name: "通用主线封面",
          imageUrl: "/shared-cover.webp?v=1",
          presentationPolicy: "contain",
          displayOrder: 0,
          isActive: true,
          revision: 1,
          usageCount: 2,
        },
      })
    )
    const user = userEvent.setup()

    render(
      <StoryCoverAssetDialog
        open
        agencyId={6}
        agencyName="闪耀色彩"
        asset={{
          id: 12,
          agencyId: 6,
          name: "通用主线封面",
          imageUrl: "/shared-cover.webp?v=0",
          presentationPolicy: "inherit",
          displayOrder: 0,
          isActive: true,
          revision: 0,
          usageCount: 2,
        }}
        onOpenChange={() => undefined}
        onSaved={() => undefined}
      />
    )

    const preview = screen.getByRole("img", {
      name: "通用主线封面预览",
    })
    expect(preview).toHaveClass("object-cover")

    await user.click(screen.getByRole("button", { name: /完整显示/ }))
    expect(preview).toHaveClass("object-contain")
    expect(
      screen.getByText("标识和带文字素材会在不同画布中保留完整边缘。")
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "方形" }))
    expect(preview.parentElement).toHaveStyle({ aspectRatio: "1 / 1" })

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const request = requestDetails(fetchMock.mock.calls[0] ?? [])
    expect(request.method).toBe("PATCH")
    const form = request.body as FormData
    expect(form.get("presentation_policy")).toBe("contain")
    expect(form.get("expected_revision")).toBe("0")
  })
})
