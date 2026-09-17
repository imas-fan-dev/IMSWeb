import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react"
import {
  createBrowserRouter,
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AppNavigationProvider,
  useAppNavigation,
} from "~/components/app/app-navigation-provider"
import { NavigationLink } from "~/components/navigation/navigation-link"

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  top: vi.fn(),
  status: "anonymous",
  session: null as { account: { id: string } } | null,
}))
const SessionContext = createContext<Pick<typeof mocks, "status" | "session">>({
  status: "anonymous",
  session: null,
})
vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: () => useContext(SessionContext),
}))
vi.mock("~/lib/app-shell-scroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/app-shell-scroll")>()),
  beginAppScrollRestoration: mocks.restore,
  scrollAppViewToTop: mocks.top,
}))

function Probe() {
  const location = useLocation()
  const { activateTab, goBack } = useAppNavigation()
  const navigate = useNavigate()
  // Model document clamping before the parent's route-commit effect.
  useLayoutEffect(() => {
    window.scrollY = 0
  }, [location.key])
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <output data-testid="key">{location.key}</output>
      <button onClick={() => activateTab("community")}>社区</button>
      <button onClick={() => activateTab("map")}>交换地图</button>
      <button onClick={() => activateTab("resources")}>资料</button>
      <button onClick={() => activateTab("account")}>我的</button>
      <button onClick={goBack}>返回</button>
      {/* Models the native pop: WKWebView's edge swipe and Tauri's default
          Android back both replay session history without going through the
          back control. */}
      <button onClick={() => navigate(-1)}>原生返回</button>
      <NavigationLink to="/works/example?edition=2#intro">
        作品详情
      </NavigationLink>
      <NavigationLink to="/community/exchange/offices/tokyo?view=members#team">
        事务所详情
      </NavigationLink>
      <NavigationLink to="/account/me/cards">我的交换名片</NavigationLink>
      <NavigationLink to="/account/security">帐号安全</NavigationLink>
      <NavigationLink to="/wiki">企划目录</NavigationLink>
      <NavigationLink to="/story">剧情档案</NavigationLink>
    </>
  )
}

function SessionHarness({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider
      value={{ status: mocks.status, session: mocks.session }}
    >
      {children}
    </SessionContext.Provider>
  )
}

function Tree({
  entries = ["/community/cards?page=2&size=12#card-13"],
}: {
  entries?: string[]
}) {
  return (
    <SessionHarness>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <AppNavigationProvider>
          <Probe />
        </AppNavigationProvider>
      </MemoryRouter>
    </SessionHarness>
  )
}

function readAt(top: number) {
  act(() => {
    window.scrollY = top
    window.dispatchEvent(new Event("scroll"))
  })
}

describe("App navigation coordination", () => {
  beforeEach(() => {
    mocks.status = "anonymous"
    mocks.session = null
    mocks.restore.mockReset().mockImplementation(() => vi.fn())
    mocks.top.mockReset()
  })
  afterEach(() => {
    window.scrollY = 0
  })

  it("restores the full last URL and source position before document replacement", async () => {
    const user = userEvent.setup()
    render(<Tree />)
    readAt(812)
    await user.click(screen.getByRole("button", { name: "我的" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/account/me")
    await user.click(screen.getByRole("button", { name: "社区" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/community/cards?page=2&size=12#card-13"
    )
    expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
    await user.click(screen.getByRole("button", { name: "返回" }))
    // `/community/cards` climbs to the Community root, not to whichever tab the
    // user happened to visit last.
    expect(screen.getByTestId("location").textContent).toBe("/community")
  })

  it("keeps map root parameters without scrolling or adding history on reselection", async () => {
    const user = userEvent.setup()
    const href = "/community/exchange?series=765#office-tokyo"
    render(<Tree entries={[href]} />)
    const key = screen.getByTestId("key").textContent
    await user.click(screen.getByRole("button", { name: "交换地图" }))
    expect(screen.getByTestId("location")).toHaveTextContent(href)
    expect(screen.getByTestId("key")).toHaveTextContent(key!)
    expect(mocks.top).not.toHaveBeenCalled()
    expect(mocks.restore).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "我的" }))
    const restores = mocks.restore.mock.calls.length
    await user.click(screen.getByRole("button", { name: "交换地图" }))
    expect(screen.getByTestId("location")).toHaveTextContent(href)
    expect(mocks.restore).toHaveBeenCalledTimes(restores)
  })

  it("keeps public office reading separate from Community and reselects the map root", async () => {
    const user = userEvent.setup()
    render(<Tree />)
    readAt(812)
    await user.click(screen.getByRole("link", { name: "事务所详情" }))
    readAt(430)
    await user.click(screen.getByRole("button", { name: "社区" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/community/cards?page=2&size=12#card-13"
    )
    expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
    await user.click(screen.getByRole("button", { name: "交换地图" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/community/exchange/offices/tokyo?view=members#team"
    )
    expect(mocks.restore).toHaveBeenLastCalledWith(430, expect.any(Object))
    await user.click(screen.getByRole("button", { name: "交换地图" }))
    expect(screen.getByTestId("location").textContent).toBe(
      "/community/exchange"
    )
  })

  it("records ordinary resource links and reselects root without pushing history", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/apps"]} />)
    await user.click(screen.getByRole("link", { name: "作品详情" }))
    readAt(400)
    await user.click(screen.getByRole("button", { name: "我的" }))
    await user.click(screen.getByRole("button", { name: "资料" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/works/example?edition=2#intro"
    )
    expect(mocks.restore).toHaveBeenLastCalledWith(400, expect.any(Object))
    await user.click(screen.getByRole("button", { name: "资料" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
    const key = screen.getByTestId("key").textContent
    readAt(200)
    await user.click(screen.getByRole("button", { name: "资料" }))
    expect(mocks.top).toHaveBeenCalledOnce()
    expect(screen.getByTestId("key")).toHaveTextContent(key!)
  })

  it.each([
    ["/community/cards?page=2", "/community"],
    ["/community/exchange/offices/tokyo?view=members", "/community/exchange"],
  ])(
    "returns direct entry %s to its logical parent without observed history",
    async (href, root) => {
      const user = userEvent.setup()
      render(<Tree entries={["/about", href]} />)
      await user.click(screen.getByRole("button", { name: "返回" }))
      expect(screen.getByTestId("location").textContent).toBe(root)
      await user.click(screen.getByRole("button", { name: "我的" }))
      await user.click(screen.getByRole("button", { name: "返回" }))
      // The replacement landed on My's parent; the root itself has no parent,
      // so a second back must not replay the discarded entry.
      expect(screen.getByTestId("location").textContent).toBe("/account/me")
    }
  )

  it("cancels earlier restores and preserves a still-pending reading target", async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    mocks.restore.mockReturnValue(cancel)
    render(<Tree />)
    readAt(812)
    await user.click(screen.getByRole("button", { name: "我的" }))
    await user.click(screen.getByRole("button", { name: "社区" }))
    readAt(100)
    await user.click(screen.getByRole("button", { name: "我的" }))
    expect(cancel).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "社区" }))
    expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
  })

  it("retains only the last action when clicks happen before a commit", () => {
    render(<Tree />)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "我的" }))
      fireEvent.click(screen.getByRole("button", { name: "资料" }))
    })
    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
    expect(mocks.restore).toHaveBeenCalledTimes(1)
    expect(mocks.restore).toHaveBeenCalledWith(0, expect.any(Object))
  })

  it.each([
    ["/community/cards?page=2&size=12#card-13", "社区"],
    ["/community", "社区"],
    ["/works/example?edition=2#intro", "资料"],
  ])(
    "restores %s when a section roundtrip happens before commit",
    (href, label) => {
      render(<Tree entries={[href]} />)
      readAt(812)
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "我的" }))
        fireEvent.click(screen.getByRole("button", { name: label }))
      })
      expect(screen.getByTestId("location")).toHaveTextContent(href)
      expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
      expect(mocks.top).not.toHaveBeenCalled()
    }
  )

  it("reselects a pending section after a rapid roundtrip", () => {
    render(<Tree entries={["/works/example?edition=2#intro"]} />)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "我的" }))
      fireEvent.click(screen.getByRole("button", { name: "资料" }))
      fireEvent.click(screen.getByRole("button", { name: "资料" }))
    })
    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
    expect(mocks.restore).toHaveBeenLastCalledWith(0, expect.any(Object))
  })

  it("keeps a pending root selection when another tab interrupts it", async () => {
    render(<Tree entries={["/works/example?edition=2#intro"]} />)
    readAt(812)
    act(() => {
      for (const label of ["我的", "资料", "资料", "我的"]) {
        fireEvent.click(screen.getByRole("button", { name: label }))
      }
    })
    expect(screen.getByTestId("location")).toHaveTextContent("/account/me")
    await userEvent.setup().click(screen.getByRole("button", { name: "资料" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
    expect(mocks.restore).toHaveBeenLastCalledWith(0, expect.any(Object))
  })

  it("preserves root query and hash when reselecting a pending root", () => {
    const href = "/apps?group=wiki#catalog"
    render(<Tree entries={[href]} />)
    readAt(812)
    act(() => {
      for (const label of ["我的", "资料", "资料"]) {
        fireEvent.click(screen.getByRole("button", { name: label }))
      }
    })
    expect(screen.getByTestId("location")).toHaveTextContent(href)
    expect(mocks.restore).toHaveBeenLastCalledWith(0, expect.any(Object))
  })

  it("opens Community at its own root after visiting the fullscreen map", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/community/exchange?city=Tokyo"]} />)
    await user.click(screen.getByRole("button", { name: "我的" }))
    mocks.restore.mockClear()
    await user.click(screen.getByRole("button", { name: "社区" }))
    expect(screen.getByTestId("location").textContent).toBe("/community")
    expect(mocks.restore).toHaveBeenCalledTimes(1)
    expect(mocks.restore).toHaveBeenLastCalledWith(0, expect.any(Object))
    await user.click(screen.getByRole("button", { name: "交换地图" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/community/exchange?city=Tokyo"
    )
    expect(mocks.restore).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["/account/me/favorites", "anonymous", "/account/me"],
    ["/account/me/favorites", "authenticated", "/account/me"],
    [
      "/about?from=/account/me#help",
      "anonymous",
      "/about?from=/account/me#help",
    ],
    [
      "/about?from=/account/me#help",
      "authenticated",
      "/about?from=/account/me#help",
    ],
  ])(
    "resolves pending %s when identity becomes %s",
    async (href, status, expectedHref) => {
      mocks.status = "authenticated"
      mocks.session = { account: { id: "1" } }
      let held = false
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const router = createMemoryRouter(
        [
          {
            element: (
              <AppNavigationProvider>
                <Probe />
              </AppNavigationProvider>
            ),
            hydrateFallbackElement: <></>,
            children: [
              { path: "/community", element: <></> },
              { path: "/account/me", element: <></> },
              {
                path: href.split(/[?#]/, 1)[0],
                element: <></>,
                loader: async () => {
                  if (held) await gate
                  return null
                },
              },
            ],
          },
        ],
        { initialEntries: [href] }
      )
      const tree = () => (
        <SessionHarness>
          <RouterProvider router={router} />
        </SessionHarness>
      )
      const { rerender } = render(tree())
      const user = userEvent.setup()
      try {
        await screen.findByTestId("location")
        readAt(500)
        await user.click(screen.getByRole("button", { name: "社区" }))
        held = true
        vi.useFakeTimers()
        fireEvent.click(screen.getByRole("button", { name: "我的" }))
        act(() => vi.advanceTimersByTime(3100))
        vi.useRealTimers()
        expect(screen.getByTestId("location").textContent).toBe("/community")
        expect(router.state.navigation.state).toBe("loading")
        mocks.status = status
        mocks.session =
          status === "authenticated" ? { account: { id: "2" } } : null
        rerender(tree())
        await act(async () => {
          held = false
          release()
          await Promise.resolve()
        })
        await waitFor(() =>
          expect(screen.getByTestId("location").textContent).toBe(expectedHref)
        )
        if (expectedHref === href) {
          expect(mocks.restore).toHaveBeenLastCalledWith(
            500,
            expect.any(Object)
          )
        } else {
          expect(mocks.restore).not.toHaveBeenCalledWith(
            500,
            expect.any(Object)
          )
        }
        await user.click(screen.getByRole("button", { name: "返回" }))
        // Both resolved destinations climb to My: the account root is a no-op
        // and `/about` is its child.
        expect(screen.getByTestId("location").textContent).toBe("/account/me")
        await user.click(screen.getByRole("button", { name: "我的" }))
        expect(screen.getByTestId("location").textContent).toBe("/account/me")
      } finally {
        vi.useRealTimers()
        release()
        router.dispose()
      }
    }
  )

  it.each([
    {
      description:
        "replaces a personal browser commit before React paints an identity change",
      ordinaryLink: false,
    },
    {
      description:
        "keeps a newer ordinary navigation during an identity change",
      ordinaryLink: true,
    },
  ])("$description", async ({ ordinaryLink }) => {
    const previousHref = window.location.href
    const previousState = window.history.state
    window.history.replaceState(null, "", "/account/me/favorites")
    mocks.status = "authenticated"
    mocks.session = { account: { id: "1" } }
    const router = createBrowserRouter([
      {
        path: "*",
        element: (
          <AppNavigationProvider>
            <Probe />
          </AppNavigationProvider>
        ),
      },
    ])
    const tree = () => (
      <SessionHarness>
        <RouterProvider router={router} />
      </SessionHarness>
    )
    const { rerender } = render(tree())
    const user = userEvent.setup()
    try {
      readAt(500)
      await user.click(screen.getByRole("button", { name: "社区" }))
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "我的" }))
        expect(window.location.pathname).toBe("/account/me/favorites")
        if (ordinaryLink) {
          fireEvent.click(screen.getByRole("link", { name: "作品详情" }))
          expect(window.location.pathname).toBe("/works/example")
        }
        expect(screen.getByTestId("location").textContent).toBe("/community")
        mocks.status = "anonymous"
        mocks.session = null
        rerender(tree())
      })
      expect(screen.getByTestId("location").textContent).toBe(
        ordinaryLink ? "/works/example?edition=2#intro" : "/account/me"
      )
      expect(mocks.restore).not.toHaveBeenCalledWith(500, expect.any(Object))
      if (!ordinaryLink) {
        await user.click(screen.getByRole("button", { name: "返回" }))
        // The resolved account root ends the tree, so back stays put.
        expect(screen.getByTestId("location").textContent).toBe("/account/me")
      }
    } finally {
      router.dispose()
      window.history.replaceState(previousState, "", previousHref)
    }
  })

  it("cancels personal position restoration when identity changes after commit", async () => {
    mocks.status = "authenticated"
    mocks.session = { account: { id: "1" } }
    const { rerender } = render(<Tree entries={["/account/me/favorites"]} />)
    const user = userEvent.setup()
    readAt(500)
    await user.click(screen.getByRole("button", { name: "社区" }))
    const cancel = vi.fn()
    mocks.restore.mockReturnValue(cancel)
    await user.click(screen.getByRole("button", { name: "我的" }))
    mocks.status = "anonymous"
    mocks.session = null
    rerender(<Tree entries={["/account/me/favorites"]} />)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([
    ["/community/cards?page=2", "社区", "我的"],
    ["/about?from=/account/me#help", "我的", "社区"],
  ])(
    "keeps public %s reading active when identity changes",
    async (href, tab, away) => {
      mocks.status = "authenticated"
      mocks.session = { account: { id: "1" } }
      const { rerender } = render(<Tree entries={[href]} />)
      const user = userEvent.setup()
      readAt(812)
      await user.click(screen.getByRole("button", { name: away }))
      const cancel = vi.fn()
      mocks.restore.mockReturnValue(cancel)
      await user.click(screen.getByRole("button", { name: tab }))
      const calls = mocks.restore.mock.calls.length
      mocks.status = "anonymous"
      mocks.session = null
      rerender(<Tree entries={[href]} />)
      expect(cancel).not.toHaveBeenCalled()
      expect(mocks.restore).toHaveBeenCalledTimes(calls)
      expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
      await user.click(screen.getByRole("button", { name: away }))
      await user.click(screen.getByRole("button", { name: tab }))
      expect(screen.getByTestId("location").textContent).toBe(href)
      expect(mocks.restore).toHaveBeenLastCalledWith(812, expect.any(Object))
    }
  )

  it("does not add another history entry when reselecting a pending root", async () => {
    render(<Tree entries={["/works/example"]} />)
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "资料" }))
      fireEvent.click(screen.getByRole("button", { name: "资料" }))
    })
    expect(screen.getByTestId("location").textContent).toBe("/apps")
    const key = screen.getByTestId("key").textContent
    await userEvent.setup().click(screen.getByRole("button", { name: "返回" }))
    // `/apps` is a tab root: back is a no-op, and the reselect added no entry.
    expect(screen.getByTestId("location").textContent).toBe("/apps")
    expect(screen.getByTestId("key").textContent).toBe(key)
  })

  it.each(["/account/me/cards", "/account/security"])(
    "lands on the account root from directly entered %s",
    async (href) => {
      const user = userEvent.setup()
      render(<Tree entries={[href]} />)
      expect(screen.getByTestId("location").textContent).toBe(href)
      await user.click(screen.getByRole("button", { name: "返回" }))
      expect(screen.getByTestId("location").textContent).toBe("/account/me")
    }
  )

  it("pops to the account root when the parent sits below the subpage", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/account/me"]} />)
    await user.click(screen.getByRole("link", { name: "我的交换名片" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/account/me/cards"
    )
    await user.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
  })

  it("pushes the account root when a native pop leaves a restored section", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/community", "/account/me/cards"]} />)
    expect(screen.getByTestId("location").textContent).toBe("/account/me/cards")
    await user.click(screen.getByRole("button", { name: "原生返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
    // The corrected parent is a tab root, so the next native pop climbs again
    // instead of the correction repeating.
    await user.click(screen.getByRole("button", { name: "原生返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/community")
  })

  it("replaces a cross-tab account subpage with the account root", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/community"]} />)
    await user.click(screen.getByRole("link", { name: "我的交换名片" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/account/me/cards"
    )
    await user.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
    // The account root ends the tree: a second back is a no-op.
    await user.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
  })

  it("climbs the logical tree after a cross-tab jump", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/works/example"]} />)
    await user.click(screen.getByRole("link", { name: "我的交换名片" }))
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/account/me/cards"
    )
    // The resource page below the jump is not the parent, so the subpage is
    // replaced with My instead of popping back to Resources.
    await user.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
  })

  it.each([
    ["/wiki", "/wiki", "剧情档案", "/story"],
    ["/story", "/apps", "企划目录", "/wiki"],
  ])(
    "climbs %s to %s back through the tree",
    async (start, parent, link, destination) => {
      const user = userEvent.setup()
      render(<Tree entries={[start]} />)
      await user.click(screen.getByRole("link", { name: link }))
      expect(screen.getByTestId("location").textContent).toBe(destination)
      await user.click(screen.getByRole("button", { name: "返回" }))
      expect(screen.getByTestId("location").textContent).toBe(parent)
    }
  )

  it.each([
    ["/wiki?agency=X", "/apps"],
    ["/community/exchange/me?section=profile", "/account/me"],
    ["/events?page=2", "/community"],
  ])("keeps %s on its pathname's parent", async (href, parent) => {
    const user = userEvent.setup()
    render(<Tree entries={[href]} />)
    await user.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByTestId("location").textContent).toBe(parent)
  })

  it("does not bounce after the native pop correction", async () => {
    const user = userEvent.setup()
    render(<Tree entries={["/community", "/account/me/cards"]} />)
    await user.click(screen.getByRole("button", { name: "原生返回" }))
    const key = screen.getByTestId("key").textContent
    // The correction is a PUSH, so React must not run it a second time for the
    // same commit: the entry below the corrected page stays put.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
    expect(screen.getByTestId("key").textContent).toBe(key)
  })

  it("keeps the account root in place when back is invoked", async () => {
    const user = userEvent.setup()
    const href = "/community/cards?page=2&size=12#card-13"
    render(<Tree entries={[href]} />)
    await user.click(screen.getByRole("button", { name: "我的" }))
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
    await user.click(screen.getByRole("button", { name: "返回" }))
    // The tab root has no logical parent, so the control must not replay the
    // history that reached it.
    expect(screen.getByTestId("location").textContent).toBe("/account/me")
  })

  it("does not recapture an old personal page after the account changes", async () => {
    mocks.status = "authenticated"
    mocks.session = { account: { id: "1" } }
    const user = userEvent.setup()
    const { rerender } = render(<Tree entries={["/account/me/favorites"]} />)
    mocks.status = "anonymous"
    mocks.session = null
    rerender(<Tree entries={["/account/me/favorites"]} />)
    readAt(200)
    await user.click(screen.getByRole("button", { name: "社区" }))
    await user.click(screen.getByRole("button", { name: "我的" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/account/me")
    expect(screen.getByTestId("location")).not.toHaveTextContent("favorites")
  })
})
