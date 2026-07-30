import { ArrowLeftIcon, LayoutGridIcon } from "lucide-react"
import { Link } from "react-router"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import { wikiEntryKindLabel } from "~/components/wiki/wiki-entry-kind"
import type { WikiPublicStories } from "~/lib/api"

interface ClassicStoryProfileProps {
  stories: WikiPublicStories
  cardCount: number
}

export function ClassicStoryProfile({
  stories,
  cardCount,
}: ClassicStoryProfileProps) {
  return (
    <aside className="wiki-classic-story-profile">
      <p className="wiki-classic-story-project">
        {stories.agency.code.toUpperCase()} ARCHIVE ·{" "}
        {wikiEntryKindLabel(stories.idol.entryKind, stories.idol.entrySubtype)}
      </p>
      <h1>{stories.idol.name}</h1>
      <div className="wiki-classic-story-avatar">
        <WikiTransformedImage
          src={stories.idol.imageUrl}
          alt={stories.idol.name}
          transform={stories.idol.imageTransform}
        />
      </div>
      <dl className="wiki-classic-story-counts">
        <div>
          <dt>分类</dt>
          <dd>{stories.categories.length}</dd>
        </div>
        <div>
          <dt>卡片</dt>
          <dd>{cardCount}</dd>
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
  )
}
