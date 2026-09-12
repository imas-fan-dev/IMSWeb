import {
  ArrowUpRightIcon,
  Building2Icon,
  ImagesIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { AdminPageHeader } from "~/components/admin/admin-ui"
import { StoryCategoryEditorDialog } from "~/pages/admin/stories/components/story-category-editor-dialog"
import { StoryEditorDialog } from "~/pages/admin/stories/components/story-editor-dialog"
import { StoryOutline } from "~/pages/admin/stories/components/story-outline"
import { StorySourceCatalogDialog } from "~/pages/admin/stories/components/story-source-catalog-dialog"
import { WikiEntityEditorDialog } from "~/pages/admin/stories/components/wiki-entity-editor-sheet"
import { WikiHierarchyExplorer } from "~/pages/admin/stories/components/wiki-hierarchy-explorer"
import { useWikiWorkbenchState } from "./wiki-workbench-hooks"
import { errorMessage } from "./wiki-workbench-model"
import {
  AgencySelectLabel,
  IdolSummary,
  StoryOutlineSkeleton,
  WorkbenchSkeleton,
} from "./wiki-workbench-sections"
import { NavigationLink } from "~/components/navigation/navigation-link"

export function WikiWorkbench() {
  const {
    catalog,
    catalogLoading,
    catalogError,
    sourceCatalog,
    sourceCatalogLoading,
    sourceCatalogError,
    selectedAgency,
    selectedIdol,
    stories,
    storiesError,
    storiesLoading,
    coverAssets,
    expandedCategoryIds,
    storyQuery,
    mobileExplorerOpen,
    setMobileExplorerOpen,
    entityTarget,
    setEntityTarget,
    storyEditor,
    setStoryEditor,
    categoryEditor,
    setCategoryEditor,
    sourceCatalogOpen,
    setSourceCatalogOpen,
    chooseAgency,
    chooseIdol,
    reloadStories,
    refreshAll,
    handleEntitySaved,
    openCreateStory,
    setStoryQuery,
    setCategoryOpen,
    storyUrl,
    deleteConfirm,
    refreshSourceCatalog,
  } = useWikiWorkbenchState()

  const explorer = selectedAgency ? (
    <WikiHierarchyExplorer
      agency={selectedAgency}
      selectedIdolId={selectedIdol?.id ?? null}
      onSelectIdol={chooseIdol}
      onCreateGroup={() =>
        setEntityTarget({ kind: "group", agency: selectedAgency, entity: null })
      }
      onEditGroup={(group) =>
        setEntityTarget({
          kind: "group",
          agency: selectedAgency,
          entity: group,
        })
      }
      onCreateIdol={() =>
        setEntityTarget({ kind: "idol", agency: selectedAgency, entity: null })
      }
    />
  ) : null

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminPageHeader
        eyebrow="WIKI WORKBENCH"
        title="Wiki 内容工作台"
        description="按企划、栏目与内容页定位资料，维护卡片媒体、来源平台和页面信息。"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={sourceCatalogLoading || Boolean(sourceCatalogError)}
              onClick={() => setSourceCatalogOpen(true)}
            >
              <Settings2Icon data-icon="inline-start" />
              类型与来源
            </Button>
            <NavigationLink
              to={`/admin/stories/assets?agencyId=${selectedAgency?.id ?? ""}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ImagesIcon data-icon="inline-start" />
              企划素材库
            </NavigationLink>
            <Button
              variant="outline"
              render={
                <NavigationLink
                  href={storyUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              <ArrowUpRightIcon data-icon="inline-start" />
              打开公开页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={catalogLoading || storiesLoading}
              onClick={() => void refreshAll()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
          </>
        }
      />

      {catalogError ? (
        <Alert>
          <AlertTitle>Wiki 目录加载失败</AlertTitle>
          <AlertDescription>{errorMessage(catalogError)}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="企划工具栏"
        className="flex flex-col gap-3 border-y bg-muted/20 p-3 sm:flex-row sm:items-end"
      >
        {catalog.agencies.length ? (
          <Field className="min-w-0 flex-1 sm:max-w-sm">
            <FieldLabel htmlFor="wiki-workbench-agency">当前企划</FieldLabel>
            <Select
              items={catalog.agencies.map((agency) => ({
                label: agency.name,
                value: String(agency.id),
              }))}
              value={selectedAgency ? String(selectedAgency.id) : ""}
              onValueChange={(value) => chooseAgency(String(value))}
            >
              <SelectTrigger id="wiki-workbench-agency" className="w-full">
                <SelectValue>
                  {() =>
                    selectedAgency ? (
                      <AgencySelectLabel agency={selectedAgency} />
                    ) : (
                      "选择企划"
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {catalog.agencies.map((agency) => (
                    <SelectItem
                      key={agency.id}
                      value={String(agency.id)}
                      className="h-9"
                    >
                      <AgencySelectLabel agency={agency} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">企划目录</p>
            <p className="text-xs text-muted-foreground">
              创建首个企划后即可继续添加栏目与内容页。
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {selectedAgency ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setEntityTarget({
                  kind: "agency",
                  entity: selectedAgency,
                })
              }
            >
              <PencilIcon data-icon="inline-start" />
              编辑企划
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => setEntityTarget({ kind: "agency", entity: null })}
          >
            <PlusIcon data-icon="inline-start" />
            新增企划
          </Button>
        </div>
      </section>

      {catalogLoading && !catalog.agencies.length ? (
        <WorkbenchSkeleton />
      ) : !selectedAgency ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>还没有 Wiki 企划</EmptyTitle>
            <EmptyDescription>
              从企划开始建立栏目、内容页和剧情内容层级。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              onClick={() => setEntityTarget({ kind: "agency", entity: null })}
            >
              <PlusIcon data-icon="inline-start" />
              新增企划
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="min-h-128 overflow-hidden rounded-lg border lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden min-w-0 border-r bg-muted/20 lg:block">
            {explorer}
          </aside>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 border-b p-3 lg:hidden">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">当前内容页</p>
                <p className="truncate text-sm font-medium">
                  {selectedIdol?.name ?? "尚未选择"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMobileExplorerOpen(true)}
              >
                <MenuIcon data-icon="inline-start" />
                选择内容页
              </Button>
            </div>

            {selectedIdol ? (
              <>
                <IdolSummary
                  agency={selectedAgency}
                  idol={selectedIdol}
                  onEdit={() =>
                    setEntityTarget({
                      kind: "idol",
                      agency: selectedAgency,
                      entity: selectedIdol,
                    })
                  }
                />

                {storiesError ? (
                  <div className="p-4">
                    <Alert>
                      <AlertTitle>剧情数据加载失败</AlertTitle>
                      <AlertDescription>
                        {errorMessage(storiesError)}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : storiesLoading || !stories ? (
                  <StoryOutlineSkeleton />
                ) : (
                  <StoryOutline
                    stories={stories}
                    query={storyQuery}
                    onQueryChange={setStoryQuery}
                    expandedCategoryIds={expandedCategoryIds}
                    onCategoryOpenChange={setCategoryOpen}
                    onCreateCategory={() =>
                      setCategoryEditor({ category: null })
                    }
                    onCreate={openCreateStory}
                    onEditCategory={(category) =>
                      setCategoryEditor({ category })
                    }
                    onEditCard={(card) => {
                      setStoryEditor({
                        story: card,
                        defaults: {},
                        mode: "edit-card",
                      })
                    }}
                    onEdit={(story) =>
                      setStoryEditor({
                        story,
                        defaults: {},
                        mode: "edit-source",
                      })
                    }
                    onDeleteSource={(story, sourceCount) =>
                      deleteConfirm.requestAction({
                        kind: "source",
                        storyId: story.id,
                        videoTitle: story.videoTitle,
                        cardName: story.cardName,
                        sourceCount,
                        mediaRevision: story.mediaRevision,
                      })
                    }
                    onDeleteCard={(card) =>
                      deleteConfirm.requestAction({
                        kind: "card",
                        category: card.category,
                        cardName: card.name,
                        linkCount: card.stories.length,
                        revision: card.mediaRevision,
                      })
                    }
                    onDeleteCategory={(category, linkCount) =>
                      deleteConfirm.requestAction({
                        kind: "category",
                        category: category.name,
                        linkCount,
                        revision: category.revision ?? 0,
                      })
                    }
                  />
                )}
              </>
            ) : (
              <Empty className="min-h-128 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRoundIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>这个企划还没有内容页</EmptyTitle>
                  <EmptyDescription>
                    可以直接新增内容页，也可以先建立栏目后再归档。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setEntityTarget({
                        kind: "group",
                        agency: selectedAgency,
                        entity: null,
                      })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    新增栏目
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      setEntityTarget({
                        kind: "idol",
                        agency: selectedAgency,
                        entity: null,
                      })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    新增内容页
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>
        </div>
      )}

      <Sheet open={mobileExplorerOpen} onOpenChange={setMobileExplorerOpen}>
        <SheetContent side="left" className="w-[min(22rem,calc(100vw-1rem))]">
          <SheetHeader className="border-b">
            <SheetTitle>选择内容页</SheetTitle>
            <SheetDescription>
              同一内容页可归入多个栏目，选择状态会自动同步。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{explorer}</div>
        </SheetContent>
      </Sheet>

      <WikiEntityEditorDialog
        target={entityTarget}
        open={Boolean(entityTarget)}
        onOpenChange={(open) => {
          if (!open) setEntityTarget(null)
        }}
        onSaved={handleEntitySaved}
      />

      {selectedAgency && selectedIdol && storyEditor ? (
        <StoryEditorDialog
          key={[
            storyEditor.story?.cardId ?? "new",
            storyEditor.mode,
            storyEditor.defaults.category ?? "",
            storyEditor.defaults.cardName ?? "",
          ].join("-")}
          open
          story={storyEditor.story}
          agency={selectedAgency.name}
          idol={selectedIdol.name}
          categories={stories?.categories ?? []}
          contentTypes={stories?.contentTypes ?? []}
          sourcePlatforms={stories?.sourcePlatforms ?? []}
          coverAssets={coverAssets}
          defaultCategory=""
          defaults={storyEditor.defaults}
          mode={storyEditor.mode}
          onOpenChange={(open) => {
            if (!open) setStoryEditor(null)
          }}
          onSaved={reloadStories}
        />
      ) : null}

      {sourceCatalogOpen ? (
        <StorySourceCatalogDialog
          open={sourceCatalogOpen}
          contentTypes={sourceCatalog.contentTypes}
          sourcePlatforms={sourceCatalog.sourcePlatforms}
          onOpenChange={setSourceCatalogOpen}
          onSaved={() => {
            reloadStories()
            void refreshSourceCatalog().catch(() => undefined)
          }}
        />
      ) : null}

      {selectedAgency && selectedIdol && categoryEditor ? (
        <StoryCategoryEditorDialog
          key={categoryEditor.category?.id ?? "new"}
          open
          agencyId={selectedAgency.id}
          idolId={selectedIdol.id}
          agencyName={selectedAgency.name}
          idolName={selectedIdol.name}
          category={categoryEditor.category}
          onOpenChange={(open) => {
            if (!open) setCategoryEditor(null)
          }}
          onSaved={reloadStories}
        />
      ) : null}

      <ConfirmActionDialog
        open={deleteConfirm.open}
        onOpenChange={deleteConfirm.onOpenChange}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        submitting={deleteConfirm.submitting}
        onConfirm={() => void deleteConfirm.confirmAction()}
      />
    </div>
  )
}
