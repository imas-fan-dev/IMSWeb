import { PlusIcon, Trash2Icon } from "lucide-react"

import {
  NAMECARD_CREDIT_LIMIT,
  NAMECARD_CREDIT_ROLES,
  NAMECARD_CREDIT_ROLE_LIMIT,
} from "@imsweb/contracts/fudaba/runtime"

import type { NamecardCredit } from "@imsweb/contracts/fudaba"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"

const ROLE_LABELS: Record<(typeof NAMECARD_CREDIT_ROLES)[number], string> = {
  design: "设计",
  illustration: "插画",
  other: "其他",
}

export function emptyCredit(): NamecardCredit {
  return { accountId: null, displayName: "", url: null, roles: ["illustration"] }
}

/** A credit with no name cannot be saved; roles are pre-filled so none is empty. */
export function creditsIncomplete(credits: readonly NamecardCredit[]): boolean {
  return credits.some(
    (credit) => !credit.displayName.trim() || credit.roles.length === 0
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

  function toggleRole(index: number, role: NamecardCredit["roles"][number]) {
    const credit = credits[index]
    if (!credit) return
    const has = credit.roles.includes(role)
    if (!has && credit.roles.length >= NAMECARD_CREDIT_ROLE_LIMIT) return
    update(index, {
      roles: has
        ? credit.roles.filter((item) => item !== role)
        : [...credit.roles, role],
    })
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel>署名</FieldLabel>
      <FieldDescription>
        填写设计、插画或其他贡献者；同一位可以同时担任多个角色（最多{" "}
        {NAMECARD_CREDIT_LIMIT} 人）。
      </FieldDescription>
      {credits.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂未添加署名。</p>
      ) : (
        <div className="grid gap-3">
          {credits.map((credit, index) => (
            <div
              // Credits have no stable id until saved; the row index is the key.
              key={index}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
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
              <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                <div className="flex flex-wrap gap-3">
                  {NAMECARD_CREDIT_ROLES.map((role) => (
                    <label
                      key={role}
                      className="flex cursor-pointer items-center gap-1.5 text-sm"
                    >
                      <Checkbox
                        checked={credit.roles.includes(role)}
                        disabled={
                          disabled ||
                          (!credit.roles.includes(role) &&
                            credit.roles.length >= NAMECARD_CREDIT_ROLE_LIMIT)
                        }
                        onCheckedChange={() => toggleRole(index, role)}
                      />
                      {ROLE_LABELS[role]}
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`删除第 ${index + 1} 条署名`}
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
          disabled={disabled || credits.length >= NAMECARD_CREDIT_LIMIT}
          onClick={() => onChange([...credits, emptyCredit()])}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          添加署名
        </Button>
      </div>
    </Field>
  )
}
