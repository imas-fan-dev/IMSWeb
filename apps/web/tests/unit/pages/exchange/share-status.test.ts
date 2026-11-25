import { describe, expect, it } from "vitest"

import {
  CARD_SHARE_UNAVAILABLE_MESSAGE,
  QUICK_SHARE_MISSING_MESSAGE,
  SHARE_EXCHANGE_LABEL,
  SHARE_EXCHANGE_READY_MESSAGE,
  cardShareStatus,
  quickShareStatus,
  scanLandingStatus,
} from "~/pages/exchange/share-status"

describe("card share status", () => {
  it("points the owner at the card manager for their own card", () => {
    expect(
      cardShareStatus({ state: "own-card", loggedIn: true, collected: false })
    ).toEqual({
      message: "这是你自己的名片",
      action: { kind: "manage", label: "去名片管理" },
    })
  })

  it("keeps the not-accepting card free of any entry", () => {
    expect(
      cardShareStatus({
        state: "not-accepting",
        loggedIn: true,
        collected: false,
      })
    ).toEqual({ message: "这张名片不接受交换", action: null })
  })

  it.each([true, false])(
    "asks anonymous visitors to log in before they can exchange (collected=%s)",
    (collected) => {
      expect(
        cardShareStatus({ state: "available", loggedIn: false, collected })
      ).toEqual({
        message: "登录后才能交换",
        action: { kind: "login", label: "去登录" },
      })
    }
  )

  it("tells the visitor they already hold the card", () => {
    expect(
      cardShareStatus({ state: "available", loggedIn: true, collected: true })
    ).toEqual({ message: "你已经拥有这张名片", action: null })
  })

  it("tells the visitor how to start the exchange", () => {
    expect(
      cardShareStatus({ state: "available", loggedIn: true, collected: false })
    ).toEqual({ message: SHARE_EXCHANGE_READY_MESSAGE, action: null })
  })

  it("exposes the fixed button copy and both error copies", () => {
    expect(SHARE_EXCHANGE_LABEL).toBe("交换")
    expect(SHARE_EXCHANGE_READY_MESSAGE).toBe("选择你要给出的名片即可交换")
    expect(CARD_SHARE_UNAVAILABLE_MESSAGE).toBe("这张名片当前不开放交换")
    expect(QUICK_SHARE_MISSING_MESSAGE).toBe("找不到这位制作人")
  })
})

describe("quick share status", () => {
  it("only swaps the copy when every card is already owned", () => {
    expect(
      quickShareStatus({ loggedIn: true, allCollected: true }).message
    ).toBe("你已经拥有这些名片")
  })

  it("keeps the ready copy when only some cards are owned", () => {
    expect(quickShareStatus({ loggedIn: true, allCollected: false })).toEqual({
      message: SHARE_EXCHANGE_READY_MESSAGE,
      action: null,
    })
  })

  it("asks anonymous visitors to log in", () => {
    expect(
      quickShareStatus({ loggedIn: false, allCollected: false })
    ).toEqual({
      message: "登录后才能交换",
      action: { kind: "login", label: "去登录" },
    })
  })
})

describe("scan landing status", () => {
  it("tells the owner it is their own code", () => {
    expect(scanLandingStatus({ state: "own-card", loggedIn: true })).toEqual({
      message: "这是你自己的二维码",
      action: { kind: "manage", label: "去名片管理" },
    })
  })

  it("stops at the terminal states without offering an entry", () => {
    expect(scanLandingStatus({ state: "committed", loggedIn: true })).toEqual({
      message: "这个二维码已经完成过一次交换",
      action: null,
    })
    expect(scanLandingStatus({ state: "expired", loggedIn: false })).toEqual({
      message: "这个二维码已过期",
      action: null,
    })
  })

  it("asks for login before an active code can be used", () => {
    expect(scanLandingStatus({ state: "active", loggedIn: false })).toEqual({
      message: "登录后才能交换",
      action: { kind: "login", label: "去登录" },
    })
    expect(scanLandingStatus({ state: "active", loggedIn: true })).toEqual({
      message: SHARE_EXCHANGE_READY_MESSAGE,
      action: null,
    })
  })
})
