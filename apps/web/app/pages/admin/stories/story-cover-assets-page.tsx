import {
  ArrowLeftIcon,
  ImageIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
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
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import {
  AdminEmptyState,
  AdminPageHeader,
} from "~/pages/admin/components/admin-ui"
import { StoryCoverAssetDialog } from "~/pages/admin/stories/story-cover-asset-dialog"
import {
  deleteWikiStoryCoverAsset,
  getAdminWikiCatalog,
  getAdminWikiStoryCoverAssets,
  isApiError,
  type WikiAdminAgency,
  type WikiStoryCoverAsset,
} from "~/shared/api"

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function positiveId(value: string | null) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function StoryCoverAssetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [agencies, setAgencies] = useState<WikiAdminAgency[]>([])
  const [assets, setAssets] = useState<WikiStoryCoverAsset[]>([])
  const [error, setError] = useState<unknown>(null)
  const [assetsRequestKey, setAssetsRequestKey] = useState("")
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [query, setQuery] = useState("")
  const [editingAsset, setEditingAsset] = useState<WikiStoryCoverAsset | null>(
    null
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WikiStoryCoverAsset | null>(
    null
  )
  const [deleting, setDeleting] = useState(false)
  const requestedAgencyId = positiveId(searchParams.get("agencyId"))
  const selectedAgency =
    agencies.find((agency) => agency.id === requestedAgencyId) ?? agencies[0]

  useEffect(() => {
    let active = true
    void getAdminWikiCatalog()
      .send()
      .then((result) => {
        if (active) setAgencies(result.agencies)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedAgency) return
    if (requestedAgencyId === selectedAgency.id) return
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set("agencyId", String(selectedAgency.id))
        return next
      },
      { replace: true, preventScrollReset: true }
    )
  }, [requestedAgencyId, selectedAgency, setSearchParams])

  const currentRequestKey = selectedAgency
    ? `${selectedAgency.id}:${refreshVersion}`
    : ""
  const loading = Boolean(
    selectedAgency && assetsRequestKey !== currentRequestKey
  )

  useEffect(() => {
    if (!selectedAgency) return
    let active = true
    void getAdminWikiStoryCoverAssets(selectedAgency.id)
      .send()
      .then((result) => {
        if (!active) return
        setAssets(result.assets)
        setError(null)
        setAssetsRequestKey(currentRequestKey)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause)
        setAssetsRequestKey(currentRequestKey)
      })
    return () => {
      active = false
    }
  }, [currentRequestKey, selectedAgency])

  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return assets
    return assets.filter((asset) =>
      asset.name.toLocaleLowerCase().includes(normalized)
    )
  }, [assets, query])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteWikiStoryCoverAsset(deleteTarget.id).send()
      toast.success("素材已删除")
      setDeleteTarget(null)
      setRefreshVersion((version) => version + 1)
    } catch (cause) {
      toast.error(errorMessage(cause))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Story assets"
        title="企划剧情封面素材库"
        description="集中管理同一企划内可复用的剧情封面。"
        actions={
          <>
            <Link
              to={`/admin/stories?agencyId=${selectedAgency?.id ?? ""}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              返回剧情管理
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefreshVersion((version) => version + 1)}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
            <Button
              type="button"
              disabled={!selectedAgency}
              onClick={() => {
                setEditingAsset(null)
                setDialogOpen(true)
              }}
            >
              <ImagePlusIcon data-icon="inline-start" />
              上传素材
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="story-cover-assets-agency">企划</FieldLabel>
          <Select
            items={agencies.map((agency) => ({
              label: agency.name,
              value: String(agency.id),
            }))}
            value={selectedAgency ? String(selectedAgency.id) : ""}
            onValueChange={(value) => {
              const agencyId = positiveId(value ?? null)
              if (!agencyId) return
              setSearchParams(
                (current) => {
                  const next = new URLSearchParams(current)
                  next.set("agencyId", String(agencyId))
                  return next
                },
                { preventScrollReset: true }
              )
            }}
          >
            <SelectTrigger id="story-cover-assets-agency" className="w-full">
              <SelectValue placeholder="选择企划" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={String(agency.id)}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="story-cover-assets-search">搜索素材</FieldLabel>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="story-cover-assets-search"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </Field>
      </div>

      {error ? (
        <Alert>
          <AlertTitle>素材加载失败</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-4/3 w-full" />
          ))}
        </div>
      ) : visibleAssets.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => (
            <Card key={asset.id} size="sm">
              <div className="aspect-video overflow-hidden border-b bg-muted/30">
                <img
                  src={asset.imageUrl}
                  alt=""
                  className="size-full object-contain"
                />
              </div>
              <CardHeader>
                <CardTitle>{asset.name}</CardTitle>
                <CardDescription>
                  {asset.usageCount} 张卡片正在使用
                </CardDescription>
                <CardAction>
                  <Badge variant={asset.isActive ? "secondary" : "outline"}>
                    {asset.isActive ? "启用" : "停用"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingAsset(asset)
                    setDialogOpen(true)
                  }}
                >
                  <PencilIcon data-icon="inline-start" />
                  编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={asset.usageCount > 0}
                  title={asset.usageCount ? "仍有卡片使用该素材" : "删除素材"}
                  onClick={() => setDeleteTarget(asset)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  删除
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <AdminEmptyState
          icon={ImageIcon}
          title={query ? "没有匹配的素材" : "还没有共享封面"}
          description={
            query ? "调整搜索词后重试。" : "上传第一张企划共享封面。"
          }
        />
      )}

      {selectedAgency ? (
        <StoryCoverAssetDialog
          key={`${editingAsset?.id ?? "new"}-${editingAsset?.revision ?? 0}`}
          open={dialogOpen}
          agencyId={selectedAgency.id}
          agencyName={selectedAgency.name}
          asset={editingAsset}
          onOpenChange={setDialogOpen}
          onSaved={() => setRefreshVersion((version) => version + 1)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除共享封面？</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name ?? ""}”及其对象存储文件会永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? (
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
