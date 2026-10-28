/**
 * The card artwork is one ordered slot list: the front at slot 0, the middle
 * pages in between, and the back last. The editor only edits the middle pages,
 * so every submit repeats the untouched front and back slots by reference.
 *
 * `tokens` come from the middle-page editor: `#i` is the middle page the card
 * already has at position i, `@n` is the n-th file chosen in this submit.
 */
export function middlePageSlotOrder(
  tokens: readonly string[],
  middleCount: number,
  hasBack: boolean
): string[] {
  return [
    "#0",
    ...tokens.map((token) =>
      token.startsWith("#") ? `#${Number(token.slice(1)) + 1}` : token
    ),
    ...(hasBack ? [`#${middleCount + 1}`] : []),
  ]
}
