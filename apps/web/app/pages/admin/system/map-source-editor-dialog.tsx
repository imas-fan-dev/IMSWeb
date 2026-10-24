import { useState } from "react"
import {
  defaultMapProvider,
  mapProviderById,
  mapProviderCatalog,
  mapProviderFor,
} from "~/lib/maps/provider-catalog"
import type { MapProviderDraft } from "~/lib/maps/provider-definition"

import { AdminConfigDialog } from "~/components/admin/admin-config-dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import {
  fudabaMapSourceWriteSchema,
  type FudabaMapSource,
  type FudabaMapProviderConfig,
} from "~/lib/api"

export type MapSourceDraft = { name: string } & FudabaMapProviderConfig

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
  const [name, setName] = useState(source?.name ?? "")
  const [providerId, setProviderId] = useState(
    () => (source ? mapProviderFor(source) : defaultMapProvider).id
  )
  const [drafts, setDrafts] = useState<Record<string, MapProviderDraft>>(() =>
    Object.fromEntries(
      mapProviderCatalog.map((provider) => [
        provider.id,
        provider.createDraft(source ?? undefined),
      ])
    )
  )
  const provider = mapProviderById(providerId)
  const draft = drafts[providerId] ?? provider.createDraft()
  const payload: MapSourceDraft = {
    name: name.trim(),
    ...provider.toConfig(draft),
  }
  const valid = fudabaMapSourceWriteSchema.safeParse({
    ...payload,
    revision: null,
  }).success

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
        if (valid) return onSave(payload)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="map-source-provider">地图服务商</FieldLabel>
          <Select
            value={providerId}
            onValueChange={(value) => {
              if (value) setProviderId(mapProviderById(value).id)
            }}
          >
            <SelectTrigger id="map-source-provider">
              <SelectValue>{provider.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {mapProviderCatalog.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="map-source-name">配置名称</FieldLabel>
          <Input
            id="map-source-name"
            required
            maxLength={80}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {provider.fields.map((field) => (
          <Field key={`${provider.id}:${field.key}`}>
            <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
            <Input
              id={field.id}
              value={draft[field.key] ?? ""}
              required={field.required}
              maxLength={field.maxLength}
              spellCheck={false}
              onChange={(event) => {
                const value = event.target.value
                setDrafts((current) => ({
                  ...current,
                  [provider.id]: {
                    ...current[provider.id],
                    [field.key]: value,
                  },
                }))
              }}
            />
            <FieldDescription>{field.description}</FieldDescription>
          </Field>
        ))}
      </FieldGroup>
    </AdminConfigDialog>
  )
}
