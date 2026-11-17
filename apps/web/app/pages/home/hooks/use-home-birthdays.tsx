import { useRequest } from "alova/client"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { getCatalogBirthdays, type CatalogBirthdays } from "~/lib/api"
import { indexBirthdays } from "../birthday-data"

const empty: CatalogBirthdays = { success: true, items: [] }
type BirthdayState = {
  data: CatalogBirthdays
  loading: boolean
  error: unknown
  retry: () => void
  getBirthdaysOn: ReturnType<typeof indexBirthdays>
}
const BirthdayContext = createContext<BirthdayState | null>(null)

export function HomeBirthdaysProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, onError, send } = useRequest(
    getCatalogBirthdays(),
    { initialData: empty, force: ({ args }) => args[0] === true }
  )
  onError(() => undefined)
  const getBirthdaysOn = useMemo(() => indexBirthdays(data.items), [data.items])
  return (
    <BirthdayContext
      value={{
        data,
        loading,
        error,
        getBirthdaysOn,
        retry: () => {
          void send(true).catch(() => undefined)
        },
      }}
    >
      {children}
    </BirthdayContext>
  )
}

export function useHomeBirthdays() {
  const state = useContext(BirthdayContext)
  if (!state) throw new Error("useHomeBirthdays requires HomeBirthdaysProvider")
  return state
}
