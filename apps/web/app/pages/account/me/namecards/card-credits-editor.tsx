import { useState } from "react"

import { ChevronDown, PlusIcon, Trash2Icon } from "lucide-react"

import {
  NAMECARD_CREDIT_LIMIT,
  NAMECARD_CREDIT_ROLES,
  NAMECARD_CREDIT_ROLE_LIMIT,
} from "@imsweb/contracts/fudaba/runtime"

import type { NamecardCredit } from "@imsweb/contracts/fudaba"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"

const ROLE_LABELS: Record<(typeof NAMECARD_CREDIT_ROLES)[number], string> = {
  design: "设计",
  illustration: "插画",
  other: "其他",
}

export function emptyCredit(): NamecardCredit {
  return { accountId: null, displayName: "", url: null, roles: ["design"] }
}

/** A credit with no name cannot be saved; roles are pre-filled so none is empty. */
export function creditsIncomplete(credits: readonly NamecardCredit[]): boolean {
  return credits.some(
    (credit) => !credit.displayName.trim() || credit.roles.length === 0
  )
}

/** 一个贡献者可以同时担任多个角色，所以这里是下拉复选而不是一排复选框。 */
function RoleSelect({
  id,
  roles,
  disabled,
  onChange,
}: {
  id: string
  roles: NamecardCredit["roles"]
  disabled: boolean
  onChange: (roles: NamecardCredit["roles"]) => void
}) {
  const [open, setOpen] = useState(false)
  const label = roles.length
    ? roles.map((role) => ROLE_LABELS[role]).join("、")
    : "选择角色"
  const atLimit = roles.length >= NAMECARD_CREDIT_ROLE_LIMIT

  function toggle(role: NamecardCredit["roles"][number]) {
    const has = roles.includes(role)
    if (!has && atLimit) return
    onChange(
      has ? roles.filter((item) => item !== role) : [...roles, role]
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full min-w-0 justify-between font-normal"
            aria-label={`担任角色：${label}`}
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-2">
        <PopoverTitle className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
          担任角色（最多 {NAMECARD_CREDIT_ROLE_LIMIT} 个）
        </PopoverTitle>
        {NAMECARD_CREDIT_ROLES.map((role) => {
          const checked = roles.includes(role)
          return (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <Checkbox
                checked={checked}
                disabled={disabled || (!checked && atLimit)}
                onCheckedChange={() => toggle(role)}
              />
              {ROLE_LABELS[role]}
            </label>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The people behind the artwork. Eight rows at most, and one person can carry
 * several roles (the same author often designed and drew the card).
 */
export function CreditsEditor({
  credits,
  disabled,
  onChange,
}: {
  credits: readonly NamecardCredit[]
  disabled: boolean
  onChange: (credits: NamecardCredit[]) => void
}) {
  function update(index: number, patch: Partial<NamecardCredit>) {
    onChange(
      credits.map((credit, current) =>
        current === index ? { ...credit, ...patch } : credit
      )
    )
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel>创作人员</FieldLabel>
      <FieldDescription>
        填写设计、插画或其他贡献者；同一位可以同时担任多个角色（最多{" "}
        {NAMECARD_CREDIT_LIMIT} 人）。
      </FieldDescription>
      {credits.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂未添加创作人员。</p>
      ) : (
        <div className="grid gap-3">
          {credits.map((credit, index) => (
            <div
              // Credits have no stable id until saved; the row index is the key.
              key={index}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem_auto]"
            >
              <Field data-disabled={disabled || undefined}>
                <FieldLabel htmlFor={`exchange-card-credit-name-${index}`}>
                  姓名
                </FieldLabel>
                <Input
                  id={`exchange-card-credit-name-${index}`}
                  value={credit.displayName}
                  maxLength={80}
                  disabled={disabled}
                  placeholder="署名或昵称"
                  onChange={(event) =>
                    update(index, { displayName: event.currentTarget.value })
                  }
                />
              </Field>
              <Field data-disabled={disabled || undefined}>
                <FieldLabel htmlFor={`exchange-card-credit-url-${index}`}>
                  主页链接
                </FieldLabel>
                <Input
                  id={`exchange-card-credit-url-${index}`}
                  value={credit.url ?? ""}
                  disabled={disabled}
                  inputMode="url"
                  placeholder="https://"
                  onChange={(event) => {
                    const value = event.currentTarget.value.trim()
                    update(index, { url: value ? value : null })
                  }}
                />
              </Field>
              <Field data-disabled={disabled || undefined}>
                <FieldLabel htmlFor={`exchange-card-credit-role-${index}`}>
                  担任角色
                </FieldLabel>
                <RoleSelect
                  id={`exchange-card-credit-role-${index}`}
                  roles={credit.roles}
                  disabled={disabled}
                  onChange={(roles) => update(index, { roles })}
                />
              </Field>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`删除第 ${index + 1} 条创作人员`}
                  onClick={() =>
                    onChange(credits.filter((_, current) => current !== index))
                  }
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="添加创作人员"
          disabled={disabled || credits.length >= NAMECARD_CREDIT_LIMIT}
          onClick={() => onChange([...credits, emptyCredit()])}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          添加创作人员
        </Button>
      </div>
    </Field>
  )
}
