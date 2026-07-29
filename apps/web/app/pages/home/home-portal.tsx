import { SeriesIconBackground } from "~/components/shared/series-icon-background"

import { ActivityHighlights } from "./components/activity-highlights"
import { BirthdayCalendar } from "./components/birthday-calendar"
import { HomeFeed } from "./components/home-feed"
import { HomeBrowserBrand } from "./components/home-browser-brand"
import { SeriesWall, TodayBirthdayNotice } from "./components/home-hero"
import { FriendLinks, PortalDirectory } from "./components/home-navigation"
import { RandomIdol } from "./components/random-idol"
import { SiteSupport } from "./components/site-support"

export function HomePortal() {
  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <HomeBrowserBrand />
      <SeriesIconBackground />
      <div className="relative z-10">
        <SeriesWall />
        <TodayBirthdayNotice />
        <PortalDirectory />
        <HomeFeed />
        <BirthdayCalendar />
        <ActivityHighlights />
        <RandomIdol />
        <FriendLinks />
        <SiteSupport />
      </div>
    </main>
  )
}
