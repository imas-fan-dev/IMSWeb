import { SmileIcon } from "lucide-react"
import { useState } from "react"

// Pinned local Twemoji assets; public/emoji/twemoji/manifest.json owns provenance.
const REACTION_ASSETS = new Map<string, string>([
  ["\u2764\uFE0F", "2764.svg"],
  ["\u{1F44D}", "1f44d.svg"],
  ["\u{1F602}", "1f602.svg"],
  ["\u{1F923}", "1f923.svg"],
  ["\u{1F62D}", "1f62d.svg"],
  ["\u{1F60D}", "1f60d.svg"],
  ["\u{1F970}", "1f970.svg"],
  ["\u{1F618}", "1f618.svg"],
  ["\u{1F92F}", "1f92f.svg"],
  ["\u{1F631}", "1f631.svg"],
  ["\u{1F60E}", "1f60e.svg"],
  ["\u{1F929}", "1f929.svg"],
  ["\u{1F624}", "1f624.svg"],
  ["\u{1F64F}", "1f64f.svg"],
  ["\u{1F44F}", "1f44f.svg"],
  ["\u2728", "2728.svg"],
  ["\u{1F4AF}", "1f4af.svg"],
  ["\u{1F389}", "1f389.svg"],
  ["\u{1F4A5}", "1f4a5.svg"],
  ["\u{1F31F}", "1f31f.svg"],
  ["\u{1F435}", "1f435.svg"],
  ["\u{1F436}", "1f436.svg"],
  ["\u{1F431}", "1f431.svg"],
  ["\u{1F98A}", "1f98a.svg"],
  ["\u{1F43C}", "1f43c.svg"],
  ["\u{1F433}", "1f433.svg"],
  ["\u{1F525}", "1f525.svg"],
  ["\u{1F480}", "1f480.svg"],
  ["\u{1F440}", "1f440.svg"],
  ["\u{1F340}", "1f340.svg"],
  ["\u{1F308}", "1f308.svg"],
  ["\u{1F41B}", "1f41b.svg"],
  ["\u{1F48E}", "1f48e.svg"],
  ["\u{1F680}", "1f680.svg"],
  ["\u{1F3C6}", "1f3c6.svg"],
  ["\u{1F355}", "1f355.svg"],
  ["\u{1F354}", "1f354.svg"],
  ["\u{1F3AE}", "1f3ae.svg"],
  ["\u{1F339}", "1f339.svg"],
  ["\u{1F36D}", "1f36d.svg"],
  ["\u{1F528}", "1f528.svg"],
  ["\u{1F52B}", "1f52b.svg"],
  ["\u2753", "2753.svg"],
  ["\u{1F9D2}", "1f9d2.svg"],
  ["\u{1F619}", "1f619.svg"],
  ["\u{1F518}", "1f518.svg"],
])

export function NamecardReactionEmoji({
  emoji,
  compact = false,
}: {
  emoji: string
  compact?: boolean
}) {
  const file = REACTION_ASSETS.get(emoji)
  const [failedFile, setFailedFile] = useState<string | null>(null)
  const className = compact ? "size-4 shrink-0 md:size-5" : "size-5 shrink-0"

  if (!file || failedFile === file) {
    return <SmileIcon aria-hidden="true" className={className} />
  }

  return (
    <img
      key={file}
      src={`/emoji/twemoji/${file}`}
      width={20}
      height={20}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailedFile(file)}
    />
  )
}
