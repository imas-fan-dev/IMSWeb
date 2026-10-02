import { useRequest } from "alova/client"
import { createContext, useCallback, useContext, type ReactNode } from "react"

import {
  emptyHomepageLinks,
  getHomepageLinks,
  type HomepageLinks,
} from "~/lib/api"

type HomepageLinksState = {
  data: HomepageLinks
  loading: boolean
  error: unknown
  retry: () => Promise<HomepageLinks>
}

const HomepageLinksContext = createContext<HomepageLinksState | null>(null)

export function HomepageLinksProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, onError, send } = useRequest(
    getHomepageLinks(),
    {
      initialData: emptyHomepageLinks,
      force: ({ args }) => args[0] === true,
    }
  )
  onError(() => undefined)
  const retry = useCallback(() => send(true), [send])

  return (
    <HomepageLinksContext value={{ data, loading, error, retry }}>
      {children}
    </HomepageLinksContext>
  )
}

export function useHomepageLinks() {
  const value = useContext(HomepageLinksContext)
  if (!value) {
    throw new Error(
      "useHomepageLinks must be used inside HomepageLinksProvider"
    )
  }
  return value
}
