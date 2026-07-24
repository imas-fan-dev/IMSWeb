import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"

describe("AdminImageUploadField", () => {
  it("shows the selected image name and size", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <AdminImageUploadField
        id="cover-image"
        label="封面图片"
        description="选择活动封面。"
        onSelect={onSelect}
      />
    )

    const file = new File([new Uint8Array(1536)], "summer-live.png", {
      type: "image/png",
    })
    await user.upload(screen.getByLabelText("封面图片"), file)

    rerender(
      <AdminImageUploadField
        id="cover-image"
        label="封面图片"
        description="选择活动封面。"
        file={file}
        onSelect={onSelect}
      />
    )

    expect(onSelect).toHaveBeenCalledWith(file)
    expect(screen.getByText("summer-live.png")).toBeVisible()
    expect(screen.getByText(/1.5 KiB/)).toBeVisible()
    expect(screen.queryByText("No file chosen")).not.toBeInTheDocument()
  })

  it("announces and locks the upload while it is in progress", () => {
    render(
      <AdminImageUploadField
        id="body-image"
        label="正文图片"
        description="插入正文图片。"
        uploading
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByLabelText("正文图片")).toBeDisabled()
    expect(screen.getByText("正在上传图片")).toBeVisible()
    expect(screen.getByText("上传中")).toBeVisible()
  })
})
