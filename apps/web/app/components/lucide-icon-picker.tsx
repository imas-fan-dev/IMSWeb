import { CheckIcon, SearchIcon } from "lucide-react"
import { iconNames, type IconName } from "lucide-react/dynamic"
import { useMemo, useState } from "react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import {
  ConfigurableLucideIcon,
  resolveLucideIconName,
} from "~/components/lucide-icon"
import { cn } from "~/lib/utils"

const featuredIconNames = [
  "link-2",
  "book-open-text",
  "mic-2",
  "phone",
  "notebook-tabs",
  "film",
  "video",
  "music",
  "headphones",
  "radio",
  "message-circle",
  "messages-square",
  "newspaper",
  "file-text",
  "library",
  "scroll-text",
  "image",
  "images",
  "gamepad-2",
  "tv",
  "clapperboard",
  "globe",
  "external-link",
  "sparkles",
] satisfies IconName[]

const maximumVisibleResults = 60

function normalizedQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
}

export function LucideIconPicker({
  id,
  value,
  onValueChange,
}: {
  id?: string
  value: string
  onValueChange: (value: IconName) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selectedIcon = resolveLucideIconName(value)
  const visibleIconNames = useMemo(() => {
    const normalized = normalizedQuery(query)
    if (!normalized) return featuredIconNames
    return iconNames
      .filter((iconName) => iconName.includes(normalized))
      .slice(0, maximumVisibleResults)
  }, [query])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full min-w-0 justify-start font-normal"
            aria-label={`图标：${selectedIcon}`}
          />
        }
      >
        <ConfigurableLucideIcon name={selectedIcon} aria-hidden="true" />
        <span className="truncate">{selectedIcon}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 max-w-[calc(100vw-2rem)] sm:w-96"
      >
        <PopoverTitle className="mb-2">选择 Lucide 图标</PopoverTitle>
        <div className="relative mb-2">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图标名称"
            aria-label="搜索 Lucide 图标"
            className="pl-8"
          />
        </div>
        <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
          {visibleIconNames.map((iconName) => (
            <Button
              key={iconName}
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`选择 ${iconName} 图标`}
              aria-pressed={selectedIcon === iconName}
              className={cn(
                "min-w-0 justify-start px-2 font-normal",
                selectedIcon === iconName && "bg-muted"
              )}
              onClick={() => {
                onValueChange(iconName)
                setOpen(false)
              }}
            >
              <ConfigurableLucideIcon name={iconName} aria-hidden="true" />
              <span
                className="min-w-0 flex-1 truncate text-left"
                title={iconName}
              >
                {iconName}
              </span>
              {selectedIcon === iconName ? (
                <CheckIcon aria-hidden="true" className="text-primary" />
              ) : null}
            </Button>
          ))}
          {visibleIconNames.length === 0 ? (
            <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">
              没有匹配的图标
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
