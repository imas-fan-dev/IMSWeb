import { AlertCircleIcon, Layers3Icon } from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { BackToTop } from "~/components/shared/back-to-top"
import { getWikiStories, isApiError } from "~/lib/api"
import type {
  WikiPublicStories,
  WikiPublicStoryCard,
  WikiPublicStoryCategory,
} from "~/lib/api"
import {
  contrastingWikiText,
  readableWikiAccent,
  safeWikiColor,
} from "~/pages/wiki/wiki-model"

import {
  GAKUMAS_S_CARD_ALL_CAST,
  gakumasSCardMatchesCast,
  type GakumasSCardCastFilter,
  isGakumasSCardStories,
} from "~/pages/wiki/gakumas-s-card-cast-model"
import { ClassicStoryContent } from "./components/story/classic-story-content"
import { ClassicStoryDialog } from "./components/story/classic-story-dialog"
import { ClassicStoryProfile } from "./components/story/classic-story-profile"
import "./components/story/classic-story.css"

interface SelectedStoryCard {
  category: WikiPublicStoryCategory
  card: WikiPublicStoryCard
}

function classicStoryErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "剧情内容暂时无法加载"
}

export function meta() {
  return [
    { title: "经典剧情详情 | IMSWeb" },
    {
      name: "description",
      content: "保留原 Wiki 模板分类与剧情卡片交互方式的经典视图。",
    },
  ]
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
  const [castFilterState, setCastFilterState] = useState<{
    key: string
    selectedCast: GakumasSCardCastFilter
    collapsed: boolean
  }>({ key: "", selectedCast: GAKUMAS_S_CARD_ALL_CAST, collapsed: false })
  const [selectedCard, setSelectedCard] = useState<SelectedStoryCard | null>(
    null
  )
  const storyTargetKey = `${agencyName}\u0000${idolName}`
  const requestKey = `${agencyName}\u0000${idolName}\u0000${refreshVersion}`
  const castFilterIsCurrent = castFilterState.key === storyTargetKey
  const selectedCast = castFilterIsCurrent
    ? castFilterState.selectedCast
    : GAKUMAS_S_CARD_ALL_CAST
  const castFilterCollapsed = castFilterIsCurrent
    ? castFilterState.collapsed
    : false

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
  const showsCastFilter = Boolean(stories && isGakumasSCardStories(stories))
  const categories = useMemo(() => {
    if (!stories) return []
    const selectedCategories =
      selectedCategory === "all"
        ? stories.categories
        : stories.categories.filter(
            (category) => category.name === selectedCategory
          )

    if (!showsCastFilter || selectedCast === GAKUMAS_S_CARD_ALL_CAST) {
      return selectedCategories
    }

    return selectedCategories.map((category) => ({
      ...category,
      cards: category.cards.filter((card) =>
        gakumasSCardMatchesCast(card, selectedCast)
      ),
    }))
  }, [selectedCast, selectedCategory, showsCastFilter, stories])
  const cardCount =
    stories?.categories.reduce(
      (sum, category) => sum + category.cards.length,
      0
    ) ?? 0
  const style = {
    "--classic-story-color": accent,
    "--classic-story-ink": readableWikiAccent(accent),
    "--classic-story-on-color": contrastingWikiText(
      accent,
      stories?.idol.textColor
    ),
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
          <h1>请选择一个内容页</h1>
          <p>剧情地址缺少企划或内容页信息。</p>
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
              返回内容目录
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
          <ClassicStoryProfile stories={stories} cardCount={cardCount} />
          <ClassicStoryContent
            stories={stories}
            categories={categories}
            selectedCategory={selectedCategory}
            cardCount={cardCount}
            castFilter={
              showsCastFilter
                ? {
                    collapsed: castFilterCollapsed,
                    selectedCast,
                    onSelectCast: (cast) =>
                      setCastFilterState({
                        key: storyTargetKey,
                        selectedCast: cast,
                        collapsed: castFilterCollapsed,
                      }),
                    onToggleCollapsed: () =>
                      setCastFilterState({
                        key: storyTargetKey,
                        selectedCast,
                        collapsed: !castFilterCollapsed,
                      }),
                  }
                : null
            }
            onSelectCategory={setSelectedCategory}
            onSelectCard={(category, card) =>
              setSelectedCard({ category, card })
            }
          />
        </div>
      ) : null}

      <ClassicStoryDialog
        selected={selectedCard}
        style={style}
        onClose={() => setSelectedCard(null)}
      />
      <BackToTop />
    </main>
  )
}

export default ClassicStoryPage
