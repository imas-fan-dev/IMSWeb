import type { NativeGlassStatus } from "~/lib/native-glass"

async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(command, args)
}

/**
 * The App owns one page stack per tab, so a native edge swipe must not replay
 * WebKit session history. Native code admits the gesture and reports it here;
 * the provider performs the single navigation.
 */
export interface NativeBackPolicy {
  generation: number
  revision: number
  canBack: boolean
}

export type NativeBackPhase = "begin" | "progress" | "cancel" | "commit"

export interface NativeBackGesture {
  generation: number
  revision: number
  gestureId: number
  phase: NativeBackPhase
  progress: number
}

export const NATIVE_BACK_EVENT = "ims:native-back"

export function syncNativeBackPolicy(policy: NativeBackPolicy) {
  return invokeCommand<NativeGlassStatus>(
    "plugin:native-glass|set_back_policy",
    {
      args: policy,
    }
  )
}

/** Android: a root Back hands the task to the system instead of WebView history. */
export function backgroundNativeTask() {
  return invokeCommand<NativeGlassStatus>("plugin:native-glass|background_task")
}

export function nativeBackGesture(event: Event): NativeBackGesture | null {
  if (
    !(event instanceof CustomEvent) ||
    !event.detail ||
    typeof event.detail !== "object"
  )
    return null
  const detail = event.detail as Record<string, unknown>
  if (
    !Number.isSafeInteger(detail.generation) ||
    !Number.isSafeInteger(detail.revision) ||
    !Number.isSafeInteger(detail.gestureId) ||
    Number(detail.generation) < 0 ||
    Number(detail.revision) < 0 ||
    Number(detail.gestureId) <= 0
  )
    return null
  if (!["begin", "progress", "cancel", "commit"].includes(String(detail.phase)))
    return null
  if (
    typeof detail.progress !== "number" ||
    !Number.isFinite(detail.progress) ||
    detail.progress < 0 ||
    detail.progress > 1
  )
    return null
  return {
    generation: Number(detail.generation),
    revision: Number(detail.revision),
    gestureId: Number(detail.gestureId),
    phase: detail.phase as NativeBackPhase,
    progress: detail.progress,
  }
}
