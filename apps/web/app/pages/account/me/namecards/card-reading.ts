const PRODUCER_READING_ALLOWED = /[^ぁ-ゖァ-ヺーA-Za-z '-]/g

/**
 * 全角英数降到半角，再丢掉假名、英文字母、空格、撇号与连字符之外的字符。
 * 撇号与连字符只用于分隔音节，参与排序前另行过滤。
 */
export function normalizeProducerReading(value: string): string | null {
  const cleaned = value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(PRODUCER_READING_ALLOWED, "")
  return cleaned.trim() ? cleaned : null
}
