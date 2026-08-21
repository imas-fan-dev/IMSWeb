import { z } from "zod"
import { successEnvelope } from "./common.js"

export const adminRoleSchema = z.enum(["admin", "super_admin"])

export const adminSessionSchema = successEnvelope({
  user: z.object({
    id: z.coerce.number().int().positive(),
    username: z.string(),
    producername: z.string().optional().default(""),
    dept: z.string(),
    adminRole: adminRoleSchema.nullable(),
  }),
})

export const adminAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  username: z.string(),
  producername: z.string(),
  adminRole: adminRoleSchema,
})

export const adminAccountListSchema = successEnvelope({
  accounts: z.array(adminAccountSchema),
})

export const adminAccountMutationSchema = successEnvelope({
  account: adminAccountSchema,
})

export type AdminSession = z.infer<typeof adminSessionSchema>["user"]

export type AdminRole = z.infer<typeof adminRoleSchema>

export type AdminAccount = z.infer<typeof adminAccountSchema>

export type AdminAccountList = z.infer<typeof adminAccountListSchema>

export type AdminAccountMutation = z.infer<typeof adminAccountMutationSchema>

export type AdminSessionResponse = z.infer<typeof adminSessionSchema>
