import { createContext, useContext } from "react"

export const ExchangeMapActions = createContext<{
  startCreate(): void
  showHelp(): void
  tourTarget: string | null
} | null>(null)

export function useExchangeMapActions() {
  return useContext(ExchangeMapActions)
}
