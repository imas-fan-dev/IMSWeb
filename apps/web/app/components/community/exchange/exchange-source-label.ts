import type { NamecardExchangeSource } from "@imsweb/contracts/namecards"

/** 交换方式：扫码交换 / 快速清单 / 单卡分享 / 交换申请 / 发送名片。 */
export const EXCHANGE_SOURCE_LABEL: Record<NamecardExchangeSource, string> = {
  scan: "扫码交换",
  quick: "快速交换",
  "card-share": "名片分享",
  "card-request": "交换申请",
  gift: "发送名片",
}
