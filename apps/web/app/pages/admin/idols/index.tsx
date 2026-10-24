import { Navigate, useLocation } from "react-router"

export default function AdminIdolsPage() {
  const { search } = useLocation()
  return <Navigate to={`/admin/idols/entries${search}`} replace />
}
