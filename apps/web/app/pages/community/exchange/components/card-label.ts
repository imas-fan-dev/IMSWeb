/** Cards carry no title any more; the producer name is the human handle. */
export function cardLabel(card: { producerName: string }): string {
  const name = card.producerName.trim()
  return name ? `${name}的名片` : "名片"
}
