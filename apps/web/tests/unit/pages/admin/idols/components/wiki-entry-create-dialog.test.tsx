import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeWikiAdminAgency,
  makeWikiAdminGroup,
  makeWikiAdminIdol,
} from "@/mocks/data/wiki"
import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { I18nTestProvider, renderPage } from "@/tests/unit/support/harness"
import { WikiEntryCreateDialog } from "~/pages/admin/idols/components/wiki-entry-create-dialog"
import type { ComponentProps, ReactElement } from "react"

const first = makeWikiAdminAgency({
  groups: [
    makeWikiAdminGroup({ name: "第一栏目" }),
    makeWikiAdminGroup({ id: 2, name: "第二栏目" }),
  ],
})
const second = makeWikiAdminAgency({
  id: 2,
  code: "sc",
  name: "闪耀色彩",
  color: "#8dbbff",
  groups: [makeWikiAdminGroup({ id: 9, name: "新栏目" })],
})
const agencies = [first, second]

function renderCreate(
  overrides: Partial<ComponentProps<typeof WikiEntryCreateDialog>> = {}
) {
  const props: ComponentProps<typeof WikiEntryCreateDialog> = {
    agencies,
    loading: false,
    catalogError: undefined,
    onRetry: vi.fn(),
    onClose: vi.fn(),
    onCreated: vi.fn(),
    returnFocus: { current: null },
    ...overrides,
  }
  const view = renderPage(
    <I18nTestProvider>
      <WikiEntryCreateDialog {...props} />
    </I18nTestProvider>
  )
  return {
    ...view,
    props,
    rerender: (ui: ReactElement) =>
      view.rerender(<I18nTestProvider>{ui}</I18nTestProvider>),
  }
}

async function chooseAgency(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByRole("combobox", { name: "所属企划（必选）" }))
  await user.keyboard("{ArrowDown}")
  await user.click(await screen.findByRole("option", { name }))
}

async function fillDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("名称"), "新增资料")
  await user.type(screen.getByLabelText("素材目录"), "new_entry")
  await user.type(
    screen.getByLabelText("Wiki 链接（可选）"),
    "https://wiki.example.test/new"
  )
}

function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("WikiEntryCreateDialog", () => {
  beforeEach(() => {
    setCsrfCookie("backoffice", "entry-create-test")
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:entry-avatar")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  })

  it("requires a selection, preserves draft and image across agencies, clears only dependent groups", async () => {
    const fetchMock = installFetchMock()
    const { props, unmount } = renderCreate()
    const user = userEvent.setup()
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "创建内容页" })).toBeDisabled()
    await chooseAgency(user, "765PRO")
    await fillDraft(user)
    await user.click(screen.getByRole("checkbox", { name: "第一栏目" }))
    await user.upload(
      screen.getByLabelText("上传图片"),
      new File(["image"], "avatar.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "向右旋转" }))
    await user.click(screen.getByRole("button", { name: "更多设置" }))
    expect(screen.getByLabelText("主题色色值")).toHaveValue(first.color)
    await chooseAgency(user, "闪耀色彩")
    expect(
      screen.queryByRole("checkbox", { name: "第一栏目" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "新栏目" })).not.toBeChecked()
    expect(screen.getByLabelText("主题色色值")).toHaveValue(second.color)
    expect(screen.getByLabelText("名称")).toHaveValue("新增资料")
    expect(screen.getByLabelText("素材目录")).toHaveValue("new_entry")
    expect(screen.getByLabelText("Wiki 链接（可选）")).toHaveValue(
      "https://wiki.example.test/new"
    )
    expect(screen.getByRole("img", { name: "图片构图预览" })).toHaveAttribute(
      "src",
      "blob:entry-avatar"
    )
    expect(screen.getByLabelText("上传图片")).toHaveProperty(
      "files",
      expect.objectContaining({ length: 1 })
    )
    await chooseAgency(user, "765PRO")
    expect(screen.getByRole("checkbox", { name: "第一栏目" })).not.toBeChecked()
    await user.clear(screen.getByLabelText("主题色色值"))
    await user.type(screen.getByLabelText("主题色色值"), "#123456")
    await chooseAgency(user, "闪耀色彩")
    expect(screen.getByLabelText("主题色色值")).toHaveValue("#123456")
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:entry-avatar")
  })

  it("submits multi-select IDs to the selected agency, locks dismissal and duplicate submissions through upload, reports partial success", async () => {
    const create = deferredResponse()
    const upload = deferredResponse()
    const fetchMock = installFetchMock()
      .mockReturnValueOnce(create.promise)
      .mockReturnValueOnce(upload.promise)
    const { props } = renderCreate({ initialAgencyId: 1 })
    const user = userEvent.setup()
    await fillDraft(user)
    await user.click(screen.getByRole("checkbox", { name: "第一栏目" }))
    await user.click(screen.getByRole("checkbox", { name: "第二栏目" }))
    const file = new File(["image"], "avatar.png", { type: "image/png" })
    await user.upload(screen.getByLabelText("上传图片"), file)
    await user.click(screen.getByRole("button", { name: "向右旋转" }))
    await user.click(screen.getByRole("button", { name: "创建内容页" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = requestDetails(fetchMock.mock.calls[0]!)
    expect(new URL(request.url, window.location.origin).pathname).toBe(
      "/api/admin/wiki/agencies/1/idols"
    )
    expect(request.headers.get("x-csrftoken")).toBe("entry-create-test")
    expect(JSON.parse(String(request.body))).toMatchObject({
      groupIds: [1, 2],
      folderName: "new_entry",
      entryKind: "idol",
      entrySubtype: null,
    })
    expect(screen.getByLabelText("名称")).toBeDisabled()
    expect(
      screen.getByRole("combobox", { name: "所属企划（必选）" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    await user.keyboard("{Escape}")
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(props.onClose).not.toHaveBeenCalled()
    const idol = makeWikiAdminIdol({ id: 77, mediaRevision: 4 })
    await act(async () =>
      create.resolve(
        Response.json({ status: "success", idol }, { status: 201 })
      )
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(props.onCreated).not.toHaveBeenCalled()
    const media = requestDetails(fetchMock.mock.calls[1]!)
    expect(new URL(media.url, window.location.origin).pathname).toBe(
      "/api/admin/wiki/idols/77/avatar"
    )
    expect(media.body).toBeInstanceOf(FormData)
    const body = media.body as FormData
    expect(body.get("expected_revision")).toBe("4")
    expect(body.get("image_rotation")).toBe("90")
    expect(body.get("image")).toBe(file)
    await user.keyboard("{Escape}")
    expect(props.onClose).not.toHaveBeenCalled()
    await act(async () =>
      upload.resolve(
        Response.json(
          { status: "error", msg: "图片冲突", mediaRevision: 5 },
          { status: 409 }
        )
      )
    )
    await waitFor(() =>
      expect(props.onCreated).toHaveBeenCalledWith({
        idol,
        imageError: "图片冲突",
      })
    )
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retains a failed create draft and only retries on explicit submission, with no groups", async () => {
    const idol = makeWikiAdminIdol({ agencyId: 2, groupIds: [] })
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(
        Response.json({ status: "error", msg: "目录已变化" }, { status: 409 })
      )
      .mockResolvedValueOnce(
        Response.json({ status: "success", idol }, { status: 201 })
      )
    const { props } = renderCreate({
      agencies: [{ ...second, groups: [] }],
      initialAgencyId: 2,
    })
    const user = userEvent.setup()
    expect(screen.getByText(/当前企划没有栏目/)).toBeVisible()
    await fillDraft(user)
    await user.click(screen.getByRole("button", { name: "更多设置" }))
    await user.click(screen.getByRole("button", { name: "剧情专题" }))
    await user.click(screen.getByRole("button", { name: "活动" }))
    await user.click(screen.getByRole("button", { name: "创建内容页" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("目录已变化")
    expect(screen.getByLabelText("名称")).toHaveValue("新增资料")
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "创建内容页" }))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith({ idol }))
    const request = requestDetails(fetchMock.mock.calls[1]!)
    expect(new URL(request.url, window.location.origin).pathname).toBe(
      "/api/admin/wiki/agencies/2/idols"
    )
    expect(JSON.parse(String(request.body))).toMatchObject({
      groupIds: [],
      entryKind: "story",
      entrySubtype: "event",
    })
  })

  it("reconciles changed catalog memberships and a removed agency without losing common fields", async () => {
    const fetchMock = installFetchMock()
    const { props, rerender } = renderCreate({ initialAgencyId: 1 })
    const user = userEvent.setup()
    await fillDraft(user)
    await user.click(screen.getByRole("checkbox", { name: "第一栏目" }))
    rerender(
      <WikiEntryCreateDialog
        {...props}
        agencies={[{ ...first, groups: [] }, second]}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("失效的栏目选择已移除")
    rerender(<WikiEntryCreateDialog {...props} agencies={[second]} />)
    expect(screen.getByRole("status")).toHaveTextContent("原企划已不可用")
    expect(screen.getByRole("button", { name: "创建内容页" })).toBeDisabled()
    await chooseAgency(user, "闪耀色彩")
    expect(screen.getByLabelText("名称")).toHaveValue("新增资料")
    expect(screen.getByRole("checkbox", { name: "新栏目" })).not.toBeChecked()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("resolves prefill after loading, retains drafts through catalog errors, and exposes retry and empty states", async () => {
    const { props, rerender } = renderCreate({
      agencies: [],
      initialAgencyId: 2,
      loading: true,
    })
    expect(screen.getByRole("status")).toHaveTextContent("正在加载")
    rerender(
      <WikiEntryCreateDialog {...props} agencies={agencies} loading={false} />
    )
    expect(screen.getByRole("combobox")).toHaveTextContent("闪耀色彩")
    const user = userEvent.setup()
    await fillDraft(user)
    rerender(
      <WikiEntryCreateDialog
        {...props}
        agencies={agencies}
        loading={false}
        catalogError={new Error("offline")}
      />
    )
    await user.click(screen.getByRole("button", { name: "重试加载目录" }))
    expect(props.onRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "创建内容页" })).toBeDisabled()
    expect(screen.getByLabelText("名称")).toHaveValue("新增资料")
    rerender(<WikiEntryCreateDialog {...props} loading={false} />)
    expect(screen.getByText("还没有企划")).toBeVisible()
    expect(screen.getByRole("link", { name: "前往企划管理" })).toHaveAttribute(
      "href",
      "/admin/idols/agencies"
    )
  })

  it("validates retained color values even when more settings is collapsed", async () => {
    const fetchMock = installFetchMock()
    renderCreate({ initialAgencyId: 1 })
    const user = userEvent.setup()
    await fillDraft(user)
    await user.click(screen.getByRole("button", { name: "更多设置" }))
    await user.clear(screen.getByLabelText("主题色色值"))
    await user.type(screen.getByLabelText("主题色色值"), "#12")
    await user.click(screen.getByRole("button", { name: "更多设置" }))
    await user.click(screen.getByRole("button", { name: "创建内容页" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("有效的六位")
    expect(screen.getByLabelText("主题色色值")).toHaveValue("#12")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("finishes the admitted image save after navigation unmount without calling a stale session", async () => {
    const create = deferredResponse()
    const fetchMock = installFetchMock()
      .mockReturnValueOnce(create.promise)
      .mockResolvedValueOnce(
        Response.json({ status: "error", msg: "图片不可用" }, { status: 503 })
      )
    const { props, unmount } = renderCreate({ initialAgencyId: 1 })
    const user = userEvent.setup()
    await fillDraft(user)
    await user.upload(
      screen.getByLabelText("上传图片"),
      new File(["image"], "avatar.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "创建内容页" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    unmount()
    await act(async () =>
      create.resolve(
        Response.json({
          status: "success",
          idol: makeWikiAdminIdol({ id: 77 }),
        })
      )
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(requestDetails(fetchMock.mock.calls[1]!).method).toBe("PUT")
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
