import { useState } from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Button } from "~/components/ui/button"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  deleteAdminNamecardCharacter,
  invalidateNamecardCharacterCatalog,
  type AdminCatalog,
} from "~/lib/api"
import { resetNamecardCharacterCatalogCache } from "~/lib/use-namecard-character-catalog"

export function CatalogCharacterRetireButton({
  owner,
  disabled,
  onBusyChange,
  onRetired,
}: {
  owner: AdminCatalog["characters"][number]
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onRetired: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  async function retire() {
    setSaving(true)
    onBusyChange(true)
    try {
      await deleteAdminNamecardCharacter(owner.id, owner.revision).send()
      resetNamecardCharacterCatalogCache()
      await invalidateNamecardCharacterCatalog()
      setOpen(false)
      toast.success("人物已停用，已有担当关联保留")
      await onRetired()
    } catch (error) {
      toast.error(adminErrorMessage(error) ?? "无法停用人物，请刷新后重试")
    } finally {
      setSaving(false)
      onBusyChange(false)
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || saving || owner.isFallback || owner.retired}
        onClick={() => setOpen(true)}
      >
        <Trash2Icon data-icon="inline-start" className="text-destructive" />
        停用人物
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={(value) => {
          if (!saving) setOpen(value)
        }}
        title="停用人物"
        description={`「${owner.name}」将停用，所有企划档案转为只读，不再作为新增担当候选。已有名片和认领关联继续保留。`}
        submitting={saving}
        confirmLabel="确认停用"
        onConfirm={() => void retire()}
      />
    </>
  )
}
