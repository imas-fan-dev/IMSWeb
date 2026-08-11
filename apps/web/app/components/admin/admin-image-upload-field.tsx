import { FileImageIcon, ImageUpIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AdminFileUploadField } from "./admin-file-upload-field"

const adminImageAccept = "image/png,image/jpeg,image/webp,image/avif"

export function AdminImageUploadField({
  id,
  name,
  label,
  description,
  file = null,
  disabled = false,
  uploading = false,
  required = false,
  resetAfterSelect = false,
  compact = true,
  onSelect,
}: {
  id: string
  name?: string
  label: string
  description: string
  file?: File | null
  disabled?: boolean
  uploading?: boolean
  required?: boolean
  resetAfterSelect?: boolean
  compact?: boolean
  onSelect: (file: File | null) => void
}) {
  const { t } = useTranslation()

  return (
    <AdminFileUploadField
      id={id}
      name={name}
      label={label}
      description={description}
      accept={adminImageAccept}
      emptyTitle={t("upload.image.emptyTitle")}
      emptyDetail={t("upload.image.emptyDetail")}
      fileKind={t("upload.image.fileKind")}
      file={file}
      disabled={disabled}
      uploading={uploading}
      required={required}
      resetAfterSelect={resetAfterSelect}
      compact={compact}
      selectedIcon={FileImageIcon}
      emptyIcon={ImageUpIcon}
      onSelect={onSelect}
    />
  )
}
