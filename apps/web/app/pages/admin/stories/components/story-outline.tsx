import {
  ChevronDownIcon,
  ExternalLinkIcon,
  FileImageIcon,
  FileTextIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import type {
  WikiAdminStories,
  WikiAdminStory,
  WikiAdminStoryCard,
} from "~/lib/api"

type StoryCard = WikiAdminStoryCard & {
  category: string
  name: string
  stories: WikiAdminStory[]
}

type StoryCategory = WikiAdminStories["categories"][number] & {
  cards: StoryCard[]
}

export type StoryCreateDefaults = {
  category: string
  cardName: string
  template?: WikiAdminStoryCard
}

export function StoryOutline({
  stories,
  query: controlledQuery,
  onQueryChange,
  expandedCategoryIds,
  onCategoryOpenChange,
  onCreateCategory,
  onCreate,
  onEditCategory,
  onEditCard,
  onEdit,
  onDeleteSource,
  onDeleteCard,
  onDeleteCategory,
}: {
  stories: WikiAdminStories
  query?: string
  onQueryChange?: (query: string) => void
  expandedCategoryIds?: ReadonlySet<number>
  onCategoryOpenChange?: (categoryId: number, open: boolean) => void
  onCreateCategory: () => void
  onCreate: (defaults: StoryCreateDefaults) => void
  onEditCategory: (category: WikiAdminStories["categories"][number]) => void
  onEditCard: (card: StoryCard) => void
  onEdit: (story: WikiAdminStory) => void
  onDeleteSource: (story: WikiAdminStory, sourceCount: number) => void
  onDeleteCard: (card: StoryCard) => void
  onDeleteCategory: (category: StoryCategory, linkCount: number) => void
}) {
  const [localQuery, setLocalQuery] = useState("")
  const query = controlledQuery ?? localQuery
  const categories = useMemo(
    () => buildOutline(stories, query),
    [query, stories]
  )

  return (
    <section aria-labelledby="wiki-story-outline-title" className="min-w-0">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="wiki-story-outline-title" className="text-sm font-medium">
            剧情大纲
          </h2>
          <p className="text-xs text-muted-foreground">
            {stories.categories.length} 个分类 ·{" "}
            {stories.cards?.length ?? countCards(stories.stories)} 张卡片 ·{" "}
            {stories.stories.length} 个来源
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="搜索剧情"
              className="pl-8"
              placeholder="卡片、标题、投稿者"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value
                if (onQueryChange) onQueryChange(nextQuery)
                else setLocalQuery(nextQuery)
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={onCreateCategory}>
            <FolderIcon data-icon="inline-start" />
            新增分类
          </Button>
          <Button
            type="button"
            onClick={() =>
              onCreate({
                category: "",
                cardName: "",
              })
            }
          >
            <PlusIcon data-icon="inline-start" />
            新增卡片
          </Button>
        </div>
      </div>

      {categories.length ? (
        <div className="divide-y">
          {categories.map((category) => (
            <CategoryBranch
              key={category.id}
              category={category}
              open={expandedCategoryIds?.has(category.id)}
              onOpenChange={(open) =>
                onCategoryOpenChange?.(category.id, open)
              }
              onCreate={onCreate}
              onEditCategory={onEditCategory}
              onEditCard={onEditCard}
              onEdit={onEdit}
              onDeleteSource={onDeleteSource}
              onDeleteCard={onDeleteCard}
              onDeleteCategory={onDeleteCategory}
            />
          ))}
        </div>
      ) : (
        <Empty className="m-4 min-h-48 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {query ? (
                <SearchIcon aria-hidden="true" />
              ) : (
                <FolderIcon aria-hidden="true" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {query ? "没有匹配的剧情" : "还没有剧情分类"}
            </EmptyTitle>
            <EmptyDescription>
              {query
                ? "调整关键词后再试。"
                : "先新增分类，再为分类添加卡片与剧情来源。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )
}

function CategoryBranch({
  category,
  open,
  onOpenChange,
  onCreate,
  onEditCategory,
  onEditCard,
  onEdit,
  onDeleteSource,
  onDeleteCard,
  onDeleteCategory,
}: {
  category: StoryCategory
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCreate: (defaults: StoryCreateDefaults) => void
  onEditCategory: (category: WikiAdminStories["categories"][number]) => void
  onEditCard: (card: StoryCard) => void
  onEdit: (story: WikiAdminStory) => void
  onDeleteSource: (story: WikiAdminStory, sourceCount: number) => void
  onDeleteCard: (card: StoryCard) => void
  onDeleteCategory: (category: StoryCategory, linkCount: number) => void
}) {
  const linkCount = category.cards.reduce(
    (total, card) => total + card.stories.length,
    0
  )

  return (
    <Collapsible
      defaultOpen={open === undefined}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex min-w-0 items-center gap-1 px-3 py-2">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          <ChevronDownIcon
            className="size-3.5 shrink-0 transition-transform group-data-panel-open:rotate-180"
            aria-hidden="true"
          />
          <FolderIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {category.name}
          </span>
          <Badge variant="secondary">{category.cards.length} 张</Badge>
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
            {linkCount} 个来源
          </span>
        </CollapsibleTrigger>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => onCreate({ category: category.name, cardName: "" })}
        >
          <PlusIcon data-icon="inline-start" />
          卡片
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`编辑分类 ${category.name}`}
          onClick={() =>
            onEditCategory({
              id: category.id,
              name: category.name,
              storageSlug: category.storageSlug,
              displayOrder: category.displayOrder,
              showWhenEmpty: category.showWhenEmpty,
              backgroundEligible: category.backgroundEligible,
              revision: category.revision,
            })
          }
        >
          <PencilIcon data-icon="inline-start" />
          编辑
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={`删除分类 ${category.name}`}
          onClick={() => onDeleteCategory(category, linkCount)}
        >
          <Trash2Icon data-icon="inline-start" />
          删除
        </Button>
      </div>

      <CollapsibleContent>
        {category.cards.length ? (
          <div className="border-t bg-muted/20 px-3 py-2 sm:pl-9">
            <div className="flex flex-col gap-2">
              {category.cards.map((card) => (
                <CardBranch
                  key={card.name}
                  card={card}
                  onCreate={onCreate}
                  onEditCard={onEditCard}
                  onEdit={onEdit}
                  onDeleteSource={onDeleteSource}
                  onDelete={onDeleteCard}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="border-t px-9 py-3 text-xs text-muted-foreground">
            此分类暂时没有卡片。
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CardBranch({
  card,
  onCreate,
  onEditCard,
  onEdit,
  onDeleteSource,
  onDelete,
}: {
  card: StoryCard
  onCreate: (defaults: StoryCreateDefaults) => void
  onEditCard: (card: StoryCard) => void
  onEdit: (story: WikiAdminStory) => void
  onDeleteSource: (story: WikiAdminStory, sourceCount: number) => void
  onDelete: (card: StoryCard) => void
}) {
  const contentTypeCount = new Set(
    card.stories.map((story) => story.contentTypeId)
  ).size

  return (
    <Collapsible defaultOpen>
      <div className="rounded-md border bg-background">
        <div className="flex min-w-0 flex-col gap-2 p-2 sm:flex-row sm:items-center">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
            <ChevronDownIcon
              className="size-3.5 shrink-0 transition-transform group-data-panel-open:rotate-180"
              aria-hidden="true"
            />
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
              {card.imageUrl ? (
                <WikiTransformedImage
                  src={card.imageUrl}
                  alt=""
                  transform={card.imageTransform}
                />
              ) : (
                <FileImageIcon className="size-4" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {card.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {card.subtitle || "无剧情备注"}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              <Badge variant="secondary">{contentTypeCount} 种内容</Badge>
              <Badge variant="outline">{card.stories.length} 个来源</Badge>
            </span>
          </CollapsibleTrigger>
          <div className="flex shrink-0 self-end sm:self-auto">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                onCreate({
                  category: card.category,
                  cardName: card.name,
                  template: card,
                })
              }
            >
              <PlusIcon data-icon="inline-start" />
              来源
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-label={`编辑卡片 ${card.name}`}
              onClick={() => onEditCard(card)}
            >
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-label={`删除卡片 ${card.name}`}
              onClick={() => onDelete(card)}
            >
              <Trash2Icon data-icon="inline-start" />
              删除
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="divide-y border-t">
            {card.stories.length ? (
              card.stories.map((story) => (
                <div
                  key={story.id}
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:pl-7"
                >
                  <FileTextIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{story.videoTitle}</p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{story.contentTypeName}</Badge>
                      <Badge variant="outline">
                        {story.sourcePlatformName}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">
                        {story.upName}
                      </span>
                    </div>
                  </div>
                  <div className="col-start-2 flex justify-end sm:col-start-3 sm:row-start-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label={`编辑来源 ${story.videoTitle}`}
                      onClick={() => onEdit(story)}
                    >
                      <PencilIcon data-icon="inline-start" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label={`删除来源 ${story.videoTitle}`}
                      onClick={() => onDeleteSource(story, card.stories.length)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      删除
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      render={
                        <a href={story.url} target="_blank" rel="noreferrer" />
                      }
                      nativeButton={false}
                    >
                      <ExternalLinkIcon data-icon="inline-start" />
                      打开
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-7 py-4 text-sm text-muted-foreground">
                暂无来源
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function buildOutline(stories: WikiAdminStories, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const categoryMap = new Map<string, StoryCategory>(
    stories.categories.map((category) => [
      category.name,
      { ...category, cards: [] },
    ])
  )
  const cardMaps = new Map<string, Map<string, StoryCard>>()

  for (const record of stories.cards ?? []) {
    const category = categoryMap.get(record.category)
    if (!category) continue
    let cards = cardMaps.get(record.category)
    if (!cards) {
      cards = new Map()
      cardMaps.set(record.category, cards)
    }
    const card = { ...record, name: record.cardName, stories: [] }
    cards.set(record.cardName, card)
    category.cards.push(card)
  }

  for (const story of stories.stories) {
    let category = categoryMap.get(story.category)
    if (!category) {
      category = {
        id: -categoryMap.size - 1,
        name: story.category,
        storageSlug: story.category,
        displayOrder: categoryMap.size,
        showWhenEmpty: true,
        backgroundEligible: false,
        cards: [],
      }
      categoryMap.set(story.category, category)
    }
    let cards = cardMaps.get(story.category)
    if (!cards) {
      cards = new Map()
      cardMaps.set(story.category, cards)
    }
    let card = cards.get(story.cardName)
    if (!card) {
      card = { ...story, name: story.cardName, stories: [] }
      cards.set(story.cardName, card)
      category.cards.push(card)
    }
    card.stories.push(story)
  }

  const categories = [...categoryMap.values()]
  if (!normalizedQuery) return categories

  return categories.flatMap((category) => {
    const categoryMatches = category.name
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery)
    const cards = category.cards.flatMap((card) => {
      const cardMatches = card.name
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery)
      const cardMetadataMatches = card.subtitle
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery)
      const storyMatches = card.stories.some((story) =>
        [
          story.videoTitle,
          story.upName,
          story.subtitle,
          story.url,
          story.contentTypeName,
          story.sourcePlatformName,
        ].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        )
      )
      if (
        !categoryMatches &&
        !cardMatches &&
        !cardMetadataMatches &&
        !storyMatches
      ) {
        return []
      }
      return [card]
    })
    return cards.length ? [{ ...category, cards }] : []
  })
}

function countCards(stories: WikiAdminStory[]) {
  return new Set(
    stories.map((story) => `${story.category}\u0000${story.cardName}`)
  ).size
}
