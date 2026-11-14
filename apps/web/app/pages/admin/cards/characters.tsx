import { Navigate, useLocation } from "react-router"
import { characterWorkspaceAddress } from "../idols/catalog-workspace-model"

export default function LegacyCharacterDirectoryPage() {
  const { search, hash } = useLocation()
  return <Navigate to={characterWorkspaceAddress(search, hash)} replace />
}
