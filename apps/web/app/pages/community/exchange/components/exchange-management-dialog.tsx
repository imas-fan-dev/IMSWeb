import { lazy, Suspense, useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  ExchangeMapDialogContext,
  useExchangeMapDialog,
} from "./exchange-page-surface"

const Workspace = lazy(async () => {
  const module = await import("~/pages/account/me/account-me-workspace")
  return { default: module.AccountMeWorkspace }
})

/** Contextual management uses the same owner-only workspace as account pages. */
export function ExchangeManagementDialog({
  section,
  cardId,
  officeId,
}: {
  section: "namecards" | "offices"
  cardId?: string
  officeId?: string
}) {
  const outer = useExchangeMapDialog()
  const [open, setOpen] = useState(false)
  const label = section === "namecards" ? "管理我的名片" : "管理我的事务所"
  const query = new URLSearchParams()
  if (cardId) query.set("card", cardId)
  if (officeId) query.set("office", officeId)
  const href = `/account/me/${section}${query.size ? `?${query}` : ""}`

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent layout="pinned" className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              仅管理你拥有的资料，关闭后继续浏览地图。
            </DialogDescription>
            <NavigationLink
              to={href}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              打开完整管理页面
            </NavigationLink>
          </DialogHeader>
          <DialogBody>
            <ExchangeMapDialogContext
              value={{ close: () => setOpen(false), changed: outer?.changed }}
            >
              <Suspense fallback={<p role="status">正在载入管理工作区</p>}>
                <Workspace
                  section={section}
                  sectionBasePath="/account/me"
                  initialCardId={cardId}
                  initialOfficeId={officeId}
                />
              </Suspense>
            </ExchangeMapDialogContext>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
