import { CatalogManager } from "./components/catalog-manager"

export function meta() {
  return [{ title: "企划管理 | IMSWeb" }]
}

export default function AdminIdolAgenciesPage() {
  return <CatalogManager section="agencies" />
}
