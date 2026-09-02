import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { CommunityPostDetail } from "~/components/editorial/community-post-detail"
import type { EditorialArticle } from "~/lib/api"

const baseArticle: EditorialArticle = {
  id: 43,
  article_id: 70,
  title: "湖南偶像大师 ONLY",
  summary: "制作人线下交流活动现已开放报名。",
  cover_url: "https://media.example.test/hunan-only.webp",
  cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
  image_url: null,
  body_json: { type: "doc", content: [] },
  body_html: "<p>欢迎各位制作人参与本次活动。</p>",
  status: "published",
  revision: 3,
  kind: "notice",
  name: "湖南制作人社群",
  published_at: "2026-08-20T09:30:00.000Z",
  source_url: "https://example.test/source",
  related_links: [],
  live_franchises: [],
  live_brand_codes: [],
}

function renderDetail(article: EditorialArticle, showBackLink = false) {
  return render(
    <MemoryRouter>
      <CommunityPostDetail article={article} showBackLink={showBackLink} />
    </MemoryRouter>
  )
}

describe("CommunityPostDetail", () => {
  it("renders a content-first community post with publisher, cover preview, and source link", () => {
    renderDetail(baseArticle, true)

    expect(screen.getByRole("link", { name: "返回社区动态" })).toHaveAttribute(
      "href",
      "/events"
    )
    expect(
      screen.getByRole("heading", { name: "湖南偶像大师 ONLY" })
    ).toBeVisible()
    expect(screen.getByText("发布者：湖南制作人社群")).toBeVisible()
    expect(screen.getByText(/发布于 2026年8月20日/)).toBeVisible()
    expect(screen.getByText("制作人线下交流活动现已开放报名。")).toBeVisible()
    expect(screen.getByText("欢迎各位制作人参与本次活动。")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "查看湖南偶像大师 ONLY封面" })
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "查看原页面" })).toHaveAttribute(
      "href",
      "https://example.test/source"
    )
  })

  it("places structured event data in a dedicated side panel", () => {
    renderDetail({
      ...baseArticle,
      kind: "event",
      event_status: "cancelled",
      start_at: "2026-09-01T10:00:00.000Z",
      end_at: "2026-09-01T17:00:00.000Z",
      venue_name: "上海活动中心",
      address: "静安区示例路 1 号",
      contact: "QQ群：123456",
      registration_url: "https://example.test/register",
      related_links: [
        { label: "活动报名", url: "https://example.test/register" },
        { label: "站内说明", url: "/events/43" },
      ],
    })

    expect(screen.getByText("具体活动")).toBeVisible()
    expect(screen.getByText("已取消")).toBeVisible()
    expect(screen.getByRole("heading", { name: "活动信息" })).toBeVisible()
    expect(screen.getByText("活动时间")).toBeVisible()
    expect(screen.getByText("活动地点")).toBeVisible()
    expect(screen.getByText("联系方式")).toBeVisible()
    expect(screen.getByText("上海活动中心，静安区示例路 1 号")).toBeVisible()
    expect(screen.getByText("QQ群：123456")).toBeVisible()
    expect(screen.getByRole("link", { name: "活动报名" })).toHaveAttribute(
      "href",
      "https://example.test/register"
    )
    expect(screen.getByRole("link", { name: "站内说明" })).toHaveAttribute(
      "href",
      "/events/43"
    )
    expect(
      screen.getByRole("heading", { name: "活动信息" }).closest("aside")
    ).toHaveClass("lg:sticky")
  })

  it("omits unavailable event facts instead of deriving them from the article body", () => {
    renderDetail({
      ...baseArticle,
      kind: "event",
      event_status: "scheduled",
      venue_name: "虹桥品汇",
      address: "上海市闵行区申长路 869 号",
      start_at: null,
      end_at: null,
      contact: null,
      registration_url: null,
    })

    expect(screen.getByRole("heading", { name: "活动信息" })).toBeVisible()
    expect(screen.getByText("活动状态")).toBeVisible()
    expect(
      screen.getByText("虹桥品汇，上海市闵行区申长路 869 号")
    ).toBeVisible()
    expect(screen.queryByText("活动时间")).not.toBeInTheDocument()
    expect(screen.queryByText("联系方式")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "报名 / 查看链接" })
    ).not.toBeInTheDocument()
  })

  it("applies semantic long-form formatting to editor-generated content", () => {
    renderDetail({
      ...baseArticle,
      body_html:
        '<h2>活动简介</h2><p>欢迎参与。</p><h3>注意事项</h3><ul><li>携带证件</li></ul><blockquote>以现场公告为准。</blockquote><hr /><p><a href="https://example.test/detail">查看详情</a></p><img src="https://media.example.test/detail.webp" alt="活动现场" />',
    })

    expect(
      screen.getByRole("heading", { name: "活动简介", level: 2 })
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "注意事项", level: 3 })
    ).toBeVisible()
    expect(screen.getByRole("list")).toHaveTextContent("携带证件")
    expect(
      screen.getByText("以现场公告为准。").closest("blockquote")
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "查看详情" })).toHaveAttribute(
      "href",
      "https://example.test/detail"
    )
    expect(screen.getByRole("img", { name: "活动现场" })).toBeVisible()
  })

  it("keeps the cover and body in the same reading container", () => {
    renderDetail(baseArticle)

    const cover = screen.getByRole("button", {
      name: "查看湖南偶像大师 ONLY封面",
    })
    const body = screen.getByText("欢迎各位制作人参与本次活动。")

    expect(cover.closest("section")).toHaveClass("rounded-xl")
    expect(body.closest("section")).toBe(cover.closest("section"))
  })

  it("keeps detail and body images at their natural proportions", () => {
    renderDetail({
      ...baseArticle,
      body_html:
        '<img src="https://media.example.test/body.webp" alt="正文图片" />',
    })

    expect(
      screen.getByRole("img", { name: "正文图片" }).parentElement
    ).toHaveClass("[&_img]:object-contain")
    expect(
      screen
        .getByRole("button", { name: "查看湖南偶像大师 ONLY封面" })
        .querySelector("img")
    ).toHaveClass("object-contain")
  })

  it("keeps the chosen empty-body state and omits a missing publisher", () => {
    renderDetail({
      ...baseArticle,
      body_html: "",
      name: null,
      source_url: null,
      cover_url: null,
    })

    expect(screen.getByText("暂无更多介绍")).toBeVisible()
    expect(screen.getByText("管理员尚未补充正文内容。")).toBeVisible()
    expect(screen.queryByText(/发布者：/)).toBeNull()
    expect(screen.queryByRole("heading", { name: "内容来源" })).toBeNull()
  })

  it("renders a legacy event record with its creation date as the published date", () => {
    renderDetail({
      ...baseArticle,
      status: "published",
      revision: 0,
      kind: undefined,
      name: "旧活动发布者",
      published_at: undefined,
      created_at: "2026-08-01T10:00:00.000Z",
    })

    expect(screen.getByText("发布者：旧活动发布者")).toBeVisible()
    expect(screen.getByText(/发布于 2026年8月1日/)).toBeVisible()
  })
})
