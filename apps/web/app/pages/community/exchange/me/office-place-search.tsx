import { MapPinIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { ExchangePlaceSearch } from "../exchange-place-search"
import type { OfficeDraft } from "./office-location-model"

export function OfficePlaceSearch({
  draft,
  disabled,
  onChange,
}: {
  draft: OfficeDraft
  disabled: boolean
  onChange: (draft: OfficeDraft) => void
}) {
  return (
    <div className="space-y-4">
      <ExchangePlaceSearch
        disabled={disabled}
        onSelect={(place) =>
          onChange({
            ...draft,
            city: place.city,
            address: place.address,
            latitude: String(place.location.latitude),
            longitude: String(place.location.longitude),
          })
        }
      />
      {draft.address && draft.latitude && draft.longitude ? (
        <Alert>
          <MapPinIcon aria-hidden="true" />
          <AlertTitle>已选择地点</AlertTitle>
          <AlertDescription>{draft.address}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
