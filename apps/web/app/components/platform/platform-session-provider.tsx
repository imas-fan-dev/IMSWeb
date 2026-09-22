import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  getPlatformSession,
  hasPlatformSessionHint,
  isApiError,
  logoutPlatform,
  type PlatformProfile,
  type PlatformSession,
} from "~/lib/api"

export type PlatformSessionStatus =
  | "anonymous"
  | "loading"
  | "authenticated"
  | "restricted"
  | "error"

interface PlatformSessionState {
  status: PlatformSessionStatus
  session: PlatformSession | null
  error: unknown | null
}

interface PlatformSessionContextValue extends PlatformSessionState {
  acceptSession: (session: PlatformSession) => void
  acceptProfile: (accountId: string, profile: PlatformProfile) => void
  reload: () => Promise<void>
  logout: () => Promise<void>
}

const anonymousState: PlatformSessionState = {
  status: "anonymous",
  session: null,
  error: null,
}

const PlatformSessionContext = createContext<
  PlatformSessionContextValue | undefined
>(undefined)

const optionalAnonymousContext: PlatformSessionContextValue = {
  ...anonymousState,
  acceptSession: () => undefined,
  acceptProfile: () => undefined,
  reload: async () => undefined,
  logout: async () => undefined,
}

function resolvedSessionState(session: PlatformSession): PlatformSessionState {
  return {
    status:
      session.account.status === "restricted" ? "restricted" : "authenticated",
    session,
    error: null,
  }
}

function rejectedSessionState(error: unknown): PlatformSessionState {
  if (isApiError(error) && (error.status === 401 || error.status === 403)) {
    return anonymousState
  }
  return { status: "error", session: null, error }
}

export function PlatformSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformSessionState>(anonymousState)
  const requestGeneration = useRef(0)

  const acceptSession = useCallback((session: PlatformSession) => {
    requestGeneration.current += 1
    setState(resolvedSessionState(session))
  }, [])

  const acceptProfile = useCallback(
    (accountId: string, profile: PlatformProfile) => {
      setState((current) => {
        if (
          (current.status !== "authenticated" &&
            current.status !== "restricted") ||
          !current.session ||
          current.session.account.id !== accountId
        ) {
          return current
        }
        return {
          ...current,
          session: {
            ...current.session,
            profile: {
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
              homeCity: profile.homeCity,
              bio: profile.bio,
            },
          },
        }
      })
    },
    []
  )

  const reload = useCallback(async () => {
    const generation = ++requestGeneration.current
    if (!hasPlatformSessionHint()) {
      setState(anonymousState)
      return
    }

    setState({ status: "loading", session: null, error: null })
    try {
      const session = await getPlatformSession().send()
      if (requestGeneration.current === generation) {
        setState(resolvedSessionState(session))
      }
    } catch (error) {
      if (requestGeneration.current === generation) {
        setState(rejectedSessionState(error))
      }
    }
  }, [])

  const logout = useCallback(async () => {
    const generation = ++requestGeneration.current
    if (!hasPlatformSessionHint()) {
      setState(anonymousState)
      return
    }

    setState({ status: "loading", session: null, error: null })
    try {
      await logoutPlatform().send()
      if (requestGeneration.current === generation) {
        setState(anonymousState)
      }
    } catch (error) {
      if (requestGeneration.current === generation) {
        setState(rejectedSessionState(error))
      }
    }
  }, [])

  useEffect(() => {
    const bootstrapTimer = window.setTimeout(() => {
      void reload()
    }, 0)
    return () => {
      window.clearTimeout(bootstrapTimer)
      requestGeneration.current += 1
    }
  }, [reload])

  const value = useMemo<PlatformSessionContextValue>(
    () => ({ ...state, acceptSession, acceptProfile, reload, logout }),
    [acceptProfile, acceptSession, logout, reload, state]
  )

  return (
    <PlatformSessionContext.Provider value={value}>
      {children}
    </PlatformSessionContext.Provider>
  )
}

export function usePlatformSession(): PlatformSessionContextValue {
  const context = useContext(PlatformSessionContext)
  if (!context) {
    throw new Error(
      "usePlatformSession must be used within PlatformSessionProvider"
    )
  }
  return context
}

export function useOptionalPlatformSession(): PlatformSessionContextValue {
  return useContext(PlatformSessionContext) ?? optionalAnonymousContext
}
