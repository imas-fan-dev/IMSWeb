import { useRequest } from "alova/client"
import { LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
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
import { AdminPageHeader } from "~/components/admin/admin-ui"

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
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<HomepageLink | null>(null)
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
    setEditorOpen(false)
    resetForm(section)
  }

  function createLink(section: HomepageLinkSection) {
    resetForm(section)
    setEditorOpen(true)
  }

  function changeEditorOpen(open: boolean) {
    if (!open && saving) return
    setEditorOpen(open)
    if (!open) resetForm(activeSection)
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
    setEditorOpen(true)
  }

  async function saveLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const editing = editingId !== null
    try {
      if (editingId) {
        await updateHomepageLink(editingId, {
          title: draft.title,
          description: draft.description,
          href: draft.href,
          icon: draft.icon,
          accent: draft.accent,
        }).send()
      } else {
        await createHomepageLink(draft).send()
      }
    } catch (saveError) {
      toast.error(homepageLinkErrorMessage(saveError))
      setSaving(false)
      return
    }

    toast.success(editing ? "首页链接已更新" : "首页链接已添加")
    setEditorOpen(false)
    resetForm()
    try {
      await refresh()
    } catch (refreshError) {
      toast.error(
        `链接已保存，但列表刷新失败：${homepageLinkErrorMessage(refreshError)}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeLink() {
    const link = deleteTarget
    if (!link) return
    setDeletingId(link.id)
    try {
      await deleteHomepageLink(link.id).send()
    } catch (deleteError) {
      toast.error(homepageLinkErrorMessage(deleteError))
      setDeletingId(null)
      return
    }

    if (editingId === link.id) resetForm()
    toast.success("首页链接已删除")
    setDeleteTarget(null)
    try {
      await refresh()
    } catch (refreshError) {
      toast.error(
        `链接已删除，但列表刷新失败：${homepageLinkErrorMessage(refreshError)}`
      )
    } finally {
      setDeletingId(null)
    }
  }

  async function reorderLinks(next: HomepageLink[]) {
    const section = activeSection
    const ids = next.map((link) => link.id)
    setSectionOrders((current) => ({ ...current, [section]: ids }))
    setReordering(true)
    try {
      await reorderHomepageLinks(section, ids).send()
    } catch (reorderError) {
      setSectionOrders((current) => {
        const nextOrders = { ...current }
        delete nextOrders[section]
        return nextOrders
      })
      toast.error(homepageLinkErrorMessage(reorderError))
      try {
        await refresh()
      } catch {
        // The mutation failed and the optimistic order is already rolled back.
      }
      setReordering(false)
      return
    }

    toast.success("首页链接顺序已更新")
    try {
      await refresh()
      setSectionOrders((current) => {
        const nextOrders = { ...current }
        delete nextOrders[section]
        return nextOrders
      })
    } catch (refreshError) {
      toast.error(
        `顺序已保存，但列表刷新失败：${homepageLinkErrorMessage(refreshError)}`
      )
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
            <HomepageLinkList
              title={homepageSectionLabels[section]}
              links={sectionLinks(section)}
              loading={loading}
              error={error}
              deletingId={deletingId}
              reordering={reordering}
              onCreate={() => createLink(section)}
              onDelete={setDeleteTarget}
              onEdit={editLink}
              onReorder={reorderLinks}
            />
          </TabsContent>
        ))}
      </Tabs>

      <HomepageLinkForm
        open={editorOpen}
        sectionLabel={homepageSectionLabels[draft.section]}
        draft={draft}
        editing={Boolean(editingId)}
        saving={saving}
        onChange={setDraft}
        onOpenChange={changeEditorOpen}
        onSubmit={saveLink}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除首页链接？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}”将从首页移除。`
                : "该链接将从首页移除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={deletingId !== null}
              onClick={() => void removeLink()}
            >
              {deletingId !== null ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default HomepageLinkManager
