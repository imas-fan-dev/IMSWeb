import {
  BookmarkIcon,
  Building2Icon,
  CreditCardIcon,
  MailIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { ThemeToggle } from "~/components/shared/theme-toggle"
import { Button } from "~/components/ui/button"
import { useDesktopAccountWorkspace } from "~/lib/use-desktop-account-workspace"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import type { PlatformProfile } from "~/lib/api"
import { cn } from "~/lib/utils"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNamecardUnread } from "~/lib/use-namecard-unread"

export type ProfileWorkspaceSection =
  | "profile"
  | "namecards"
  | "favorites"
  | "offices"
  | "claims"

export const profileWorkspaceSections = [
  {
    id: "profile",
    label: "个人资料",
    labelKey: "platformAccount.app.sections.profile.label",
    shortLabel: "个人",
    description: "头像、名称与简介",
    descriptionKey: "platformAccount.app.sections.profile.description",
    icon: UserRoundIcon,
  },
  {
    id: "namecards",
    label: "交换名片",
    labelKey: "platformAccount.app.sections.namecards.label",
    shortLabel: "名片",
    description: "名片素材与交换状态",
    descriptionKey: "platformAccount.app.sections.namecards.description",
    icon: CreditCardIcon,
  },
  {
    id: "favorites",
    label: "收藏夹",
    labelKey: "platformAccount.app.sections.favorites.label",
    shortLabel: "收藏",
    description: "收藏的交换名片",
    descriptionKey: "platformAccount.app.sections.favorites.description",
    icon: BookmarkIcon,
  },
  {
    id: "offices",
    label: "事务所与位置",
    labelKey: "platformAccount.app.sections.offices.label",
    shortLabel: "事务所",
    description: "事务所资料与地图公开",
    descriptionKey: "platformAccount.app.sections.offices.description",
    icon: Building2Icon,
  },
  {
    id: "claims",
    label: "消息",
    labelKey: "platformAccount.app.sections.claims.label",
    shortLabel: "消息",
    description: "审核通知与名片认领",
    descriptionKey: "platformAccount.app.sections.claims.description",
    icon: MailIcon,
  },
] as const satisfies ReadonlyArray<{
  id: ProfileWorkspaceSection
  label: string
  labelKey: string
  shortLabel: string
  description: string
  descriptionKey: string
  icon: typeof UserRoundIcon
}>

export function isProfileWorkspaceSection(
  value: string | null
): value is ProfileWorkspaceSection {
  return profileWorkspaceSections.some((section) => section.id === value)
}

export function ProfileWorkspaceNavigation({
  profile,
  cardCount,
  activeSection,
  sectionBasePath,
  onLogout,
  embedded,
}: {
  profile: PlatformProfile
  cardCount: number
  activeSection: ProfileWorkspaceSection
  onLogout?: () => void
  sectionBasePath?: string
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const desktopAccount = useDesktopAccountWorkspace()
  const avatarSource = profile.avatarUrl
  const unread = useNamecardUnread()

  if (sectionBasePath && (!desktopAccount || embedded)) return null

  return (
    <aside
      className={cn(
        "min-w-0 border-b bg-muted/15 lg:border-r lg:border-b-0",
        sectionBasePath
          ? "hidden lg:flex lg:flex-col lg:self-stretch"
          : "lg:sticky lg:top-16 lg:max-h-[calc(100svh-4rem)] lg:self-start lg:overflow-y-auto"
      )}
    >
      <div className="flex min-w-0 items-center gap-3 p-4 sm:px-6 lg:p-5">
        <Avatar size="lg" className="size-12 shrink-0">
          {avatarSource ? (
            <AvatarImage
              src={avatarSource}
              alt={`${profile.displayName}的头像`}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback className="text-base">
            {profile.displayName.trim().slice(0, 1) || "制"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile.displayName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {profile.homeCity || "未填写常驻城市"} · {cardCount} 张名片
          </p>
        </div>
      </div>

      <nav className="min-w-0 border-t" aria-label="个人档案菜单">
        <ul className="grid grid-cols-5 lg:block">
          {profileWorkspaceSections.map((section) => {
            const active = activeSection === section.id
            const Icon = section.icon
            const href = `${sectionBasePath ?? "/account/me"}/${section.id}`
            return (
              <li key={section.id} className="min-w-0">
                <NavigationLink
                  to={href}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-2 border-b-2 border-transparent px-2 py-3 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 lg:justify-start lg:gap-3 lg:border-b-0 lg:border-l-2 lg:px-5",
                    active
                      ? "border-primary bg-accent/60 text-foreground lg:border-l-primary"
                      : "text-muted-foreground lg:border-l-transparent",
                    section.id === "claims" && "relative pr-9 lg:pr-12"
                  )}
                  aria-label={t(section.labelKey)}
                  aria-current={active ? "page" : undefined}
                  aria-controls={`profile-workspace-section-${section.id}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span
                      className="block font-medium whitespace-nowrap text-current lg:hidden"
                      aria-hidden="true"
                    >
                      {section.shortLabel}
                    </span>
                    <span
                      className="hidden font-medium text-current lg:block"
                      aria-hidden="true"
                    >
                      {t(section.labelKey)}
                    </span>
                    <span
                      className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block"
                      aria-hidden="true"
                    >
                      {t(section.descriptionKey)}
                    </span>
                  </span>

                  {section.id === "claims" && unread > 0 ? (
                    <span
                      className="absolute top-1/2 right-2 grid size-4 -translate-y-1/2 place-items-center rounded-full bg-destructive text-[10px] leading-none font-medium text-destructive-foreground lg:right-3"
                      aria-label={`${unread} 条未读消息`}
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </NavigationLink>
              </li>
            )
          })}
        </ul>
      </nav>
      {sectionBasePath ? <AccountSidebarUtilities onLogout={onLogout} /> : null}
    </aside>
  )
}

function AccountSidebarUtilities({ onLogout }: { onLogout?: () => void }) {
  const { t } = useTranslation()
  return (
    <footer
      className="mt-auto space-y-4 border-t p-5 text-sm"
      aria-label="帐号操作"
    >
      <NavigationLink
        to="/account/security"
        className="block hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("platformAccount.security.title")}
      </NavigationLink>
      <div className="flex items-center justify-between gap-3">
        <span>{t("platformAccount.app.theme")}</span>
        <ThemeToggle />
      </div>
      <NavigationLink to="/about" className="block hover:text-primary">
        {t("navigation.about")}
      </NavigationLink>
      {onLogout ? (
        <Button variant="outline" onClick={onLogout}>
          {t("platformAccount.logout")}
        </Button>
      ) : null}
    </footer>
  )
}
