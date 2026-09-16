import { Navigate, useParams } from "react-router"

import { CommunityExchangeMeWorkspace } from "~/pages/community/exchange/me/community-exchange-me-workspace"
import { isProfileWorkspaceSection } from "~/pages/community/exchange/me/profile-workspace-navigation"

export { meta } from "~/pages/community/exchange/me/community-exchange-me-page"

export default function AccountMeSectionPage() {
  const { section } = useParams()
  const requestedSection = section ?? null

  if (!isProfileWorkspaceSection(requestedSection)) {
    return <Navigate to="/account/me" replace />
  }

  return (
    <CommunityExchangeMeWorkspace
      section={requestedSection}
      sectionBasePath="/account/me"
    />
  )
}
