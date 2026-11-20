import type { NamecardExchangeSource } from "@imsweb/contracts/namecards"

/** 交换方式：扫的 / 快速清单 / 单卡分享 / 名片请求 / 赠送。 */
export const EXCHANGE_SOURCE_LABEL: Record<NamecardExchangeSource, string> = {
  scan: "扫码",
  quick: "快速交换",
  "card-share": "名片分享",
  "card-request": "名片请求",
  gift: "赠送",
}
