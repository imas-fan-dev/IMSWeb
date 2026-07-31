import { useRequest } from "alova/client"
import { RefreshCwIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  createHomepageLink,
  deleteHomepageLink,
  emptyHomepageLinks,
  getAdminHomepageLinks,
  reorderHomepageLinks,
  updateHomepageLink,
  type HomepageLink,
  type HomepageLinkSection,
} from "~/lib/api"
import { AdminPageHeader } from "~/pages/admin/components/admin-ui"

import { HomepageLinkForm } from "./components/homepage-link-form"
import { HomepageLinkList } from "./components/homepage-link-list"
import {
  emptyHomepageLinkSubmission,
  homepageLinkErrorMessage,
  homepageSectionLabels,
  homepageSectionOrder,
} from "./homepage-link-model"

export function meta() {
  return [{ title: "首页板块管理 | IMSWeb" }]
}

export function HomepageLinkManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAdminHomepageLinks(), { initialData: emptyHomepageLinks })
  onError(() => undefined)
  const [sectionOrders, setSectionOrders] = useState<
    Partial<Record<HomepageLinkSection, string[]>>
  >({})
  const [activeSection, setActiveSection] =
    useState<HomepageLinkSection>("navigation")
  const [draft, setDraft] = useState(() =>
    emptyHomepageLinkSubmission("navigation")
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  function sectionLinks(section: HomepageLinkSection) {
    const links = data.sections[section]
    const order = sectionOrders[section]
    if (!order) return links
    const byId = new Map(links.map((link) => [link.id, link]))
    return order.flatMap((id) => {
      const link = byId.get(id)
      return link ? [link] : []
    })
  }

  function resetForm(section = activeSection) {
    setEditingId(null)
    setDraft(emptyHomepageLinkSubmission(section))
  }

  function chooseSection(section: HomepageLinkSection) {
    setActiveSection(section)
    resetForm(section)
  }

  function editLink(link: HomepageLink) {
    setEditingId(link.id)
    setDraft({
      section: link.section,
      title: link.title,
      description: link.description,
      href: link.href,
      icon: link.icon,
      accent: link.accent,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function saveLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await updateHomepageLink(editingId, {
          title: draft.title,
          description: draft.description,
          href: draft.href,
          icon: draft.icon,
          accent: draft.accent,
        }).send()
        toast.success("首页链接已更新")
      } else {
        await createHomepageLink(draft).send()
        toast.success("首页链接已添加")
      }
      resetForm()
      await refresh()
    } catch (saveError) {
      toast.error(homepageLinkErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function removeLink(link: HomepageLink) {
    if (!window.confirm(`确定删除“${link.title}”吗？`)) return
    setDeletingId(link.id)
    try {
      await deleteHomepageLink(link.id).send()
      if (editingId === link.id) resetForm()
      await refresh()
      toast.success("首页链接已删除")
    } catch (deleteError) {
      toast.error(homepageLinkErrorMessage(deleteError))
    } finally {
      setDeletingId(null)
    }
  }

  async function reorderLinks(next: HomepageLink[]) {
    const ids = next.map((link) => link.id)
    setSectionOrders((current) => ({ ...current, [activeSection]: ids }))
    setReordering(true)
    try {
      await reorderHomepageLinks(activeSection, ids).send()
      await refresh()
      setSectionOrders((current) => {
        const nextOrders = { ...current }
        delete nextOrders[activeSection]
        return nextOrders
      })
      toast.success("首页链接顺序已更新")
    } catch (reorderError) {
      setSectionOrders((current) => {
        const nextOrders = { ...current }
        delete nextOrders[activeSection]
        return nextOrders
      })
      toast.error(homepageLinkErrorMessage(reorderError))
      await refresh()
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="HOMEPAGE CONTENT"
        title="首页板块"
        description="维护站点导航、友情链接与网站支持内容。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <Tabs
        value={activeSection}
        onValueChange={(value) =>
          chooseSection(String(value) as HomepageLinkSection)
        }
      >
        <TabsList className="w-full sm:w-fit">
          {homepageSectionOrder.map((section) => (
            <TabsTrigger key={section} value={section}>
              {homepageSectionLabels[section]}
            </TabsTrigger>
          ))}
        </TabsList>
        {homepageSectionOrder.map((section) => (
          <TabsContent key={section} value={section}>
            <div className="grid gap-8 xl:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
              <HomepageLinkForm
                draft={draft}
                editing={Boolean(editingId)}
                saving={saving}
                onChange={setDraft}
                onCancel={() => resetForm()}
                onSubmit={saveLink}
              />
              <HomepageLinkList
                title={homepageSectionLabels[section]}
                links={sectionLinks(section)}
                loading={loading}
                error={error}
                deletingId={deletingId}
                reordering={reordering}
                onDelete={removeLink}
                onEdit={editLink}
                onReorder={reorderLinks}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export default HomepageLinkManager
