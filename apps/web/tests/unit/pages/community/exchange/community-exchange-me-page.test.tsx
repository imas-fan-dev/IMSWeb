import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, type PlatformProfile } from "~/lib/api"
import CommunityExchangeMePage from "~/pages/community/exchange/me/community-exchange-me-page"
import { ProfileEditor } from "~/pages/community/exchange/me/profile-editor"

const sessionMocks = vi.hoisted(() => ({
  usePlatformSession: vi.fn(),
  acceptProfile: vi.fn(),
  reload: vi.fn(),
}))

const cropMocks = vi.hoisted(() => ({
  cropAvatarImage: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  getPlatformProfile: vi.fn(),
  getFudabaOwnerSeries: vi.fn(),
  getFudabaOwnerCards: vi.fn(),
  getFudabaOwnerCard: vi.fn(),
  getFudabaClaimEnvelopes: vi.fn(),
  getWikiCatalog: vi.fn(),
  updatePlatformProfile: vi.fn(),
  uploadPlatformAvatar: vi.fn(),
  removePlatformAvatar: vi.fn(),
  createFudabaCard: vi.fn(),
  updateFudabaCard: vi.fn(),
  uploadFudabaCardMedia: vi.fn(),
  deleteFudabaCard: vi.fn(),
  sendProfile: vi.fn(),
  sendSeries: vi.fn(),
  sendCards: vi.fn(),
  sendCard: vi.fn(),
  sendCatalog: vi.fn(),
  sendEnvelopes: vi.fn(),
  sendProfileUpdate: vi.fn(),
  sendAvatarUpload: vi.fn(),
  sendAvatarRemoval: vi.fn(),
  sendCreate: vi.fn(),
  sendUpdate: vi.fn(),
  sendMediaUpload: vi.fn(),
  sendDelete: vi.fn(),
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

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    hasPlatformSessionHint: () => false,
    getPlatformProfile: apiMocks.getPlatformProfile,
    getFudabaOwnerSeries: apiMocks.getFudabaOwnerSeries,
    getFudabaOwnerCards: apiMocks.getFudabaOwnerCards,
    getFudabaOwnerCard: apiMocks.getFudabaOwnerCard,
    getFudabaClaimEnvelopes: apiMocks.getFudabaClaimEnvelopes,
    getWikiCatalog: apiMocks.getWikiCatalog,
    updatePlatformProfile: apiMocks.updatePlatformProfile,
    uploadPlatformAvatar: apiMocks.uploadPlatformAvatar,
    removePlatformAvatar: apiMocks.removePlatformAvatar,
    createFudabaCard: apiMocks.createFudabaCard,
    updateFudabaCard: apiMocks.updateFudabaCard,
    uploadFudabaCardMedia: apiMocks.uploadFudabaCardMedia,
    deleteFudabaCard: apiMocks.deleteFudabaCard,
  }
})

const profile: PlatformProfile = {
  displayName: "春香P",
  avatarUrl: null,
  homeCity: "上海",
  bio: "周末交换",
  updatedAt: 10,
}

const series = {
  id: 1,
  code: "765",
  displayName: "765PRO",
  color: "#f34f6d",
  iconUrl: "/icon/agencies/1.webp",
  imageTransform: {
    fit: "contain" as const,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    rotation: 0 as const,
  },
  displayOrder: 0,
  activeOfficeCount: 1,
}

const card = {
  id: "card-1",
  producerName: "春香P",
  displayName: "周末交换名片",
  seriesCode: "765",
  favoriteIdol: "天海春香",
  favoriteIdols: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  frontImageUrl: "/api/community/exchange/me/cards/card-1/media/front?v=3",
  backImageUrl: "/api/community/exchange/me/cards/card-1/media/back?v=3",
  accent: "#f34e6c",
  bio: "上海地区制作人",
  tradeNote: "周末现场交换",
  available: true,
  mediaRightsStatus: "approved" as const,
  publicationStatus: "draft" as const,
  revision: 3,
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (error: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: (value: T) => resolvePromise(value),
    reject: (error: unknown) => rejectPromise(error),
  }
}

function authenticatedSession(
  status: "authenticated" | "restricted" = "authenticated",
  accountId = "platform-1"
) {
  return {
    status,
    session: {
      success: true,
      account: {
        id: accountId,
        status: status === "restricted" ? "restricted" : "active",
      },
      profile: {
        displayName: profile.displayName,
        avatarUrl: null,
        homeCity: profile.homeCity,
        bio: profile.bio,
      },
    },
    error: null,
    acceptProfile: sessionMocks.acceptProfile,
    reload: sessionMocks.reload,
    logout: vi.fn(),
  }
}

function pageTree() {
  return (
    <MemoryRouter initialEntries={["/community/exchange/me"]}>
      <CommunityExchangeMePage />
    </MemoryRouter>
  )
}

function renderPage() {
  return render(pageTree())
}

function renderAccountSection() {
  return render(
    <MemoryRouter initialEntries={["/account/me/profile"]}>
      <CommunityExchangeMePage
        section="profile"
        sectionBasePath="/account/me"
      />
    </MemoryRouter>
  )
}

describe("CommunityExchangeMePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMocks.usePlatformSession.mockReturnValue(authenticatedSession())
    apiMocks.getPlatformProfile.mockReturnValue({ send: apiMocks.sendProfile })
    apiMocks.getFudabaOwnerSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.getFudabaOwnerCards.mockReturnValue({ send: apiMocks.sendCards })
    apiMocks.getFudabaOwnerCard.mockReturnValue({ send: apiMocks.sendCard })
    apiMocks.getFudabaClaimEnvelopes.mockReturnValue({
      send: apiMocks.sendEnvelopes,
    })
    apiMocks.getWikiCatalog.mockReturnValue({ send: apiMocks.sendCatalog })
    apiMocks.updatePlatformProfile.mockReturnValue({
      send: apiMocks.sendProfileUpdate,
    })
    apiMocks.uploadPlatformAvatar.mockReturnValue({
      send: apiMocks.sendAvatarUpload,
    })
    apiMocks.removePlatformAvatar.mockReturnValue({
      send: apiMocks.sendAvatarRemoval,
    })
    apiMocks.createFudabaCard.mockReturnValue({ send: apiMocks.sendCreate })
    apiMocks.updateFudabaCard.mockReturnValue({ send: apiMocks.sendUpdate })
    apiMocks.uploadFudabaCardMedia.mockReturnValue({
      send: apiMocks.sendMediaUpload,
    })
    apiMocks.deleteFudabaCard.mockReturnValue({ send: apiMocks.sendDelete })

    apiMocks.sendProfile.mockResolvedValue({
      success: true,
      account: { id: "platform-1", status: "active" },
      capabilities: { fudabaWrite: true },
      profile,
    })
    apiMocks.sendSeries.mockResolvedValue({ items: [series] })
    apiMocks.sendCatalog.mockResolvedValue({
      status: "success",
      agencies: [
        {
          id: 1,
          code: "765",
          name: "765PRO",
          color: "#f34f6d",
          bannerTitle: "765PRO",
          iconUrl: null,
          idolCount: 1,
          entryCount: 1,
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
        },
      ],
      searchEntries: [
        {
          id: 1,
          name: "天海春香",
          agencyId: 1,
          agencyCode: "765",
          agencyName: "765PRO",
          agencyColor: "#f34f6d",
          entryKind: "idol",
          entrySubtype: null,
        },
      ],
      selection: null,
    })
    apiMocks.sendEnvelopes.mockResolvedValue({ items: [] })
    apiMocks.sendCards.mockResolvedValue({ items: [card] })
    apiMocks.sendCard.mockResolvedValue({ card })
    apiMocks.sendProfileUpdate.mockResolvedValue({
      success: true,
      profile: { ...profile, displayName: "更新后的制作人", updatedAt: 11 },
    })
    cropMocks.cropAvatarImage.mockImplementation(
      async (source: File) =>
        new File(["cropped"], `cropped-${source.name}`, { type: "image/webp" })
    )
    apiMocks.sendAvatarUpload.mockResolvedValue({
      success: true,
      profile: {
        ...profile,
        avatarUrl: "https://public-media.example.test/platform/avatars/11.webp",
        updatedAt: 11,
      },
    })
    apiMocks.sendAvatarRemoval.mockResolvedValue({
      success: true,
      profile: { ...profile, avatarUrl: null, updatedAt: 11 },
    })
    apiMocks.sendUpdate.mockResolvedValue({
      success: true,
      card: { ...card, displayName: "更新后的名片", revision: 4 },
    })
    apiMocks.sendMediaUpload.mockResolvedValue({
      success: true,
      card: { ...card, revision: 4 },
    })
    apiMocks.sendCreate.mockResolvedValue({
      success: true,
      card: { ...card, id: "card-new", revision: 0 },
    })
    apiMocks.sendDelete.mockResolvedValue({ success: true, revision: 4 })
  })

  it("saves profile and card metadata with their current versions", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole("heading", { name: "个人档案" })
    ).toBeVisible()
    expect(
      screen.queryByRole("textbox", { name: "名片标题" })
    ).not.toBeInTheDocument()

    const profileName = screen.getByRole("textbox", { name: "显示名称" })
    await user.clear(profileName)
    await user.type(profileName, "更新后的制作人")
    await user.click(screen.getByRole("button", { name: "保存资料" }))

    await waitFor(() => {
      expect(apiMocks.updatePlatformProfile).toHaveBeenCalledWith({
        displayName: "更新后的制作人",
        homeCity: "上海",
        bio: "周末交换",
        expectedUpdatedAt: 10,
      })
    })
    expect(await screen.findByText("制作人资料已保存。")).toBeVisible()

    await user.click(screen.getByRole("link", { name: "交换名片" }))
    expect(screen.getByText("素材已核准")).toBeVisible()
    expect(screen.getAllByText("草稿")).toHaveLength(2)
    expect(
      screen.queryByRole("textbox", { name: "显示名称" })
    ).not.toBeInTheDocument()

    const cardName = screen.getByRole("textbox", { name: "名片标题" })
    await user.clear(cardName)
    await user.type(cardName, "更新后的名片")
    await user.click(screen.getByRole("button", { name: "保存名片资料" }))

    await waitFor(() => {
      expect(apiMocks.updateFudabaCard).toHaveBeenCalledWith(
        "card-1",
        expect.objectContaining({
          displayName: "更新后的名片",
          expectedRevision: 3,
        })
      )
    })
    expect(await screen.findByText("名片资料已保存。")).toBeVisible()
  })

  it.each([
    ["Web workspace", renderPage],
    ["App profile section", renderAccountSection],
  ])(
    "propagates an uploaded avatar and its revision through the %s",
    async (_label, renderProfilePage) => {
      const user = userEvent.setup()
      renderProfilePage()

      await screen.findByRole("heading", { name: "个人资料" })
      await user.upload(
        screen.getByLabelText("头像"),
        new File(["avatar"], "avatar.png", { type: "image/png" })
      )
      await user.click(
        await screen.findByRole("button", { name: "使用此头像" })
      )
      await user.click(screen.getByRole("button", { name: "保存头像" }))

      const savedProfile = {
        ...profile,
        avatarUrl: "https://public-media.example.test/platform/avatars/11.webp",
        updatedAt: 11,
      }
      await waitFor(() => {
        expect(sessionMocks.acceptProfile).toHaveBeenCalledWith(
          "platform-1",
          savedProfile
        )
      })
      expect(screen.getByRole("button", { name: "移除头像" })).toBeVisible()

      const profileName = screen.getByRole("textbox", { name: "显示名称" })
      await user.clear(profileName)
      await user.type(profileName, "更新后的制作人")
      await user.click(screen.getByRole("button", { name: "保存资料" }))
      await waitFor(() => {
        expect(apiMocks.updatePlatformProfile).toHaveBeenCalledWith(
          expect.objectContaining({ expectedUpdatedAt: 11 })
        )
      })
    }
  )

  it("propagates avatar removal and its revision to local and session state", async () => {
    const profileWithAvatar = {
      ...profile,
      avatarUrl: "https://public-media.example.test/platform/avatars/10.webp",
    }
    apiMocks.sendProfile.mockResolvedValue({
      success: true,
      account: { id: "platform-1", status: "active" },
      capabilities: { fudabaWrite: true },
      profile: profileWithAvatar,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("button", { name: "移除头像" }))
    expect(
      screen.getByRole("heading", { name: "移除当前头像？" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "确认移除" }))

    const savedProfile = { ...profile, avatarUrl: null, updatedAt: 11 }
    await waitFor(() => {
      expect(apiMocks.removePlatformAvatar).toHaveBeenCalledWith(10)
      expect(sessionMocks.acceptProfile).toHaveBeenCalledWith(
        "platform-1",
        savedProfile
      )
    })
    expect(
      screen.queryByRole("button", { name: "移除头像" })
    ).not.toBeInTheDocument()

    const profileName = screen.getByRole("textbox", { name: "显示名称" })
    await user.clear(profileName)
    await user.type(profileName, "移除头像后的制作人")
    await user.click(screen.getByRole("button", { name: "保存资料" }))
    await waitFor(() => {
      expect(apiMocks.updatePlatformProfile).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: 11 })
      )
    })
  })

  it("keeps a failed avatar upload out of local and session state", async () => {
    apiMocks.sendAvatarUpload.mockRejectedValue(new Error("upload failed"))
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole("heading", { name: "个人资料" })
    await user.upload(
      screen.getByLabelText("头像"),
      new File(["avatar"], "avatar.png", { type: "image/png" })
    )
    await user.click(await screen.findByRole("button", { name: "使用此头像" }))
    await user.click(screen.getByRole("button", { name: "保存头像" }))

    expect(await screen.findByText(/头像上传失败/)).toBeVisible()
    expect(sessionMocks.acceptProfile).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: "移除头像" })
    ).not.toBeInTheDocument()
  })

  it("suppresses a mutation failure after its workspace generation expires", async () => {
    const staleSave = deferred<never>()
    apiMocks.sendProfileUpdate.mockReset().mockReturnValue(staleSave.promise)
    let operationCurrent = true
    const onWriteClosed = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProfileEditor
          profile={profile}
          readOnly={false}
          readOnlyReason={null}
          onSaved={() => true}
          onReload={vi.fn()}
          isOperationCurrent={() => operationCurrent}
          onWriteClosed={onWriteClosed}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole("button", { name: "保存资料" }))
    await waitFor(() =>
      expect(apiMocks.sendProfileUpdate).toHaveBeenCalledOnce()
    )
    operationCurrent = false
    await act(async () => {
      staleSave.reject(
        new ApiError("Not Found", {
          kind: "http",
          status: 404,
          payload: "Not Found",
        })
      )
      await Promise.resolve()
    })

    expect(onWriteClosed).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("preserves conflict feedback when a stale reload fails", async () => {
    const staleReload = deferred<PlatformProfile>()
    apiMocks.sendProfileUpdate.mockReset().mockRejectedValueOnce(
      new ApiError("资料版本冲突", {
        kind: "http",
        status: 409,
        code: "PLATFORM_PROFILE_CONFLICT",
        payload: { updatedAt: 11 },
      })
    )
    let operationCurrent = true
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProfileEditor
          profile={profile}
          readOnly={false}
          readOnlyReason={null}
          onSaved={() => true}
          onReload={() => staleReload.promise}
          isOperationCurrent={() => operationCurrent}
          onWriteClosed={vi.fn()}
        />
      </MemoryRouter>
    )

    await user.click(screen.getByRole("button", { name: "保存资料" }))
    await user.click(
      await screen.findByRole("button", { name: "载入最新资料" })
    )
    operationCurrent = false
    await act(async () => {
      staleReload.reject(new Error("stale reload failed"))
      await Promise.resolve()
    })

    expect(screen.getByText("资料版本冲突")).toBeVisible()
    expect(screen.queryByText("stale reload failed")).not.toBeInTheDocument()
  })

  it("ignores an avatar upload that completes after the account changes", async () => {
    const avatarUpload = deferred<{
      success: true
      profile: typeof profile
    }>()
    const nextWorkspace = deferred<{
      success: true
      account: { id: string; status: "active" }
      capabilities: { fudabaWrite: true }
      profile: typeof profile
    }>()
    apiMocks.sendProfile
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        account: { id: "platform-1", status: "active" },
        capabilities: { fudabaWrite: true },
        profile,
      })
      .mockReturnValueOnce(nextWorkspace.promise)
    apiMocks.sendAvatarUpload.mockReset().mockReturnValue(avatarUpload.promise)

    const user = userEvent.setup()
    const view = renderPage()
    await screen.findByRole("heading", { name: "个人资料" })
    await user.upload(
      screen.getByLabelText("头像"),
      new File(["avatar"], "avatar.png", { type: "image/png" })
    )
    await user.click(await screen.findByRole("button", { name: "使用此头像" }))
    await user.click(screen.getByRole("button", { name: "保存头像" }))
    await waitFor(() =>
      expect(apiMocks.sendAvatarUpload).toHaveBeenCalledOnce()
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存资料" })).toBeDisabled()
    )

    sessionMocks.usePlatformSession.mockReturnValue(
      authenticatedSession("authenticated", "platform-2")
    )
    view.rerender(pageTree())
    await waitFor(() => expect(apiMocks.sendProfile).toHaveBeenCalledTimes(2))

    await act(async () => {
      avatarUpload.resolve({
        success: true,
        profile: {
          ...profile,
          avatarUrl:
            "https://public-media.example.test/platform/avatars/11.webp",
          updatedAt: 11,
        },
      })
      await avatarUpload.promise
    })
    expect(sessionMocks.acceptProfile).not.toHaveBeenCalled()

    const nextProfile = {
      ...profile,
      displayName: "千早P",
      homeCity: "东京",
      updatedAt: 20,
    }
    await act(async () => {
      nextWorkspace.resolve({
        success: true,
        account: { id: "platform-2", status: "active" },
        capabilities: { fudabaWrite: true },
        profile: nextProfile,
      })
      await nextWorkspace.promise
    })
    expect(await screen.findByDisplayValue("千早P")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "移除头像" })
    ).not.toBeInTheDocument()
  })

  it("ignores a profile reload that completes after the account changes", async () => {
    const staleReload = deferred<{
      success: true
      account: { id: string; status: "active" }
      capabilities: { fudabaWrite: true }
      profile: typeof profile
    }>()
    const nextWorkspace = deferred<{
      success: true
      account: { id: string; status: "active" }
      capabilities: { fudabaWrite: true }
      profile: typeof profile
    }>()
    apiMocks.sendProfile
      .mockReset()
      .mockResolvedValueOnce({
        success: true,
        account: { id: "platform-1", status: "active" },
        capabilities: { fudabaWrite: true },
        profile,
      })
      .mockReturnValueOnce(staleReload.promise)
      .mockReturnValueOnce(nextWorkspace.promise)
    apiMocks.sendProfileUpdate.mockRejectedValueOnce(
      new ApiError("资料版本冲突", {
        kind: "http",
        status: 409,
        code: "PLATFORM_PROFILE_CONFLICT",
        payload: { updatedAt: 11 },
      })
    )

    const user = userEvent.setup()
    const view = renderPage()
    await screen.findByRole("heading", { name: "个人资料" })
    await user.click(screen.getByRole("button", { name: "保存资料" }))
    await user.click(
      await screen.findByRole("button", { name: "载入最新资料" })
    )
    await waitFor(() => expect(apiMocks.sendProfile).toHaveBeenCalledTimes(2))

    sessionMocks.usePlatformSession.mockReturnValue(
      authenticatedSession("authenticated", "platform-2")
    )
    view.rerender(pageTree())
    await waitFor(() => expect(apiMocks.sendProfile).toHaveBeenCalledTimes(3))

    const nextProfile = {
      ...profile,
      displayName: "千早P",
      homeCity: "东京",
      updatedAt: 20,
    }
    await act(async () => {
      nextWorkspace.resolve({
        success: true,
        account: { id: "platform-2", status: "active" },
        capabilities: { fudabaWrite: true },
        profile: nextProfile,
      })
      await nextWorkspace.promise
    })
    expect(await screen.findByDisplayValue("千早P")).toBeVisible()

    await act(async () => {
      staleReload.resolve({
        success: true,
        account: { id: "platform-1", status: "active" },
        capabilities: { fudabaWrite: true },
        profile: { ...profile, displayName: "迟到的春香P", updatedAt: 11 },
      })
      await staleReload.promise
    })
    expect(screen.getByDisplayValue("千早P")).toBeVisible()
    expect(screen.queryByDisplayValue("迟到的春香P")).not.toBeInTheDocument()
  })

  it("preserves card input and offers reload after a revision conflict", async () => {
    apiMocks.sendUpdate.mockRejectedValue(
      new ApiError("名片版本冲突", {
        kind: "http",
        status: 409,
        code: "FUDABA_CARD_CONFLICT",
        payload: { revision: 4 },
      })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("link", { name: "交换名片" }))
    const cardName = await screen.findByRole("textbox", { name: "名片标题" })
    await user.clear(cardName)
    await user.type(cardName, "仍需保留的输入")
    await user.click(screen.getByRole("button", { name: "保存名片资料" }))

    expect(await screen.findByText("名片版本冲突")).toBeVisible()
    expect(cardName).toHaveValue("仍需保留的输入")
    expect(screen.getByRole("button", { name: "载入最新名片" })).toBeVisible()
  })

  it("creates a card from the empty state and deletes it through confirmation", async () => {
    apiMocks.sendCards.mockResolvedValue({ items: [] })
    const createdCard = { ...card, id: "card-new", revision: 0 }
    apiMocks.sendCreate.mockResolvedValue({ success: true, card: createdCard })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole("link", { name: "交换名片" }))
    const cardName = await screen.findByRole("textbox", { name: "名片标题" })
    await user.type(cardName, "新交换名片")
    await user.click(screen.getByRole("checkbox", { name: /天海春香/ }))
    await user.upload(
      screen.getByLabelText("名片正面"),
      new File(["front"], "front.png", { type: "image/png" })
    )
    await user.upload(
      screen.getByLabelText("名片背面"),
      new File(["back"], "back.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "创建名片草稿" }))

    await waitFor(() => {
      expect(apiMocks.createFudabaCard).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "新交换名片",
          seriesCode: "765",
          favoriteIdolIds: [1],
          front: expect.any(File),
          back: expect.any(File),
        })
      )
    })
    expect(await screen.findByText("周末交换名片")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "删除名片" }))
    expect(
      screen.getByRole("heading", { name: "删除这张名片？" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "确认删除" }))

    await waitFor(() => {
      expect(apiMocks.deleteFudabaCard).toHaveBeenCalledWith("card-new", 0)
    })
    expect(await screen.findByText("还没有交换名片")).toBeVisible()
  })

  it("keeps restricted and rollout-closed workspaces readable but disabled", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(
      authenticatedSession("restricted")
    )
    apiMocks.sendProfile.mockResolvedValue({
      success: true,
      account: { id: "platform-1", status: "restricted" },
      capabilities: { fudabaWrite: false },
      profile,
    })
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText("帐号受限")).toBeVisible()
    expect(screen.getByRole("textbox", { name: "显示名称" })).toBeDisabled()
    await user.click(screen.getByRole("link", { name: "交换名片" }))
    expect(screen.getByRole("textbox", { name: "名片标题" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "新建名片" })).toBeDisabled()
    expect(screen.getByText("周末交换名片")).toBeVisible()
  })

  it("keeps profile editing open while the exchange rollout switch is closed", async () => {
    apiMocks.sendProfile.mockResolvedValue({
      success: true,
      account: { id: "platform-1", status: "active" },
      capabilities: { fudabaWrite: false },
      profile,
    })
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole("textbox", { name: "显示名称" })
    ).toBeEnabled()
    expect(screen.getByRole("button", { name: "保存资料" })).toBeEnabled()
    expect(screen.queryByText("编辑暂未开放")).not.toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "交换名片" }))
    expect(screen.getByText("编辑暂未开放")).toBeVisible()
    expect(screen.getByRole("button", { name: "新建名片" })).toBeDisabled()
  })

  it("uses a single App section without the legacy workspace header or tab grid", async () => {
    renderAccountSection()

    expect(
      await screen.findByRole("heading", { name: "个人资料" })
    ).toBeVisible()
    expect(
      screen.queryByRole("navigation", { name: "个人档案菜单" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "名片交换事务所" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "刷新个人档案" })).toBeVisible()
  })

  it("does not probe owner APIs for an anonymous visitor", () => {
    sessionMocks.usePlatformSession.mockReturnValue({
      status: "anonymous",
      session: null,
      error: null,
      acceptProfile: sessionMocks.acceptProfile,
      reload: sessionMocks.reload,
      logout: vi.fn(),
    })
    renderPage()

    expect(screen.getByText("请先登录平台帐号")).toBeVisible()
    expect(apiMocks.getPlatformProfile).not.toHaveBeenCalled()
    expect(apiMocks.getFudabaOwnerCards).not.toHaveBeenCalled()
  })
})
