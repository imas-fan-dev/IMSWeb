import {
  BookmarkIcon,
  Building2Icon,
  CreditCardIcon,
  MailIcon,
  UserRoundIcon,
} from "lucide-react"
import { Link } from "react-router"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import type { PlatformProfile } from "~/lib/api"
import { cn } from "~/lib/utils"

export type ProfileWorkspaceSection =
  | "profile"
  | "cards"
  | "favorites"
  | "offices"
  | "claims"

const sections = [
  {
    id: "profile",
    label: "个人资料",
    shortLabel: "个人",
    description: "头像、名称与简介",
    icon: UserRoundIcon,
  },
  {
    id: "cards",
    label: "交换名片",
    shortLabel: "名片",
    description: "名片素材与交换状态",
    icon: CreditCardIcon,
  },
  {
    id: "favorites",
    label: "收藏夹",
    shortLabel: "收藏",
    description: "收藏的交换名片",
    icon: BookmarkIcon,
  },
  {
    id: "offices",
    label: "事务所与位置",
    shortLabel: "事务所",
    description: "事务所资料与地图公开",
    icon: Building2Icon,
  },
  {
    id: "claims",
    label: "认领消息",
    shortLabel: "认领",
    description: "历史名片身份确认",
    icon: MailIcon,
  },
] as const satisfies ReadonlyArray<{
  id: ProfileWorkspaceSection
  label: string
  shortLabel: string
  description: string
  icon: typeof UserRoundIcon
}>

export function isProfileWorkspaceSection(
  value: string | null
): value is ProfileWorkspaceSection {
  return sections.some((section) => section.id === value)
}

export function ProfileWorkspaceNavigation({
  profile,
  cardCount,
  activeSection,
}: {
  profile: PlatformProfile
  cardCount: number
  activeSection: ProfileWorkspaceSection
}) {
  return (
    <aside className="min-w-0 border-b bg-muted/15 lg:sticky lg:top-16 lg:max-h-[calc(100svh-4rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex min-w-0 items-center gap-3 p-4 sm:px-6 lg:p-5">
        <Avatar size="lg" className="size-12 shrink-0">
          {profile.avatarUrl ? (
            <AvatarImage
              src={profile.avatarUrl}
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

      <nav
        className="grid min-w-0 grid-cols-5 border-t lg:block"
        aria-label="个人档案菜单"
      >
        {sections.map((section) => {
          const active = activeSection === section.id
          const Icon = section.icon
          const href =
            section.id === "profile"
              ? "/community/exchange/me"
              : `/community/exchange/me?section=${section.id}`
          return (
            <Link
              key={section.id}
              to={href}
              className={cn(
                "flex min-w-0 items-center justify-center gap-2 border-b-2 border-transparent px-2 py-3 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 lg:justify-start lg:gap-3 lg:border-b-0 lg:border-l-2 lg:px-5",
                active
                  ? "border-primary bg-accent/60 text-foreground lg:border-l-primary"
                  : "text-muted-foreground lg:border-l-transparent"
              )}
              aria-label={section.label}
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
                  {section.label}
                </span>
                <span
                  className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block"
                  aria-hidden="true"
                >
                  {section.description}
                </span>
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
