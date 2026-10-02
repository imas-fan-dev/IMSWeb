import { Navigate } from "react-router"

export default function AdminInformationRedirect() {
  return <Navigate to="/admin/events" replace />
}
