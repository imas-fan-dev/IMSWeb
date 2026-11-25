import { useRef, useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { Button } from "~/components/ui/button"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { getFudabaGuestSubmission } from "~/lib/api"
import { NamecardGuestDialog } from "~/components/community/namecard-guest-dialog"
export function NamecardCreateEntry() {
  const platform = useOptionalPlatformSession()
  const navigate = useNavigation()

  const [checking, setChecking] = useState(false)
  const [guestOpen, setGuestOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  async function start() {
    if (platform.status === "authenticated") {
      navigate("/account/me/namecards?card=new")
      return
    }
    if (platform.status === "restricted") {
      toast.error("帐号当前受限，暂时无法新建名片")
      return
    }
    if (platform.status === "anonymous") {
      setChecking(true)
      try {
        if ((await getFudabaGuestSubmission().send()).enabled) {
          setGuestOpen(true)
          return
        }
      } catch {
        // If the policy is unavailable, preserve the login flow.
      } finally {
        setChecking(false)
      }
    }
    navigate("/account/login")
  }

  return (
    <>
      <Button
        ref={trigger}
        disabled={checking || platform.status === "loading"}
        type="button"
        size="icon"
        className="size-12 rounded-full shadow-lg shadow-primary/20 sm:w-auto sm:gap-2 sm:rounded-lg sm:px-5"
        aria-label="新建名片"
        title="新建名片"
        data-namecard-create-trigger
        onClick={() => void start()}
      >
        <PlusIcon className="size-5 sm:size-4" aria-hidden="true" />
        <span className="hidden sm:inline">新建名片</span>
      </Button>
      {guestOpen && platform.status === "anonymous" ? (
        <NamecardGuestDialog
          onClose={() => {
            setGuestOpen(false)
            trigger.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}
