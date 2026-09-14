import { useEffect, useState } from "react"

import { getPlatformAvatar, isManagedPlatformAvatarUrl } from "~/lib/api"

type LoadedAvatarSource = {
  accountId: string | null
  avatarUrl: string
  source: string
}

export function usePlatformAvatarSource(
  avatarUrl: string | null | undefined,
  accountId?: string | null
): string | null {
  const [loaded, setLoaded] = useState<LoadedAvatarSource | null>(null)
  const managed = isManagedPlatformAvatarUrl(avatarUrl)
  const sourceAccountId = accountId ?? null

  useEffect(() => {
    if (!managed || !avatarUrl) return

    const method = getPlatformAvatar()
    let active = true
    let pending = true
    let objectUrl: string | null = null

    void method
      .send()
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
          return
        }
        setLoaded({
          accountId: sourceAccountId,
          avatarUrl,
          source: objectUrl,
        })
      })
      .catch(() => {
        if (active) setLoaded(null)
      })
      .finally(() => {
        pending = false
      })

    return () => {
      active = false
      if (pending) method.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        setLoaded((current) => (current?.source === objectUrl ? null : current))
      }
    }
  }, [avatarUrl, managed, sourceAccountId])

  if (!managed) return avatarUrl ?? null
  if (
    !loaded ||
    loaded.accountId !== sourceAccountId ||
    loaded.avatarUrl !== avatarUrl
  ) {
    return null
  }
  return loaded.source
}
