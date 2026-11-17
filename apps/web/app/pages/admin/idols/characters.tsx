import { Navigate, useLocation } from "react-router"
import { characterWorkspaceAddress } from "./catalog-workspace-model"

export default function LegacyCharacterDirectoryPage() {
  const { search, hash } = useLocation()
  return <Navigate to={characterWorkspaceAddress(search, hash)} replace />
}
