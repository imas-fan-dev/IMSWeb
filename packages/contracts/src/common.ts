import { z } from "zod"

// 跨域公共响应结构：各业务模块通过组合（extend/引用）复用，
// 不直接对外承诺独立端点契约。

/** ASCII 控制字符检测：跨域字符串净化的共用原子。 */
export function hasAsciiControl(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

/** 成功信封原子：{ success: true } */
export const successFlagSchema = z.object({ success: z.literal(true) })

/** 组合成功信封：successEnvelope({ card }) => { success: true, card } */
export function successEnvelope<T extends z.ZodRawShape>(shape: T) {
  return successFlagSchema.extend(shape)
}

/** 游标分页页信息（hasNextPage + 可空 nextCursor）。 */
export const cursorPageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  nextCursor: z.string().min(1).nullable(),
})

/** 快照游标分页页信息（含 snapshotAt 毫秒时间戳字符串）。 */
export const snapshotPageInfoSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
  snapshotAt: z.string().regex(/^\d+$/).nullable(),
})

/** 页码分页页信息。 */
export const numberedPageInfoSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
})

export type CursorPageInfo = z.infer<typeof cursorPageInfoSchema>
export type SnapshotPageInfo = z.infer<typeof snapshotPageInfoSchema>
export type NumberedPageInfo = z.infer<typeof numberedPageInfoSchema>

export type SuccessFlag = z.infer<typeof successFlagSchema>
