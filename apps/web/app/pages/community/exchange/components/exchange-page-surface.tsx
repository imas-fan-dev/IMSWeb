import { createContext, useContext, type ComponentProps } from "react"
import { cn } from "~/lib/utils"
import { NavigationLink } from "~/components/navigation/navigation-link"

export const ExchangeMapDialogContext = createContext<{
  close: () => void
} | null>(null)

export function useExchangeMapDialog() {
  return useContext(ExchangeMapDialogContext)
}

/** App and standalone renders retain their main landmark. Embedded Web pages
 * share the map's main landmark and use a section inside the dialog instead. */
export function ExchangePageSurface({
  id,
  className,
  ...props
}: ComponentProps<"main">) {
  const embedded = useExchangeMapDialog()
  const Surface = embedded ? "section" : "main"
  return (
    <Surface
      {...props}
      id={embedded ? undefined : id}
      className={cn(
        className,
        embedded && "m-0 min-h-0 w-full max-w-none [&_h1]:text-xl"
      )}
    />
  )
}

export function ExchangeMapReturnLink(
  props: ComponentProps<typeof NavigationLink>
) {
  const dialog = useExchangeMapDialog()
  return (
    <NavigationLink
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        if (
          !dialog ||
          props.to !== "/community/exchange" ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return
        event.preventDefault()
        dialog.close()
      }}
    />
  )
}
