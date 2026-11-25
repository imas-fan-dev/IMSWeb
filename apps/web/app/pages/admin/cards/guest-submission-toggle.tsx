import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  getAdminNamecardGuestSubmission,
  updateAdminNamecardGuestSubmission,
  isApiError,
} from "~/lib/api"

export function GuestSubmissionToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let active = true
    void getAdminNamecardGuestSubmission()
      .send()
      .then((result) => {
        if (active) setEnabled(result.enabled)
      })
      .catch(() => {
        if (active) toast.error("无法读取匿名投稿设置")
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (enabled === null) {
        setEnabled((await getAdminNamecardGuestSubmission().send()).enabled)
        return
      }
      const result = await updateAdminNamecardGuestSubmission(!enabled).send()
      setEnabled(result.enabled)
      toast.success(
        result.enabled ? "已允许匿名名片投稿" : "已关闭匿名名片投稿"
      )
    } catch (error) {
      setEnabled(null)
      toast.error(isApiError(error) ? error.message : "无法更新匿名投稿设置")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={() => void toggle()}
    >
      {enabled === null
        ? busy
          ? "正在读取匿名投稿设置…"
          : "重试读取匿名投稿设置"
        : enabled
          ? "关闭匿名投稿"
          : "允许匿名投稿"}
    </Button>
  )
}
