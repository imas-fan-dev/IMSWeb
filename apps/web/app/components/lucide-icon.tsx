import { Link2Icon, type LucideProps } from "lucide-react"
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic"

export const fallbackLucideIconName = "link-2" satisfies IconName

const lucideIconNames = new Set<string>(iconNames)

function FallbackIcon() {
  return <Link2Icon aria-hidden="true" />
}

export function isLucideIconName(value: string): value is IconName {
  return lucideIconNames.has(value)
}

export function resolveLucideIconName(value: string): IconName {
  return isLucideIconName(value) ? value : fallbackLucideIconName
}

export function ConfigurableLucideIcon({
  name,
  ...props
}: LucideProps & { name: string }) {
  const resolvedName = resolveLucideIconName(name)
  return (
    <DynamicIcon
      name={resolvedName}
      fallback={FallbackIcon}
      data-lucide-icon={resolvedName}
      {...props}
    />
  )
}
