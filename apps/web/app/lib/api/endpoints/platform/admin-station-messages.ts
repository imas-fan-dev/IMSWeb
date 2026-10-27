import {
  adminStationMessageCancelResponseSchema,
  adminStationMessageDeliveryListSchema,
  adminStationMessageErrorSchema,
  adminStationMessageListSchema,
  adminStationMessageSendRequestSchema,
  adminStationMessageSendResponseSchema,
  adminStationMessageTargetListSchema,
  type AdminStationMessageSendRequest,
} from "@imsweb/contracts/platform/admin-station-messages"
import { adminApiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

const ADMIN_STATION_MESSAGES_PATH = adminApiPath("/platform/messages")

export interface AdminStationMessagePageInput {
  page?: number
  pageSize?: number
}

export interface AdminStationMessageRecipientInput extends AdminStationMessagePageInput {
  query?: string
}

export type AdminStationMessageSendInput = AdminStationMessageSendRequest

/** Query keys are only sent when they carry a value, so the strict query
 * contract never sees an empty `query=` that fails `min(1)`. */
function pageParams(input: AdminStationMessagePageInput) {
  const params: Record<string, string> = {}
  if (input.page !== undefined) params.page = String(input.page)
  if (input.pageSize !== undefined) params.pageSize = String(input.pageSize)
  return params
}

export function getAdminStationMessages(
  input: AdminStationMessagePageInput = {}
) {
  return adminApiClient.Get(
    ADMIN_STATION_MESSAGES_PATH,
    parsed(adminStationMessageListSchema, {
      errorSchema: adminStationMessageErrorSchema,
      meta: withBackofficeAuth(),
      params: pageParams(input),
    })
  )
}

export function getAdminStationMessageRecipients(
  input: AdminStationMessageRecipientInput = {}
) {
  const params = pageParams(input)
  if (input.query) params.query = input.query
  return adminApiClient.Get(
    `${ADMIN_STATION_MESSAGES_PATH}/recipients`,
    parsed(adminStationMessageTargetListSchema, {
      errorSchema: adminStationMessageErrorSchema,
      meta: withBackofficeAuth(),
      params,
    })
  )
}

/** 某一批次的收件人名册（指定用户时用于历史审计的完整清单）。 */
export function getAdminStationMessageDeliveries(id: string) {
  return adminApiClient.Get(
    `${ADMIN_STATION_MESSAGES_PATH}/${encodeURIComponent(id)}/recipients`,
    parsed(adminStationMessageDeliveryListSchema, {
      errorSchema: adminStationMessageErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function sendAdminStationMessage(input: AdminStationMessageSendInput) {
  const submission = adminStationMessageSendRequestSchema.parse(input)
  return adminApiClient.Post(
    ADMIN_STATION_MESSAGES_PATH,
    submission,
    parsed(adminStationMessageSendResponseSchema, {
      errorSchema: adminStationMessageErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function cancelAdminStationMessage(id: string) {
  return adminApiClient.Post(
    `${ADMIN_STATION_MESSAGES_PATH}/${encodeURIComponent(id)}/cancel`,
    {},
    parsed(adminStationMessageCancelResponseSchema, {
      errorSchema: adminStationMessageErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export {
  ADMIN_STATION_MESSAGE_MAX_LEAD_MS,
  ADMIN_STATION_MESSAGE_MIN_LEAD_MS,
} from "@imsweb/contracts/platform/admin-station-messages"
export type * from "@imsweb/contracts/platform/admin-station-messages"
