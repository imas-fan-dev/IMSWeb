import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cropMocks = vi.hoisted(() => ({
  cropAvatarImage: vi.fn(),
}))

vi.mock("react-easy-crop", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  function EasyCrop({
    onCropComplete,
  }: {
    onCropComplete: (area: unknown, pixels: unknown) => void
  }) {
    const completed = React.useRef(false)
    React.useEffect(() => {
      if (completed.current) return
      completed.current = true
      onCropComplete({}, { height: 480, width: 480, x: 20, y: 10 })
    }, [onCropComplete])

    return React.createElement("div", { "data-testid": "avatar-cropper" })
  }

  return { default: EasyCrop }
})

vi.mock("~/lib/media/crop-avatar-image", () => ({
  cropAvatarImage: cropMocks.cropAvatarImage,
  CropAvatarImageError: class CropAvatarImageError extends Error {},
}))

vi.mock("~/components/ui/avatar", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    Avatar: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    AvatarFallback: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
      React.createElement("img", props),
  }
})

import type { PlatformProfile } from "~/lib/api"
import { AvatarUploadEditor } from "~/pages/community/exchange/me/components/avatar-upload-editor"

const profile: PlatformProfile = {
  avatarUrl: "https://images.example.test/current.webp",
  bio: "周末交换",
  displayName: "春香P",
  homeCity: "上海",
  updatedAt: 10,
}

function file(name = "avatar.png") {
  return new File(["image"], name, { type: "image/png" })
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof AvatarUploadEditor>> = {}
) {
  const onUpload = vi.fn().mockResolvedValue(true)
  const onRemove = vi.fn().mockResolvedValue(true)
  const props: React.ComponentProps<typeof AvatarUploadEditor> = {
    disabled: false,
    onBusyChange: vi.fn(),
    onClearFeedback: vi.fn(),
    onError: vi.fn(),
    onRemove,
    onUpload,
    profile,
    validate: () => null,
    ...overrides,
  }

  return { ...render(<AvatarUploadEditor {...props} />), onRemove, onUpload }
}

async function selectAndCrop(
  user: ReturnType<typeof userEvent.setup>,
  source = file()
) {
  await user.upload(screen.getByLabelText("头像"), source)
  expect(await screen.findByTestId("avatar-cropper")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "使用此头像" }))
  await waitFor(() =>
    expect(screen.queryByTestId("avatar-cropper")).not.toBeInTheDocument()
  )
}

describe("AvatarUploadEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cropMocks.cropAvatarImage.mockImplementation(
      async (source: File) =>
        new File(["cropped"], `cropped-${source.name}`, { type: "image/webp" })
    )
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (source) => `blob:${(source as File).name}`
    )
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows the current avatar, falls back after an image error, and remains viewable when read-only", () => {
    const { rerender } = renderEditor()

    const image = screen.getByRole("img", { name: "当前头像" })
    expect(image).toHaveAttribute("src", profile.avatarUrl)
    fireEvent.error(image)
    expect(screen.getByText("春")).toBeVisible()

    rerender(
      <AvatarUploadEditor
        disabled
        onBusyChange={vi.fn()}
        onClearFeedback={vi.fn()}
        onError={vi.fn()}
        onRemove={vi.fn()}
        onUpload={vi.fn()}
        profile={profile}
        validate={() => null}
      />
    )

    expect(screen.getByLabelText("头像")).toBeDisabled()
    expect(screen.getByRole("button", { name: "移除头像" })).toBeDisabled()
    expect(screen.getByText("春")).toBeVisible()
  })

  it("cancels a crop without staging or uploading the selected image", async () => {
    const user = userEvent.setup()
    const onClearFeedback = vi.fn()
    const { onUpload } = renderEditor({ onClearFeedback })

    await user.upload(screen.getByLabelText("头像"), file("cancel.png"))
    expect(onClearFeedback).toHaveBeenCalledOnce()
    expect(await screen.findByTestId("avatar-cropper")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "取消" }))

    await waitFor(() => {
      expect(screen.queryByTestId("avatar-cropper")).not.toBeInTheDocument()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cancel.png")
    })
    expect(screen.queryByText("待上传头像")).not.toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("stages a cropped preview, replaces it, and revokes both preview URLs", async () => {
    const user = userEvent.setup()
    renderEditor()

    await selectAndCrop(user, file("first.png"))
    expect(
      await screen.findByRole("img", { name: "头像预览" })
    ).toHaveAttribute("src", "blob:cropped-first.png")

    await selectAndCrop(user, file("second.png"))
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cropped-first.png")
    })
    expect(screen.getByRole("img", { name: "头像预览" })).toHaveAttribute(
      "src",
      "blob:cropped-second.png"
    )

    await user.click(screen.getByRole("button", { name: "取消更改" }))
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:cropped-second.png"
      )
    })
    expect(
      screen.queryByRole("button", { name: "保存头像" })
    ).not.toBeInTheDocument()
  })

  it("clears a successful upload and retains a failed upload for the same-file retry", async () => {
    const user = userEvent.setup()
    const onUpload = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    renderEditor({ onUpload })

    await selectAndCrop(user, file("retry.png"))
    await user.click(screen.getByRole("button", { name: "保存头像" }))
    expect(
      await screen.findByRole("img", { name: "头像预览" })
    ).toHaveAttribute("src", "blob:cropped-retry.png")

    await user.click(screen.getByRole("button", { name: "保存头像" }))
    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(2)
      expect(
        screen.queryByRole("button", { name: "保存头像" })
      ).not.toBeInTheDocument()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cropped-retry.png")
    })
    expect(onUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "cropped-retry.png", type: "image/webp" })
    )
  })

  it("locks conflicting actions while an upload is pending", async () => {
    const user = userEvent.setup()
    const upload = deferred<boolean>()
    const onUpload = vi.fn().mockReturnValue(upload.promise)
    renderEditor({ onUpload })

    await selectAndCrop(user, file("busy.png"))
    await user.click(screen.getByRole("button", { name: "保存头像" }))

    expect(screen.getByLabelText("头像")).toBeDisabled()
    expect(screen.getByRole("button", { name: "取消更改" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "移除头像" })).toBeDisabled()

    upload.resolve(false)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存头像" })).toBeEnabled()
    )
  })

  it("releases a staged preview and ignores an upload completion after unmount", async () => {
    const user = userEvent.setup()
    const upload = deferred<boolean>()
    const onUpload = vi.fn().mockReturnValue(upload.promise)
    const view = renderEditor({ onUpload })

    await selectAndCrop(user, file("unmount.png"))
    await user.click(screen.getByRole("button", { name: "保存头像" }))
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce())

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cropped-unmount.png")

    await act(async () => {
      upload.resolve(true)
      await upload.promise
    })
  })

  it("requires confirmation before removal and keeps a failed confirmation open for retry", async () => {
    const user = userEvent.setup()
    const onRemove = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    renderEditor({ onRemove })

    await user.click(screen.getByRole("button", { name: "移除头像" }))
    expect(
      screen.getByRole("heading", { name: "移除当前头像？" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(onRemove).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "移除头像" }))
    await user.click(screen.getByRole("button", { name: "确认移除" }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce())
    expect(
      screen.getByRole("heading", { name: "移除当前头像？" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "确认移除" }))
    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(2)
      expect(
        screen.queryByRole("heading", { name: "移除当前头像？" })
      ).not.toBeInTheDocument()
    })
  })
})
