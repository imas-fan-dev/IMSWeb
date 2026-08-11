import { useRequest } from "alova/client"
import { LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

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
import { Button } from "~/components/ui/button"
import {
  createInformation,
  deleteInformation,
  deleteInformationAsset,
  getAdminInformation,
  reorderInformation,
  updateInformation,
  uploadInformationAsset,
} from "~/lib/api"
import type { AdminInformationCard, InformationSubmission } from "~/lib/api"
import { AdminPageHeader } from "~/pages/admin/components/admin-ui"

import { InformationEditorDialog } from "./components/information-editor-dialog"
import {
  InformationAssetsPanel,
  PublishedInformationPanel,
} from "./components/information-panels"
import {
  appendInformationBodyAsset,
  emptyInformationSubmission,
  informationErrorMessage,
  maskInformationBodyAssets,
  restoreInformationBodyAssets,
  type InformationBodyAsset,
} from "./information-model"

export function meta() {
  return [{ title: "活动内容管理 | IMSWeb" }]
}

export function InformationManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getAdminInformation(), {
    initialData: { version: 1, cards: [], assets: [] },
  })
  onError(() => undefined)
  const [submission, setSubmission] = useState<InformationSubmission>(
    emptyInformationSubmission
  )
  const [bodyAssets, setBodyAssets] = useState<InformationBodyAsset[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [bodyImageUploading, setBodyImageUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminInformationCard | null>(
    null
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<string | null>(
    null
  )
  const [assetDeleting, setAssetDeleting] = useState<string | null>(null)
  const [cardOrder, setCardOrder] = useState<string[] | null>(null)
  const [reordering, setReordering] = useState(false)

  const orderedCards = useMemo(() => {
    if (!cardOrder) return data.cards
    const byId = new Map(data.cards.map((card) => [card.id, card]))
    return cardOrder.flatMap((id) => {
      const card = byId.get(id)
      return card ? [card] : []
    })
  }, [cardOrder, data.cards])

  function updateSubmission<Key extends keyof InformationSubmission>(
    key: Key,
    value: InformationSubmission[Key]
  ) {
    setSubmission((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setSubmission(emptyInformationSubmission)
    setBodyAssets([])
    setEditingId(null)
  }

  function createCard() {
    resetForm()
    setEditorOpen(true)
  }

  function editCard(card: AdminInformationCard) {
    const htmlDraft = maskInformationBodyAssets(card.html ?? "")
    setEditingId(card.id)
    setBodyAssets(htmlDraft.assets)
    setSubmission({
      title: card.title,
      category: card.category,
      contentType: card.contentType,
      externalUrl: card.contentType === "external" ? card.link : "",
      html: htmlDraft.html,
      image: card.image,
    })
    setEditorOpen(true)
  }

  function changeEditorOpen(open: boolean) {
    if (!open && (saving || coverUploading || bodyImageUploading)) return
    setEditorOpen(open)
    if (!open) resetForm()
  }

  async function uploadAsset(file: File, usage: "cover" | "body") {
    const setUploading =
      usage === "cover" ? setCoverUploading : setBodyImageUploading
    setUploading(true)
    try {
      const result = await uploadInformationAsset(file).send()
      if (usage === "cover") {
        updateSubmission("image", result.url)
      } else {
        const appended = appendInformationBodyAsset(
          submission.html,
          result.url,
          bodyAssets
        )
        setSubmission((current) => ({ ...current, html: appended.html }))
        setBodyAssets((current) => [...current, appended.asset])
      }
      toast.success(usage === "cover" ? "封面已托管" : "正文图片已插入")
      try {
        await refresh()
      } catch (refreshError) {
        toast.error(
          `图片已托管，但资源列表刷新失败：${informationErrorMessage(refreshError)}`
        )
      }
    } catch (uploadError) {
      toast.error(informationErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setSaving(true)
    const editing = editingId !== null
    const resolvedSubmission = {
      ...submission,
      html: restoreInformationBodyAssets(submission.html, bodyAssets),
    }
    try {
      if (editingId) {
        await updateInformation(editingId, resolvedSubmission).send()
      } else {
        await createInformation(resolvedSubmission).send()
      }
      toast.success(editing ? "活动内容已更新" : "活动内容已发布")
      setEditorOpen(false)
      resetForm()
    } catch (saveError) {
      toast.error(informationErrorMessage(saveError))
      setSaving(false)
      return
    }

    try {
      await refresh()
    } catch (refreshError) {
      toast.error(
        `内容已保存，但列表刷新失败：${informationErrorMessage(refreshError)}`
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeCard() {
    const card = deleteTarget
    if (!card) return

    setDeletingId(card.id)
    try {
      await deleteInformation(card.id).send()
      setDeleteTarget(null)
      setCardOrder(
        orderedCards
          .filter((item) => item.id !== card.id)
          .map((item) => item.id)
      )
      toast.success("活动内容已删除")
    } catch (deleteError) {
      toast.error(informationErrorMessage(deleteError))
      setDeletingId(null)
      return
    }

    try {
      await refresh()
      setCardOrder(null)
    } catch (refreshError) {
      toast.error(
        `内容已删除，但列表刷新失败：${informationErrorMessage(refreshError)}`
      )
    } finally {
      setDeletingId(null)
    }
  }

  async function removeAsset() {
    const url = assetDeleteTarget
    if (!url) return

    setAssetDeleting(url)
    try {
      await deleteInformationAsset(url).send()
      setAssetDeleteTarget(null)
      toast.success("托管图片已删除")
    } catch (deleteError) {
      toast.error(informationErrorMessage(deleteError))
      setAssetDeleting(null)
      return
    }

    try {
      await refresh()
    } catch (refreshError) {
      toast.error(
        `图片已删除，但列表刷新失败：${informationErrorMessage(refreshError)}`
      )
    } finally {
      setAssetDeleting(null)
    }
  }

  async function reorderCards(next: AdminInformationCard[]) {
    const ids = next.map((card) => card.id)
    setCardOrder(ids)
    setReordering(true)
    try {
      await reorderInformation(ids).send()
      toast.success("活动内容顺序已更新")
    } catch (reorderError) {
      setCardOrder(null)
      toast.error(informationErrorMessage(reorderError))
      setReordering(false)
      try {
        await refresh()
      } catch {
        // The mutation already failed; the existing load error state is enough.
      }
      return
    }

    try {
      await refresh()
      setCardOrder(null)
    } catch (refreshError) {
      toast.error(
        `顺序已保存，但列表刷新失败：${informationErrorMessage(refreshError)}`
      )
    } finally {
      setReordering(false)
    }
  }

  const assetDeleteIndex = assetDeleteTarget
    ? data.assets.indexOf(assetDeleteTarget)
    : -1

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="CONTENT DESK"
        title="活动内容"
        description="发布活动资讯与同人活动，统一管理外部链接、站内 HTML 和正文图片。"
        actions={
          <Button type="button" variant="outline" onClick={() => refresh()}>
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <PublishedInformationPanel
        cards={orderedCards}
        deletingId={deletingId}
        error={error}
        loading={loading}
        reordering={reordering}
        onCreate={createCard}
        onEdit={editCard}
        onDelete={setDeleteTarget}
        onReorder={(cards) => void reorderCards(cards)}
      />

      <InformationAssetsPanel
        assets={data.assets}
        deletingUrl={assetDeleting}
        onDelete={setAssetDeleteTarget}
      />

      <InformationEditorDialog
        open={editorOpen}
        editing={editingId !== null}
        submission={submission}
        bodyAssets={bodyAssets}
        saving={saving}
        coverUploading={coverUploading}
        bodyImageUploading={bodyImageUploading}
        onOpenChange={changeEditorOpen}
        onSubmit={() => void submit()}
        onUpdate={updateSubmission}
        onUpload={(file, usage) => void uploadAsset(file, usage)}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除活动内容？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}”将从活动区移除。`
                : "所选活动内容将从活动区移除。"}
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
              onClick={() => void removeCard()}
            >
              {deletingId ? (
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

      <AlertDialog
        open={assetDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !assetDeleting) setAssetDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="text-destructive">
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除托管图片？</AlertDialogTitle>
            <AlertDialogDescription>
              {assetDeleteIndex >= 0
                ? `托管图片 ${assetDeleteIndex + 1} 将被永久删除。`
                : "所选托管图片将被永久删除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assetDeleting !== null}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={assetDeleting !== null}
              onClick={() => void removeAsset()}
            >
              {assetDeleting ? (
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

export default InformationManager
