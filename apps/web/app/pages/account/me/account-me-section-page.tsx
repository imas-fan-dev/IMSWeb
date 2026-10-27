import { Navigate, useParams } from "react-router"

import { AccountMePage } from "./account-me-page"

import {
  isProfileWorkspaceSection,
  profileWorkspaceSections,
} from "~/pages/account/me/profile-workspace-navigation"

export function meta({ params }: { params: { section?: string } }) {
  const section = profileWorkspaceSections.find(
    (item) => item.id === params.section
  )
  return [{ title: `${section?.label ?? "我的"} | IMSWeb` }]
}

export default function AccountMeSectionPage() {
  const { section } = useParams()
  const requestedSection = section ?? null

  if (!isProfileWorkspaceSection(requestedSection)) {
    return <Navigate to="/account/me" replace />
  }

  return <AccountMePage section={requestedSection} standaloneSection />
}
