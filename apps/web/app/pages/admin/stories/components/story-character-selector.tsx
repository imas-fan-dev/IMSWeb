import { useState } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { adminErrorMessage } from "~/lib/admin-error"
import {
  ensureAdminCharacterStoryTarget,
  getAdminCatalog,
  type AdminCatalog,
  type AdminCatalogStoryTargetResponse,
} from "~/lib/api"

export function StoryCharacterSelector({
  onSelected,
}: {
  onSelected: (target: AdminCatalogStoryTargetResponse) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  async function load() {
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      setCatalog(await getAdminCatalog().send())
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "角色档案加载失败")
    } finally {
      setLoading(false)
    }
  }
  async function select(profileId: number) {
    setBusy(true)
    setError(null)
    try {
      const target = await ensureAdminCharacterStoryTarget({ profileId }).send()
      await onSelected(target)
      setOpen(false)
      toast.success("已使用角色档案管理剧情")
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "角色剧情关联失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => void load()}>
        从角色档案选择
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择角色档案</DialogTitle>
            <DialogDescription>
              剧情关联此角色的企划档案，共用名称和图片随档案更新。已有剧情条目会直接复用。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              aria-label="搜索角色档案"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="角色名称、别名或企划"
              disabled={busy}
            />
            {loading ? <p role="status">正在加载角色档案…</p> : null}
            {error ? (
              <div role="alert">
                <p>{error}</p>
                {!catalog ? (
                  <Button onClick={() => void load()}>重试</Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {catalog?.characters
                .filter((owner) => !owner.retired && !owner.isFallback)
                .flatMap((owner) =>
                  owner.profiles
                    .filter((profile) => !profile.isFallback)
                    .map((profile) => {
                      const project = catalog.projects.find(
                        (p) => p.id === profile.projectId
                      )
                      if (
                        ![
                          profile.nameCn,
                          profile.nameJa,
                          profile.nameEn,
                          profile.aliases,
                          project?.name,
                        ].some((s) =>
                          s
                            ?.toLocaleLowerCase()
                            .includes(query.trim().toLocaleLowerCase())
                        )
                      )
                        return null
                      return (
                        <Button
                          className="h-auto w-full justify-start text-left whitespace-normal"
                          key={profile.id}
                          variant="outline"
                          disabled={busy}
                          onClick={() => void select(profile.id)}
                        >
                          {profile.nameCn} · {project?.name}
                        </Button>
                      )
                    })
                )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
