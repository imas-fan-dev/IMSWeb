import { ShuffleIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import { birthdays } from "../birthday-data"
import type { BirthdayRecord } from "../birthday-data"

function idolWikiHref(idol: BirthdayRecord) {
  const idolName = idol.name === "伴田路子" ? "Roco" : idol.name
  return (
    "/wiki/story?agency=" +
    encodeURIComponent(idol.agency) +
    "&idol=" +
    encodeURIComponent(idolName)
  )
}

export function RandomIdol() {
  const [selectedIdol, setSelectedIdol] = useState<BirthdayRecord | null>(null)

  function selectRandomIdol() {
    const index = Math.floor(Math.random() * birthdays.length)
    setSelectedIdol(birthdays[index] ?? null)
  }

  return (
    <section aria-labelledby="random-idol-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)] lg:px-8">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold text-primary">IDOL PICK</p>
          <h2 id="random-idol-heading" className="mt-2 text-2xl font-semibold">
            随机担当
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            从完整生日资料中随机选择一位偶像，并进入对应剧情资料页。
          </p>
        </div>

        <div className="flex min-h-52 flex-col justify-between rounded-md border bg-card p-6">
          <div
            className="flex min-h-24 items-center justify-center text-center"
            aria-live="polite"
          >
            {selectedIdol ? (
              <div>
                <span
                  className="mx-auto mb-4 block size-3 rounded-full"
                  style={{ backgroundColor: selectedIdol.color }}
                  aria-hidden="true"
                />
                <a
                  href={idolWikiHref(selectedIdol)}
                  className="text-2xl font-semibold hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {selectedIdol.name}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedIdol.agency}
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <SparklesIcon
                  className="mx-auto mb-3 size-7"
                  aria-hidden="true"
                />
                等待抽取今日的随机担当
              </div>
            )}
          </div>
          <Button
            type="button"
            className="mt-5 w-full"
            onClick={selectRandomIdol}
          >
            <ShuffleIcon data-icon="inline-start" />
            随机选择
          </Button>
        </div>
      </div>
    </section>
  )
}
