import { isTauri } from "@tauri-apps/api/core"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useNavigationType } from "react-router"

import {
  appAncestryForPathname,
  appRouteOwnership,
  appTabIdForPathname,
  appTabRoot,
  isPersonalAppRoute,
  type AppTabId,
} from "~/components/app/app-tab-model"
import { usePlatformSession } from "~/components/platform/platform-session-provider"
import {
  appNavigationHref,
  appTabSnapshot,
  createAppNavigationState,
  rememberAppNavigationLocation,
  rememberAppTabSnapshot,
  updateAppNavigationIdentity,
  type AppNavigationLocation,
} from "~/lib/app-navigation-state"
import {
  activeStack,
  activateTabIn,
  canGoBack as stackCanGoBack,
  commitAppEntry,
  createAppNavigationStacks,
  popActiveEntry,
  resetTabToRoot,
  type AppNavigationStacks,
  type AppStackEntry,
} from "~/lib/app-navigation-stacks"
import {
  beginAppScrollRestoration,
  isNonScrollingAppRoute,
  normalizeAppPathname,
  scrollAppViewToTop,
} from "~/lib/app-shell-scroll"
import { IS_APP_TARGET } from "~/lib/app-target"
import {
  backgroundNativeTask,
  NATIVE_BACK_EVENT,
  nativeBackGesture,
  syncNativeBackPolicy,
} from "~/lib/native-back"
import { useNavigation } from "~/lib/navigation/use-navigation"

interface AppNavigationContextValue {
  activateTab: (tabId: AppTabId) => void
  goBack: () => void
  /** True when the active tab stack has a page below its top. */
  canGoBack: boolean
  /** The stack the shell is showing, which may differ from the URL prefix. */
  activeTab: AppTabId
}

function stackEntry(tabId: AppTabId, href: string, id: string): AppStackEntry {
  const boundary = href.search(/[?#]/)
  return {
    id,
    tabId,
    href,
    pathname: boundary === -1 ? href : href.slice(0, boundary),
  }
}

function restoredStacks(
  location: AppNavigationLocation
): AppNavigationStacks | null {
  const ancestry = appAncestryForPathname(location.pathname)
  if (!ancestry) return null
  const hrefs = ancestry.hrefs.map((href, index) =>
    index === ancestry.hrefs.length - 1
      ? `${href}${location.search}${location.hash}`
      : href
  )
  return hrefs.reduce<AppNavigationStacks | null>((stacks, href, index) => {
    const entry = stackEntry(ancestry.tabId, href, `restored-${index}`)
    if (!stacks) return createAppNavigationStacks(entry)
    return {
      activeTab: stacks.activeTab,
      byTab: {
        ...stacks.byTab,
        [entry.tabId]: [...stacks.byTab[entry.tabId], entry],
      },
    }
  }, null)
}

interface PendingTabNavigation {
  id: number
  tabId: AppTabId
  href: string
  sourceKey: string
  browserSourceKey: string | null
  scrollY: number
}

function browserHistoryKey(): string | null {
  const key: unknown = window.history.state?.key
  return typeof key === "string" ? key : null
}

const AppNavigationContext = createContext<
  AppNavigationContextValue | undefined
>(undefined)

function navigationLocation(
  location: ReturnType<typeof useLocation>
): AppNavigationLocation {
  return {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    key: location.key,
  }
}

export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigation()
  const { session, status } = usePlatformSession()
  const stateRef = useRef(createAppNavigationState())
  const stacksRef = useRef<AppNavigationStacks | null>(null)
  // Reading position belongs to the visit, not just to the tab: returning from
  // a detail restores where that page was left.
  const scrollByEntry = useRef(new Map<string, number>())
  const [navigationView, setNavigationView] = useState({
    canGoBack: false,
    // The first paint already knows the URL's tab; the stack commit refines it
    // when a page is derived inside a different tab.
    activeTab: (appTabIdForPathname(location.pathname) ?? "home") as AppTabId,
  })
  const committedLocationRef = useRef<AppNavigationLocation | null>(null)
  const pendingRef = useRef<PendingTabNavigation | null>(null)
  const restorationRef = useRef<{
    id: number
    routeKey: string
    scrollY: number
    cancel: () => void
  } | null>(null)
  const invalidatedAccountKeyRef = useRef<string | null>(null)
  const navigationIdRef = useRef(0)
  const currentLocation = useMemo(
    () => navigationLocation(location),
    [location]
  )
  const currentHref = appNavigationHref(currentLocation)
  const goBackRef = useRef<() => void>(() => undefined)
  const canGoBackRef = useRef(false)
  // A stable bridge generation; revisions order policy updates within it.
  const nativeBackGeneration = useRef(1)
  const nativeBackRevision = useRef(0)
  const identity =
    status === "authenticated" || status === "restricted"
      ? `account:${session?.account.id ?? "unknown"}`
      : status === "anonymous"
        ? "anonymous"
        : null

  const publishStacks = useCallback((next: AppNavigationStacks) => {
    stacksRef.current = next
    const canGoBack = stackCanGoBack(next)
    setNavigationView((current) =>
      current.canGoBack === canGoBack && current.activeTab === next.activeTab
        ? current
        : { canGoBack, activeTab: next.activeTab }
    )
  }, [])

  const cancelPending = useCallback(() => {
    pendingRef.current = null
  }, [])

  const cancelRestoration = useCallback(() => {
    restorationRef.current?.cancel()
    restorationRef.current = null
  }, [])

  const rememberLocation = useCallback((target: AppNavigationLocation) => {
    // The source was captured before queueing. Its stale document must not
    // overwrite a later tab or root selection while the route is committing.
    if (pendingRef.current) return
    if (
      target.key === invalidatedAccountKeyRef.current &&
      isPersonalAppRoute(target.pathname)
    )
      return

    // A short loading page must not replace the position still being restored.
    const restoration = restorationRef.current
    const scrollY = isNonScrollingAppRoute(target.pathname)
      ? 0
      : restoration?.routeKey === target.key
        ? restoration.scrollY
        : window.scrollY
    rememberAppNavigationLocation(stateRef.current, target, scrollY)
  }, [])

  const rememberCurrentLocation = useCallback(() => {
    rememberLocation(currentLocation)
  }, [currentLocation, rememberLocation])

  const queueTabNavigation = useCallback(
    (tabId: AppTabId, href: string, scrollY: number) => {
      cancelPending()
      cancelRestoration()
      const id = ++navigationIdRef.current
      pendingRef.current = {
        id,
        tabId,
        href,
        sourceKey: currentLocation.key,
        browserSourceKey: browserHistoryKey(),
        scrollY,
      }
      // The active stack owns page history. A tab activation projects its top
      // into the single browser entry instead of appending a stale page that a
      // native swipe could replay.
      navigate(href, { preventScrollReset: true, replace: true })
    },
    [cancelPending, cancelRestoration, currentLocation.key, navigate]
  )

  const activateTab = useCallback(
    (tabId: AppTabId) => {
      const pending = pendingRef.current
      rememberCurrentLocation()
      cancelRestoration()

      const state = stateRef.current
      const stacks = stacksRef.current
      const activeId =
        pending?.tabId ??
        stacks?.activeTab ??
        appTabIdForPathname(currentLocation.pathname)
      const activeHref = pending?.href ?? currentHref
      const root = appTabRoot(tabId)
      const normalizedPathname = normalizeAppPathname(
        activeHref.split(/[?#]/, 1)[0] ?? "/"
      )

      if (activeId === tabId && normalizedPathname === root) {
        if (tabId === "account") invalidatedAccountKeyRef.current = null
        rememberAppTabSnapshot(state, tabId, {
          href: activeHref,
          scrollY: 0,
          routeKey: currentLocation.key,
        })
        if (pending) {
          pending.scrollY = 0
        } else if (!isNonScrollingAppRoute(currentLocation.pathname)) {
          scrollAppViewToTop()
        }
        return
      }

      if (activeId === tabId) {
        rememberAppTabSnapshot(state, tabId, {
          href: root,
          scrollY: 0,
          routeKey: currentLocation.key,
        })
        // Reselecting the active tab returns to the root entry that is already
        // in this tab's stack; it never layers a second root above the pages.
        if (stacks) {
          publishStacks(
            resetTabToRoot(
              stacks,
              tabId,
              stackEntry(tabId, root, `tab-${++navigationIdRef.current}`)
            )
          )
        }
        queueTabNavigation(tabId, root, 0)
        return
      }

      const snapshot = appTabSnapshot(state, tabId)
      const href = snapshot?.href ?? root
      const scrollY = snapshot?.scrollY ?? 0
      if (!snapshot) {
        rememberAppTabSnapshot(state, tabId, {
          href,
          scrollY,
          routeKey: currentLocation.key,
        })
      }
      if (stacks) {
        publishStacks(
          activateTabIn(
            stacks,
            tabId,
            stackEntry(tabId, href, `tab-${++navigationIdRef.current}`)
          ).stacks
        )
      }
      queueTabNavigation(tabId, href, scrollY)
    },
    [
      cancelRestoration,
      currentHref,
      currentLocation,
      publishStacks,
      queueTabNavigation,
      rememberCurrentLocation,
    ]
  )

  const goBack = useCallback(() => {
    const stacks = stacksRef.current ?? restoredStacks(currentLocation)
    if (!stacks) return
    rememberCurrentLocation()
    cancelPending()
    cancelRestoration()

    const popped = popActiveEntry(stacks)
    // A tab root ends the page tree: the controller is a no-op there even when
    // the WebView still holds an unrelated entry beneath it.
    if (!popped) {
      publishStacks(stacks)
      return
    }

    publishStacks(popped.stacks)
    const id = ++navigationIdRef.current
    pendingRef.current = {
      id,
      tabId: popped.target.tabId,
      href: popped.target.href,
      sourceKey: currentLocation.key,
      browserSourceKey: browserHistoryKey(),
      scrollY: scrollByEntry.current.get(popped.target.id) ?? 0,
    }
    // Replace rather than pop session history: the browser keeps one entry that
    // mirrors the active stack top, so no native traversal can reach a page
    // that this stack has already left.
    navigate(popped.target.href, { preventScrollReset: true, replace: true })
  }, [
    cancelPending,
    cancelRestoration,
    currentLocation,
    navigate,
    publishStacks,
    rememberCurrentLocation,
  ])

  useLayoutEffect(() => {
    goBackRef.current = goBack
    canGoBackRef.current = navigationView.canGoBack
  }, [goBack, navigationView.canGoBack])

  // Publish the stack's admission to native code and consume its gestures. A
  // gesture captured under an older revision is ignored, so a swipe that began
  // before a page change can never navigate the new stack.
  useEffect(() => {
    if (!IS_APP_TARGET || !isTauri()) return
    nativeBackRevision.current += 1
    const revision = nativeBackRevision.current
    void syncNativeBackPolicy({
      generation: nativeBackGeneration.current,
      revision,
      canBack: navigationView.canGoBack,
    }).catch(() => undefined)

    const handleGesture = (event: Event) => {
      const gesture = nativeBackGesture(event)
      if (!gesture) return
      if (gesture.generation !== nativeBackGeneration.current) return
      if (gesture.revision !== revision) return
      if (gesture.phase === "commit") goBackRef.current()
    }
    window.addEventListener(NATIVE_BACK_EVENT, handleGesture)
    return () => window.removeEventListener(NATIVE_BACK_EVENT, handleGesture)
  }, [navigationView.canGoBack])

  // On Android, Tauri's `app` plugin pops the WebView's own history unless a JS
  // listener exists. Keep the listener on every App route so root Back cannot
  // replay a stale page from another tab; `goBack` owns both the page stack and
  // the root boundary. iOS edge-swipe is delivered by the native-glass gesture
  // bridge and calls the same controller.
  useEffect(() => {
    if (!IS_APP_TARGET || !isTauri()) return

    let disposed = false
    let release: (() => void) | undefined
    void import("@tauri-apps/api/app")
      .then(({ onBackButtonPress }) =>
        onBackButtonPress(() => {
          if (canGoBackRef.current) goBackRef.current()
          // A tab root hands the task back to the system instead of replaying
          // WebView history.
          else void backgroundNativeTask().catch(() => undefined)
        })
      )
      .then((listener) => {
        const unregister = () => {
          void listener.unregister()
        }
        if (disposed) unregister()
        else release = unregister
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      release?.()
    }
  }, [])

  useLayoutEffect(() => {
    const previous = committedLocationRef.current
    const locationChanged =
      !previous ||
      previous.key !== currentLocation.key ||
      appNavigationHref(previous) !== currentHref
    let pending = pendingRef.current

    if (updateAppNavigationIdentity(stateRef.current, identity)) {
      invalidatedAccountKeyRef.current = isPersonalAppRoute(
        currentLocation.pathname
      )
        ? currentLocation.key
        : previous && isPersonalAppRoute(previous.pathname)
          ? previous.key
          : null
      if (previous && isPersonalAppRoute(previous.pathname)) {
        cancelRestoration()
      }
      if (pending && isPersonalAppRoute(pending.href)) {
        // A browser commit can land before React paints. Compare the browser
        // entry itself so a newer ordinary link wins over the pending one.
        const browserKey = browserHistoryKey()
        const browserMoved =
          browserKey !== null && browserKey !== pending.browserSourceKey
        const expectedUrl = new URL(pending.href, window.location.href)
        const browserMatchesTarget =
          appNavigationHref(window.location) === appNavigationHref(expectedUrl)
        if (browserMoved && !browserMatchesTarget) {
          cancelPending()
          pending = null
        } else if (
          pending.sourceKey === currentLocation.key ||
          pending.href === currentHref
        ) {
          pending.scrollY = 0
          const root = appTabRoot("account")
          if (pending.href !== root) {
            // The personal page belonged to the previous identity; continue at
            // the account root instead of restoring another account's page.
            cancelPending()
            if (locationChanged) committedLocationRef.current = currentLocation
            if (stacksRef.current) {
              publishStacks(
                activateTabIn(
                  stacksRef.current,
                  "account",
                  stackEntry(
                    "account",
                    root,
                    `tab-${++navigationIdRef.current}`
                  )
                ).stacks
              )
            }
            queueTabNavigation("account", root, 0)
            return
          }
        }
      }
    }

    // Session updates alone must not reset a public page or its restoration.
    if (!locationChanged) return
    // The previous document has already been replaced. Source positions come
    // from the scroll listener and explicit navigation, never this commit.
    let stacks = stacksRef.current ?? restoredStacks(currentLocation)
    if (!stacks) return
    const normalizedPathname = normalizeAppPathname(currentLocation.pathname)
    const ownership = appRouteOwnership(normalizedPathname)
    // A native traversal is validated against the active stack below; it must
    // never be reinterpreted as a tab switch.
    // Content details derive from the page that opened them. A global
    // destination (tab root, account, auth) transfers ownership to its tab and
    // enters through the smallest legal chain.
    if (
      navigationType !== "POP" &&
      ownership &&
      !ownership.derived &&
      ownership.tab !== stacks.activeTab
    ) {
      const ancestry = appAncestryForPathname(normalizedPathname)
      if (ancestry) {
        const last = ancestry.hrefs.length - 1
        stacks = {
          activeTab: ancestry.tabId,
          byTab: {
            ...stacks.byTab,
            [ancestry.tabId]: ancestry.hrefs.map((href, index) =>
              stackEntry(
                ancestry.tabId,
                index === last ? currentHref : href,
                index === last
                  ? `visit-${currentLocation.key}`
                  : `ancestor-${index}`
              )
            ),
          },
        }
      }
    }
    const top = activeStack(stacks).at(-1)
    // A query/hash change updates the current page; it is not a new layer.
    const action: "push" | "replace" | "pop" =
      navigationType === "POP"
        ? "pop"
        : top && top.pathname === normalizedPathname
          ? "replace"
          : "push"
    const entry = stackEntry(
      stacks.activeTab,
      currentHref,
      action === "replace" && top ? top.id : `visit-${currentLocation.key}`
    )
    const committed = commitAppEntry(stacks, { action, entry })
    if (!committed.accepted) {
      // A native traversal left the active stack (another tab or a page the
      // stack already dropped). Project the current top back into the browser
      // entry instead of showing that page.
      publishStacks(committed.stacks)
      navigate(committed.restore.href, {
        preventScrollReset: true,
        replace: true,
      })
      return
    }
    publishStacks(committed.stacks)

    const pendingTarget =
      pending?.href === currentHref && pending.sourceKey !== currentLocation.key
        ? pending
        : null

    cancelPending()
    cancelRestoration()
    if (
      pendingTarget &&
      pendingTarget.href === appTabRoot("account") &&
      invalidatedAccountKeyRef.current === currentLocation.key
    ) {
      invalidatedAccountKeyRef.current = null
    }
    if (invalidatedAccountKeyRef.current !== currentLocation.key) {
      rememberAppNavigationLocation(
        stateRef.current,
        currentLocation,
        pendingTarget?.scrollY ?? 0
      )
    }
    committedLocationRef.current = currentLocation

    if (!pendingTarget) return

    if (isNonScrollingAppRoute(currentLocation.pathname)) return

    const id = pendingTarget.id
    const cancel = beginAppScrollRestoration(pendingTarget.scrollY, {
      onFinish: () => {
        if (restorationRef.current?.id === id) {
          restorationRef.current = null
        }
      },
    })
    restorationRef.current = {
      id,
      routeKey: currentLocation.key,
      scrollY: pendingTarget.scrollY,
      cancel,
    }
  }, [
    cancelPending,
    cancelRestoration,
    currentHref,
    currentLocation,
    identity,
    navigate,
    navigationType,
    publishStacks,
    queueTabNavigation,
  ])

  useEffect(() => {
    function rememberScroll() {
      const committedLocation = committedLocationRef.current
      if (!committedLocation) return
      rememberLocation(committedLocation)
      const top = stacksRef.current
        ? activeStack(stacksRef.current).at(-1)
        : null
      if (top) scrollByEntry.current.set(top.id, window.scrollY)
    }

    window.addEventListener("scroll", rememberScroll, { passive: true })
    return () => window.removeEventListener("scroll", rememberScroll)
  }, [rememberLocation])

  useEffect(
    () => () => {
      cancelPending()
      cancelRestoration()
    },
    [cancelPending, cancelRestoration]
  )

  const value = useMemo(
    () => ({
      activateTab,
      goBack,
      canGoBack: navigationView.canGoBack,
      activeTab: navigationView.activeTab,
    }),
    [activateTab, goBack, navigationView]
  )

  return (
    <AppNavigationContext.Provider value={value}>
      {children}
    </AppNavigationContext.Provider>
  )
}

export function useAppNavigation() {
  const context = useContext(AppNavigationContext)
  if (!context) {
    throw new Error(
      "useAppNavigation must be used within AppNavigationProvider"
    )
  }
  return context
}
