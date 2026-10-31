import { StrictMode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { ConfiguredOfficePicker } from "~/pages/account/me/offices/configured-office-picker"
import { emptyOfficeDraft } from "~/pages/account/me/offices/office-location-model"

const mocks = vi.hoisted(() => ({
  config: { provider: "regional", search: { provider: "federated" } },
  searcher: vi.fn(),
  configGet: vi.fn(),
  reverse: vi.fn(),
  send: vi.fn(async (request: unknown, signal: AbortSignal) => {
    void signal
    return request
  }),
  props: null as
    | null
    | import("~/pages/community/exchange/maps/exchange-map-provider").ExchangeMapInteractionProps,
  cleanup: vi.fn(),
}))
vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getFudabaMapConfig: mocks.configGet,
  reverseFudabaPlace: mocks.reverse,
  sendWithAbort: mocks.send,
}))
vi.mock("~/pages/community/exchange/maps/exchange-map-search", () => ({
  loadExchangeMapSearch: async () => mocks.searcher,
}))
vi.mock("~/pages/community/exchange/maps/resolve-point-address", () => ({
  createPointAddressResolver:
    () => (point: [number, number], signal: AbortSignal) =>
      mocks.send(
        mocks.reverse({ longitude: point[0], latitude: point[1] }),
        signal
      ),
}))
vi.mock("~/pages/community/exchange/maps/exchange-map-renderer", async () => {
  const { useEffect, useRef } = await import("react")
  return {
    loadExchangeMapRenderer: async () =>
      function Renderer(
        props: import("~/pages/community/exchange/maps/exchange-map-provider").ExchangeMapInteractionProps
      ) {
        mocks.props = props
        const initialProps = useRef(props)
        useEffect(() => {
          initialProps.current.onCameraChange?.(
            initialProps.current.initialViewport?.center ?? [127.1, 31.2]
          )
          return () => mocks.cleanup()
        }, [])
        return (
          <div
            tabIndex={0}
            aria-label="测试地图"
            onClick={() =>
              props.pointPicker?.onPick(
                { kind: "wgs84", position: [139.8, 35.7] },
                "click"
              )
            }
            onKeyDown={() =>
              props.onCameraChange?.([139.8, 35.7], {
                origin: "user",
                interactionTime: performance.now(),
              })
            }
          />
        )
      },
  }
})
vi.mock("~/pages/community/exchange/components/exchange-place-search", () => ({
  ExchangePlaceSearch: ({ onSelect }: { onSelect(place: unknown): void }) => (
    <button
      onClick={() =>
        onSelect({
          id: "canonical",
          label: "规范地点",
          city: "临时城市",
          address: "临时地址",
          location: { longitude: 121.4, latitude: 31.2, precision: "exact" },
        })
      }
    >
      选择规范地点
    </button>
  ),
  MapPlaceSearch: ({
    model,
    onSelect,
  }: {
    model: { submit(query: string): void }
    onSelect(place: unknown): void
  }) => (
    <>
      <button onClick={() => model.submit("上海")}>搜索</button>
      <button
        onClick={() =>
          onSelect({
            id: "native",
            label: "原生预览",
            address: "原生地址",
            target: {
              kind: "native",
              provider: "amap",
              position: [121.4, 31.2],
            },
          })
        }
      >
        预览原生位置
      </button>
      <button
        onClick={() =>
          onSelect({
            id: "second",
            label: "第二预览",
            address: "另一临时地址",
            target: { kind: "wgs84", position: [120, 30] },
          })
        }
      >
        预览第二位置
      </button>
      <button
        onClick={() =>
          onSelect({
            id: "estimated",
            label: "预览",
            address: "预览地址",
            target: { kind: "wgs84", position: [121.4, 31.2] },
          })
        }
      >
        预览估计位置
      </button>
      <button
        onClick={() =>
          onSelect({
            id: "amap-estimate",
            label: "高德预览",
            address: "临时地址",
            target: { kind: "wgs84", position: [121.4, 31.2] },
            source: {
              provider: "amap",
              coordinateSystem: "gcj02",
              position: [121.405, 31.197],
              calibration: "amap-forward-estimate",
            },
          })
        }
      >
        预览高德估算位置
      </button>
      {(["mapbox", "nominatim"] as const).map((provider) => (
        <button
          key={provider}
          onClick={() =>
            onSelect({
              id: provider,
              label: "规范地点",
              address: "临时地址",
              target: { kind: "wgs84", position: [121.4, 31.2] },
              source: {
                provider,
                coordinateSystem: "wgs84",
                position: [121.4, 31.2],
                calibration: "identity",
              },
            })
          }
        >
          预览{provider}位置
        </button>
      ))}
    </>
  ),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.configGet.mockResolvedValue(mocks.config)
  mocks.reverse.mockImplementation(async (point) => ({
    place: {
      id: "reverse",
      label: "解析地点",
      city: "上海市",
      address: "后端解析地址",
      location: { ...point, precision: "exact" },
    },
    attribution: {
      text: "© OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
    },
  }))
  mocks.searcher.mockResolvedValue({ items: [], attribution: "来源" })
})
it("keeps preview separate, snapshots viewport, and reverse fills an explicit map adjustment", async () => {
  const onChange = vi.fn(),
    onClose = vi.fn(),
    user = userEvent.setup()
  const view = render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft("上海")}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await screen.findByLabelText("测试地图")
  expect(mocks.props?.persistViewport).toBe(false)
  expect(mocks.props?.groups).toEqual([])
  await user.click(screen.getByText("预览估计位置"))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
  expect(mocks.reverse).not.toHaveBeenCalled()
  await user.click(screen.getByText("搜索"))
  await waitFor(() => expect(mocks.searcher).toHaveBeenCalled())
  expect(mocks.searcher.mock.calls[0]?.[2]).toHaveProperty("viewportCenter")
  // Browsing the camera never moves the already previewed point.
  act(() => mocks.props?.onCameraChange?.([121.4, 31.2]))
  expect(mocks.props?.pointPicker?.target?.position).toEqual([121.4, 31.2])
  fireEvent.click(screen.getByLabelText("测试地图"))
  await user.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      longitude: "139.8",
      latitude: "35.7",
      city: "上海市",
      address: "后端解析地址",
    })
  )
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  expect(mocks.cleanup).toHaveBeenCalledOnce()
})
it("cancel never writes preview coordinates", async () => {
  const onChange = vi.fn(),
    onClose = vi.fn(),
    user = userEvent.setup()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await screen.findByLabelText("测试地图")
  await user.click(screen.getByText("预览估计位置"))
  await user.click(screen.getByText("取消选点"))
  expect(onChange).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it("requires an explicit map pick or marker drag before saving an AMap estimate", async () => {
  const onChange = vi.fn(),
    onClose = vi.fn(),
    user = userEvent.setup()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await screen.findByLabelText("测试地图")
  await user.click(screen.getByText("预览高德估算位置"))
  expect(mocks.props?.selectedPlace?.source?.calibration).toBe(
    "amap-forward-estimate"
  )
  expect(screen.getByRole("status")).toHaveTextContent("此搜索结果仅供预览")
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  act(() =>
    mocks.props?.onCameraChange?.([121.4, 31.2], { origin: "programmatic" })
  )
  fireEvent.keyDown(screen.getByLabelText("测试地图"), { key: "ArrowRight" })
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  expect(mocks.reverse).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()

  act(() =>
    mocks.props?.onCameraChange?.([121.5, 31.3], {
      origin: "user",
      interactionTime: 0,
    })
  )
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  act(() =>
    mocks.props?.onCameraChange?.([121.6, 31.3], { origin: "programmatic" })
  )
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  act(() => mocks.props?.pointPicker?.onPickStart?.())
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  act(() =>
    mocks.props?.pointPicker?.onPick(
      { kind: "wgs84", position: [139.8, 35.7] },
      "drag"
    )
  )
  await user.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
    longitude: 139.8,
    latitude: 35.7,
  })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      longitude: "139.8",
      latitude: "35.7",
      city: "上海市",
      address: "后端解析地址",
    })
  )
  expect(onClose).toHaveBeenCalledOnce()
})

it.each(["mapbox", "nominatim"])(
  "allows explicit confirmation and reverse fill for an identity %s candidate",
  async (provider) => {
    const onChange = vi.fn(),
      onClose = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    )
    await screen.findByLabelText("测试地图")
    await userEvent.click(screen.getByText(`预览${provider}位置`))
    expect(onChange).not.toHaveBeenCalled()
    expect(mocks.reverse).not.toHaveBeenCalled()
    expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
      longitude: 121.4,
      latitude: 31.2,
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        longitude: "121.4",
        latitude: "31.2",
        city: "上海市",
        address: "后端解析地址",
      })
    )
    expect(onClose).toHaveBeenCalledOnce()
  }
)

it("native renderer rejects native coordinates and requires explicit canonical confirmation", async () => {
  mocks.configGet.mockResolvedValue({
    provider: "amap",
    search: { provider: "amap" },
  })
  const onChange = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  await userEvent.click(screen.getByText("预览原生位置"))
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  act(() =>
    mocks.props?.onCameraChange?.([121.4, 31.2], {
      origin: "user",
      interactionTime: performance.now(),
    })
  )
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  expect(mocks.reverse).not.toHaveBeenCalled()
  await userEvent.click(screen.getByText("规范地址搜索"))
  await userEvent.click(screen.getByText("选择规范地点"))
  expect(onChange).not.toHaveBeenCalled()
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(mocks.reverse).toHaveBeenCalledWith({
    longitude: 121.4,
    latitude: 31.2,
  })
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ city: "上海市", address: "后端解析地址" })
  )
})

it.each(["wheel", "touchMove"] as const)(
  "does not authorize a late programmatic camera after %s without center movement",
  async (input) => {
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    fireEvent[input](screen.getByLabelText("测试地图"))
    await import("@testing-library/react").then(({ act }) =>
      act(() => mocks.props?.onCameraChange?.([120, 30]))
    )
    expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  }
)

it.each([
  [NaN, 0],
  [Infinity, 0],
  [0, Infinity],
  [0, 91],
])(
  "rejects invalid camera %j without poisoning search context",
  async (lng, lat) => {
    const onChange = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={onChange}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    const { act } = await import("@testing-library/react")
    fireEvent.wheel(screen.getByLabelText("测试地图"))
    act(() =>
      mocks.props?.onCameraChange?.([lng, lat], {
        origin: "user",
        interactionTime: performance.now(),
      })
    )
    act(() =>
      mocks.props?.pointPicker?.onPick(
        { kind: "wgs84", position: [lng, lat] },
        "click"
      )
    )
    expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  }
)
it.each([
  [181, 0, -179],
  [0, 0, 0],
])(
  "normalizes a picked point %j without moving it on later camera updates",
  async (lng, lat, expected) => {
    const onChange = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={onChange}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    const { act } = await import("@testing-library/react")
    act(() =>
      mocks.props?.pointPicker?.onPick(
        { kind: "wgs84", position: [lng, lat] },
        "click"
      )
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        longitude: String(expected),
        latitude: String(lat),
      })
    )
    act(() => mocks.props?.onCameraChange?.([121, 30]))
    expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
    expect(mocks.props?.pointPicker?.target?.position).toEqual([expected, lat])
  }
)
it("does not authorize a point from an old camera interaction", async () => {
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  const { act } = await import("@testing-library/react")
  act(() =>
    mocks.props?.onCameraChange?.([120, 30], {
      origin: "user",
      interactionTime: 0,
    })
  )
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
})

it("shows an already bound pin without assigning a new office's default camera centre", async () => {
  const draft = {
    ...emptyOfficeDraft(null),
    longitude: "121.5",
    latitude: "31.2",
  }
  const view = render(
    <ConfiguredOfficePicker
      draft={draft}
      disabled={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  expect(mocks.props?.pointPicker?.target).toEqual({
    kind: "wgs84",
    position: [121.5, 31.2],
  })
  expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
  view.unmount()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  expect(mocks.props?.pointPicker?.target).toBeNull()
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
})

it("does not pick or bind locations while the enclosing form is disabled", async () => {
  const onChange = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled
      onChange={onChange}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  act(() =>
    mocks.props?.pointPicker?.onPick(
      { kind: "wgs84", position: [121.5, 31.2] },
      "click"
    )
  )
  expect(mocks.props?.pointPicker?.target).toBeNull()
  expect(mocks.props?.pointPicker?.disabled).toBe(true)
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  expect(onChange).not.toHaveBeenCalled()
  expect(mocks.reverse).not.toHaveBeenCalled()
})

it("starts a single config request under StrictMode probe teardown", async () => {
  render(
    <StrictMode>
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />
    </StrictMode>
  )
  await screen.findByLabelText("测试地图")
  expect(mocks.configGet).toHaveBeenCalledOnce()
})

it("uses the camera only after the explicit keyboard alternative and retains the picked pin", async () => {
  const onChange = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  fireEvent.keyDown(screen.getByLabelText("测试地图"), { key: "ArrowRight" })
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  await userEvent.click(screen.getByText("使用地图中心"))
  expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
  const { act } = await import("@testing-library/react")
  act(() => mocks.props?.onCameraChange?.([120, 30]))
  expect(screen.getByText("确认位置并填写地址")).toBeEnabled()
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ longitude: "139.8", latitude: "35.7" })
  )
})

function pendingReverse() {
  let resolve!: (value: import("~/lib/api").FudabaPlaceReverseResponse) => void
  const promise = new Promise<import("~/lib/api").FudabaPlaceReverseResponse>(
    (done) => {
      resolve = done
    }
  )
  return { promise, resolve }
}

const reverseResponse = {
  place: {
    id: "resolved",
    label: "确定地点",
    city: "上海市",
    address: "后端解析地址",
    location: { longitude: 121.4, latitude: 31.2, precision: "exact" as const },
  },
  attribution: { text: "© Mapbox", url: "https://www.mapbox.com/about/maps/" },
}

it("previews the clicked pin's address without binding it and confirms without a duplicate lookup", async () => {
  const { act } = await import("@testing-library/react")
  const pending = pendingReverse()
  mocks.reverse.mockReturnValueOnce(pending.promise)
  const onChange = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={vi.fn()}
    />
  )
  await screen.findByLabelText("测试地图")
  act(() =>
    mocks.props?.pointPicker?.onPick(
      { kind: "wgs84", position: [121.4, 31.2] },
      "click"
    )
  )
  expect(
    screen.getByRole("region", { name: "浮标地址预览" })
  ).toHaveTextContent("正在解析")
  expect(onChange).not.toHaveBeenCalled()
  await act(async () => {
    pending.resolve(reverseResponse)
    await pending.promise
  })
  expect(
    screen.getByRole("region", { name: "浮标地址预览" })
  ).toHaveTextContent("后端解析地址")
  expect(onChange).not.toHaveBeenCalled()
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
    longitude: 121.4,
    latitude: 31.2,
  })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      city: "上海市",
      address: "后端解析地址",
      longitude: "121.4",
      latitude: "31.2",
    })
  )
})

it.each(["confirm", "manual", "new-point"])(
  "protects edits across a failed pin lookup and %s retry",
  async (outcome) => {
    const { act } = await import("@testing-library/react")
    const pending = pendingReverse()
    mocks.reverse.mockReturnValueOnce(pending.promise)
    const onChange = vi.fn(),
      onClose = vi.fn()
    const draft = { ...emptyOfficeDraft("旧城市"), address: "旧地址" }
    const view = render(
      <ConfiguredOfficePicker
        draft={draft}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    )
    await screen.findByLabelText("测试地图")
    act(() =>
      mocks.props?.pointPicker?.onPick(
        { kind: "wgs84", position: [121.4, 31.2] },
        "click"
      )
    )
    view.rerender(
      <ConfiguredOfficePicker
        draft={{ ...draft, city: "手改城市", address: "手改地址" }}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    )
    await act(async () => {
      pending.resolve({ place: null, attribution: null })
      await pending.promise
    })
    expect(await screen.findByRole("alert")).toHaveTextContent("未找到")
    expect(onChange).not.toHaveBeenCalled()
    if (outcome === "manual")
      mocks.reverse.mockResolvedValueOnce({ place: null, attribution: null })
    else mocks.reverse.mockResolvedValueOnce(reverseResponse)
    if (outcome === "new-point") {
      act(() =>
        mocks.props?.pointPicker?.onPick(
          { kind: "wgs84", position: [120, 30] },
          "click"
        )
      )
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "浮标地址预览" })
        ).toHaveTextContent("后端解析地址")
      )
    }
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    if (outcome === "manual")
      await userEvent.click(
        await screen.findByRole("button", { name: "使用此位置，手动填写地址" })
      )
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(
        outcome === "new-point"
          ? {
              city: "上海市",
              address: "后端解析地址",
              longitude: "120",
              latitude: "30",
            }
          : {
              city: "手改城市",
              address: "手改地址",
              longitude: "121.4",
              latitude: "31.2",
            }
      )
    )
    expect(mocks.reverse).toHaveBeenCalledTimes(2)
  }
)

it("invalidates an earlier confirmation when an estimate is previewed and cancelled", async () => {
  const pending = pendingReverse()
  mocks.reverse.mockReturnValueOnce(pending.promise)
  const onChange = vi.fn(),
    onClose = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={emptyOfficeDraft(null)}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await screen.findByLabelText("测试地图")
  await userEvent.click(screen.getByText("预览mapbox位置"))
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  const signal = mocks.send.mock.calls.at(-1)![1]
  await userEvent.click(screen.getByText("预览高德估算位置"))
  expect(signal.aborted).toBe(true)
  expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
  await userEvent.click(screen.getByText("取消选点"))
  await act(async () => {
    pending.resolve(reverseResponse)
    await pending.promise
  })
  expect(mocks.reverse).toHaveBeenCalledOnce()
  expect(onChange).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})

it("confirms a canonical search preview directly without requiring a map gesture", async () => {
  const onChange = vi.fn(),
    onClose = vi.fn(),
    onResolved = vi.fn()
  render(
    <ConfiguredOfficePicker
      draft={{ ...emptyOfficeDraft("旧城市"), address: "旧地址" }}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
      onResolved={onResolved}
    />
  )
  await screen.findByLabelText("测试地图")
  await userEvent.click(screen.getByText("预览估计位置"))
  act(() =>
    mocks.props?.onCameraChange?.([121.4, 31.2], { origin: "programmatic" })
  )
  expect(onChange).not.toHaveBeenCalled()
  expect(mocks.reverse).not.toHaveBeenCalled()
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
    longitude: 121.4,
    latitude: 31.2,
  })
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      city: "上海市",
      address: "后端解析地址",
      longitude: "121.4",
      latitude: "31.2",
    })
  )
  expect(onResolved).toHaveBeenCalledWith(
    expect.objectContaining({ text: "© OpenStreetMap contributors" })
  )
  expect(onClose).toHaveBeenCalledOnce()
})

it.each(["city", "address", "both", "neither"])(
  "protects later %s edits and all unrelated draft fields while resolving",
  async (field) => {
    const pending = pendingReverse()
    mocks.reverse.mockReturnValueOnce(pending.promise)
    const onChange = vi.fn(),
      onClose = vi.fn()
    const draft = { ...emptyOfficeDraft("旧城市"), address: "旧地址" }
    const view = render(
      <ConfiguredOfficePicker
        draft={draft}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    )
    await screen.findByLabelText("测试地图")
    await userEvent.click(screen.getByText("预览估计位置"))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(screen.getByRole("button", { name: "正在解析地址" })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: "正在解析地址" }))
    expect(mocks.reverse).toHaveBeenCalledOnce()
    const newer = {
      ...draft,
      name: "等待时编辑的名称",
      intro: "新介绍",
      accent: "#123456",
      seriesCodes: ["765"],
      isOpen: false,
      city: field === "city" || field === "both" ? "手改城市" : draft.city,
      address:
        field === "address" || field === "both" ? "手改地址" : draft.address,
    }
    view.rerender(
      <ConfiguredOfficePicker
        draft={newer}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    )
    await act(async () => {
      pending.resolve(reverseResponse)
      await pending.promise
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...newer,
      city: newer.city === draft.city ? "上海市" : newer.city,
      address: newer.address === draft.address ? "后端解析地址" : newer.address,
      longitude: "121.4",
      latitude: "31.2",
    })
  }
)

it.each(["city", "address", "both"])(
  "clears missing %s rather than retaining a previous place's text",
  async (missing) => {
    const city = missing === "address" ? "上海市" : ""
    const address = missing === "city" ? "后端解析地址" : ""
    mocks.reverse.mockResolvedValueOnce({
      ...reverseResponse,
      place: { ...reverseResponse.place, city, address },
    })
    const onChange = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={{ ...emptyOfficeDraft("旧城市"), address: "旧地址" }}
        disabled={false}
        onChange={onChange}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    await userEvent.click(screen.getByText("预览估计位置"))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ city, address })
    )
  }
)

it.each(["null", "network", "503", "429"])(
  "allows a retry after %s without changing the draft",
  async (failure) => {
    const { ApiError } = await import("~/lib/api")
    if (failure === "null")
      mocks.reverse.mockResolvedValueOnce({
        place: null,
        attribution: reverseResponse.attribution,
      })
    else
      mocks.reverse.mockRejectedValueOnce(
        failure === "network"
          ? new Error("offline")
          : new ApiError("unavailable", {
              kind: "http",
              status: Number(failure),
            })
      )
    const onChange = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={onChange}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    expect(
      screen.queryByText("使用此位置，手动填写地址")
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByText("预览估计位置"))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    const message = {
      null: "未找到",
      network: "解析失败",
      "503": "暂不可用",
      "429": "过于频繁",
    }[failure]
    expect(await screen.findByRole("alert")).toHaveTextContent(message!)
    expect(screen.getByText("使用此位置，手动填写地址")).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(mocks.reverse).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledOnce()
  }
)

it("manual fallback clears the old place text but protects edits made while waiting", async () => {
  const pending = pendingReverse()
  mocks.reverse.mockReturnValueOnce(pending.promise)
  const onChange = vi.fn(),
    onClose = vi.fn()
  const draft = { ...emptyOfficeDraft("旧城市"), address: "旧地址" }
  const view = render(
    <ConfiguredOfficePicker
      draft={draft}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await screen.findByLabelText("测试地图")
  await userEvent.click(screen.getByText("预览估计位置"))
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  view.rerender(
    <ConfiguredOfficePicker
      draft={{ ...draft, city: "等待时填写的城市", intro: "新介绍" }}
      disabled={false}
      onChange={onChange}
      onClose={onClose}
    />
  )
  await act(async () => {
    pending.resolve({ place: null, attribution: null })
    await pending.promise
  })
  await userEvent.click(screen.getByText("使用此位置，手动填写地址"))
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      city: "等待时填写的城市",
      address: "",
      intro: "新介绍",
      longitude: "121.4",
      latitude: "31.2",
    })
  )
})

it.each(["cancel", "unmount", "replace-office"])(
  "aborts and ignores pending reverse on %s",
  async (action) => {
    const pending = pendingReverse()
    mocks.reverse.mockReturnValueOnce(pending.promise)
    const onChange = vi.fn(),
      onClose = vi.fn()
    const props = {
      draft: emptyOfficeDraft(null),
      disabled: false,
      onChange,
      onClose,
    }
    const view = render(<ConfiguredOfficePicker key="office-1" {...props} />)
    await screen.findByLabelText("测试地图")
    await userEvent.click(screen.getByText("预览估计位置"))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    const signal = mocks.send.mock.calls.at(-1)![1]
    if (action === "cancel") await userEvent.click(screen.getByText("取消选点"))
    else if (action === "unmount") view.unmount()
    else view.rerender(<ConfiguredOfficePicker key="office-2" {...props} />)
    expect(signal.aborted).toBe(true)
    await act(async () => {
      pending.resolve(reverseResponse)
      await pending.promise
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(action === "cancel" ? 1 : 0)
  }
)

it.each(["search", "click", "drag"])(
  "ignores a superseded reverse after a new %s point",
  async (source) => {
    const pending = pendingReverse()
    mocks.reverse.mockReturnValueOnce(pending.promise)
    const onChange = vi.fn()
    render(
      <ConfiguredOfficePicker
        draft={emptyOfficeDraft(null)}
        disabled={false}
        onChange={onChange}
        onClose={vi.fn()}
      />
    )
    await screen.findByLabelText("测试地图")
    await userEvent.click(screen.getByText("预览估计位置"))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    const signal = mocks.send.mock.calls.at(-1)![1]
    if (source === "search")
      await userEvent.click(screen.getByText("预览第二位置"))
    else {
      if (source === "drag") {
        act(() => mocks.props?.pointPicker?.onPickStart?.())
        expect(signal.aborted).toBe(true)
        expect(screen.getByText("确认位置并填写地址")).toBeDisabled()
      }
      act(() =>
        mocks.props?.pointPicker?.onPick(
          { kind: "wgs84", position: [120, 30] },
          source === "drag" ? "drag" : "click"
        )
      )
    }
    expect(signal.aborted).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(
      await screen.findByRole("button", { name: "确认位置并填写地址" })
    )
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ longitude: "120", latitude: "30" })
    )
    await act(async () => {
      pending.resolve(reverseResponse)
      await pending.promise
    })
    expect(onChange).toHaveBeenCalledOnce()
  }
)

it("replaces an earlier location on a later explicit selection", async () => {
  const onChange = vi.fn()
  const props = { disabled: false, onChange, onClose: vi.fn() }
  const view = render(
    <ConfiguredOfficePicker {...props} draft={emptyOfficeDraft(null)} />
  )
  await screen.findByLabelText("测试地图")
  await userEvent.click(screen.getByText("预览估计位置"))
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  const first = onChange.mock.calls[0][0]
  view.rerender(<ConfiguredOfficePicker {...props} draft={first} />)
  mocks.reverse.mockResolvedValueOnce({
    ...reverseResponse,
    place: { ...reverseResponse.place, city: "杭州市", address: "新地点地址" },
  })
  await userEvent.click(screen.getByText("预览第二位置"))
  expect(onChange).toHaveBeenCalledOnce()
  await userEvent.click(
    await screen.findByRole("button", { name: "确认位置并填写地址" })
  )
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      city: "杭州市",
      address: "新地点地址",
      longitude: "120",
      latitude: "30",
    })
  )
})
