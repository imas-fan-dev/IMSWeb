import { useEffect, useState } from "react"

import { getFudabaCardReactions, type FudabaCardReaction } from "~/lib/api"

import { CardReactionBar } from "./exchange-card-reactions"

// Reactions are fetched per card for now. Folding them into the card list
// payload is the next step once the list projection carries them.
export function CardReactionArea({ cardId }: { cardId: string }) {
  const [reactions, setReactions] = useState<FudabaCardReaction[]>([])

  useEffect(() => {
    let active = true
    getFudabaCardReactions(cardId)
      .send()
      .then((result) => {
        if (active) setReactions([...result.reactions])
      })
      .catch(() => {
        if (active) setReactions([])
      })
    return () => {
      active = false
    }
  }, [cardId])

  return (
    <CardReactionBar
      cardId={cardId}
      reactions={reactions}
      onChange={setReactions}
    />
  )
}
