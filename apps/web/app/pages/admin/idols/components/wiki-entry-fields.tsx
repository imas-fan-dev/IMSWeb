import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import {
  wikiEntryKindOptions,
  wikiStoryEntrySubtypeOptions,
} from "~/components/wiki/wiki-entry-kind"
import type { WikiAdminGroup } from "~/lib/api"
import { entryKindDraft, type WikiEntryDraft } from "../wiki-entry-draft-model"

export function WikiEntryTypeFields({
  draft,
  onChange,
  disabled,
}: {
  draft: WikiEntryDraft
  onChange: (patch: Partial<WikiEntryDraft>) => void
  disabled?: boolean
}) {
  return (
    <>
      <FieldSet>
        <FieldLegend>内容页类型</FieldLegend>
        <FieldDescription>
          类型决定目录中的标识；真实组合和剧情专题也作为内容页维护。
        </FieldDescription>
        <ToggleGroup
          value={[draft.entryKind]}
          variant="outline"
          spacing={0}
          className="grid w-full grid-cols-2 sm:grid-cols-4"
          aria-label="内容页类型"
          disabled={disabled}
          onValueChange={(values) => {
            const option = wikiEntryKindOptions.find(
              ({ value }) => value === values[0]
            )
            if (option) onChange(entryKindDraft(option.value, draft))
          }}
        >
          {wikiEntryKindOptions.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} className="min-w-0">
              <Icon data-icon="inline-start" aria-hidden="true" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>
      {draft.entryKind === "story" ? (
        <FieldSet>
          <FieldLegend>剧情类型</FieldLegend>
          <FieldDescription>
            用于在目录中区分主线、活动和特殊剧情。
          </FieldDescription>
          <ToggleGroup
            value={[draft.entrySubtype ?? "main"]}
            variant="outline"
            spacing={0}
            className="grid w-full grid-cols-4"
            aria-label="剧情类型"
            disabled={disabled}
            onValueChange={(values) => {
              const option = wikiStoryEntrySubtypeOptions.find(
                ({ value }) => value === values[0]
              )
              if (option) onChange({ entrySubtype: option.value })
            }}
          >
            {wikiStoryEntrySubtypeOptions.map(({ value, label }) => (
              <ToggleGroupItem key={value} value={value} className="min-w-0">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
      ) : null}
    </>
  )
}

export function WikiEntryGroupFields({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: WikiAdminGroup[]
  value: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  return (
    <FieldSet>
      <FieldLegend>所属栏目</FieldLegend>
      <FieldDescription>
        可选择多个栏目，也可以留空；未归档内容会在企划末尾展示。
      </FieldDescription>
      <FieldGroup className="grid gap-2 sm:grid-cols-2">
        {groups.map((group) => (
          <Field key={group.id} orientation="horizontal">
            <Checkbox
              id={`wiki-idol-group-${group.id}`}
              checked={value.includes(group.id)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...new Set([...value, group.id])]
                    : value.filter((id) => id !== group.id)
                )
              }
            />
            <FieldContent>
              <FieldLabel htmlFor={`wiki-idol-group-${group.id}`}>
                {group.name}
              </FieldLabel>
            </FieldContent>
          </Field>
        ))}
        {!groups.length ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            当前企划没有栏目，保存后内容页会进入未归档区域。
          </p>
        ) : null}
      </FieldGroup>
    </FieldSet>
  )
}

export function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          className="size-8 shrink-0 p-1"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          aria-label={`${label}色值`}
          pattern="#[0-9A-Fa-f]{6}"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  )
}
