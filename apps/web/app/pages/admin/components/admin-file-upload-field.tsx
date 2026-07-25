import { FileUploadControl } from "~/components/shared/file-upload-control"
import type { FileUploadControlProps } from "~/components/shared/file-upload-control"

import { AdminField } from "./admin-ui"

export type AdminFileUploadControlProps = FileUploadControlProps
export const AdminFileUploadControl = FileUploadControl

export function AdminFileUploadField({
  label,
  description,
  className,
  ...controlProps
}: AdminFileUploadControlProps & {
  label: string
  description: string
  className?: string
}) {
  return (
    <AdminField
      label={label}
      htmlFor={controlProps.id}
      description={description}
      className={className}
    >
      <FileUploadControl {...controlProps} />
    </AdminField>
  )
}
