import { useRequest } from "alova/client"
import {
  ArchiveIcon,
  EyeIcon,
  FileArchiveIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { isApiError } from "~/shared/api"
import {
  createSitePackage,
  createSitePackageRevision,
  getSitePackages,
  publishSitePackageRevision,
  rotateSitePackagePreviewToken,
} from "./site-package-api"
import type {
  NewSitePackageUpload,
  SitePackage,
  SitePackageRevision,
  SitePackageRuntimeMode,
  SitePackageUpload,
} from "./site-package-api"
import {
  AdminField,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStatus,
  adminControlClass,
  adminTextareaClass,
} from "./admin-ui"

const maximumArchiveBytes = 25 * 1024 * 1024
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const entryPathPattern = /^[^/\\]+\.html?$/i

type UploadDraft = {
  archive: File | null
  entryPath: string
  runtimeMode: SitePackageRuntimeMode
}

type PackageDraft = UploadDraft & {
  slug: string
  title: string
  description: string
}

type Preview = {
  revisionId: string
  title: string
  url: string
}

type UploadNotice = {
  hasScripts: boolean
  title: string
  warnings: string[]
}

const emptyUploadDraft: UploadDraft = {
  archive: null,
  entryPath: "index.html",
  runtimeMode: "safe",
}

const emptyPackageDraft: PackageDraft = {
  ...emptyUploadDraft,
  slug: "",
  title: "",
  description: "",
}

function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function formatDate(value: number | null) {
  if (!value) return "未发布"
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function runtimeModeLabel(runtimeMode: SitePackageRuntimeMode) {
  return runtimeMode === "safe" ? "静态安全模式" : "隔离脚本模式"
}

function warningLabel(warning: string) {
  if (warning === "runtime-isolation-required") {
    return "包含脚本，必须在隔离内容域运行"
  }
  if (warning.startsWith("active-content:")) {
    return `检测到活动内容：${warning.slice("active-content:".length)}`
  }
  if (warning.startsWith("remote-reference:")) {
    return `包含会被隔离策略拦截的远程引用：${warning.slice("remote-reference:".length)}`
  }
  if (warning.startsWith("content-type-corrected:")) {
    const detail = warning.slice("content-type-corrected:".length)
    const separator = detail.lastIndexOf(":")
    const file = separator === -1 ? detail : detail.slice(0, separator)
    const contentType =
      separator === -1 ? "实际媒体类型" : detail.slice(separator + 1)
    return `扩展名与内容不一致，${file} 已按 ${contentType} 提供`
  }
  return warning
}

function validateUpload(draft: UploadDraft) {
  if (!draft.archive) return "请选择 ZIP 页面包"
  if (!draft.archive.name.toLowerCase().endsWith(".zip")) {
    return "页面包必须是 .zip 文件"
  }
  if (draft.archive.size > maximumArchiveBytes) {
    return "页面包不能超过 25 MiB"
  }
  if (!entryPathPattern.test(draft.entryPath.trim())) {
    return "入口文件必须是 ZIP 根目录中的 HTML 文件"
  }
  return null
}

function validatePackage(draft: PackageDraft) {
  const slug = draft.slug.trim()
  if (!slugPattern.test(slug) || slug.length > 80) {
    return "slug 只能包含小写字母、数字和单连字符，最长 80 个字符"
  }
  if (!draft.title.trim() || draft.title.trim().length > 200) {
    return "标题不能为空且不能超过 200 个字符"
  }
  if (draft.description.trim().length > 4000) {
    return "简介不能超过 4000 个字符"
  }
  return validateUpload(draft)
}

function UploadFields({
  disabled,
  draft,
  idPrefix,
  onChange,
}: {
  disabled: boolean
  draft: UploadDraft
  idPrefix: string
  onChange: (draft: UploadDraft) => void
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <AdminField
        label="ZIP 页面包"
        htmlFor={`${idPrefix}-archive`}
        description="最多 25 MiB；仅接收 HTML、CSS、字体、图片与受控脚本资源。"
        className="sm:col-span-2"
      >
        <input
          id={`${idPrefix}-archive`}
          name="archive"
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className={adminControlClass}
          disabled={disabled}
          aria-required="true"
          onChange={(event) =>
            onChange({
              ...draft,
              archive: event.target.files?.[0] ?? null,
            })
          }
        />
      </AdminField>
      <AdminField
        label="入口文件"
        htmlFor={`${idPrefix}-entry-path`}
        description="必须位于 ZIP 根目录，例如 index.html。"
      >
        <input
          id={`${idPrefix}-entry-path`}
          className={adminControlClass}
          disabled={disabled}
          required
          value={draft.entryPath}
          onChange={(event) =>
            onChange({ ...draft, entryPath: event.target.value })
          }
        />
      </AdminField>
      <AdminField
        label="运行模式"
        htmlFor={`${idPrefix}-runtime-mode`}
        description="仅在页面确实需要脚本时启用隔离脚本模式。"
      >
        <select
          id={`${idPrefix}-runtime-mode`}
          className={adminControlClass}
          disabled={disabled}
          value={draft.runtimeMode}
          onChange={(event) =>
            onChange({
              ...draft,
              runtimeMode: event.target.value as SitePackageRuntimeMode,
            })
          }
        >
          <option value="safe">静态安全模式</option>
          <option value="isolated-script">隔离脚本模式</option>
        </select>
      </AdminField>
    </div>
  )
}

function UploadProgress({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2" role="status">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        {label}
      </span>
      <progress
        aria-label={label}
        className="h-1 w-full overflow-hidden rounded bg-muted accent-primary"
      />
    </div>
  )
}

function RevisionRow({
  disabled,
  isPublished,
  onPreview,
  onPublish,
  previewing,
  publishing,
  revision,
}: {
  disabled: boolean
  isPublished: boolean
  onPreview: () => void
  onPublish: () => void
  previewing: boolean
  publishing: boolean
  revision: SitePackageRevision
}) {
  const rollback = Boolean(revision.publishedAt) && !isPublished

  return (
    <article className="grid gap-4 border-b py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">
            版本 {revision.revisionNumber}
          </h4>
          {isPublished ? <AdminStatus>当前线上</AdminStatus> : null}
          <AdminStatus>{runtimeModeLabel(revision.runtimeMode)}</AdminStatus>
          {revision.state !== "ready" ? (
            <AdminStatus>已归档</AdminStatus>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {revision.entryPath} · {revision.fileCount} 个文件 ·{" "}
          {formatBytes(revision.totalBytes)} · 上传于{" "}
          {formatDate(revision.createdAt)}
        </p>
        {revision.publishedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            首次发布于 {formatDate(revision.publishedAt)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`预览版本 ${revision.revisionNumber}`}
          onClick={onPreview}
        >
          {previewing ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <EyeIcon data-icon="inline-start" />
          )}
          预览
        </Button>
        <Button
          type="button"
          variant={rollback ? "outline" : "default"}
          size="sm"
          disabled={disabled || isPublished || revision.state !== "ready"}
          aria-label={
            isPublished
              ? `版本 ${revision.revisionNumber} 当前在线`
              : rollback
                ? `回滚到版本 ${revision.revisionNumber}`
                : `发布版本 ${revision.revisionNumber}`
          }
          onClick={onPublish}
        >
          {publishing ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : rollback ? (
            <RotateCcwIcon data-icon="inline-start" />
          ) : (
            <RocketIcon data-icon="inline-start" />
          )}
          {publishing
            ? "处理中"
            : isPublished
              ? "当前线上"
              : rollback
                ? "回滚"
                : "发布"}
        </Button>
      </div>
    </article>
  )
}

function PackageSection({
  busyAction,
  onPreview,
  onPublish,
  onToggleUpload,
  sitePackage,
  uploadOpen,
  uploadPanel,
}: {
  busyAction: string | null
  onPreview: (revision: SitePackageRevision) => void
  onPublish: (revision: SitePackageRevision) => void
  onToggleUpload: () => void
  sitePackage: SitePackage
  uploadOpen: boolean
  uploadPanel: React.ReactNode
}) {
  return (
    <section className="border-b py-6 first:pt-0 last:border-b-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{sitePackage.title}</h3>
            <AdminStatus>/{sitePackage.slug}</AdminStatus>
            <AdminStatus>{sitePackage.revisions.length} 个版本</AdminStatus>
          </div>
          {sitePackage.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {sitePackage.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            最近更新 {formatDate(sitePackage.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {sitePackage.publishedRevisionId ? (
            <a
              href={`/sites/${encodeURIComponent(sitePackage.slug)}`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ShieldCheckIcon data-icon="inline-start" />
              打开线上页面
            </a>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={uploadOpen}
            disabled={Boolean(busyAction)}
            onClick={onToggleUpload}
          >
            {uploadOpen ? (
              <XIcon data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {uploadOpen ? "收起上传" : "上传新版本"}
          </Button>
        </div>
      </div>

      {uploadOpen ? uploadPanel : null}

      <div className="mt-4 border-t">
        {sitePackage.revisions.map((revision) => (
          <RevisionRow
            key={revision.id}
            revision={revision}
            isPublished={sitePackage.publishedRevisionId === revision.id}
            disabled={Boolean(busyAction)}
            previewing={busyAction === `preview:${revision.id}`}
            publishing={busyAction === `publish:${revision.id}`}
            onPreview={() => onPreview(revision)}
            onPublish={() => onPublish(revision)}
          />
        ))}
      </div>
    </section>
  )
}

export function SitePackageManager() {
  const {
    data,
    loading,
    error,
    send: refresh,
    onError,
  } = useRequest(getSitePackages(), {
    initialData: { packages: [] },
  })
  onError(() => undefined)
  const [packageDraft, setPackageDraft] =
    useState<PackageDraft>(emptyPackageDraft)
  const [versionTargetId, setVersionTargetId] = useState<string | null>(null)
  const [versionDraft, setVersionDraft] =
    useState<UploadDraft>(emptyUploadDraft)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [uploadNotice, setUploadNotice] = useState<UploadNotice | null>(null)
  const [createInputKey, setCreateInputKey] = useState(0)
  const [versionInputKey, setVersionInputKey] = useState(0)

  async function reload() {
    try {
      await refresh()
    } catch {
      // The request hook exposes the list error in the page-level error state.
    }
  }

  async function submitPackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validatePackage(packageDraft)
    if (validationError) {
      setMutationError(validationError)
      return
    }
    setBusyAction("create")
    setMutationError(null)
    setUploadNotice(null)
    try {
      const result = await createSitePackage({
        ...packageDraft,
        archive: packageDraft.archive!,
        slug: packageDraft.slug.trim(),
        title: packageDraft.title.trim(),
        description: packageDraft.description.trim(),
        entryPath: packageDraft.entryPath.trim(),
      } satisfies NewSitePackageUpload).send()
      const revisionId = result.revisionId ?? result.revision?.id
      if (revisionId) {
        setPreview({
          revisionId,
          title: `${packageDraft.title.trim()} · 新上传版本`,
          url: result.previewUrl,
        })
      }
      setUploadNotice({
        hasScripts: result.hasScripts,
        title: "页面包已创建，请预览确认后再发布",
        warnings: result.warnings,
      })
      setPackageDraft(emptyPackageDraft)
      setCreateInputKey((value) => value + 1)
      await refresh()
      toast.success("页面包已创建")
    } catch (uploadError) {
      const message = errorMessage(uploadError)
      setMutationError(message)
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  async function submitRevision(
    event: React.FormEvent<HTMLFormElement>,
    sitePackage: SitePackage
  ) {
    event.preventDefault()
    const validationError = validateUpload(versionDraft)
    if (validationError) {
      setMutationError(validationError)
      return
    }
    setBusyAction(`upload:${sitePackage.id}`)
    setMutationError(null)
    setUploadNotice(null)
    try {
      const result = await createSitePackageRevision(sitePackage.id, {
        ...versionDraft,
        archive: versionDraft.archive!,
        entryPath: versionDraft.entryPath.trim(),
      } satisfies SitePackageUpload).send()
      const revisionId = result.revision?.id ?? result.revisionId
      if (revisionId) {
        setPreview({
          revisionId,
          title: `${sitePackage.title} · 新上传版本`,
          url: result.previewUrl,
        })
      }
      setUploadNotice({
        hasScripts: result.hasScripts,
        title: "新版本已上传，请预览确认后再发布",
        warnings: result.warnings,
      })
      setVersionDraft(emptyUploadDraft)
      setVersionTargetId(null)
      setVersionInputKey((value) => value + 1)
      await refresh()
      toast.success("新版本已上传")
    } catch (uploadError) {
      const message = errorMessage(uploadError)
      setMutationError(message)
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  async function openPreview(
    sitePackage: SitePackage,
    revision: SitePackageRevision
  ) {
    setBusyAction(`preview:${revision.id}`)
    setMutationError(null)
    setPreview(null)
    try {
      const result = await rotateSitePackagePreviewToken(
        sitePackage.id,
        revision.id
      ).send()
      setPreview({
        revisionId: revision.id,
        title: `${sitePackage.title} · 版本 ${revision.revisionNumber}`,
        url: result.previewUrl,
      })
    } catch (previewError) {
      const message = errorMessage(previewError)
      setMutationError(message)
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  async function publishRevision(
    sitePackage: SitePackage,
    revision: SitePackageRevision
  ) {
    const rollback = Boolean(revision.publishedAt)
    const action = rollback ? "回滚" : "发布"
    if (
      !window.confirm(
        `确定${action}“${sitePackage.title}”版本 ${revision.revisionNumber} 吗？`
      )
    ) {
      return
    }
    setBusyAction(`publish:${revision.id}`)
    setMutationError(null)
    try {
      await publishSitePackageRevision(sitePackage.id, revision.id).send()
      await refresh()
      toast.success(rollback ? "线上页面已回滚" : "页面版本已发布")
    } catch (publishError) {
      const message = errorMessage(publishError)
      setMutationError(message)
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        eyebrow="SITE PACKAGE DESK"
        title="页面包管理"
        description="上传第三方 HTML 页面包，隔离预览并按不可变版本发布；选择历史版本即可回滚。"
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading || Boolean(busyAction)}
            onClick={() => void reload()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      {mutationError ? (
        <Alert variant="destructive">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      ) : null}

      {uploadNotice ? (
        <Alert>
          {uploadNotice.hasScripts ? (
            <ArchiveIcon aria-hidden="true" />
          ) : (
            <ShieldCheckIcon aria-hidden="true" />
          )}
          <AlertTitle>{uploadNotice.title}</AlertTitle>
          <AlertDescription>
            {uploadNotice.warnings.length
              ? uploadNotice.warnings.map(warningLabel).join("；")
              : "归档校验已通过，未发现需要人工处理的警告。"}
          </AlertDescription>
        </Alert>
      ) : null}

      <AdminPanel
        title="新建页面包"
        description="首个版本只会进入待发布状态。"
        icon={FileArchiveIcon}
      >
        <form
          key={createInputKey}
          className="grid gap-5 lg:grid-cols-2"
          onSubmit={submitPackage}
        >
          <AdminField label="页面标题" htmlFor="site-package-title">
            <input
              id="site-package-title"
              className={adminControlClass}
              maxLength={200}
              disabled={Boolean(busyAction)}
              required
              value={packageDraft.title}
              onChange={(event) =>
                setPackageDraft((draft) => ({
                  ...draft,
                  title: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField
            label="页面 slug"
            htmlFor="site-package-slug"
            description="发布入口为 /sites/slug；创建后不可修改。"
          >
            <input
              id="site-package-slug"
              className={adminControlClass}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="hiro2026"
              disabled={Boolean(busyAction)}
              required
              value={packageDraft.slug}
              onChange={(event) =>
                setPackageDraft((draft) => ({
                  ...draft,
                  slug: event.target.value,
                }))
              }
            />
          </AdminField>
          <AdminField
            label="页面简介"
            htmlFor="site-package-description"
            className="lg:col-span-2"
          >
            <textarea
              id="site-package-description"
              className={adminTextareaClass}
              maxLength={4000}
              disabled={Boolean(busyAction)}
              value={packageDraft.description}
              onChange={(event) =>
                setPackageDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))
              }
            />
          </AdminField>
          <div className="lg:col-span-2">
            <UploadFields
              idPrefix="site-package"
              draft={packageDraft}
              disabled={Boolean(busyAction)}
              onChange={(draft) =>
                setPackageDraft((current) => ({ ...current, ...draft }))
              }
            />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
            {busyAction === "create" ? (
              <div className="min-w-0 flex-1">
                <UploadProgress label="正在校验并上传页面包" />
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                服务端会校验路径、文件类型、压缩比例与活动内容。
              </p>
            )}
            <Button type="submit" size="lg" disabled={Boolean(busyAction)}>
              {busyAction === "create" ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              创建并上传
            </Button>
          </div>
        </form>
      </AdminPanel>

      {preview ? (
        <AdminPanel
          title={preview.title}
          description="预览凭据仅保留在当前页面内存中；重新获取会立即使旧链接失效。"
          icon={EyeIcon}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreview(null)}
            >
              <XIcon data-icon="inline-start" />
              关闭预览
            </Button>
          }
        >
          <iframe
            key={`${preview.revisionId}:${preview.url}`}
            src={preview.url}
            title={preview.title}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-[min(72svh,52rem)] min-h-96 w-full rounded-lg border bg-background"
          />
        </AdminPanel>
      ) : null}

      <AdminPanel
        title="页面包与版本"
        description={`${data.packages.length} 个页面包`}
        icon={FileArchiveIcon}
        contentClassName="pt-1"
      >
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>页面包加载失败</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircleIcon
              className="size-4 animate-spin"
              aria-hidden="true"
            />
            正在加载页面包
          </p>
        ) : data.packages.length ? (
          <div>
            {data.packages.map((sitePackage) => (
              <PackageSection
                key={sitePackage.id}
                sitePackage={sitePackage}
                busyAction={busyAction}
                uploadOpen={versionTargetId === sitePackage.id}
                onToggleUpload={() => {
                  setMutationError(null)
                  setVersionDraft(emptyUploadDraft)
                  setVersionTargetId((current) =>
                    current === sitePackage.id ? null : sitePackage.id
                  )
                  setVersionInputKey((value) => value + 1)
                }}
                onPreview={(revision) =>
                  void openPreview(sitePackage, revision)
                }
                onPublish={(revision) =>
                  void publishRevision(sitePackage, revision)
                }
                uploadPanel={
                  <form
                    key={versionInputKey}
                    className="mt-5 border-y bg-muted/20 px-4 py-5"
                    onSubmit={(event) =>
                      void submitRevision(event, sitePackage)
                    }
                  >
                    <h4 className="text-sm font-semibold">
                      上传“{sitePackage.title}”的新版本
                    </h4>
                    <div className="mt-4">
                      <UploadFields
                        idPrefix={`revision-${sitePackage.id}`}
                        draft={versionDraft}
                        disabled={Boolean(busyAction)}
                        onChange={setVersionDraft}
                      />
                    </div>
                    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      {busyAction === `upload:${sitePackage.id}` ? (
                        <div className="min-w-0 flex-1">
                          <UploadProgress label="正在校验并上传新版本" />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          新版本不会自动发布。
                        </p>
                      )}
                      <Button type="submit" disabled={Boolean(busyAction)}>
                        <UploadIcon data-icon="inline-start" />
                        上传版本
                      </Button>
                    </div>
                  </form>
                }
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState
            icon={FileArchiveIcon}
            title="还没有页面包"
            description="还没有页面包。使用上方表单上传第一个版本。"
          />
        )}
      </AdminPanel>
    </div>
  )
}
