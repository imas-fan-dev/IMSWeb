import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  Layers3Icon,
  UserRoundIcon,
} from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { safeExternalStoryUrl, safeWikiColor } from "~/pages/wiki/wiki-model"
import { getWikiStories, isApiError } from "~/shared/api"
import type {
  WikiPublicStories,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/shared/api"

import "./classic-wiki.css"

interface SelectedStoryCard {
  category: WikiPublicStoryCategory
  card: WikiPublicStoryCard
}

function classicStoryErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情内容暂时无法加载"
}

export function ClassicStoryPage() {
  const [searchParams] = useSearchParams()
  const agencyName = searchParams.get("agency")?.trim() ?? ""
  const idolName = searchParams.get("idol")?.trim() ?? ""
  const [storyRequest, setStoryRequest] = useState<{
    key: string
    data: WikiPublicStories | null
    error: unknown
  }>({ key: "", data: null, error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedCard, setSelectedCard] = useState<SelectedStoryCard | null>(
    null
  )
  const requestKey = `${agencyName}\u0000${idolName}\u0000${refreshVersion}`

  useEffect(() => {
    if (!agencyName || !idolName) return
    let active = true
    void getWikiStories(agencyName, idolName)
      .send()
      .then((data) => {
        if (active) setStoryRequest({ key: requestKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (active) setStoryRequest({ key: requestKey, data: null, error })
      })
    return () => {
      active = false
    }
  }, [agencyName, idolName, requestKey])

  const hasTarget = Boolean(agencyName && idolName)
  const requestIsCurrent = storyRequest.key === requestKey
  const stories = requestIsCurrent ? storyRequest.data : null
  const storiesError = requestIsCurrent ? storyRequest.error : null
  const loading = hasTarget && !requestIsCurrent
  const accent = safeWikiColor(stories?.idol.color ?? stories?.agency.color)
  const categories = useMemo(() => {
    if (!stories) return []
    return selectedCategory === "all"
      ? stories.categories
      : stories.categories.filter(
          (category) => category.name === selectedCategory
        )
  }, [selectedCategory, stories])
  const cardCount = stories?.categories.reduce(
    (sum, category) => sum + category.cards.length,
    0
  )
  const style = {
    "--classic-story-color": accent,
    "--classic-story-tint": `color-mix(in srgb, ${accent} 9%, white)`,
  } as CSSProperties

  if (!hasTarget) {
    return (
      <main
        id="main-content"
        className="wiki-classic-story-shell"
        style={style}
      >
        <div className="wiki-classic-story-status">
          <Layers3Icon />
          <h1>请选择一位角色</h1>
          <p>剧情地址缺少企划或角色信息。</p>
          <Link to="/wiki/classic">返回经典剧情导航</Link>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="wiki-classic-story-shell" style={style}>
      {storiesError ? (
        <div className="wiki-classic-story-status is-error">
          <AlertCircleIcon />
          <h1>剧情内容暂时无法加载</h1>
          <p>{classicStoryErrorMessage(storiesError)}</p>
          <div>
            <button
              type="button"
              onClick={() => setRefreshVersion((current) => current + 1)}
            >
              重新加载
            </button>
            <Link to={`/wiki/classic?agency=${encodeURIComponent(agencyName)}`}>
              返回角色目录
            </Link>
          </div>
        </div>
      ) : loading ? (
        <div
          className="wiki-classic-story-loading"
          aria-label="正在加载经典剧情"
        >
          <span />
          <span />
          <span />
        </div>
      ) : stories ? (
        <div className="wiki-classic-story-layout">
          <aside className="wiki-classic-story-profile">
            <p className="wiki-classic-story-project">
              {stories.agency.code.toUpperCase()} ARCHIVE
            </p>
            <h1>{stories.idol.name}</h1>
            <div className="wiki-classic-story-avatar">
              <img
                src={stories.idol.imageUrl}
                alt={stories.idol.name}
                style={{ objectFit: stories.idol.imageFit }}
              />
            </div>
            <dl className="wiki-classic-story-counts">
              <div>
                <dt>分类</dt>
                <dd>{stories.categories.length}</dd>
              </div>
              <div>
                <dt>卡片</dt>
                <dd>{cardCount ?? 0}</dd>
              </div>
            </dl>
            <nav className="wiki-classic-story-actions" aria-label="页面切换">
              <Link
                to={`/wiki/classic?agency=${encodeURIComponent(stories.agency.name)}`}
              >
                <ArrowLeftIcon />
                返回上一页
              </Link>
              <Link
                to={`/story?agency=${encodeURIComponent(stories.agency.name)}&idol=${encodeURIComponent(stories.idol.name)}`}
              >
                <LayoutGridIcon />
                新版视图
              </Link>
            </nav>
          </aside>

          <section className="wiki-classic-story-content">
            <div className="wiki-classic-story-tabs">
              <div>
                <Layers3Icon />
                <strong>分类筛选</strong>
              </div>
              <nav aria-label="剧情分类">
                <button
                  type="button"
                  className={selectedCategory === "all" ? "is-active" : ""}
                  onClick={() => setSelectedCategory("all")}
                >
                  全部展开
                  <small>{cardCount ?? 0}</small>
                </button>
                {stories.categories.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    className={
                      selectedCategory === category.name ? "is-active" : ""
                    }
                    onClick={() => setSelectedCategory(category.name)}
                  >
                    {category.name}
                    <small>{category.cards.length}</small>
                  </button>
                ))}
              </nav>
            </div>

            <div className="wiki-classic-story-categories">
              {categories.map((category) => (
                <section
                  key={category.name}
                  className="wiki-classic-story-category"
                  aria-labelledby={`classic-story-${category.name}`}
                >
                  <header>
                    <h2 id={`classic-story-${category.name}`}>
                      <span>📂</span> ({category.name})
                    </h2>
                    <small>{category.cards.length} 张卡片</small>
                  </header>
                  {category.cards.length ? (
                    <div className="wiki-classic-story-grid">
                      {category.cards.map((card) => {
                        const textOnly = !card.img
                        return (
                          <button
                            key={`${category.name}\u0000${card.name}`}
                            type="button"
                            className={`wiki-classic-story-card${textOnly ? "is-text-only" : ""}`}
                            onClick={() => setSelectedCard({ category, card })}
                          >
                            {!textOnly ? (
                              <span className="wiki-classic-story-card-image">
                                <img
                                  src={card.img || stories.idol.imageUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(event) => {
                                    event.currentTarget.src =
                                      stories.idol.imageUrl
                                  }}
                                />
                              </span>
                            ) : null}
                            <span className="wiki-classic-story-card-body">
                              <strong>{card.name}</strong>
                              {card.subtitle ? (
                                <small>{card.subtitle}</small>
                              ) : null}
                              <span>{card.links.length} 个来源</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="wiki-classic-story-empty">此分类下暂无剧情</p>
                  )}
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <Dialog
        open={selectedCard !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null)
        }}
      >
        <DialogContent className="wiki-classic-story-dialog" style={style}>
          <DialogHeader>
            <p>{selectedCard?.category.name}</p>
            <DialogTitle>{selectedCard?.card.name}</DialogTitle>
            {selectedCard?.card.subtitle ? (
              <DialogDescription>
                {selectedCard.card.subtitle}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="wiki-classic-story-dialog-links">
            {selectedCard?.card.links.length ? (
              selectedCard.card.links.map((link) => {
                const href = safeExternalStoryUrl(link.url)
                return href ? (
                  <a key={link.id} href={href} target="_blank" rel="noreferrer">
                    <UserRoundIcon />
                    <span>
                      <strong>{link.title || "查看剧情"}</strong>
                      <small>{link.up || "未知投稿者"}</small>
                    </span>
                    <ExternalLinkIcon />
                  </a>
                ) : (
                  <div key={link.id} className="is-unavailable">
                    链接不可用
                  </div>
                )
              })
            ) : (
              <p className="wiki-classic-story-empty">暂无可用剧情来源</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
