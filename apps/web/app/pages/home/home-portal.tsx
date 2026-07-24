import { ActivityHighlights } from "./components/activity-highlights"
import { AnimatedBrandBackground } from "./components/animated-brand-background"
import { BirthdayCalendar } from "./components/birthday-calendar"
import { HomeFeed } from "./components/home-feed"
import { SeriesWall, TodayBirthdayNotice } from "./components/home-hero"
import { FriendLinks, PortalDirectory } from "./components/home-navigation"
import { RandomIdol } from "./components/random-idol"
import { SiteSupport } from "./components/site-support"

export function HomePortal() {
  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <AnimatedBrandBackground />
      <div className="relative z-10">
        <SeriesWall />
        <TodayBirthdayNotice />
        <PortalDirectory />
        <HomeFeed />
        <BirthdayCalendar />
        <ActivityHighlights />
        <RandomIdol />
        <SiteSupport />
        <FriendLinks />
      </div>
    </main>
  )
}
