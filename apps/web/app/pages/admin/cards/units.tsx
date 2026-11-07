import { Navigate, useLocation } from "react-router"

export default function LegacyUnitDirectoryPage() {
  const { search, hash } = useLocation()
  return <Navigate to={`/admin/idols/units${search}${hash}`} replace />
}
