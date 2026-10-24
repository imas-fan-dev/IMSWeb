import { LoaderCircleIcon, SaveIcon } from "lucide-react"
import type { FormEvent } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
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
import {
  NAMECARD_CHARACTER_CATEGORIES,
  type NamecardCharacterAgency,
} from "~/lib/api"
import {
  NAMECARD_CHARACTER_CATEGORY_LABELS,
  isCharacterDraftValid,
  type CharacterDraft,
} from "./namecard-character-model"

const categoryItems = NAMECARD_CHARACTER_CATEGORIES.map((value) => ({
  value,
  label: NAMECARD_CHARACTER_CATEGORY_LABELS[value],
}))

export function CharacterEditorDialog({
  open,
  editing,
  agencyLocked,
  agencies,
  draft,
  saving,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  editing: boolean
  /** Fallback entries belong to the sentinel agency and cannot move. */
  agencyLocked: boolean
  agencies: NamecardCharacterAgency[]
  draft: CharacterDraft
  saving: boolean
  onChange: (draft: CharacterDraft) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const agencyItems = agencies.map((agency) => ({
    value: String(agency.id),
    label: agency.name,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent layout="pinned" className="sm:max-w-lg">
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={onSubmit}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "编辑角色" : "新增角色"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "保存后名片分类候选立即使用新内容。"
                : "新增条目会进入所选企划的名片分类候选。"}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="py-5">
              <Field>
                <FieldLabel htmlFor="namecard-character-agency">
                  企划
                </FieldLabel>
                <Select
                  items={agencyItems}
                  value={draft.agencyId}
                  disabled={saving || agencyLocked}
                  onValueChange={(value) =>
                    onChange({ ...draft, agencyId: String(value) })
                  }
                >
                  <SelectTrigger
                    id="namecard-character-agency"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agencyItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {agencyLocked ? (
                  <p className="text-xs text-muted-foreground">
                    兜底条目属于哨兵企划，企划不可修改。
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-category">
                  分类
                </FieldLabel>
                <Select
                  items={categoryItems}
                  value={draft.category}
                  disabled={saving}
                  onValueChange={(value) =>
                    onChange({
                      ...draft,
                      category: String(value) as CharacterDraft["category"],
                    })
                  }
                >
                  <SelectTrigger
                    id="namecard-character-category"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-name-cn">
                  中文名
                </FieldLabel>
                <Input
                  id="namecard-character-name-cn"
                  value={draft.nameCn}
                  disabled={saving}
                  maxLength={120}
                  required
                  onChange={(event) =>
                    onChange({ ...draft, nameCn: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-name-ja">
                  日文名
                </FieldLabel>
                <Input
                  id="namecard-character-name-ja"
                  value={draft.nameJa}
                  disabled={saving}
                  maxLength={120}
                  onChange={(event) =>
                    onChange({ ...draft, nameJa: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-name-en">
                  英文名
                </FieldLabel>
                <Input
                  id="namecard-character-name-en"
                  value={draft.nameEn}
                  disabled={saving}
                  maxLength={160}
                  onChange={(event) =>
                    onChange({ ...draft, nameEn: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-aliases">
                  别名
                </FieldLabel>
                <Textarea
                  id="namecard-character-aliases"
                  value={draft.aliases}
                  disabled={saving}
                  maxLength={4000}
                  onChange={(event) =>
                    onChange({ ...draft, aliases: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  可换行或用逗号分隔，用于搜索匹配。
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="namecard-character-display-order">
                  排序值
                </FieldLabel>
                <Input
                  id="namecard-character-display-order"
                  type="number"
                  min={0}
                  value={draft.displayOrder}
                  disabled={saving}
                  onChange={(event) =>
                    onChange({ ...draft, displayOrder: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={saving || !isCharacterDraftValid(draft)}
            >
              {saving ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {editing ? "保存修改" : "新增角色"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
