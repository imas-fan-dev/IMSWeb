import { AccountAuthForm } from "~/pages/account/components/account-auth-form"

export function meta() {
  return [{ title: "找回密码 | IMSWeb" }]
}

export default function AccountPasswordResetPage() {
  return <AccountAuthForm mode="reset" />
}
