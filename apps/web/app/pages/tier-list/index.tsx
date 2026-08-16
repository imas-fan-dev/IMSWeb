import { TierListWorkspace } from "./components/tier-list-workspace"

export function meta() {
  return [
    { title: "Tier List | IMSWeb" },
    {
      name: "description",
      content:
        "上传本机图片，拖拽分级、自由配色，导出高清 PNG。所有内容只保存在浏览器本地。",
    },
  ]
}

export function TierListPage() {
  return (
    <main id="main-content">
      <section className="border-b bg-muted/25">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <p className="text-xs font-semibold text-primary">TIER LIST</p>
          <h1 className="mt-2 text-3xl font-semibold">Tier List 排行</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            上传本机图片，拖拽分级、自由配色，导出高清
            PNG。所有内容只保存在浏览器本地。
          </p>
        </div>
      </section>
      <TierListWorkspace />
    </main>
  )
}

export default TierListPage
