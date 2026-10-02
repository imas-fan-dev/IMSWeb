import { useState } from "react"

import type { Namecard } from "~/lib/api"

export function useNamecardDetailSession(listContext: string) {
  const [card, setCard] = useState<Namecard | null>(null)
  const [context, setContext] = useState(listContext)
  if (context !== listContext) {
    setContext(listContext)
    setCard(null)
  }

  function open(selected: Namecard) {
    setCard(selected)
  }

  function close() {
    setCard(null)
  }

  function updateCard(cardId: number, update: (card: Namecard) => Namecard) {
    setCard((current) => (current?.id === cardId ? update(current) : current))
  }

  return { card, open, close, updateCard }
}
