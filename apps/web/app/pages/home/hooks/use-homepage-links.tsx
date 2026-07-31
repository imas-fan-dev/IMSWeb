import { useRequest } from "alova/client"
import { createContext, useContext, type ReactNode } from "react"

import {
  emptyHomepageLinks,
  getHomepageLinks,
  type HomepageLinks,
} from "~/lib/api"

type HomepageLinksState = {
  data: HomepageLinks
  loading: boolean
  error: unknown
}

const HomepageLinksContext = createContext<HomepageLinksState | null>(null)

export function HomepageLinksProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, onError } = useRequest(getHomepageLinks(), {
    initialData: emptyHomepageLinks,
  })
  onError(() => undefined)

  return (
    <HomepageLinksContext value={{ data, loading, error }}>
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
