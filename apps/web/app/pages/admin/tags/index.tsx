import { RefreshCwIcon } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router"

import { AdminPageHeader } from "~/components/admin/admin-ui"
import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { BlocklistTab } from "./blocklist-tab"
import { FreeTagsTab } from "./free-tags-tab"
import { PresetTagsTab } from "./preset-tags-tab"
import {
  DEFAULT_TAG_LIBRARY_TAB,
  tagLibraryTab,
} from "./tag-library-model"

export function meta() {
  return [{ title: "标签管理 | IMSWeb" }]
}

export default function AdminTagLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tagLibraryTab(searchParams.get("tab"))
  const [refreshSignal, setRefreshSignal] = useState(0)

  // Each tab keeps its own query/page params, so switching never clears the
  // filters an operator left behind.
  function changeTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === DEFAULT_TAG_LIBRARY_TAB) next.delete("tab")
    else next.set("tab", value)
    setSearchParams(next)
  }

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <AdminPageHeader
        eyebrow="NAMECARD TAGS"
        title="标签管理"
        description="维护名片墙共用的预设标签、自由标签与屏蔽词；标签即时生效，不进入名片审核。"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setRefreshSignal((signal) => signal + 1)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="标签库分类">
          <TabsTrigger value="free">自由标签</TabsTrigger>
          <TabsTrigger value="presets">预设标签</TabsTrigger>
          <TabsTrigger value="blocklist">屏蔽词</TabsTrigger>
        </TabsList>

        <TabsContent value="free" className="flex flex-col gap-7 pt-5">
          {tab === "free" ? (
            <FreeTagsTab refreshSignal={refreshSignal} />
          ) : null}
        </TabsContent>

        <TabsContent value="presets" className="flex flex-col gap-7 pt-5">
          {tab === "presets" ? (
            <PresetTagsTab refreshSignal={refreshSignal} />
          ) : null}
        </TabsContent>

        <TabsContent value="blocklist" className="flex flex-col gap-7 pt-5">
          {tab === "blocklist" ? (
            <BlocklistTab refreshSignal={refreshSignal} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
