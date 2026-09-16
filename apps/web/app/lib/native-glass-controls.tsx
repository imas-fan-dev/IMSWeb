import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

import {
  NATIVE_GLASS_CONTROL_EVENT,
  nativeGlassControlEvent,
  shouldUseNativeGlassControls,
  syncNativeGlassControls,
  type NativeGlassControl,
  type NativeGlassControlEvent,
  type NativeGlassFrame,
  type NativeGlassMenuItem,
} from "~/lib/native-glass-panel"
import {
  isNativeTabBarSuppressed,
  NATIVE_TAB_BAR_SUPPRESSION_EVENT,
  nativeTabBarSuppressed,
} from "~/lib/native-tab-bar-suppression"

/**
 * Wire description of one floating control. `kind` picks the native renderer
 * branch; the frame and corner radius are measured from the DOM twin instead of
 * being authored here, so the native geometry follows whatever the page CSS
 * already decided.
 */
export type NativeGlassControlSpec =
  | {
      kind: "icon-button"
      icon: string
      label: string
      active?: boolean
      disabled?: boolean
      group?: string
    }
  | {
      kind: "menu"
      icon: string
      label: string
      expanded: boolean
      items: NativeGlassMenuItem[]
      group?: string
    }

type NativeGlassRegistration = {
  element: HTMLElement | null
  panelElement: HTMLElement | null
  spec: NativeGlassControlSpec
  onEvent?: (event: NativeGlassControlEvent) => void
}

type NativeGlassControlsApi = {
  register: (id: string, registration: NativeGlassRegistration) => () => void
  schedule: () => void
}

const NativeGlassControlsContext = createContext<NativeGlassControlsApi | null>(
  null
)

/**
 * Once the native path is live the CSS rule that carries these attributes hides
 * the twins with `display: none`. That makes them unmeasurable, so a capture
 * flips the element back into layout with `visibility: hidden` (invisible, but
 * laid out) for one synchronous read. Both writes land in the same task, so the
 * browser never paints the intermediate state and `ResizeObserver` only ever
 * delivers the unchanged final size.
 */
function withMeasurableLayout<T>(element: HTMLElement, read: () => T): T {
  const previousDisplay = element.style.display
  const previousVisibility = element.style.visibility
  element.style.display = "block"
  element.style.visibility = "hidden"
  try {
    return read()
  } finally {
    element.style.display = previousDisplay
    element.style.visibility = previousVisibility
  }
}

function measureFrame(element: HTMLElement): NativeGlassFrame | null {
  const rect = withMeasurableLayout(element, () =>
    element.getBoundingClientRect()
  )
  if (rect.width <= 0 || rect.height <= 0) return null
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

function measureCornerRadius(element: HTMLElement): number {
  return withMeasurableLayout(element, () => {
    const radius = Number.parseFloat(
      getComputedStyle(element).borderTopLeftRadius
    )
    return Number.isFinite(radius) ? radius : 0
  })
}

function measurePanelWidth(element: HTMLElement | null): number {
  if (!element) return 0
  // `offsetWidth` ignores the collapsed panel's scale transform, so the native
  // panel keeps the authored width instead of the animated one.
  return withMeasurableLayout(element, () => element.offsetWidth)
}

/**
 * The panel is a surface of its own, so it carries its own radius. Reading the
 * trigger's instead would square the expanded menu off the moment that trigger
 * became a pill segment, whose shared edge is deliberately straight.
 */
function measurePanelRadius(element: HTMLElement | null): number {
  return element ? measureCornerRadius(element) : 0
}

/**
 * Owns the native control overlay for one page. It is inert unless the packaged
 * iOS App is the runtime; the real verdict is the `supported` flag the plugin
 * returns, and the DOM twins only leave the layout after that flag is true.
 */
export function NativeGlassControlsProvider({
  children,
}: {
  children: ReactNode
}) {
  const attempted = useMemo(() => shouldUseNativeGlassControls(), [])
  const registrations = useRef(new Map<string, NativeGlassRegistration>())
  const suppressedRef = useRef(isNativeTabBarSuppressed())
  const frameRef = useRef<number | null>(null)
  const tokenRef = useRef(0)

  const collect = useCallback((): NativeGlassControl[] => {
    const controls: NativeGlassControl[] = []
    for (const [id, registration] of registrations.current) {
      const element = registration.element
      if (!element || !element.isConnected) continue
      const frame = measureFrame(element)
      if (!frame) continue
      const cornerRadius = measureCornerRadius(element)
      const spec = registration.spec
      if (spec.kind === "menu") {
        controls.push({
          id,
          kind: "menu",
          icon: spec.icon,
          label: spec.label,
          frame,
          cornerRadius,
          group: spec.group,
          expanded: spec.expanded,
          panelWidth: measurePanelWidth(registration.panelElement),
          panelCornerRadius: measurePanelRadius(registration.panelElement),
          items: spec.items,
        })
      } else {
        controls.push({
          id,
          kind: "icon-button",
          icon: spec.icon,
          label: spec.label,
          frame,
          cornerRadius,
          group: spec.group,
          active: spec.active ?? false,
          disabled: spec.disabled ?? false,
        })
      }
    }
    return controls
  }, [])

  const runSync = useCallback(async () => {
    if (!attempted) return
    const token = ++tokenRef.current
    let supported: boolean
    try {
      // An open Sheet or Dialog owns the screen. Native controls float above the
      // webview, so they would sit on top of that overlay; an empty set hides
      // them while the modal is up and the next sync restores them.
      //
      // `dark` stays false because the map material is light in both themes:
      // `.exchange-map-app-control` pins the light glass tokens, so a dark host
      // would draw a second, darker control next to the Web version.
      const status = await syncNativeGlassControls(
        suppressedRef.current ? [] : collect(),
        false
      )
      supported = Boolean(status?.supported)
    } catch {
      supported = false
    }
    if (token !== tokenRef.current) return
    if (supported) {
      document.documentElement.dataset.nativeGlass = "controls"
    } else {
      delete document.documentElement.dataset.nativeGlass
    }
  }, [attempted, collect])

  const schedule = useCallback(() => {
    if (!attempted) return
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      void runSync()
    })
  }, [attempted, runSync])

  const register = useCallback(
    (id: string, registration: NativeGlassRegistration) => {
      registrations.current.set(id, registration)
      schedule()
      return () => {
        if (registrations.current.get(id) !== registration) return
        registrations.current.delete(id)
        schedule()
      }
    },
    [schedule]
  )

  const api = useMemo<NativeGlassControlsApi>(
    () => ({ register, schedule }),
    [register, schedule]
  )

  // Only physical layout changes move a floating control. The map itself never
  // does: panning and zooming leaves every overlay in place, so no `move` or
  // `moveend` listener is registered here by design.
  useEffect(() => {
    if (!attempted) return
    window.addEventListener("resize", schedule)
    window.addEventListener("orientationchange", schedule)
    window.visualViewport?.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("scroll", schedule)
    return () => {
      window.removeEventListener("resize", schedule)
      window.removeEventListener("orientationchange", schedule)
      window.visualViewport?.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("scroll", schedule)
    }
  }, [attempted, schedule])

  useEffect(() => {
    if (!attempted) return
    const handleSuppression = (event: Event) => {
      const suppressed = nativeTabBarSuppressed(event)
      if (suppressed === null) return
      suppressedRef.current = suppressed
      schedule()
    }
    window.addEventListener(NATIVE_TAB_BAR_SUPPRESSION_EVENT, handleSuppression)
    return () =>
      window.removeEventListener(
        NATIVE_TAB_BAR_SUPPRESSION_EVENT,
        handleSuppression
      )
  }, [attempted, schedule])

  useEffect(() => {
    if (!attempted) return
    const handleControl = (event: Event) => {
      const parsed = nativeGlassControlEvent(event)
      if (!parsed) return
      registrations.current.get(parsed.id)?.onEvent?.(parsed)
    }
    window.addEventListener(NATIVE_GLASS_CONTROL_EVENT, handleControl)
    return () =>
      window.removeEventListener(NATIVE_GLASS_CONTROL_EVENT, handleControl)
  }, [attempted])

  useEffect(() => {
    if (!attempted) return
    schedule()
    return () => {
      tokenRef.current += 1
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      delete document.documentElement.dataset.nativeGlass
      // An empty set is the plugin's teardown path; it clears the native views
      // even when the platform never supported them.
      void syncNativeGlassControls([], false).catch(() => {})
    }
  }, [attempted, schedule])

  return (
    <NativeGlassControlsContext.Provider value={api}>
      {children}
    </NativeGlassControlsContext.Provider>
  )
}

/**
 * Registers one DOM twin with the provider. The trigger is measured through the
 * returned `controlRef`; a menu also exposes `panelRef` so the native panel can
 * reuse the authored width. `onEvent` receives only the native press or
 * menu-item event and forwards it to the existing handler.
 */
export function useNativeGlassControl(
  id: string,
  spec: NativeGlassControlSpec,
  onEvent?: (event: NativeGlassControlEvent) => void
): {
  controlRef: (element: HTMLElement | null) => void
  panelRef: (element: HTMLElement | null) => void
} {
  const api = useContext(NativeGlassControlsContext)
  const elementRef = useRef<HTMLElement | null>(null)
  const panelElementRef = useRef<HTMLElement | null>(null)
  const signatureRef = useRef<string | null>(null)
  const registrationRef = useRef<NativeGlassRegistration>({
    element: null,
    panelElement: null,
    spec,
    onEvent,
  })

  const controlRef = useCallback(
    (element: HTMLElement | null) => {
      if (elementRef.current === element) return
      elementRef.current = element
      registrationRef.current.element = element
      api?.schedule()
    },
    [api]
  )

  const panelRef = useCallback(
    (element: HTMLElement | null) => {
      if (panelElementRef.current === element) return
      panelElementRef.current = element
      registrationRef.current.panelElement = element
      api?.schedule()
    },
    [api]
  )

  // The provider holds the same object, so the latest spec and handler are
  // visible to the next sync without re-registering.
  useEffect(() => {
    if (!api) return
    registrationRef.current.spec = spec
    registrationRef.current.onEvent = onEvent
    const signature = JSON.stringify(spec)
    if (signatureRef.current === signature) return
    signatureRef.current = signature
    api.schedule()
  }, [api, onEvent, spec])

  useEffect(() => {
    if (!api) return
    return api.register(id, registrationRef.current)
  }, [api, id])

  useEffect(() => {
    if (!api) return
    const element = elementRef.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => api.schedule())
    observer.observe(element)
    if (panelElementRef.current) observer.observe(panelElementRef.current)
    return () => observer.disconnect()
  }, [api])

  return { controlRef, panelRef }
}
