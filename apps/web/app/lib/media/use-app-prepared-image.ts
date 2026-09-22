import { useCallback, useEffect, useRef, useState } from "react"

import {
  cleanupExpiredNativeImages,
  nativeImageErrorMessage,
  releaseNativeImage,
  selectNativeImage,
  shouldUseNativeImage,
  type NativeImageKind,
} from "~/lib/media/native-image"

let cleanupStarted = false

export function useAppPreparedImage({
  mediaKind,
  validate,
  onError,
  onSelected,
}: {
  mediaKind: NativeImageKind
  validate: (file: File) => string | null
  onError: (message: string) => void
  onSelected?: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preparing, setPreparing] = useState(false)
  const nativeIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const nativeEnabled = shouldUseNativeImage()

  const releaseCurrent = useCallback(() => {
    const nativeId = nativeIdRef.current
    nativeIdRef.current = null
    if (nativeId) void releaseNativeImage(nativeId).catch(() => undefined)
  }, [])

  const clear = useCallback(() => {
    releaseCurrent()
    setFile(null)
  }, [releaseCurrent])

  const selectFile = useCallback(
    (nextFile: File | null) => {
      if (!nextFile) {
        clear()
        return
      }
      const invalid = validate(nextFile)
      if (invalid) {
        onError(invalid)
        return
      }
      releaseCurrent()
      setFile(nextFile)
      onSelected?.()
    },
    [clear, onError, onSelected, releaseCurrent, validate]
  )

  const browse = useCallback(async () => {
    setPreparing(true)
    try {
      const result = await selectNativeImage(mediaKind)
      if (!result) return
      if (!mountedRef.current) {
        await releaseNativeImage(result.descriptor.id).catch(() => undefined)
        return
      }
      const invalid = validate(result.file)
      if (invalid) {
        await releaseNativeImage(result.descriptor.id).catch(() => undefined)
        onError(invalid)
        return
      }
      releaseCurrent()
      nativeIdRef.current = result.descriptor.id
      setFile(result.file)
      onSelected?.()
    } catch (error) {
      if (mountedRef.current) onError(nativeImageErrorMessage(error))
    } finally {
      if (mountedRef.current) setPreparing(false)
    }
  }, [mediaKind, onError, onSelected, releaseCurrent, validate])

  useEffect(() => {
    mountedRef.current = true
    if (nativeEnabled && !cleanupStarted) {
      cleanupStarted = true
      void cleanupExpiredNativeImages().catch(() => undefined)
    }
    return () => {
      mountedRef.current = false
      releaseCurrent()
    }
  }, [nativeEnabled, releaseCurrent])

  return {
    browse: nativeEnabled ? browse : undefined,
    clear,
    file,
    preparing,
    selectFile,
  }
}
