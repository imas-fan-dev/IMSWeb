import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import { defaultLanguage, defaultNamespace } from "~/i18n/resources"
import { AdminImageUploadField } from "~/pages/admin/components/admin-image-upload-field"

function TestI18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  )
}

describe("AdminImageUploadField", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("shows the selected image name and size", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <AdminImageUploadField
        id="cover-image"
        label="封面图片"
        description="选择活动封面。"
        onSelect={onSelect}
      />,
      { wrapper: TestI18nProvider }
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
    expect(screen.getByRole("group", { name: "图片文件选择" })).toHaveClass(
      "min-h-0"
    )
    expect(screen.getByText("summer-live.png")).toBeVisible()
    expect(screen.getByText(/1.5 KiB/)).toBeVisible()
    expect(screen.getByText("已选择")).toBeVisible()
    expect(screen.getByRole("button", { name: "更换" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "移除 summer-live.png" })
    ).toHaveAttribute("title", "移除已选择的文件")
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
      />,
      { wrapper: TestI18nProvider }
    )

    expect(screen.getByLabelText("正文图片")).toBeDisabled()
    expect(screen.getByText("正在上传图片")).toBeVisible()
    expect(screen.getByText("上传中")).toBeVisible()
  })

  it("updates upload copy and accessible labels when the language changes", async () => {
    const file = new File([new Uint8Array(1536)], "profile.png", {
      type: "image/png",
    })

    render(
      <AdminImageUploadField
        id="localized-image"
        label="Localized image"
        description="Choose an image."
        file={file}
        onSelect={vi.fn()}
      />,
      { wrapper: TestI18nProvider }
    )

    expect(screen.getByRole("group", { name: "图片文件选择" })).toBeVisible()

    await act(() => i18n.changeLanguage("en"))

    expect(
      screen.getByRole("group", { name: "Image file picker" })
    ).toBeVisible()
    expect(screen.getByText("Image · 1.5 KiB")).toBeVisible()
    expect(screen.getByText("Selected")).toBeVisible()
    expect(screen.getByRole("button", { name: "Change" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Remove profile.png" })
    ).toHaveAttribute("title", "Remove selected file")
  })

  it("localizes the empty and uploading states", async () => {
    const { rerender } = render(
      <AdminImageUploadField
        id="localized-empty-image"
        label="Localized image"
        description="Choose an image."
        onSelect={vi.fn()}
      />,
      { wrapper: TestI18nProvider }
    )

    await act(() => i18n.changeLanguage("en"))

    expect(screen.getByText("Choose an image")).toBeVisible()
    expect(screen.getByText("PNG, JPEG, WebP, or AVIF")).toBeVisible()
    expect(screen.getByRole("button", { name: "Choose file" })).toBeVisible()

    rerender(
      <AdminImageUploadField
        id="localized-empty-image"
        label="Localized image"
        description="Choose an image."
        uploading
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText("Uploading Image")).toBeVisible()
    expect(
      screen.getByText("Keep this page open until the upload is complete")
    ).toBeVisible()
    expect(screen.getByText("Uploading")).toBeVisible()
  })
})
