import { IS_APP_TARGET } from "~/lib/app-target"
import { siteSeoOrigin } from "~/lib/site-seo"
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
import { HomeBirthdaysProvider } from "./hooks/use-home-birthdays"

export function meta() {
  return [
    { title: "IMSWeb | 偶像大师交流站" },
    {
      name: "description",
      content: "偶像大师中文资料、活动日程、制作人社区与共同创作入口。",
    },
    ...(IS_APP_TARGET
      ? []
      : [
          {
            tagName: "link" as const,
            rel: "canonical",
            href: new URL(
              "/",
              siteSeoOrigin(import.meta.env.VITE_IMS_PUBLIC_SITE_ORIGIN)
            ).href,
          },
        ]),
  ]
}

export function HomePortal() {
  return (
    <main id="main-content" className="relative isolate overflow-clip">
      {IS_APP_TARGET ? <HomeBrowserBrand /> : null}
      <HomepageLinksProvider>
        <HomeBirthdaysProvider>
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
        </HomeBirthdaysProvider>
      </HomepageLinksProvider>
    </main>
  )
}

export default HomePortal
