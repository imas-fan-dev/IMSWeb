import { useMemo, useState } from "react"

import { AdminConfigDialog } from "~/components/admin/admin-config-dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  fudabaMapSourceNameSchema,
  fudabaMapStyleUrlSchema,
  type FudabaMapSource,
} from "~/lib/api"

interface MapSourceDraft {
  name: string
  styleUrl: string
}

export function MapSourceEditorDialog({
  source,
  saving,
  onOpenChange,
  onSave,
}: {
  source: FudabaMapSource | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (draft: MapSourceDraft) => void | Promise<void>
}) {
  const [draft, setDraft] = useState<MapSourceDraft>({
    name: source?.name ?? "",
    styleUrl: source?.styleUrl ?? "",
  })

  const valid = useMemo(
    () =>
      fudabaMapSourceNameSchema.safeParse(draft.name).success &&
      fudabaMapStyleUrlSchema.safeParse(draft.styleUrl).success,
    [draft]
  )

  return (
    <AdminConfigDialog
      open
      title={source ? "编辑地图源" : "新增地图源"}
      description={source?.name ?? "地图源配置"}
      submitLabel={source ? "保存地图源" : "添加地图源"}
      submitDisabled={!valid}
      saving={saving}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (valid) return onSave(draft)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="map-source-name">配置名称</FieldLabel>
          <Input
            id="map-source-name"
            required
            maxLength={80}
            autoFocus
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="map-source-style-url">地图样式地址</FieldLabel>
          <Input
            id="map-source-style-url"
            required
            maxLength={2048}
            spellCheck={false}
            value={draft.styleUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                styleUrl: event.target.value,
              }))
            }
          />
          <FieldDescription>完整 HTTP(S) 地址或站点根路径。</FieldDescription>
        </Field>
      </FieldGroup>
    </AdminConfigDialog>
  )
}
