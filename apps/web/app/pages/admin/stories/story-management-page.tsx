import { BookOpenIcon, ImageIcon, ShapesIcon } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { AgencyIconManager } from "~/pages/admin/stories/agency-icon-manager"
import { StoryManager } from "~/pages/admin/stories/story-manager"
import { StoryMediaManager } from "~/pages/admin/stories/story-media-manager"

export function StoryManagementPage() {
  return (
    <Tabs defaultValue="stories" className="gap-7">
      <TabsList aria-label="Wiki 管理视图">
        <TabsTrigger value="stories">
          <BookOpenIcon data-icon="inline-start" />
          剧情内容
        </TabsTrigger>
        <TabsTrigger value="media">
          <ImageIcon data-icon="inline-start" />
          角色素材
        </TabsTrigger>
        <TabsTrigger value="agency-icons">
          <ShapesIcon data-icon="inline-start" />
          系列图标
        </TabsTrigger>
      </TabsList>
      <TabsContent value="stories">
        <StoryManager />
      </TabsContent>
      <TabsContent value="media">
        <StoryMediaManager />
      </TabsContent>
      <TabsContent value="agency-icons">
        <AgencyIconManager />
      </TabsContent>
    </Tabs>
  )
}
