import { CatalogManager } from "./components/catalog-manager"

export function meta() {
  return [{ title: "条目管理 | IMSWeb" }]
}

export default function AdminIdolEntriesPage() {
  return <CatalogManager section="entries" />
}
