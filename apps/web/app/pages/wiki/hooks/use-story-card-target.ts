import { useEffect, useState } from "react"

export const TARGET_CARD_HIGHLIGHT_MS = 1800

/**
 * Scrolls to and highlights the `#story-card-<id>` deep-link target.
 *
 * Shared by Modern `/story` and Classic `/story/classic`: structured cards and
 * document-authored `:::card` cards both expose `story-card-<id>` anchors, so
 * one hook owns focus, scroll, and the temporary highlight for both views.
 */
export function useStoryCardTarget({
  hash,
  ready,
  documentKey,
}: {
  hash: string
  /** False while the payload is loading; the target only resolves once true. */
  ready: boolean
  /** Changes when another entry or refresh loads, re-applying the deep link. */
  documentKey: string
}): number | null {
  const [highlightedCardId, setHighlightedCardId] = useState<number | null>(
    null
  )
  const targetCardIdMatch = /^#story-card-(\d+)$/.exec(hash)
  const targetCardId = targetCardIdMatch ? Number(targetCardIdMatch[1]) : null

  useEffect(() => {
    let highlightTimer: number | undefined
    const activationTimer = window.setTimeout(() => {
      if (!ready || !targetCardId) {
        setHighlightedCardId(null)
        return
      }
      const targetCard = document.getElementById(`story-card-${targetCardId}`)
      if (!targetCard) {
        setHighlightedCardId(null)
        return
      }
      targetCard.focus({ preventScroll: true })
      targetCard.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: "auto",
      })
      setHighlightedCardId(targetCardId)
      highlightTimer = window.setTimeout(() => {
        if (document.activeElement === targetCard) targetCard.blur()
        setHighlightedCardId((current) =>
          current === targetCardId ? null : current
        )
      }, TARGET_CARD_HIGHLIGHT_MS)
    }, 0)
    return () => {
      window.clearTimeout(activationTimer)
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer)
    }
  }, [documentKey, ready, targetCardId])

  return highlightedCardId
}
