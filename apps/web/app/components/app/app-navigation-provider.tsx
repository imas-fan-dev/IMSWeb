import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useLocation, useNavigationType } from "react-router"

import {
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
  hasUsableAppHistoryBack,
  observeAppHistoryCommit,
  rememberAppNavigationLocation,
  rememberAppTabSnapshot,
  updateAppNavigationIdentity,
  type AppNavigationLocation,
} from "~/lib/app-navigation-state"
import {
  beginAppScrollRestoration,
  isNonScrollingAppRoute,
  normalizeAppPathname,
  scrollAppViewToTop,
} from "~/lib/app-shell-scroll"
import { useNavigation } from "~/lib/navigation/use-navigation"

interface AppNavigationContextValue {
  activateTab: (tabId: AppTabId) => void
  goBack: () => void
}

interface PendingTabNavigation {
  id: number
  tabId: AppTabId
  href: string
  sourceKey: string
  browserSourceKey: string | null
  scrollY: number
  replace: boolean
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

function browserHistoryKey(): string | null {
  const key: unknown = window.history.state?.key
  return typeof key === "string" ? key : null
}

export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigation()
  const { session, status } = usePlatformSession()
  const stateRef = useRef(createAppNavigationState())
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
  const identity =
    status === "authenticated" || status === "restricted"
      ? `account:${session?.account.id ?? "unknown"}`
      : status === "anonymous"
        ? "anonymous"
        : null

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
    (tabId: AppTabId, href: string, scrollY: number, replace = false) => {
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
        replace,
      }
      navigate(href, { preventScrollReset: true, replace })
    },
    [cancelPending, cancelRestoration, currentLocation.key, navigate]
  )

  const activateTab = useCallback(
    (tabId: AppTabId) => {
      const pending = pendingRef.current
      rememberCurrentLocation()
      cancelRestoration()

      const state = stateRef.current
      const activeId =
        pending?.tabId ?? appTabIdForPathname(currentLocation.pathname)
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
      queueTabNavigation(tabId, href, scrollY)
    },
    [
      cancelRestoration,
      currentHref,
      currentLocation,
      queueTabNavigation,
      rememberCurrentLocation,
    ]
  )

  const goBack = useCallback(() => {
    rememberCurrentLocation()
    cancelPending()
    cancelRestoration()

    if (hasUsableAppHistoryBack(stateRef.current)) {
      navigate(-1)
      return
    }

    const activeId = appTabIdForPathname(currentLocation.pathname)
    const root = activeId ? appTabRoot(activeId) : "/"
    if (activeId) {
      rememberAppTabSnapshot(stateRef.current, activeId, {
        href: root,
        scrollY: 0,
        routeKey: currentLocation.key,
      })
    }
    queueTabNavigation(activeId ?? "home", root, 0, true)
  }, [
    cancelPending,
    cancelRestoration,
    currentLocation,
    navigate,
    queueTabNavigation,
    rememberCurrentLocation,
  ])

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
        // Browser history can commit before React paints the new location.
        const browserKey = browserHistoryKey()
        const browserMoved =
          browserKey !== null && browserKey !== pending.browserSourceKey
        const expectedUrl = new URL(pending.href, window.location.href)
        const browserMatchesTarget =
          appNavigationHref(window.location) === appNavigationHref(expectedUrl)
        if (browserMoved && !browserMatchesTarget) {
          // An ordinary link has already superseded this Account request.
          cancelPending()
          pending = null
        } else if (
          pending.sourceKey === currentLocation.key ||
          pending.href === currentHref
        ) {
          pending.scrollY = 0
          const root = appTabRoot("account")
          if (pending.href !== root) {
            if (browserMoved) {
              observeAppHistoryCommit(
                stateRef.current,
                pending.replace ? "REPLACE" : "PUSH",
                {
                  pathname: window.location.pathname,
                  search: window.location.search,
                  hash: window.location.hash,
                  key: browserKey,
                }
              )
            } else if (locationChanged) {
              observeAppHistoryCommit(
                stateRef.current,
                navigationType,
                currentLocation
              )
            }
            if (locationChanged) committedLocationRef.current = currentLocation
            queueTabNavigation(
              "account",
              root,
              0,
              pending.replace ||
                browserMoved ||
                pending.sourceKey !== currentLocation.key
            )
            return
          }
        }
      }
    }

    // Session updates alone must not reset a public page or its restoration.
    if (!locationChanged) return
    // The previous document has already been replaced. Source positions come
    // from the scroll listener and explicit navigation, never this commit.
    observeAppHistoryCommit(stateRef.current, navigationType, currentLocation)
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
    navigationType,
    queueTabNavigation,
  ])

  useEffect(() => {
    function rememberScroll() {
      const committedLocation = committedLocationRef.current
      if (!committedLocation) return
      rememberLocation(committedLocation)
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

  return (
    <AppNavigationContext.Provider value={{ activateTab, goBack }}>
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
