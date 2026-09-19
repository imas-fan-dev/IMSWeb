import { useState } from "react"

import { AdminConfigDialog } from "~/components/admin/admin-config-dialog"
import { LucideIconPicker } from "~/components/lucide-icon-picker"
import { platformOAuthButtonStyle } from "~/components/platform/platform-oauth-button-theme"
import { PlatformOAuthProviderIcon } from "~/components/platform/platform-oauth-provider-icon"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  validDraft,
  type ProviderDraft,
} from "~/pages/admin/platform-oauth/platform-oauth-model"

function ProviderIconPicker({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
      {(["google", "github"] as const).map((brand) => (
        <Button
          key={brand}
          type="button"
          variant={value === brand ? "secondary" : "outline"}
          aria-pressed={value === brand}
          onClick={() => onValueChange(brand)}
        >
          <PlatformOAuthProviderIcon
            provider={brand}
            className="size-4"
            aria-hidden="true"
          />
          {brand === "google" ? "Google" : "GitHub"}
        </Button>
      ))}
      <LucideIconPicker
        value={value === "google" || value === "github" ? "globe-2" : value}
        onValueChange={onValueChange}
      />
    </div>
  )
}

export function ProviderConfigDialog({
  provider,
  creating,
  saving,
  onOpenChange,
  onSave,
}: {
  provider: ProviderDraft
  creating: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (provider: ProviderDraft) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(provider)
  const valid = validDraft(draft, creating)

  return (
    <AdminConfigDialog
      open
      title={creating ? "新增 OAuth provider" : `编辑 ${provider.displayName}`}
      description={creating ? "OAuth 2.0 / OpenID Connect" : provider.code}
      icon={
        <PlatformOAuthProviderIcon
          provider={draft.icon}
          className="size-5"
          aria-hidden="true"
        />
      }
      contentClassName="sm:max-w-3xl"
      submitLabel={creating ? "添加 provider" : "保存 OAuth 配置"}
      submitDisabled={!valid}
      saving={saving}
      onOpenChange={onOpenChange}
      onSubmit={() => onSave(draft)}
    >
      <FieldGroup className="grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="oauth-provider-code">Provider code</FieldLabel>
          <Input
            id="oauth-provider-code"
            required
            readOnly={!creating}
            maxLength={32}
            value={draft.code}
            placeholder="example-id"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                code: event.target.value.toLowerCase(),
              }))
            }
          />
          <FieldDescription>保存后不可修改。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-display-name">
            显示名称
          </FieldLabel>
          <Input
            id="oauth-provider-display-name"
            required
            maxLength={80}
            value={draft.displayName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>按钮图标</FieldLabel>
          <ProviderIconPicker
            value={draft.icon}
            onValueChange={(icon) =>
              setDraft((current) => ({ ...current, icon }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-button-color">
            按钮主题色
          </FieldLabel>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
            <Input
              id="oauth-provider-button-color-picker"
              type="color"
              aria-label="选择按钮主题色"
              className="p-1"
              value={draft.buttonColor}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  buttonColor: event.target.value,
                }))
              }
            />
            <Input
              id="oauth-provider-button-color"
              required
              value={draft.buttonColor}
              maxLength={7}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  buttonColor: event.target.value,
                }))
              }
            />
          </div>
        </Field>
        <Field>
          <FieldLabel>按钮预览</FieldLabel>
          <Button
            type="button"
            variant="outline"
            className="pointer-events-none w-full"
            style={platformOAuthButtonStyle(draft.buttonColor)}
          >
            <PlatformOAuthProviderIcon
              provider={draft.icon}
              className="size-4"
              aria-hidden="true"
            />
            {draft.displayName || "Provider"}
          </Button>
        </Field>

        <div className="border-t pt-1 sm:col-span-2" />
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="oauth-provider-authorization-endpoint">
            Authorization endpoint
          </FieldLabel>
          <Input
            id="oauth-provider-authorization-endpoint"
            type="url"
            required
            maxLength={2048}
            value={draft.authorizationEndpoint}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                authorizationEndpoint: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-token-endpoint">
            Token endpoint
          </FieldLabel>
          <Input
            id="oauth-provider-token-endpoint"
            type="url"
            required
            maxLength={2048}
            value={draft.tokenEndpoint}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                tokenEndpoint: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-userinfo-endpoint">
            UserInfo endpoint
          </FieldLabel>
          <Input
            id="oauth-provider-userinfo-endpoint"
            type="url"
            required
            maxLength={2048}
            value={draft.userInfoEndpoint}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                userInfoEndpoint: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-token-auth-method">
            Client 鉴权方式
          </FieldLabel>
          <Select
            value={draft.tokenAuthMethod}
            onValueChange={(tokenAuthMethod) =>
              setDraft((current) => ({
                ...current,
                tokenAuthMethod:
                  tokenAuthMethod as ProviderDraft["tokenAuthMethod"],
              }))
            }
          >
            <SelectTrigger id="oauth-provider-token-auth-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_secret_post">
                client_secret_post
              </SelectItem>
              <SelectItem value="client_secret_basic">
                client_secret_basic
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-scopes">Scopes</FieldLabel>
          <Input
            id="oauth-provider-scopes"
            value={draft.scopesInput}
            maxLength={1000}
            placeholder="openid email profile"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                scopesInput: event.target.value,
              }))
            }
          />
          <FieldDescription>使用空格分隔。</FieldDescription>
        </Field>
        <Field className="sm:col-span-2" orientation="horizontal">
          <Checkbox
            id="oauth-provider-pkce"
            checked={draft.pkceEnabled}
            onCheckedChange={(checked) =>
              setDraft((current) => ({
                ...current,
                pkceEnabled: checked === true,
              }))
            }
          />
          <FieldLabel htmlFor="oauth-provider-pkce">启用 PKCE S256</FieldLabel>
        </Field>

        <div className="border-t pt-1 sm:col-span-2" />
        <Field>
          <FieldLabel htmlFor="oauth-provider-redirect-uri">
            回调地址
          </FieldLabel>
          <Input
            id="oauth-provider-redirect-uri"
            type="url"
            maxLength={2048}
            value={draft.redirectUriInput}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                redirectUriInput: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-client-id">Client ID</FieldLabel>
          <Input
            id="oauth-provider-client-id"
            value={draft.clientId}
            autoComplete="off"
            maxLength={512}
            placeholder={draft.clientIdMasked ?? "输入 Client ID"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clientId: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-client-secret">
            Client secret
          </FieldLabel>
          <Input
            id="oauth-provider-client-secret"
            type="password"
            value={draft.clientSecret}
            autoComplete="new-password"
            maxLength={2048}
            placeholder={
              draft.configured ? "已保存，输入新值可替换" : "输入 Client secret"
            }
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clientSecret: event.target.value,
              }))
            }
          />
          <FieldDescription>留空时保持已保存的密钥。</FieldDescription>
        </Field>
        <Field className="sm:col-span-2" orientation="horizontal">
          <Checkbox
            id="oauth-provider-enabled"
            checked={draft.enabled}
            onCheckedChange={(checked) =>
              setDraft((current) => ({
                ...current,
                enabled: checked === true,
              }))
            }
          />
          <FieldLabel htmlFor="oauth-provider-enabled">
            在前端显示此登录方式
          </FieldLabel>
        </Field>

        <div className="border-t pt-1 sm:col-span-2" />
        <Field>
          <FieldLabel htmlFor="oauth-provider-subject-path">
            用户唯一标识路径
          </FieldLabel>
          <Input
            id="oauth-provider-subject-path"
            required
            value={draft.profileSubjectPath}
            maxLength={160}
            placeholder="sub"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                profileSubjectPath: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-display-path">
            显示名称路径
          </FieldLabel>
          <Input
            id="oauth-provider-display-path"
            required
            value={draft.profileDisplayNamePath}
            maxLength={160}
            placeholder="name"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                profileDisplayNamePath: event.target.value,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-display-fallback-path">
            显示名称回退路径
          </FieldLabel>
          <Input
            id="oauth-provider-display-fallback-path"
            value={draft.profileDisplayNameFallbackPath ?? ""}
            maxLength={160}
            placeholder="email"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                profileDisplayNameFallbackPath: event.target.value || null,
              }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oauth-provider-avatar-path">
            头像 URL 路径
          </FieldLabel>
          <Input
            id="oauth-provider-avatar-path"
            value={draft.profileAvatarUrlPath ?? ""}
            maxLength={160}
            placeholder="picture"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                profileAvatarUrlPath: event.target.value || null,
              }))
            }
          />
        </Field>
      </FieldGroup>
    </AdminConfigDialog>
  )
}
