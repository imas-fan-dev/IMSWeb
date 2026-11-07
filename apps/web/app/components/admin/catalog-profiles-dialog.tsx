import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ImageCompositionEditor } from "~/components/admin/image-composition-editor"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { adminErrorMessage } from "~/lib/admin-error"
import { resetNamecardCharacterCatalogCache } from "~/lib/use-namecard-character-catalog"
import {
  defaultWikiImageTransform,
  getAdminCatalog,
  saveAdminCatalogGroupKind,
  saveAdminCatalogImage,
  saveAdminCatalogProfile,
  createAdminCatalogCharacter,
  setAdminCatalogDefaultProfile,
  invalidateNamecardCharacterCatalog,
  NAMECARD_CHARACTER_CATEGORIES,
  type AdminCatalog,
  type AdminCatalogProfile,
  type AdminCatalogProfileRequest,
  type WikiImageTransform,
} from "~/lib/api"

export const catalogCategoryLabels = {
  idol: "偶像",
  staff: "工作人员",
  rival: "竞争对手",
  mascot: "吉祥物",
  chara: "其他角色",
  other: "其他",
}

function draftFor(
  kind: "character" | "group",
  ownerId: number,
  projectId: number,
  profile?: AdminCatalogProfile
): AdminCatalogProfileRequest {
  return {
    kind,
    ownerId,
    projectId,
    revision: profile?.revision ?? null,
    nameCn: profile?.nameCn ?? null,
    nameJa: profile?.nameJa ?? null,
    nameEn: profile?.nameEn ?? null,
    aliases: kind === "character" ? (profile?.aliases ?? null) : null,
    category: kind === "character" ? (profile?.category ?? "idol") : null,
    displayOrder: kind === "character" ? (profile?.displayOrder ?? 0) : null,
    isFallback: kind === "character" ? (profile?.isFallback ?? false) : false,
    color: profile?.color ?? null,
    birthMonth: profile?.birthMonth ?? null,
    birthDay: profile?.birthDay ?? null,
    biography: profile?.biography ?? null,
    voiceStatus: profile?.voiceStatus ?? "unknown",
    cvName: profile?.cvName ?? null,
    profileUrl: profile?.profileUrl ?? null,
  }
}

function profileFor(
  data: AdminCatalog | undefined,
  kind: "character" | "group",
  ownerId: number,
  projectId?: number
) {
  const owner =
    kind === "character"
      ? data?.characters.find((c) => c.id === ownerId)
      : data?.groups.find((g) => g.id === ownerId)
  const defaultId =
    owner && "defaultProfileId" in owner ? owner.defaultProfileId : null
  const selectedId =
    projectId ??
    owner?.profiles.find((p) => p.id === defaultId)?.projectId ??
    owner?.profiles[0]?.projectId ??
    data?.projects[0]?.id
  return {
    owner,
    defaults: owner?.profiles.find((p) => p.id === defaultId),
    projectId: selectedId,
    profile: owner?.profiles.find((p) => p.projectId === selectedId),
  }
}

export function CatalogProfilesDialog({
  kind,
  ownerId,
  name,
  disabled = false,
  onClosed,
}: {
  kind: "character" | "group"
  ownerId: number
  name: string
  disabled?: boolean
  onClosed?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        企划档案
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value)
            if (!value) onClosed?.()
          }
        }}
      >
        <DialogContent layout="pinned" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{name} · 企划档案</DialogTitle>
            <DialogDescription>
              人物的名称、分类、别名及其他资料均由企划档案维护。
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <CatalogProfileEditor
              kind={kind}
              ownerId={ownerId}
              onBusyChange={setBusy}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CatalogProfileEditor({
  kind,
  ownerId,
  initialProjectId,
  initialCatalog,
  readOnly = false,
  fixedProject = false,
  presentation = "dialog",
  onBusyChange,
  onSaved,
  creating = false,
  onCreated,
}: {
  kind: "character" | "group"
  ownerId: number
  initialProjectId?: number
  initialCatalog?: AdminCatalog
  readOnly?: boolean
  fixedProject?: boolean
  presentation?: "dialog" | "panel"
  onBusyChange?: (busy: boolean) => void
  onSaved?: (catalog: AdminCatalog) => void
  creating?: boolean
  onCreated?: (catalog: AdminCatalog, ownerId: number) => void
}) {
  const created = useRef<{ characterId: number; profileId: number } | null>(
    null
  )
  const initial = profileFor(initialCatalog, kind, ownerId, initialProjectId)
  const [catalog, setCatalog] = useState<AdminCatalog | null>(
    initialCatalog ?? null
  )
  const [draft, setDraft] = useState<AdminCatalogProfileRequest | null>(() => {
    if (!initialCatalog || !initial.projectId) return null
    const next = draftFor(
      kind,
      ownerId,
      initial.projectId,
      initial.profile ??
        (!creating && kind === "character" ? initial.defaults : undefined)
    )
    if (!initial.profile) {
      next.revision = null
      next.isFallback = false
    }
    return next
  })
  const [profile, setProfile] = useState<AdminCatalogProfile | undefined>(
    initial.profile
  )
  const [file, setFile] = useState<File | null>(null)
  const [transform, setTransform] = useState<WikiImageTransform>(
    initial.profile?.imageTransform ?? defaultWikiImageTransform
  )
  const [loading, setLoading] = useState(!initialCatalog)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupKind, setGroupKind] = useState<
    "unit" | "attribute" | "organization"
  >(() => initialCatalog?.groups.find((g) => g.id === ownerId)?.kind ?? "unit")

  const selectProject = useCallback(
    (data: AdminCatalog, projectId: number) => {
      const owner =
        kind === "character"
          ? data.characters.find((c) => c.id === ownerId)
          : data.groups.find((g) => g.id === ownerId)
      const selected = owner?.profiles.find((p) => p.projectId === projectId)
      const defaults =
        kind === "character" && owner && "defaultProfileId" in owner
          ? owner.profiles.find((p) => p.id === owner.defaultProfileId)
          : undefined
      const next = draftFor(kind, ownerId, projectId, selected ?? defaults)
      if (!selected) {
        next.revision = null
        next.isFallback = false
      }
      setDraft(next)
      setProfile(selected)
      setTransform(selected?.imageTransform ?? defaultWikiImageTransform)
      setFile(null)
    },
    [kind, ownerId]
  )

  const applyCatalog = useCallback(
    (data: AdminCatalog, projectId?: number) => {
      setCatalog(data)
      const { owner, projectId: selectedId } = profileFor(
        data,
        kind,
        ownerId,
        projectId
      )
      if (!owner && !creating) throw new Error("资料对象不存在")
      if (!selectedId) throw new Error("请先建立企划")
      if (kind === "group")
        setGroupKind(data.groups.find((g) => g.id === ownerId)?.kind ?? "unit")
      selectProject(data, selectedId)
    },
    [kind, ownerId, selectProject, creating]
  )

  const load = useCallback(
    async (projectId?: number) => {
      setLoading(true)
      setError(null)
      try {
        const data = await getAdminCatalog().send()
        if (creating && created.current) {
          onCreated?.(data, created.current.characterId)
          return data
        }
        applyCatalog(data, projectId)
        return data
      } catch (cause) {
        setError(adminErrorMessage(cause) ?? "加载企划档案失败")
      } finally {
        setLoading(false)
      }
    },
    [applyCatalog, creating, onCreated]
  )

  useEffect(() => {
    if (initialCatalog) return
    let active = true
    void getAdminCatalog()
      .send()
      .then((data) => {
        if (active) applyCatalog(data, initialProjectId)
      })
      .catch((cause) => {
        if (active) setError(adminErrorMessage(cause) ?? "加载企划档案失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [applyCatalog, initialProjectId, initialCatalog])

  async function save() {
    if (readOnly || !draft || !catalog) return
    if (
      kind === "character" &&
      (!draft.nameCn?.trim() || !draft.category || draft.displayOrder === null)
    ) {
      setError("请填写人物中文名、分类和排序")
      return
    }
    if (creating && created.current) {
      setError("人物档案已创建，请刷新后继续编辑")
      return
    }
    setSaving(true)
    onBusyChange?.(true)
    setError(null)
    try {
      if (creating) {
        const { nameCn, category, displayOrder } = draft
        if (
          kind !== "character" ||
          !nameCn ||
          !category ||
          displayOrder === null
        )
          throw new Error("请填写完整人物档案")
        const {
          kind: _kind,
          ownerId: _ownerId,
          revision: _revision,
          ...fields
        } = draft
        void _kind
        void _ownerId
        void _revision
        const result = await createAdminCatalogCharacter({
          ...fields,
          nameCn,
          category,
          displayOrder,
        }).send()
        created.current = result
        resetNamecardCharacterCatalogCache()
        await invalidateNamecardCharacterCatalog()
        let imageError: unknown
        if (file) {
          try {
            await saveAdminCatalogImage(
              {
                kind: "character",
                id: result.profileId,
                revision: 0,
                imageTransform: transform,
              },
              file
            ).send()
          } catch (cause) {
            imageError = cause
          }
        }
        const latest = await getAdminCatalog().send()
        onCreated?.(latest, result.characterId)
        if (imageError)
          toast.error(
            `人物档案已创建，图片未保存：${adminErrorMessage(imageError) ?? "请重新选择图片"}`
          )
        else toast.success("人物档案已创建")
        return
      }
      await saveAdminCatalogProfile(draft).send()
      resetNamecardCharacterCatalogCache()
      await invalidateNamecardCharacterCatalog()
      if (kind === "group") {
        const group = catalog.groups.find((g) => g.id === ownerId)
        if (group && group.kind !== groupKind)
          await saveAdminCatalogGroupKind({
            id: ownerId,
            revision: group.revision + (draft.revision === null ? 1 : 0),
            kind: groupKind,
          }).send()
      }
      if (
        file ||
        (profile &&
          JSON.stringify(transform) !== JSON.stringify(profile.imageTransform))
      ) {
        const latest = await getAdminCatalog().send()
        const owner =
          kind === "character"
            ? latest.characters.find((c) => c.id === ownerId)
            : latest.groups.find((g) => g.id === ownerId)
        const saved = owner?.profiles.find(
          (p) => p.projectId === draft.projectId
        )
        if (!saved) throw new Error("档案保存后无法读取")
        await saveAdminCatalogImage(
          {
            kind,
            id: saved.id,
            revision: profile?.mediaRevision ?? 0,
            imageTransform: transform,
          },
          file
        ).send()
      }
      toast.success("企划档案已保存")
      const latest = await load(draft.projectId)
      if (latest) onSaved?.(latest)
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "保存失败，请刷新档案后重试")
    } finally {
      setSaving(false)
      onBusyChange?.(false)
    }
  }

  async function setDefault() {
    const owner = catalog?.characters.find((c) => c.id === ownerId)
    if (readOnly || !owner || !profile || !draft) return
    setSaving(true)
    onBusyChange?.(true)
    setError(null)
    try {
      await setAdminCatalogDefaultProfile({
        ownerId,
        profileId: profile.id,
        revision: owner.revision,
      }).send()
      resetNamecardCharacterCatalogCache()
      await invalidateNamecardCharacterCatalog()
      const latest = await load(draft.projectId)
      if (latest) onSaved?.(latest)
      toast.success("名片默认档案已更新")
    } catch (cause) {
      setError(adminErrorMessage(cause) ?? "切换默认档案失败")
    } finally {
      setSaving(false)
      onBusyChange?.(false)
    }
  }

  const text = (
    key:
      | "nameCn"
      | "nameJa"
      | "nameEn"
      | "color"
      | "profileUrl"
      | "cvName"
      | "aliases",
    label: string,
    type = "text"
  ) => (
    <Field key={key}>
      <FieldLabel htmlFor={`catalog-${kind}-${key}`}>{label}</FieldLabel>
      <Input
        id={`catalog-${kind}-${key}`}
        type={type}
        required={kind === "character" && key === "nameCn"}
        maxLength={
          key === "cvName"
            ? 500
            : key === "aliases"
              ? 4000
              : key === "profileUrl"
                ? 2000
                : undefined
        }
        value={draft?.[key] ?? ""}
        disabled={saving || readOnly}
        onChange={(e) =>
          setDraft((d) => (d ? { ...d, [key]: e.target.value || null } : d))
        }
      />
    </Field>
  )

  const Body = presentation === "dialog" ? DialogBody : "div"
  const Footer = presentation === "dialog" ? DialogFooter : "div"
  return (
    <>
      <Body>
        {error ? (
          <p role="alert" className="py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            正在加载档案…
          </p>
        ) : draft && catalog ? (
          <fieldset disabled={readOnly} className="min-w-0">
            <FieldGroup className="py-5">
              {!fixedProject ? (
                <Field>
                  <FieldLabel htmlFor="catalog-project">企划</FieldLabel>
                  <Select
                    items={catalog.projects.map((p) => ({
                      value: String(p.id),
                      label: p.name,
                    }))}
                    value={String(draft.projectId)}
                    disabled={saving}
                    onValueChange={(value) =>
                      selectProject(catalog, Number(value))
                    }
                  >
                    <SelectTrigger id="catalog-project">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.projects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {profile
                      ? "编辑现有企划档案"
                      : "此企划尚无档案，保存后创建"}
                  </p>
                </Field>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {profile ? "编辑现有企划档案" : "此企划尚无档案，保存后创建"}
                  。
                  {kind === "character"
                    ? "人物资料独立保存于当前档案，名片从默认档案读取。"
                    : "组合名称留空时使用默认名称。"}
                </p>
              )}
              {kind === "group" ? (
                <Field>
                  <FieldLabel htmlFor="catalog-group-kind">类型</FieldLabel>
                  <Select
                    items={[
                      { value: "unit", label: "正式组合" },
                      { value: "attribute", label: "属性分组" },
                      { value: "organization", label: "组织" },
                    ]}
                    value={groupKind}
                    disabled={saving || readOnly}
                    onValueChange={(value) => {
                      if (
                        value === "unit" ||
                        value === "attribute" ||
                        value === "organization"
                      )
                        setGroupKind(value)
                    }}
                  >
                    <SelectTrigger id="catalog-group-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unit">正式组合</SelectItem>
                      <SelectItem value="attribute">属性分组</SelectItem>
                      <SelectItem value="organization">组织</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                {text("nameCn", "企划内中文名")}
                {text("nameJa", "企划内日文名")}
                {text("nameEn", "企划内英文名")}
                {text("color", "代表色（#RRGGBB）")}
              </div>
              {kind === "character" ? (
                <>
                  {text("aliases", "别名（逗号或换行分隔）")}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="catalog-category">
                        角色分类
                      </FieldLabel>
                      <Select
                        items={NAMECARD_CHARACTER_CATEGORIES.map((value) => ({
                          value,
                          label: catalogCategoryLabels[value],
                        }))}
                        value={draft.category}
                        disabled={saving || readOnly}
                        onValueChange={(value) => {
                          const category = NAMECARD_CHARACTER_CATEGORIES.find(
                            (item) => item === value
                          )
                          if (category) setDraft({ ...draft, category })
                        }}
                      >
                        <SelectTrigger id="catalog-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NAMECARD_CHARACTER_CATEGORIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {catalogCategoryLabels[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="catalog-display-order">
                        排序值
                      </FieldLabel>
                      <Input
                        id="catalog-display-order"
                        type="number"
                        min={0}
                        step={1}
                        value={draft.displayOrder ?? 0}
                        disabled={saving || readOnly}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            displayOrder: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="catalog-fallback"
                      checked={draft.isFallback}
                      disabled={saving || readOnly}
                      onCheckedChange={(value) =>
                        setDraft({ ...draft, isFallback: Boolean(value) })
                      }
                    />
                    <label htmlFor="catalog-fallback" className="text-sm">
                      通用兜底选项
                    </label>
                  </div>
                  {!creating && profile ? (
                    <p className="text-sm text-muted-foreground">
                      {catalog.characters.find((owner) => owner.id === ownerId)
                        ?.defaultProfileId === profile.id
                        ? "这是名片担当使用的默认档案。"
                        : "名片担当使用此人物的默认档案；可以在下方切换。"}
                    </p>
                  ) : null}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="catalog-birth-month">
                        生日月份
                      </FieldLabel>
                      <Input
                        id="catalog-birth-month"
                        type="number"
                        min={1}
                        max={12}
                        value={draft.birthMonth ?? ""}
                        disabled={saving || readOnly}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            birthMonth: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="catalog-birth-day">
                        生日日期
                      </FieldLabel>
                      <Input
                        id="catalog-birth-day"
                        type="number"
                        min={1}
                        max={31}
                        value={draft.birthDay ?? ""}
                        disabled={saving || readOnly}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            birthDay: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="catalog-voice-status">
                      配音状态
                    </FieldLabel>
                    <Select
                      items={[
                        { value: "unknown", label: "未知" },
                        { value: "voiced", label: "已配音" },
                        { value: "unvoiced", label: "明确未配音" },
                      ]}
                      value={draft.voiceStatus}
                      disabled={saving || readOnly}
                      onValueChange={(value) => {
                        if (
                          value === "unknown" ||
                          value === "voiced" ||
                          value === "unvoiced"
                        )
                          setDraft({ ...draft, voiceStatus: value })
                      }}
                    >
                      <SelectTrigger id="catalog-voice-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">未知</SelectItem>
                        <SelectItem value="voiced">已配音</SelectItem>
                        <SelectItem value="unvoiced">明确未配音</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {text("cvName", "CV（声优）")}
                  {text("profileUrl", "人物资料链接", "url")}
                </>
              ) : null}
              <Field>
                <FieldLabel htmlFor="catalog-biography">
                  {kind === "character" ? "人物简介" : "组合说明"}
                </FieldLabel>
                <Textarea
                  id="catalog-biography"
                  value={draft.biography ?? ""}
                  maxLength={20000}
                  disabled={saving || readOnly}
                  onChange={(e) =>
                    setDraft({ ...draft, biography: e.target.value || null })
                  }
                />
              </Field>
              <ImageCompositionEditor
                id="catalog-profile-image"
                file={file}
                currentUrl={profile?.imageUrl}
                transform={transform}
                disabled={saving || readOnly}
                onFileChange={setFile}
                onTransformChange={setTransform}
              />
            </FieldGroup>
          </fieldset>
        ) : null}
      </Body>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          此档案仅供查看，当前不能修改。
        </p>
      ) : null}
      <Footer
        className={
          presentation === "panel"
            ? "flex flex-wrap justify-end gap-2 border-t pt-4"
            : undefined
        }
      >
        <Button
          type="button"
          variant="outline"
          disabled={saving || loading}
          onClick={() => void load(draft?.projectId)}
        >
          刷新档案
        </Button>
        {!readOnly ? (
          <Button
            type="button"
            disabled={
              saving ||
              loading ||
              !draft ||
              (kind === "character" && !draft.nameCn?.trim())
            }
            onClick={() => void save()}
          >
            {saving ? "正在保存…" : creating ? "创建人物档案" : "保存档案"}
          </Button>
        ) : null}
        {!readOnly &&
        kind === "character" &&
        !creating &&
        profile &&
        !profile.isFallback &&
        catalog?.characters.find((owner) => owner.id === ownerId)
          ?.defaultProfileId !== profile.id ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving || loading}
            onClick={() => void setDefault()}
          >
            设为名片默认档案
          </Button>
        ) : null}
      </Footer>
    </>
  )
}
