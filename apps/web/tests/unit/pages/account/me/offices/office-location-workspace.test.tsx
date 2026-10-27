import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { makeFudabaOwnerOffice, makeFudabaSeries } from "@/mocks/data/fudaba"
import {
  ApiError,
  type FudabaOwnerOffice,
  type UpdateFudabaOfficeInput,
} from "~/lib/api"
import { OfficeLocationWorkspace } from "~/pages/account/me/offices/office-location-workspace"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaOwnerOffices: () => ({ send: mocks.list }),
  getFudabaOwnerOffice: (id: string) => ({ send: () => mocks.detail(id) }),
  createFudabaOffice: (input: unknown, key: string) => ({
    send: () => mocks.create(input, key),
  }),
  updateFudabaOwnerOffice: (id: string, input: unknown) => ({
    send: () => mocks.update(id, input),
  }),
}))

// Isolate the workspace's mutation/selection lifecycle. The actual picker has its
// own integration cases and is exercised by the Web/App browser fixtures.
vi.mock("~/pages/account/me/offices/office-editor", () => ({
  OfficeEditor: (
    props: Parameters<
      typeof import("~/pages/account/me/offices/office-editor").OfficeEditor
    >[0]
  ) => (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      {(
        [
          ["name", "事务所名称"],
          ["intro", "事务所介绍"],
          ["city", "城市"],
          ["address", "详细地址"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            aria-label={label}
            value={props.draft[key]}
            disabled={props.disabled || props.busy}
            onChange={(event) =>
              props.onChange({
                ...props.draft,
                [key]: event.currentTarget.value,
              })
            }
          />
        </label>
      ))}
      <button
        type="button"
        disabled={props.disabled || props.busy}
        onClick={() =>
          props.onChange({
            ...props.draft,
            city: "上海市",
            address: "确认地点的地址",
            latitude: "31.230412345",
            longitude: "121.473712345",
          })
        }
      >
        选用有效地点
      </button>
      <button type="submit" disabled={props.disabled || props.busy}>
        {props.mode === "create" ? "创建事务所" : "保存事务所"}
      </button>
      {props.feedback ? <p role="alert">{props.feedback.message}</p> : null}
      {props.feedback?.kind === "conflict" ? (
        <button type="button" onClick={props.onReload}>
          载入最新事务所
        </button>
      ) : null}
    </form>
  ),
}))

const office = makeFudabaOwnerOffice({
  id: "office-a",
  name: "上海事务所",
  reviewState: "published",
  reviewedAt: "2026-01-02T01:00:00Z",
  reviewedBy: 17,
})
const second = makeFudabaOwnerOffice({
  id: "office-b",
  name: "北京事务所",
  city: "北京市",
  address: "北京地址",
  revision: 7,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function mount(
  extra: Partial<Parameters<typeof OfficeLocationWorkspace>[0]> = {}
) {
  return render(
    <OfficeLocationWorkspace
      series={[makeFudabaSeries()]}
      homeCity="上海"
      readOnly={false}
      onWriteClosed={vi.fn()}
      {...extra}
    />
  )
}
async function open(index = 0) {
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "详情与编辑" }))[index]
  )
  await screen.findByLabelText("事务所名称")
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.list.mockResolvedValue({ items: [office, second] })
  mocks.detail.mockImplementation(async (id: string) => ({
    office: id === second.id ? second : office,
  }))
  mocks.create.mockResolvedValue({
    success: true,
    office: makeFudabaOwnerOffice({ id: "created-office" }),
  })
  mocks.update.mockImplementation(
    async (id: string, input: UpdateFudabaOfficeInput) => ({
      success: true,
      office: makeFudabaOwnerOffice({
        id,
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
      }),
    })
  )
})

it("shows aggregate review status and removes the independent public-location configuration", async () => {
  mount()
  await screen.findByText("已公开")
  expect(screen.getByText("待审核")).toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "公开位置配置" })
  ).not.toBeInTheDocument()
  await open()
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(office.id)
  expect(screen.queryByText(/同意公开精确位置/)).not.toBeInTheDocument()
})

it("saves a complete exact office with CAS and exposes its pending state", async () => {
  mount()
  await open()
  fireEvent.change(screen.getByLabelText("事务所名称"), {
    target: { value: "修改名称" },
  })
  fireEvent.change(screen.getByLabelText("事务所介绍"), {
    target: { value: "未保存介绍" },
  })
  await userEvent.click(screen.getByRole("button", { name: "保存事务所" }))
  await screen.findByText(/已保存并提交整体审核/)
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
    office.id,
    expect.objectContaining({
      name: "修改名称",
      intro: "未保存介绍",
      latitude: office.location.latitude,
      longitude: office.location.longitude,
      expectedRevision: office.revision,
    })
  )
})

it("creates once with an idempotency key and closes the shared dialog after submission", async () => {
  mocks.list.mockResolvedValue({ items: [] })
  mount()
  await userEvent.click(
    await screen.findByRole("button", { name: "新建事务所" })
  )
  fireEvent.change(screen.getByLabelText("事务所名称"), {
    target: { value: "新事务所" },
  })
  await userEvent.click(screen.getByRole("button", { name: "选用有效地点" }))
  await userEvent.click(screen.getByRole("button", { name: "创建事务所" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  )
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      name: "新事务所",
      address: "确认地点的地址",
      latitude: 31.230412345,
      longitude: 121.473712345,
    }),
    expect.stringMatching(/^fudaba-office-/)
  )
})

it("retains a failed create draft and reuses the same idempotency key on explicit retry", async () => {
  mocks.list.mockResolvedValue({ items: [] })
  mocks.create.mockRejectedValueOnce(new Error("offline"))
  mount()
  await userEvent.click(
    await screen.findByRole("button", { name: "新建事务所" })
  )
  fireEvent.change(screen.getByLabelText("事务所名称"), {
    target: { value: "待重试事务所" },
  })
  await userEvent.click(screen.getByRole("button", { name: "选用有效地点" }))
  await userEvent.click(screen.getByRole("button", { name: "创建事务所" }))
  await screen.findByRole("alert")
  expect(screen.getByLabelText("事务所名称")).toHaveValue("待重试事务所")
  expect(mocks.create).toHaveBeenCalledTimes(1)
  const key = mocks.create.mock.calls[0]?.[1]
  await userEvent.click(screen.getByRole("button", { name: "创建事务所" }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
  expect(mocks.create.mock.calls[1]?.[1]).toBe(key)
})

it("keeps a failed B selection isolated and explicitly retries B", async () => {
  mocks.detail.mockRejectedValueOnce(new Error("B unavailable"))
  mount()
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "详情与编辑" }))[1]
  )
  await screen.findByText("事务所详情载入失败")
  expect(screen.queryByLabelText("事务所名称")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "重试载入事务所" }))
  expect(await screen.findByLabelText("事务所名称")).toHaveValue(second.name)
  expect(mocks.detail.mock.calls.map((args) => args[0])).toEqual([
    second.id,
    second.id,
  ])
})

it("ignores a delayed A detail after B becomes the selected office", async () => {
  const pending = deferred<{ office: FudabaOwnerOffice }>()
  mocks.detail.mockImplementation((id: string) =>
    id === office.id ? pending.promise : Promise.resolve({ office: second })
  )
  mount()
  const buttons = await screen.findAllByRole("button", { name: "详情与编辑" })
  act(() => {
    buttons[0].click()
    buttons[1].click()
  })
  expect(await screen.findByLabelText("事务所名称")).toHaveValue(second.name)
  await act(async () => {
    pending.resolve({ office })
    await pending.promise
  })
  expect(screen.getByLabelText("事务所名称")).toHaveValue(second.name)
})

it("preserves input on conflict and only replaces it after explicit latest-version loading", async () => {
  mocks.update.mockRejectedValueOnce(
    new ApiError("conflict", {
      kind: "http",
      status: 409,
      code: "FUDABA_OFFICE_CONFLICT",
    })
  )
  mount()
  await open()
  fireEvent.change(screen.getByLabelText("详细地址"), {
    target: { value: "尚未保存的新地址" },
  })
  await userEvent.click(screen.getByRole("button", { name: "保存事务所" }))
  await screen.findByText(/当前输入仍保留/)
  expect(screen.getByLabelText("详细地址")).toHaveValue("尚未保存的新地址")
  mocks.detail.mockResolvedValue({
    office: { ...office, address: "服务器的新地址", revision: 8 },
  })
  await userEvent.click(screen.getByRole("button", { name: "载入最新事务所" }))
  await waitFor(() =>
    expect(screen.getByLabelText("详细地址")).toHaveValue("服务器的新地址")
  )
})

it("locks navigation and close while an office mutation is pending", async () => {
  const pending = deferred<{ success: true; office: FudabaOwnerOffice }>()
  mocks.update.mockReturnValueOnce(pending.promise)
  mount()
  await open()
  await userEvent.click(screen.getByRole("button", { name: "保存事务所" }))
  expect(
    screen.getByRole("button", { name: "新建事务所", hidden: true })
  ).toBeDisabled()
  expect(
    screen.getAllByRole("button", { name: "详情与编辑", hidden: true })[1]
  ).toBeDisabled()
  await userEvent.keyboard("{Escape}")
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  await act(async () => {
    pending.resolve({ success: true, office })
    await pending.promise
  })
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存事务所" })).toBeEnabled()
  )
})

it("does not apply a delayed save after a same-frame selection changes its target", async () => {
  const pending = deferred<{ success: true; office: FudabaOwnerOffice }>()
  mocks.update.mockReturnValueOnce(pending.promise)
  mount()
  await open()
  const save = screen.getByRole("button", { name: "保存事务所" }),
    other = screen.getAllByRole("button", {
      name: "详情与编辑",
      hidden: true,
    })[1]
  act(() => {
    save.click()
    other.click()
  })
  await waitFor(() =>
    expect(screen.getByLabelText("事务所名称")).toHaveValue(second.name)
  )
  await act(async () => {
    pending.resolve({ success: true, office: { ...office, name: "迟到响应" } })
    await pending.promise
  })
  expect(screen.getByLabelText("事务所名称")).toHaveValue(second.name)
})

it("prefills the requested office and retains approval on an identical-save response", async () => {
  mocks.update.mockResolvedValue({ success: true, office })
  mount({ initialOfficeId: office.id })
  await screen.findByLabelText("事务所名称")
  await userEvent.click(screen.getByRole("button", { name: "保存事务所" }))
  expect(await screen.findByText(/资料未发生变化/)).toBeVisible()
})

it("recovers a failed office-list load without manufacturing a create or review request", async () => {
  mocks.list.mockRejectedValueOnce(new Error("offline"))
  mount()
  await screen.findByText("事务所工作区暂时无法加载")
  await userEvent.click(screen.getByRole("button", { name: "重新载入" }))
  await screen.findAllByRole("button", { name: "详情与编辑" })
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it("uses read-only permissions for the existing form", async () => {
  mount({ readOnly: true, initialOfficeId: office.id })
  expect(await screen.findByLabelText("事务所名称")).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存事务所" })).toBeDisabled()
})
