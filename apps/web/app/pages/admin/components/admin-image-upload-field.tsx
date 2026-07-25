import { FileImageIcon, ImageUpIcon } from "lucide-react"

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
  resetAfterSelect = false,
  onSelect,
}: {
  id: string
  name?: string
  label: string
  description: string
  file?: File | null
  disabled?: boolean
  uploading?: boolean
  resetAfterSelect?: boolean
  onSelect: (file: File | null) => void
}) {
  return (
    <AdminFileUploadField
      id={id}
      name={name}
      label={label}
      description={description}
      accept={adminImageAccept}
      emptyTitle="选择一张图片"
      emptyDetail="PNG、JPEG、WebP 或 AVIF"
      fileKind="图片"
      file={file}
      disabled={disabled}
      uploading={uploading}
      resetAfterSelect={resetAfterSelect}
      selectedIcon={FileImageIcon}
      emptyIcon={ImageUpIcon}
      onSelect={onSelect}
    />
  )
}
