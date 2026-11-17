import { CatalogManager } from "./components/catalog-manager"

export function meta() {
  return [{ title: "栏目管理 | IMSWeb" }]
}

export default function AdminIdolGroupsPage() {
  return <CatalogManager section="groups" />
}
