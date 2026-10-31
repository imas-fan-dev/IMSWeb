import { useId, useState } from "react"
import { Input } from "~/components/ui/input"
import { Field, FieldLabel } from "~/components/ui/field"
import { Button } from "~/components/ui/button"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { ConfiguredOfficePicker } from "./configured-office-picker"
import { MapPinIcon } from "lucide-react"

import type { FudabaPlaceReverseResponse } from "~/lib/api"
import type { OfficeDraft } from "./office-location-model"
import type { OfficePlaceServices } from "./office-place-services"

export function OfficePlaceSearch({
  draft,
  disabled,
  onChange,
  placeServices,
  showCoordinates = false,
}: {
  draft: OfficeDraft
  disabled: boolean
  onChange: (draft: OfficeDraft) => void
  placeServices?: OfficePlaceServices
  showCoordinates?: boolean
}) {
  const addressId = useId()
  const [open, setOpen] = useState(false)
  const [attribution, setAttribution] =
    useState<FudabaPlaceReverseResponse["attribution"]>(null)
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={addressId}>详细地址</FieldLabel>
        <Input
          id={addressId}
          value={draft.address}
          required
          disabled={disabled}
          aria-describedby={open ? `${addressId}-hint` : undefined}
          onChange={(event) =>
            onChange({ ...draft, address: event.currentTarget.value })
          }
        />
        {open ? (
          <p
            id={`${addressId}-hint`}
            className="text-xs/5 text-muted-foreground"
          >
            这里保留当前表单地址；请核对下方浮标的待绑定地址，确认后再更新城市和详细地址。
          </p>
        ) : null}
      </Field>
      {showCoordinates ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["latitude", "纬度"],
              ["longitude", "经度"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${addressId}-${key}`}>{label}</FieldLabel>
              <Input
                id={`${addressId}-${key}`}
                inputMode="decimal"
                value={draft[key]}
                disabled={disabled}
                maxLength={32}
                onChange={(event) => {
                  setOpen(false)
                  setAttribution(null)
                  onChange({ ...draft, [key]: event.currentTarget.value })
                }}
              />
            </Field>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            经纬度使用 WGS84。手动修改坐标后，请同时核对城市和文字地址。
          </p>
        </div>
      ) : null}
      {open ? (
        <ConfiguredOfficePicker
          draft={draft}
          placeServices={placeServices}
          disabled={disabled}
          onChange={onChange}
          onResolved={setAttribution}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          搜索地点与地图选点
        </Button>
      )}
      {!open && draft.latitude && draft.longitude ? (
        <div
          role="status"
          className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm"
        >
          <MapPinIcon
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="font-medium">已选择地点</p>
              {attribution ? (
                <NavigationLink
                  href={attribution.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {attribution.text}
                </NavigationLink>
              ) : null}
            </div>
            {draft.address ? (
              <p className="text-muted-foreground">{draft.address}</p>
            ) : null}
            {!draft.city.trim() || !draft.address.trim() ? (
              <p className="text-xs/5 text-muted-foreground">
                此位置的地址信息不完整，请补全城市和详细地址后保存。
              </p>
            ) : (
              <p className="text-xs/5 text-muted-foreground">
                城市和详细地址已填写，可在上方手动修正。
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
