import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ImportDialog } from "~/pages/tier-list/components/import-dialog"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock("~/pages/tier-list/tier-list-local-image", () => ({
  compressImageFile: vi.fn(async () => ({
    dataUrl: "data:image/webp;base64,c2FtcGxl",
    width: 64,
    height: 64,
  })),
  labelFromFileName: (name: string) => name.replace(/\.[^.]+$/, ""),
}))

describe("ImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("adds compressed local files from the upload tab", async () => {
    const user = userEvent.setup()
    const onAddItems = vi.fn()
    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        existingItems={{}}
        onAddItems={onAddItems}
      />
    )

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput).not.toBeNull()
    const file = new File([new Uint8Array(64)], "神推.png", {
      type: "image/png",
    })
    await user.upload(fileInput, file)

    expect(await screen.findByText("神推")).toBeVisible()
    await user.click(screen.getByTestId("add-local-files"))

    await waitFor(() => {
      expect(onAddItems).toHaveBeenCalledWith([
        expect.objectContaining({
          label: "神推",
          src: "data:image/webp;base64,c2FtcGxl",
          origin: "local",
        }),
      ])
    })
  })
})
