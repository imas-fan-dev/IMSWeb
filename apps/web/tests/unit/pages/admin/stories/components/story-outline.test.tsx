import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { StoryOutline } from "~/pages/admin/stories/components/story-outline"
import { defaultWikiImageTransform, type WikiAdminStories } from "~/lib/api"

const stories: WikiAdminStories = {
  status: "success",
  agency: { id: 6, code: "sc", name: "闪耀色彩", color: "#8dbbff" },
  idol: {
    id: 6,
    name: "樱木真乃",
    folderName: "sakuragi_mano",
    color: "#f1b0c9",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    wikiEnabled: true,
    groupIds: [],
    entryKind: "idol",
    entrySubtype: null,
  },
  categories: [
    {
      id: 1,
      name: "主线",
      storageSlug: "main",
      displayOrder: 0,
      showWhenEmpty: true,
      backgroundEligible: false,
    },
  ],
  contentTypes: [
    {
      id: 1,
      name: "剧情",
      iconName: "book-open-text",
      description: "剧情内容",
      displayOrder: 0,
      isActive: true,
      revision: 0,
    },
  ],
  sourcePlatforms: [
    {
      id: 2,
      name: "其他来源",
      homepageUrl: "",
      description: "其他来源",
      displayOrder: 0,
      isActive: true,
      revision: 0,
    },
  ],
  cards: [
    {
      cardId: 11,
      category: "主线",
      cardName: "【第一话】",
      subtitle: "开场",
      imageFile: null,
      imageUrl: "",
      imageTransform: defaultWikiImageTransform,
      mediaRevision: 2,
    },
    {
      cardId: 12,
      category: "主线",
      cardName: "【待补来源】",
      subtitle: "卡片资料",
      imageFile: null,
      imageUrl: "",
      imageTransform: defaultWikiImageTransform,
      mediaRevision: 0,
    },
  ],
  stories: [
    {
      id: 21,
      cardId: 11,
      category: "主线",
      cardName: "【第一话】",
      upName: "投稿者",
      videoTitle: "第一视角",
      url: "https://example.test/story",
      contentTypeId: 1,
      contentTypeName: "剧情",
      sourcePlatformId: 2,
      sourcePlatformName: "其他来源",
      subtitle: "开场",
      imageFile: null,
      imageUrl: "",
      imageTransform: defaultWikiImageTransform,
      mediaRevision: 2,
    },
  ],
}

describe("StoryOutline", () => {
  it("exposes independent category, card, source edit and source delete actions", async () => {
    const onCreateCategory = vi.fn()
    const onEditCategory = vi.fn()
    const onEditCard = vi.fn()
    const onEdit = vi.fn()
    const onDeleteSource = vi.fn()
    const user = userEvent.setup()

    render(
      <StoryOutline
        stories={stories}
        onCreateCategory={onCreateCategory}
        onCreate={vi.fn()}
        onEditCategory={onEditCategory}
        onEditCard={onEditCard}
        onEdit={onEdit}
        onDeleteSource={onDeleteSource}
        onDeleteCard={vi.fn()}
        onDeleteCategory={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "新增分类" }))
    await user.click(screen.getByRole("button", { name: "编辑分类 主线" }))
    await user.click(
      screen.getByRole("button", { name: "编辑卡片 【第一话】" })
    )
    await user.click(screen.getByRole("button", { name: "编辑来源 第一视角" }))
    await user.click(screen.getByRole("button", { name: "删除来源 第一视角" }))

    expect(onCreateCategory).toHaveBeenCalledTimes(1)
    expect(onEditCategory).toHaveBeenCalledWith(stories.categories[0])
    expect(onEditCard.mock.calls[0]?.[0]).toMatchObject({
      category: "主线",
      name: "【第一话】",
    })
    expect(onEdit).toHaveBeenCalledWith(stories.stories[0])
    expect(onDeleteSource).toHaveBeenCalledWith(stories.stories[0], 1)
    expect(screen.getAllByText("剧情").length).toBeGreaterThan(0)
    expect(screen.getAllByText("其他来源").length).toBeGreaterThan(0)
    expect(screen.getByText("【待补来源】")).toBeVisible()
    expect(screen.getByText("暂无来源")).toBeVisible()
    expect(screen.getAllByText("0 个来源").length).toBeGreaterThan(0)
  })
})
