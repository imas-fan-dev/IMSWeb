import { LoaderCircleIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react"

import {
  homepageLinkAccentClasses,
  homepageLinkAccentLabels,
  homepageLinkIconLabels,
  homepageLinkIcons,
} from "~/components/homepage/homepage-link-options"
import { Button } from "~/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import type {
  HomepageLinkAccent,
  HomepageLinkIcon,
  HomepageLinkSubmission,
} from "~/lib/api"
import { AdminPanel } from "~/pages/admin/components/admin-ui"

const iconItems = Object.entries(homepageLinkIconLabels).map(
  ([value, label]) => ({ value: value as HomepageLinkIcon, label })
)
const accentItems = Object.entries(homepageLinkAccentLabels).map(
  ([value, label]) => ({ value: value as HomepageLinkAccent, label })
)

export function HomepageLinkForm({
  draft,
  editing,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: HomepageLinkSubmission
  editing: boolean
  saving: boolean
  onChange: (draft: HomepageLinkSubmission) => void
  onCancel: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <AdminPanel
        title={editing ? "编辑链接" : "添加链接"}
        description={
          editing ? "保存后首页立即使用新内容" : "新链接将追加到当前板块"
        }
        icon={editing ? SaveIcon : PlusIcon}
        action={
          editing ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              <XIcon data-icon="inline-start" />
              取消编辑
            </Button>
          ) : null
        }
        contentClassName="flex flex-col gap-6"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="homepage-link-title">标题</FieldLabel>
            <Input
              id="homepage-link-title"
              value={draft.title}
              maxLength={80}
              required
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="homepage-link-description">说明</FieldLabel>
            <Textarea
              id="homepage-link-description"
              value={draft.description}
              maxLength={200}
              onChange={(event) =>
                onChange({ ...draft, description: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="homepage-link-href">链接</FieldLabel>
            <Input
              id="homepage-link-href"
              value={draft.href}
              maxLength={2048}
              placeholder="/events 或 https://example.com/"
              required
              onChange={(event) =>
                onChange({ ...draft, href: event.target.value })
              }
            />
          </Field>
          {draft.section === "navigation" ? (
            <Field>
              <FieldLabel htmlFor="homepage-link-icon">图标</FieldLabel>
              <Select
                items={iconItems}
                value={draft.icon}
                onValueChange={(value) =>
                  onChange({
                    ...draft,
                    icon: String(value) as HomepageLinkIcon,
                  })
                }
              >
                <SelectTrigger id="homepage-link-icon" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {iconItems.map((item) => {
                      const Icon = homepageLinkIcons[item.value]
                      return (
                        <SelectItem key={item.value} value={item.value}>
                          <Icon aria-hidden="true" />
                          {item.label}
                        </SelectItem>
                      )
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="homepage-link-accent">强调色</FieldLabel>
            <Select
              items={accentItems}
              value={draft.accent}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  accent: String(value) as HomepageLinkAccent,
                })
              }
            >
              <SelectTrigger id="homepage-link-accent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span
                        className={cn(
                          "size-3 rounded-sm",
                          homepageLinkAccentClasses[item.value]
                        )}
                        aria-hidden="true"
                      />
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {editing ? "保存修改" : "添加链接"}
        </Button>
      </AdminPanel>
    </form>
  )
}
