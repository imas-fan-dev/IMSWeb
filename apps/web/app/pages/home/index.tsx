import { IS_APP_TARGET } from "~/lib/app-target"
import { ActivityHighlights } from "./components/activity-highlights"
import { AppHomeLinksFooter } from "./components/app-home-links-footer"
import { BirthdayCalendar } from "./components/birthday-calendar"
import { HomeFeed } from "./components/home-feed"
import { HomeBrowserBrand } from "./components/home-browser-brand"
import { SeriesWall, TodayBirthdayNotice } from "./components/home-hero"
import { FriendLinks, PortalDirectory } from "./components/home-navigation"
import { RandomIdol } from "./components/random-idol"
import { SiteSupport } from "./components/site-support"
import { HomepageLinksProvider } from "./hooks/use-homepage-links"

export function meta() {
  return [
    { title: "IMSWeb | 偶像大师交流站" },
    {
      name: "description",
      content: "偶像大师中文资料、活动日程、制作人社区与共同创作入口。",
    },
  ]
}

export function HomePortal() {
  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <HomeBrowserBrand />
      <HomepageLinksProvider>
        <div className="relative z-10">
          <SeriesWall />
          <TodayBirthdayNotice />
          {IS_APP_TARGET ? null : <PortalDirectory />}
          <HomeFeed />
          <BirthdayCalendar />
          <ActivityHighlights />
          <RandomIdol />
          {IS_APP_TARGET ? (
            <AppHomeLinksFooter />
          ) : (
            <>
              <FriendLinks />
              <SiteSupport />
            </>
          )}
        </div>
      </HomepageLinksProvider>
    </main>
  )
}

export default HomePortal
