import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderPage } from "@/tests/unit/support/harness"
import { beforeEach, expect, it, vi } from "vitest"
import {
  makeAdminOfficeReview,
  makeFudabaOwnerOffice,
  makeFudabaSeries,
} from "@/mocks/data/fudaba"
import {
  ApiError,
  type AdminOfficeReview,
  type UpdateFudabaOfficeInput,
} from "~/lib/api"
import AdminCommunityExchangePage from "~/pages/admin/community/exchange/admin-community-exchange-page"

const mocks = vi.hoisted(() => ({
  item: null as AdminOfficeReview | null,
  role: "super_admin",
  list: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  review: vi.fn(),
  config: vi.fn(),
  reverse: vi.fn(),
  search: vi.fn(),
  publicSearch: vi.fn(),
  publicReverse: vi.fn(),
  mapProps: null as
    | import("~/pages/community/exchange/maps/exchange-map-provider").ExchangeMapInteractionProps
    | null,
  userProps: null as
    | import("~/pages/admin/platform-users/user-detail-dialog").UserDetailDialogProps
    | null,
}))
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  useOutletContext: () => ({ adminSession: { adminRole: mocks.role } }),
}))
vi.mock("~/lib/api", async (original) => {
  const actual = await original<typeof import("~/lib/api")>()
  const method = (send: () => Promise<unknown>) => ({
    send,
    abort: async () => undefined,
  })
  return {
    ...actual,
    getAdminOfficeReviews: (state: string) => method(() => mocks.list(state)),
    getAdminOffice: (id: string) => method(() => mocks.detail(id)),
    updateAdminOffice: (id: string, input: unknown) =>
      method(() => mocks.update(id, input)),
    reviewAdminOffice: (id: string, input: unknown) =>
      method(() => mocks.review(id, input)),
    getAdminOfficeSeries: () =>
      method(async () => ({ items: [makeFudabaSeries()] })),
    getAdminOfficeMapConfig: () => method(() => mocks.config()),
    reverseAdminOfficePlace: (point: unknown) =>
      method(() => mocks.reverse(point)),
    searchAdminOfficePlaces: (query: string) =>
      method(() => mocks.search(query)),
    searchFudabaPlaces: mocks.publicSearch,
    reverseFudabaPlace: mocks.publicReverse,
  }
})
vi.mock("~/pages/community/exchange/maps/exchange-map-renderer", () => ({
  loadExchangeMapRenderer: async () =>
    function ReviewMap(
      props: import("~/pages/community/exchange/maps/exchange-map-provider").ExchangeMapInteractionProps
    ) {
      mocks.mapProps = props
      return <div aria-label="审核地图">只读地图</div>
    },
}))
vi.mock("~/pages/admin/platform-users/user-detail-dialog", () => ({
  UserDetailDialog: (
    props: import("~/pages/admin/platform-users/user-detail-dialog").UserDetailDialogProps
  ) => {
    mocks.userProps = props
    return props.userId ? (
      <div role="dialog" aria-label="现有用户详情">
        {props.label}
        <button onClick={() => props.onOpenChange(false)}>关闭用户</button>
      </div>
    ) : null
  },
}))

const current = () => {
  if (!mocks.item) throw new Error("missing fixture")
  return mocks.item
}
const mount = () =>
  renderPage(<AdminCommunityExchangePage />)
async function open(edit = true) {
  await userEvent.click(
    await screen.findByRole("button", {
      name: edit ? "编辑" : "查看详情",
    })
  )
  await screen.findByRole("dialog")
  if (edit) await screen.findByRole("textbox", { name: "事务所名称" })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.role = "super_admin"
  mocks.mapProps = null
  mocks.userProps = null
  mocks.item = makeAdminOfficeReview({
    office: makeFudabaOwnerOffice({
      id: "review-office",
      name: "测试事务所",
      city: "成都市",
      address: "天府二街123号",
      location: {
        latitude: 30.552371337165454,
        longitude: 104.04275126443116,
        precision: "exact",
      },
      revision: 3,
    }),
  })
  mocks.list.mockImplementation(async (state: string) => ({
    items: current().office.reviewState === state ? [current()] : [],
  }))
  mocks.detail.mockImplementation(async () => ({ item: current() }))
  mocks.config.mockResolvedValue({
    provider: "maplibre",
    styleUrl: "https://tiles.example.test/style.json",
    search: { provider: "nominatim" },
  })
  const place = {
    id: "picked-place",
    label: "新地点",
    city: "上海市",
    address: "新地点地址",
    location: { latitude: 31.1842, longitude: 121.4665, precision: "exact" },
  }
  mocks.search.mockResolvedValue({
    items: [place],
    attribution: "测试地址服务",
  })
  mocks.reverse.mockResolvedValue({
    place: { ...place, address: "浮标对应的新详细地址" },
    attribution: null,
  })
  mocks.update.mockImplementation(
    async (_id: string, input: UpdateFudabaOfficeInput) => {
      const item = current()
      mocks.item = {
        ...item,
        reviewer: null,
        office: {
          ...item.office,
          name: input.name,
          intro: input.intro,
          city: input.city,
          address: input.address,
          accent: input.accent,
          isOpen: input.isOpen,
          seriesCodes: input.seriesCodes,
          location: {
            latitude: input.latitude,
            longitude: input.longitude,
            precision: "exact",
          },
          revision: input.expectedRevision + 1,
          reviewState: "pending",
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: "",
        },
      }
      return { success: true, item: current() }
    }
  )
  mocks.review.mockImplementation(
    async (
      _id: string,
      input: {
        decision: "publish" | "reject" | "withdraw"
        expectedRevision: number
        note: string
      }
    ) => {
      const item = current()
      mocks.item = {
        ...item,
        reviewer:
          input.decision === "withdraw"
            ? null
            : {
                id: 17,
                username: "admin-login",
                displayName: "管理员昵称",
              },
        office: {
          ...item.office,
          reviewState:
            input.decision === "publish"
              ? "published"
              : input.decision === "withdraw"
                ? "pending"
                : "rejected",
          revision: input.expectedRevision + 2,
          reviewedBy: input.decision === "withdraw" ? null : 17,
          reviewedAt:
            input.decision === "withdraw" ? null : "2026-10-27T01:00:00Z",
          reviewNote: input.note,
        },
      }
      return { success: true, item: current() }
    }
  )
})

it("keeps details readonly and opens the shared form only through an explicit edit action", async () => {
  mount()
  expect(await screen.findByText("测试事务所")).toBeVisible()
  expect(
    screen.getByRole("link", { name: "producer@example.test" })
  ).toHaveAttribute(
    "href",
    expect.stringContaining("highlight=platform-owner-1")
  )
  expect(
    screen.queryByRole("textbox", { name: "事务所名称" })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(/0\.1°|公开同意时间|管理员 #/)
  ).not.toBeInTheDocument()
  await open(false)
  expect(
    screen.queryByRole("textbox", { name: "事务所名称" })
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "编辑资料" }))
  expect(screen.getByRole("textbox", { name: "详细地址" })).toHaveValue(
    "天府二街123号"
  )
  expect(screen.getByRole("textbox", { name: "纬度" })).toHaveValue(
    "30.552371337165454"
  )
  expect(screen.getByRole("textbox", { name: "经度" })).toHaveValue(
    "104.04275126443116"
  )
  expect(mocks.detail).toHaveBeenCalledWith("review-office")
})

it("previews the saved exact coordinates in a readonly map without reverse lookup or an editable picker", async () => {
  mount()
  await open(false)
  await userEvent.click(screen.getByRole("button", { name: "在地图中查看" }))
  await screen.findByLabelText("审核地图")
  expect(mocks.mapProps?.selectedPlace?.target).toEqual({
    kind: "wgs84",
    position: [104.04275126443116, 30.552371337165454],
  })
  expect(mocks.mapProps?.pointPicker).toBeUndefined()
  expect(mocks.mapProps?.persistViewport).toBe(false)
  expect(mocks.reverse).not.toHaveBeenCalled()
  expect(screen.getAllByText(/天府二街123号/).length).toBeGreaterThan(0)
  await userEvent.click(screen.getByRole("button", { name: "关闭地图" }))
  expect(screen.queryByLabelText("审核地图")).not.toBeInTheDocument()
})

it("saves edits as a new pending revision before allowing an explicit whole-office approval", async () => {
  mount()
  await open()
  fireEvent.change(screen.getByRole("textbox", { name: "事务所介绍" }), {
    target: { value: "管理员修订介绍" },
  })
  expect(
    screen.queryByRole("button", { name: "通过并发布" })
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "保存并提交审核" }))
  await screen.findByText(/修改已保存并进入待审核/)
  expect(mocks.update).toHaveBeenCalledWith(
    "review-office",
    expect.objectContaining({
      intro: "管理员修订介绍",
      expectedRevision: 3,
      latitude: 30.552371337165454,
      longitude: 104.04275126443116,
    })
  )
  await userEvent.click(screen.getByRole("button", { name: "通过并发布" }))
  await screen.findByText(/事务所整体审核已通过/)
  expect(mocks.review).toHaveBeenCalledExactlyOnceWith("review-office", {
    decision: "publish",
    expectedRevision: 4,
    note: "",
  })
  expect(screen.getByText("admin-login")).toBeVisible()
})

it("reuses the editable owner picker through Backoffice lookups without using Platform requests", async () => {
  mount()
  await open()
  await userEvent.click(
    screen.getByRole("button", { name: "搜索地点与地图选点" })
  )
  await userEvent.type(
    await screen.findByRole("textbox", { name: "搜索地点" }),
    "新地点{Enter}"
  )
  await userEvent.click(
    await screen.findByRole("button", { name: /新地点.*新地点地址/ })
  )
  expect(mocks.reverse).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole("button", { name: "确认位置并填写地址" })
  )
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "详细地址" })).toHaveValue(
      "浮标对应的新详细地址"
    )
  )
  expect(mocks.search).toHaveBeenCalledWith("新地点")
  expect(mocks.reverse).toHaveBeenCalledWith({
    latitude: 31.1842,
    longitude: 121.4665,
  })
  expect(mocks.publicSearch).not.toHaveBeenCalled()
  expect(mocks.publicReverse).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(
    screen.queryByRole("button", { name: "通过并发布" })
  ).not.toBeInTheDocument()
})

it("requires a rejection reason at the review field", async () => {
  mount()
  await open(false)
  await userEvent.click(screen.getByRole("button", { name: "拒绝" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("必须填写审核理由")
  expect(mocks.review).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole("textbox", { name: /审核备注/ }), {
    target: { value: "请补充门牌" },
  })
  await userEvent.click(screen.getByRole("button", { name: "拒绝" }))
  expect(mocks.review).toHaveBeenCalledWith("review-office", {
    decision: "reject",
    expectedRevision: 3,
    note: "请补充门牌",
  })
})

it("retains edited fields on CAS conflict and requires explicit latest-version reload", async () => {
  mocks.update.mockRejectedValueOnce(
    new ApiError("conflict", {
      kind: "http",
      status: 409,
      code: "FUDABA_OFFICE_CONFLICT",
    })
  )
  mount()
  await open()
  fireEvent.change(screen.getByRole("textbox", { name: "详细地址" }), {
    target: { value: "尚未保存地址" },
  })
  await userEvent.click(screen.getByRole("button", { name: "保存并提交审核" }))
  await screen.findByText(/输入已保留/)
  expect(screen.getByRole("textbox", { name: "详细地址" })).toHaveValue(
    "尚未保存地址"
  )
  expect(
    screen.queryByRole("button", { name: "通过并发布" })
  ).not.toBeInTheDocument()
  mocks.item = {
    ...current(),
    office: { ...current().office, address: "最新服务器地址", revision: 12 },
  }
  await userEvent.click(screen.getByRole("button", { name: "载入最新事务所" }))
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "详细地址" })).toHaveValue(
      "最新服务器地址"
    )
  )
})

it("falls back to names, reuses the existing user dialog, and links to exact user-management highlighting", async () => {
  mocks.item = {
    ...current(),
    owner: { id: "oauth-owner", email: null, displayName: "用户昵称" },
    reviewer: { id: 17, username: null, displayName: "审核昵称" },
    office: {
      ...current().office,
      reviewState: "published",
      reviewedBy: 17,
      reviewedAt: "2026-10-27T01:00:00Z",
    },
  }
  mount()
  await userEvent.click(await screen.findByRole("tab", { name: "已发布" }))
  await open(false)
  expect(screen.getByText("审核昵称")).toBeVisible()
  expect(screen.getByRole("link", { name: /用户管理/ })).toHaveAttribute(
    "href",
    "/admin/platform/users?field=id&query=oauth-owner&highlight=oauth-owner"
  )
  await userEvent.click(screen.getByRole("button", { name: "用户昵称" }))
  expect(
    within(screen.getByRole("dialog", { name: "现有用户详情" })).getByText(
      "用户昵称"
    )
  ).toBeVisible()
  expect(mocks.userProps?.onRequestUnlink).toBeUndefined()
  expect(mocks.userProps?.userId).toBe("oauth-owner")
})

it("keeps a late previous-tab queue response out of the current tab", async () => {
  const pending = deferred<{ items: AdminOfficeReview[] }>()
  mocks.list.mockImplementation((state: string) =>
    state === "pending"
      ? pending.promise
      : Promise.resolve({
          items: [
            {
              ...current(),
              office: { ...current().office, reviewState: "published" },
            },
          ],
        })
  )
  mount()
  await userEvent.click(screen.getByRole("tab", { name: "已发布" }))
  await screen.findByText("测试事务所")
  await act(async () => {
    pending.resolve({ items: [] })
    await pending.promise
  })
  expect(screen.getByText("测试事务所")).toBeVisible()
})

it("preserves existing user-management authorization and blocks editing a review-locked snapshot", async () => {
  mocks.role = "admin"
  mocks.item = {
    ...current(),
    office: { ...current().office, reviewInProgress: true },
  }
  mount()
  await open(false)
  expect(
    screen.queryByRole("link", { name: /用户管理|producer@example/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "编辑资料" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "通过并发布" })).toBeDisabled()
  expect(mocks.userProps).toBeNull()
})

it("offers withdrawal only for a published snapshot and requires explicit confirmation", async () => {
  mocks.item = {
    ...current(),
    office: {
      ...current().office,
      reviewState: "published",
      reviewedBy: 17,
      reviewedAt: "2026-10-27T01:00:00Z",
    },
  }
  mount()
  await userEvent.click(await screen.findByRole("tab", { name: "已发布" }))
  await open(false)
  expect(
    screen.queryByRole("button", { name: "通过并发布" })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "撤回发布" }))
  expect(screen.getByText("确认撤回发布？")).toBeVisible()
  expect(mocks.review).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "确认撤回" }))
  await screen.findByText(/已撤回发布，事务所已停止公开/)
  expect(mocks.review).toHaveBeenCalledExactlyOnceWith("review-office", {
    decision: "withdraw",
    expectedRevision: 3,
    note: "",
  })
  expect(screen.getByRole("button", { name: "通过并发布" })).toBeEnabled()
})

it("shows the rejection reason and resubmits through the same edit form without approving automatically", async () => {
  mocks.item = {
    ...current(),
    office: {
      ...current().office,
      reviewState: "rejected",
      reviewedBy: 17,
      reviewedAt: "2026-10-27T01:00:00Z",
      reviewNote: "请补充完整门牌",
    },
  }
  mount()
  await userEvent.click(await screen.findByRole("tab", { name: "已拒绝" }))
  expect(await screen.findByText("请补充完整门牌")).toBeVisible()
  expect(screen.getByText("拒绝理由：")).toBeVisible()
  await open(false)
  expect(screen.getByRole("alert")).toHaveTextContent("请补充完整门牌")
  expect(
    screen.queryByRole("button", { name: "通过并发布" })
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "修改并重新提交" }))
  expect(mocks.update).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole("textbox", { name: "详细地址" }), {
    target: { value: "完整门牌123号" },
  })
  await userEvent.click(screen.getByRole("button", { name: "保存并提交审核" }))
  await screen.findByText(/修改已保存并进入待审核/)
  expect(mocks.update).toHaveBeenCalledWith(
    "review-office",
    expect.objectContaining({ address: "完整门牌123号", expectedRevision: 3 })
  )
  expect(mocks.review).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "通过并发布" })).toBeEnabled()
})
