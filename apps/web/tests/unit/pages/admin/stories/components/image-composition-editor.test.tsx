import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import { defaultLanguage, defaultNamespace } from "~/i18n/resources"
import { ImageCompositionEditor } from "~/pages/admin/stories/components/image-composition-editor"
import { defaultWikiImageTransform, type WikiImageTransform } from "~/lib/api"

function TestI18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  )
}

function EditorHarness({
  initialTransform = defaultWikiImageTransform,
}: {
  initialTransform?: WikiImageTransform
}) {
  const [transform, setTransform] = useState(initialTransform)

  return (
    <ImageCompositionEditor
      id="wiki-image"
      file={null}
      currentUrl="/uploads/wiki/image.webp"
      transform={transform}
      onFileChange={vi.fn()}
      onTransformChange={setTransform}
    />
  )
}

describe("ImageCompositionEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("updates the existing focal fields from pointer and keyboard input", () => {
    render(<EditorHarness />, { wrapper: TestI18nProvider })

    const preview = screen.getByTestId("image-composition-preview")
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(preview, {
      button: 0,
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    })
    expect(screen.getByText("焦点 75 / 25")).toBeVisible()
    expect(screen.getByRole("img", { name: "图片构图预览" })).toHaveStyle({
      objectPosition: "75% 25%",
    })

    fireEvent.keyDown(preview, { key: "ArrowRight" })
    expect(screen.getByText("焦点 76 / 25")).toBeVisible()
  })

  it("keeps precise values optional and preserves rotation and reset behavior", async () => {
    const user = userEvent.setup()
    render(
      <EditorHarness
        initialTransform={{
          fit: "contain",
          focalX: 0.2,
          focalY: 0.7,
          rotation: 180,
          zoom: 1.4,
        }}
      />,
      { wrapper: TestI18nProvider }
    )

    const preciseButton = screen.getByRole("button", { name: "精细调整" })
    expect(preciseButton).toHaveAttribute("aria-expanded", "false")
    await user.click(preciseButton)
    expect(preciseButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByLabelText("水平焦点")).toBeVisible()
    expect(screen.getByLabelText("垂直焦点")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "向右旋转" }))
    expect(screen.getByRole("img", { name: "图片构图预览" })).toHaveStyle({
      transform: "rotate(270deg) scale(1.4)",
    })

    await user.click(screen.getByRole("button", { name: "重置构图" }))
    expect(screen.getByText("焦点 50 / 50")).toBeVisible()
    expect(screen.getByRole("button", { name: "裁满" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})
